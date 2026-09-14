/**
 * backfill_payroll_item_entries.js
 *
 * Reconstructs the payroll consumption ledger for payroll that was already run
 * before the ledger existed.
 *
 * WHY THIS IS MANDATORY
 * ---------------------
 * Arrears ("catch-up") rows are computed as:
 *
 *     approved timesheet hours  minus  hours recorded in payroll_item_entries
 *
 * If that table starts empty, EVERY hour ever paid looks unpaid, and the first
 * payroll run after deployment emits years of history as catch-up rows — i.e.
 * offers to pay the entire back catalogue a second time. Run this before the
 * first payroll run on any database that already contains payroll history.
 *
 * WHAT IT CONSUMES
 * ----------------
 * Two sources, because two code paths have paid W2 hours over the life of this
 * system:
 *
 *   1. payroll_run_items — the payroll-run path (controllers/payrollController).
 *   2. employee_transactions of type W2_STANDARD / W2_LCA that carry no
 *      payroll_run_item_id — the older balance-sheet "Run W2 Payroll" path
 *      (runManualPayroll in controllers/balanceSheetController), which never
 *      created payroll_run_items at all. Missing these is the single most
 *      dangerous gap: those hours would come straight back as arrears.
 *
 * HOW HOURS ARE ATTRIBUTED
 * ------------------------
 * Greedy consumption in work_date order until the item's recorded hours are
 * exhausted. Day-level attribution for historical payroll is genuinely
 * unknowable — the old code only ever stored a per-window SUM — but the TOTAL
 * is exactly right, and totals are what the arrears calculation depends on.
 *
 * This is the point of the exercise. If a Jul 1-15 item recorded 60 hours while
 * the timesheets now hold 80 approved hours for that window, the script marks 60
 * consumed and deliberately leaves 20 unclaimed, so the next payroll run picks
 * those 20 up as a catch-up row. That is a genuinely unpaid balance, not an
 * artefact.
 *
 * ORDER
 * -----
 * Chronological, submitted runs before drafts, so earlier payroll claims hours
 * before later payroll sees them — the same order the live code would have
 * written them in.
 *
 * Usage (from the backend/ folder):
 *   node scripts/backfill_payroll_item_entries.js              # dry run
 *   node scripts/backfill_payroll_item_entries.js --commit     # apply
 *   node scripts/backfill_payroll_item_entries.js --org=<uuid> # one org only
 *
 * Idempotent: an item that already has ledger rows is skipped, so re-running it
 * never double-consumes.
 */

import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

const argVal = (name) => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : null;
};

const COMMIT = process.argv.includes('--commit');
const ORG_ID = argVal('org');

// In a dry run nothing is written, so each item would otherwise re-read an empty
// ledger and claim hours an earlier item already took — making the preview
// double-count and hiding every real shortfall. This overlay stands in for the
// rows a real run would have written, so the dry run reports the same numbers
// --commit will produce.
const dryRunConsumed = new Map();

// Approved entries in a window, with hours already consumed by anything in the
// ledger subtracted. Mirrors fetchClaimableEntries in services/payrollService.js;
// kept local so the script has no dependency on live code that may change.
const claimableEntries = async (conn, placementId, from, to) => {
    const [rows] = await conn.query(`
        SELECT te.id                                 AS entry_id,
               te.timesheet_id,
               DATE_FORMAT(te.work_date, '%Y-%m-%d') AS work_date,
               te.hours                              AS approved_hours,
               COALESCE(pie.paid_hours, 0)           AS paid_hours
        FROM timesheet_entries te
        JOIN timesheets t ON te.timesheet_id = t.id
        LEFT JOIN (
            SELECT timesheet_entry_id, SUM(hours) AS paid_hours
            FROM payroll_item_entries
            WHERE placement_id = ?
            GROUP BY timesheet_entry_id
        ) pie ON pie.timesheet_entry_id = te.id
        WHERE t.placement_id = ? AND t.status_id = 3
          AND te.work_date >= ? AND te.work_date <= ?
          AND te.hours > 0
        ORDER BY te.work_date ASC, te.id ASC
    `, [placementId, placementId, from, to]);

    return rows
        .map(r => {
            const alreadyPaid = parseFloat(r.paid_hours) + (COMMIT ? 0 : (dryRunConsumed.get(r.entry_id) || 0));
            return {
                entry_id:     r.entry_id,
                timesheet_id: r.timesheet_id,
                work_date:    r.work_date,
                outstanding:  Math.max(0, parseFloat((parseFloat(r.approved_hours) - alreadyPaid).toFixed(2))),
            };
        })
        .filter(e => e.outstanding > 0);
};

// Consumes `hoursToConsume` from the window, oldest day first. Returns what was
// actually allocated and what could not be covered.
const consume = async (conn, { orgId, placementId, payrollRunItemId, legacyTransactionId }, from, to, hoursToConsume) => {
    const entries = await claimableEntries(conn, placementId, from, to);

    let remaining = parseFloat(hoursToConsume.toFixed(2));
    const allocations = [];

    for (const e of entries) {
        if (remaining <= 0.001) break;
        const take = Math.min(e.outstanding, remaining);
        allocations.push({ ...e, take: parseFloat(take.toFixed(2)) });
        remaining = parseFloat((remaining - take).toFixed(2));
    }

    if (!COMMIT) {
        for (const a of allocations) {
            dryRunConsumed.set(a.entry_id, (dryRunConsumed.get(a.entry_id) || 0) + a.take);
        }
    } else {
        for (const a of allocations) {
            if (a.take <= 0) continue;
            await conn.query(`
                INSERT INTO payroll_item_entries
                  (id, organization_id, placement_id, payroll_run_item_id, legacy_transaction_id,
                   timesheet_id, timesheet_entry_id, work_date, hours)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [uuidv4(), orgId, placementId, payrollRunItemId || null, legacyTransactionId || null,
                a.timesheet_id, a.entry_id, a.work_date, a.take]);
        }
    }

    return {
        allocated: parseFloat(allocations.reduce((s, a) => s + a.take, 0).toFixed(2)),
        shortfall: parseFloat(Math.max(0, remaining).toFixed(2)),
        rows: allocations.length,
    };
};

const main = async () => {
    const conn = await pool.getConnection();
    const orgFilter = ORG_ID ? 'AND pri.organization_id = ?' : '';
    const orgArgs   = ORG_ID ? [ORG_ID] : [];

    const stats = {
        items: 0, itemsSkipped: 0, itemRows: 0, itemHours: 0, itemShortfall: 0,
        legacy: 0, legacySkipped: 0, legacyRows: 0, legacyHours: 0, legacyShortfall: 0,
        shortfalls: [],
    };

    console.log('');
    console.log(COMMIT ? 'BACKFILL — COMMIT MODE' : 'BACKFILL — DRY RUN (nothing will be written)');
    console.log('');

    // ── 1. payroll_run_items ─────────────────────────────────────────────────
    // Submitted runs first: money that actually posted has the stronger claim on
    // an hour than a draft that may yet be discarded.
    const [items] = await conn.query(`
        SELECT pri.id, pri.organization_id, pri.placement_id, pri.approved_hours,
               pri.item_status,
               DATE_FORMAT(COALESCE(pri.segment_start, pr.period_start), '%Y-%m-%d') AS from_date,
               DATE_FORMAT(COALESCE(pri.segment_end,   pr.period_end),   '%Y-%m-%d') AS to_date,
               pr.status AS run_status,
               DATE_FORMAT(pr.period_start, '%Y-%m-%d') AS period_start,
               pr.period_label
        FROM payroll_run_items pri
        JOIN payroll_runs pr ON pri.payroll_run_id = pr.id
        WHERE 1 = 1 ${orgFilter}
        ORDER BY (pr.status = 'SUBMITTED') DESC, pr.period_start ASC, pri.segment_start ASC, pri.id ASC
    `, orgArgs);

    console.log(`payroll_run_items to process: ${items.length}`);

    for (const it of items) {
        const [[existing]] = await conn.query(
            `SELECT COUNT(*) AS c FROM payroll_item_entries WHERE payroll_run_item_id = ?`, [it.id]
        );
        if (existing.c > 0) { stats.itemsSkipped++; continue; }

        const hours = parseFloat(it.approved_hours) || 0;
        if (hours <= 0) { stats.itemsSkipped++; continue; }

        const r = await consume(
            conn,
            { orgId: it.organization_id, placementId: it.placement_id, payrollRunItemId: it.id },
            it.from_date, it.to_date, hours
        );

        stats.items++;
        stats.itemRows  += r.rows;
        stats.itemHours += r.allocated;
        if (r.shortfall > 0.001) {
            stats.itemShortfall += r.shortfall;
            stats.shortfalls.push(`item ${it.id} (${it.period_label}, ${it.from_date}..${it.to_date}): paid ${hours}h, only ${r.allocated}h of approved time available`);
        }
    }

    // ── 2. Legacy balance-sheet payroll transactions ─────────────────────────
    // W2_STANDARD is only ever written by the old runManualPayroll path.
    // W2_LCA is written by both paths, so the ones without a payroll_run_item_id
    // in metadata are the legacy ones.
    const legacyOrgFilter = ORG_ID ? 'AND et.organization_id = ?' : '';
    const [legacy] = await conn.query(`
        SELECT et.id, et.organization_id, et.placement_id, et.metadata,
               DATE_FORMAT(et.transaction_date, '%Y-%m-%d') AS transaction_date
        FROM employee_transactions et
        WHERE et.transaction_type IN ('W2_STANDARD', 'W2_LCA')
          AND JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.payroll_run_item_id')) IS NULL
          AND et.placement_id IS NOT NULL
          ${legacyOrgFilter}
        ORDER BY et.transaction_date ASC, et.created_at ASC
    `, orgArgs);

    console.log(`legacy payroll transactions to process: ${legacy.length}`);

    for (const tx of legacy) {
        const [[existing]] = await conn.query(
            `SELECT COUNT(*) AS c FROM payroll_item_entries WHERE legacy_transaction_id = ?`, [tx.id]
        );
        if (existing.c > 0) { stats.legacySkipped++; continue; }

        let meta = tx.metadata || {};
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }

        // metadata.period is "YYYY-MM-DD to YYYY-MM-DD"
        const match = /^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/.exec(meta.period || '');
        if (!match) { stats.legacySkipped++; continue; }

        // W2_STANDARD carries `hours`; the legacy LCA branch carries `total_hours`.
        const hours = parseFloat(meta.hours ?? meta.total_hours ?? 0);
        if (!(hours > 0)) { stats.legacySkipped++; continue; }

        const r = await consume(
            conn,
            { orgId: tx.organization_id, placementId: tx.placement_id, legacyTransactionId: tx.id },
            match[1], match[2], hours
        );

        stats.legacy++;
        stats.legacyRows  += r.rows;
        stats.legacyHours += r.allocated;
        if (r.shortfall > 0.001) {
            stats.legacyShortfall += r.shortfall;
            stats.shortfalls.push(`legacy tx ${tx.id} (${meta.period}): paid ${hours}h, only ${r.allocated}h of approved time available`);
        }
    }

    conn.release();

    console.log('');
    console.log('── Result ─────────────────────────────────────────');
    console.log(`  payroll items    : ${stats.items} consumed, ${stats.itemsSkipped} skipped (already done / zero hours)`);
    console.log(`                     ${stats.itemRows} ledger rows, ${stats.itemHours.toFixed(2)} hours`);
    console.log(`  legacy txns      : ${stats.legacy} consumed, ${stats.legacySkipped} skipped (already done / unparseable)`);
    console.log(`                     ${stats.legacyRows} ledger rows, ${stats.legacyHours.toFixed(2)} hours`);
    console.log('');

    const totalShortfall = stats.itemShortfall + stats.legacyShortfall;
    if (totalShortfall > 0.001) {
        console.log(`  WARNING: ${totalShortfall.toFixed(2)} paid hours could not be matched to approved timesheet time.`);
        console.log(`  These were paid for hours that are no longer approved (timesheet rejected or edited down`);
        console.log(`  after payment). They do NOT cause double payment — the arrears scan only ever pays out`);
        console.log(`  hours it can see as approved — but they are worth a look:`);
        console.log('');
        for (const s of stats.shortfalls.slice(0, 25)) console.log(`    ${s}`);
        if (stats.shortfalls.length > 25) console.log(`    ...and ${stats.shortfalls.length - 25} more`);
        console.log('');
    }

    if (!COMMIT) {
        console.log('DRY RUN — nothing was written. Re-run with --commit to apply.');
        console.log('Run this BEFORE the first payroll run on a database with existing payroll history.');
    } else {
        console.log('Done. Safe to re-run; it will not double-consume.');
    }
    console.log('');
};

main()
    .then(() => pool.end())
    .catch(async (err) => {
        console.error('\nBACKFILL FAILED:', err.message);
        console.error(err.stack);
        await pool.end().catch(() => {});
        process.exit(1);
    });
