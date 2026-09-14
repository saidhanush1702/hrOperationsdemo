import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { logAction } from './auditLogController.js';
import { getEasternDateString } from '../utils/dateUtils.js';
import {
    calcLcaWagePerPeriod,
    fetchW2Placements,
    fetchC2CFixedPlacements,
    fetchEmployeeNetBalances,
    fetchArrearsCandidates,
    fetchSettledPeriods,
    fetchRateMaps,
    segmentsForPlacement,
    fetchClaimableEntries,
    writeItemEntries,
    buildArrearsForPlacement,
} from '../services/payrollService.js';

// Approved hours a placement logged in a window.
//
// Informational only, and deliberately NOT routed through the consumption ledger:
// a C2C fixed-pay row does not claim hours (its invoices do), so this must not
// mark anything as consumed. It exists so the reviewer can see activity on the
// placement next to the flat figure being paid.
const sumApprovedHours = async (conn, placementId, from, to) => {
    const [rows] = await conn.query(`
        SELECT COALESCE(SUM(te.hours), 0) AS hours
        FROM timesheet_entries te
        JOIN timesheets t ON te.timesheet_id = t.id
        WHERE t.placement_id = ? AND t.status_id = 3
          AND te.work_date >= ? AND te.work_date <= ?
    `, [placementId, from, to]);
    return parseFloat(parseFloat(rows[0]?.hours || 0).toFixed(2));
};

// The pay rate a fixed-pay placement's invoices price at during the period.
//
// Informational: it does not decide the payout (the flat figure does), it is what
// the balance this row draws against was built from. Takes the rate in force at the
// START of the period; a mid-period rate change is a display nuance here, not a
// money one, so the first segment is the honest single answer.
const fixedPayRateFor = (pl, prByPlacement, brByPlacement, from, to) => {
    const segs = segmentsForPlacement(pl, prByPlacement, brByPlacement, from, to);
    return segs.length ? parseFloat(segs[0].payRate.toFixed(2)) : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Item building
//
// Two kinds of rows go into a payroll run:
//
//   REGULAR — hours worked inside this run's own period, one row per rate
//             segment, exactly as before.
//
//   ARREARS — hours from an EARLIER period that were approved too late to be
//             caught by that period's run. Payroll runs are locked once
//             submitted and payroll_runs.uk_org_period forbids a second run for
//             the same period, so before this these hours were simply lost.
//             They come in as their own rows, labelled with the period they
//             belong to, and are approved or rejected individually.
//
// Both kinds claim their hours through the consumption ledger
// (payroll_item_entries), which is what stops the same hour being paid twice.
// ─────────────────────────────────────────────────────────────────────────────

const buildRegularItems = async (connection, pl, prByPlacement, brByPlacement, period_start, period_end) => {
    const segments = segmentsForPlacement(pl, prByPlacement, brByPlacement, period_start, period_end);
    if (segments.length === 0) return [];

    const runAsLca = pl.run_as_per_lca_wage === 1 || pl.run_as_per_lca_wage === true;
    const lcaWage  = runAsLca && pl.lca_wage ? parseFloat(pl.lca_wage) : null;
    const lcaWagePerPeriod = lcaWage
        ? parseFloat(calcLcaWagePerPeriod(lcaWage, pl.imm_start_date, pl.imm_till_date, period_start, period_end).toFixed(2))
        : null;

    // W2 pays either what was worked or the LCA wage. FIXED is a C2C basis and is
    // built by buildC2CFixedItems, not here — a W2 row can never carry it.
    const payoutBasis = (pl.payout_basis === 'LCA' || runAsLca) ? 'LCA' : 'HOURS';

    const items = [];
    for (const seg of segments) {
        // Only hours no payroll item has already claimed. In a fresh period that
        // is everything; the subtraction matters when a draft run elsewhere has
        // already reserved some of these hours.
        const entries = await fetchClaimableEntries(connection, pl.placement_id, seg.segStart, seg.segEnd);
        const allocations   = entries.filter(e => e.outstanding > 0);
        const approvedHours = parseFloat(allocations.reduce((s, e) => s + e.outstanding, 0).toFixed(2));
        if (approvedHours === 0) continue;

        items.push({
            item_type:       'REGULAR',
            placement_id:    pl.placement_id,
            employee_id:     pl.employee_id,
            first_name:      pl.first_name,
            last_name:       pl.last_name,
            employee_code:   pl.employee_code,
            client_name:     pl.client_name,
            bill_rate:       parseFloat(pl.bill_rate) || 0,
            approvedHours,
            payRate:         seg.payRate,
            lcaWage,
            lcaWagePerPeriod,
            totalAmount:     parseFloat((approvedHours * seg.payRate).toFixed(2)),
            segStart:        seg.segStart,
            segEnd:          seg.segEnd,
            runAsLca,
            payoutBasis,
            fixedPayPerPeriod: null,
            balanceSnapshot:   null,
            sourcePeriodLabel: null,
            sourcePeriodStart: null,
            sourcePeriodEnd:   null,
            allocations,
        });
    }
    return items;
};

// ─────────────────────────────────────────────────────────────────────────────
// C2C fixed-pay line items.
//
// One row per placement per period, and — unlike every other item builder here —
// it is NOT conditional on there being claimable hours. A fixed-pay C2C placement
// owes its flat figure whether or not a timesheet was approved, so the row must
// appear regardless; approved_hours is carried for information only.
//
// The row claims no hours through the consumption ledger either. C2C hours are
// consumed by the invoice that bills them, and the balance those invoices accrue
// is what this row draws against. Claiming them here as well would double-count.
// ─────────────────────────────────────────────────────────────────────────────
const buildC2CFixedItems = (pl, balance, period_start, period_end, approvedHours, payRate = 0) => ([{
    item_type:       'REGULAR',
    placement_id:    pl.placement_id,
    employee_id:     pl.employee_id,
    first_name:      pl.first_name,
    last_name:       pl.last_name,
    employee_code:   pl.employee_code,
    client_name:     pl.client_name,
    bill_rate:       parseFloat(pl.bill_rate) || 0,
    approvedHours,
    // Carried for context only. The payout is the flat figure and the money comes
    // from the accrued balance, NOT from hours x rate -- but this is the rate the
    // placement's invoices price at on their way onto that balance, so showing it
    // beats showing 0 and looking like a missing rate.
    payRate,
    // Nothing is earned on this row: total_amount stays 0 so it cannot be summed
    // into earnings anywhere that treats a payroll item as income.
    lcaWage:         null,
    lcaWagePerPeriod: null,
    totalAmount:     0,
    segStart:        period_start,
    segEnd:          period_end,
    runAsLca:        false,
    payoutBasis:     'FIXED',
    fixedPayPerPeriod: parseFloat(pl.fixed_pay_per_period),
    balanceSnapshot:   balance,
    sourcePeriodLabel: null,
    sourcePeriodStart: null,
    sourcePeriodEnd:   null,
    allocations:     [],
}]);

const buildArrearsItems = async (connection, pl, prByPlacement, brByPlacement, period_start, settled) => {
    const { items: raw, unpricedHours } = await buildArrearsForPlacement(connection, pl, prByPlacement, brByPlacement, period_start, settled);

    // lca_wage / lca_wage_per_period stay NULL on arrears rows. The LCA payout
    // for the source period was already settled when that period ran; an arrears
    // row adds earnings on top of a closed payout, so the whole amount belongs
    // to the buffer. Submit resolves that from placement_type_history as of the
    // source period, and leaving these columns NULL keeps arrears out of the
    // regular per-placement LCA aggregation.
    const items = raw.map(a => ({
        item_type:       'ARREARS',
        placement_id:    a.placement_id,
        employee_id:     a.employee_id,
        first_name:      pl.first_name,
        last_name:       pl.last_name,
        employee_code:   pl.employee_code,
        client_name:     pl.client_name,
        bill_rate:       parseFloat(pl.bill_rate) || 0,
        approvedHours:   a.hours,
        payRate:         a.payRate,
        lcaWage:         null,
        lcaWagePerPeriod: null,
        totalAmount:     a.totalAmount,
        segStart:        a.segStart,
        segEnd:          a.segEnd,
        runAsLca:        a.runAsLca,
        sourcePeriodLabel: a.sourcePeriodLabel,
        sourcePeriodStart: a.sourcePeriodStart,
        sourcePeriodEnd:   a.sourcePeriodEnd,
        allocations:     a.allocations,
    }));

    return { items, unpricedHours };
};

// Inserts one payroll_run_item plus its consumption-ledger rows.
const insertItem = async (connection, runId, orgId, it) => {
    const itemId = uuidv4();
    await connection.query(`
        INSERT INTO payroll_run_items
          (id, payroll_run_id, organization_id, employee_id, placement_id,
           approved_hours, pay_rate, lca_wage, lca_wage_per_period, total_amount,
           payout_basis, fixed_pay_per_period, balance_snapshot,
           segment_start, segment_end, comments, item_status,
           item_type, source_period_label, source_period_start, source_period_end)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'PENDING', ?, ?, ?, ?)
    `, [itemId, runId, orgId, it.employee_id, it.placement_id,
        it.approvedHours, it.payRate, it.lcaWage, it.lcaWagePerPeriod, it.totalAmount,
        it.payoutBasis || 'HOURS', it.fixedPayPerPeriod ?? null, it.balanceSnapshot ?? null,
        it.segStart, it.segEnd,
        it.item_type, it.sourcePeriodLabel, it.sourcePeriodStart, it.sourcePeriodEnd]);

    await writeItemEntries(
        connection,
        { orgId, placementId: it.placement_id, payrollRunItemId: itemId },
        it.allocations || []
    );
    return itemId;
};

const toResponseItem = (itemId, it) => ({
    id:                  itemId,
    employee_id:         it.employee_id,
    placement_id:        it.placement_id,
    first_name:          it.first_name,
    last_name:           it.last_name,
    employee_code:       it.employee_code,
    approved_hours:      it.approvedHours,
    pay_rate:            it.payRate,
    lca_wage:            it.lcaWage,
    lca_wage_per_period: it.lcaWagePerPeriod,
    total_amount:        it.totalAmount,
    payout_basis:         it.payoutBasis || 'HOURS',
    fixed_pay_per_period: it.fixedPayPerPeriod ?? null,
    balance_snapshot:     it.balanceSnapshot ?? null,
    segment_start:       it.segStart,
    segment_end:         it.segEnd,
    client_name:         it.client_name,
    bill_rate:           it.bill_rate,
    run_as_per_lca_wage: it.runAsLca,
    comments:            null,
    item_status:         'PENDING',
    item_type:           it.item_type,
    source_period_label: it.sourcePeriodLabel,
    source_period_start: it.sourcePeriodStart,
    source_period_end:   it.sourcePeriodEnd,
});

// Timesheets overlapping the period that are still waiting on someone. Surfaced
// as a warning so the user knows, before submitting, that approving these later
// will push them into the next run as catch-up rows rather than into this one.
const fetchPendingTimesheetWarning = async (conn, orgId, periodStart, periodEnd) => {
    const [rows] = await conn.query(`
        SELECT COUNT(DISTINCT t.id)          AS timesheet_count,
               COUNT(DISTINCT t.employee_id) AS employee_count
        FROM timesheets t
        JOIN placements p ON t.placement_id = p.id
        JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
        WHERE t.organization_id = ?
          AND t.status_id IN (1, 2, 5)
          AND t.start_date <= ? AND t.end_date >= ?
          AND pt.name = 'W2'
    `, [orgId, periodEnd, periodStart]);

    const r = rows[0] || {};
    return {
        timesheet_count: parseInt(r.timesheet_count || 0, 10),
        employee_count:  parseInt(r.employee_count || 0, 10),
    };
};

const summariseArrears = (items) => {
    const arrears = items.filter(i => i.item_type === 'ARREARS');
    return {
        count:   arrears.length,
        hours:   parseFloat(arrears.reduce((s, i) => s + i.approvedHours, 0).toFixed(2)),
        amount:  parseFloat(arrears.reduce((s, i) => s + i.totalAmount, 0).toFixed(2)),
        periods: [...new Set(arrears.map(i => i.sourcePeriodLabel).filter(Boolean))],
        // Owed hours on placements with no pay rate on file. Payroll cannot
        // price them, so they produce no row — but they are real unpaid time and
        // must be visible rather than silently dropped.
        unpriced_hours: 0,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET all payroll runs for the org (list view)
// ─────────────────────────────────────────────────────────────────────────────
export const getPayrollRuns = async (req, res) => {
    try {
        const orgId = req.user.orgId;
        const [runs] = await pool.query(`
            SELECT pr.id,
                   pr.period_label,
                   DATE_FORMAT(pr.period_start, '%Y-%m-%d') AS period_start,
                   DATE_FORMAT(pr.period_end,   '%Y-%m-%d') AS period_end,
                   pr.year,
                   pr.status,
                   DATE_FORMAT(pr.created_at,   '%Y-%m-%d') AS run_date,
                   pr.created_at,
                   DATE_FORMAT(pr.submitted_at, '%Y-%m-%d %H:%i') AS submitted_at,
                   COUNT(pri.id)                                             AS total_items,
                   SUM(CASE WHEN pri.item_status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
                   SUM(CASE WHEN pri.item_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
                   SUM(CASE WHEN pri.item_type = 'ARREARS' THEN 1 ELSE 0 END)    AS arrears_count
            FROM payroll_runs pr
            LEFT JOIN payroll_run_items pri ON pr.id = pri.payroll_run_id
            WHERE pr.organization_id = ?
            GROUP BY pr.id
            ORDER BY pr.period_start DESC, pr.created_at DESC
        `, [orgId]);
        res.json(runs);
    } catch (err) {
        console.error('GET PAYROLL RUNS ERROR:', err);
        res.status(500).json({ error: 'Failed to load payroll runs.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Generate (or retrieve) a payroll run for the given period
//    Each placement may produce multiple regular items (one per rate-change
//    segment) plus any catch-up items owed from earlier periods.
// ─────────────────────────────────────────────────────────────────────────────
export const generatePayrollRun = async (req, res) => {
    const { period_label, period_start, period_end, year } = req.body;
    const orgId = req.user.orgId;

    if (!period_label || !period_start || !period_end || !year) {
        return res.status(400).json({ error: 'period_label, period_start, period_end, and year are required.' });
    }

    try {
        // Return existing run if already generated for this period
        const [existing] = await pool.query(`
            SELECT id, status FROM payroll_runs
            WHERE organization_id = ? AND period_start = ? AND period_end = ?
            LIMIT 1
        `, [orgId, period_start, period_end]);

        if (existing.length > 0) {
            const detail = await fetchPayrollDetail(existing[0].id, orgId);
            return res.json({ ...detail, already_exists: true });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const w2Placements = await fetchW2Placements(connection, orgId, period_start, period_end);

            // C2C placements paid a flat figure per period. They are owed that
            // figure whether or not anyone filed a timesheet, so they are pulled
            // in independently of the W2 set and of approved hours.
            const c2cFixedPlacements = await fetchC2CFixedPlacements(connection, orgId, period_start, period_end);

            // Catch-up rows can be owed by a placement that is not running in
            // this period at all — one that has since ended, or has since moved
            // off W2 — so the arrears scan uses its own placement set, keyed off
            // who actually holds unpaid approved hours.
            // Which periods are actually closed decides what may be caught up here.
            const settledPeriods    = await fetchSettledPeriods(connection, orgId);
            const arrearsPlacements = await fetchArrearsCandidates(connection, orgId, period_start);

            if (w2Placements.length === 0 && c2cFixedPlacements.length === 0 && arrearsPlacements.length === 0) {
                await connection.rollback();
                return res.status(422).json({ error: 'No active W2 or fixed-pay C2C placements found.' });
            }

            const placementIds = [...new Set([
                ...w2Placements.map(p => p.placement_id),
                ...c2cFixedPlacements.map(p => p.placement_id),
                ...arrearsPlacements.map(p => p.placement_id),
            ])];

            const { prByPlacement, brByPlacement } = await fetchRateMaps(connection, placementIds);

            const items = [];
            let unpricedHours = 0;
            for (const pl of w2Placements) {
                items.push(...await buildRegularItems(connection, pl, prByPlacement, brByPlacement, period_start, period_end));
            }

            // Balances are read once for the whole set: the figure shown against an
            // employee is their net position across every placement, so it is a
            // per-employee lookup rather than a per-placement one.
            if (c2cFixedPlacements.length > 0) {
                const balances = await fetchEmployeeNetBalances(
                    connection, orgId, [...new Set(c2cFixedPlacements.map(p => p.employee_id))]
                );
                for (const pl of c2cFixedPlacements) {
                    const hours = await sumApprovedHours(connection, pl.placement_id, period_start, period_end);
                    items.push(...buildC2CFixedItems(
                        pl, balances[pl.employee_id] ?? 0, period_start, period_end, hours,
                        fixedPayRateFor(pl, prByPlacement, brByPlacement, period_start, period_end)));
                }
            }

            for (const pl of arrearsPlacements) {
                const arrears = await buildArrearsItems(connection, pl, prByPlacement, brByPlacement, period_start, settledPeriods);
                items.push(...arrears.items);
                unpricedHours += arrears.unpricedHours;
            }
            unpricedHours = parseFloat(unpricedHours.toFixed(2));

            if (items.length === 0) {
                await connection.rollback();
                return res.status(422).json({
                    error: 'No W2 employees have approved timesheets for this period, and no fixed-pay C2C placements are live. Payroll run was not created.'
                });
            }

            const runId = uuidv4();
            await connection.query(`
                INSERT INTO payroll_runs
                  (id, organization_id, period_label, period_start, period_end, year, status, created_by)
                VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?)
            `, [runId, orgId, period_label, period_start, period_end, year, req.user.id]);

            const responseItems = [];
            for (const it of items) {
                const itemId = await insertItem(connection, runId, orgId, it);
                responseItems.push(toResponseItem(itemId, it));
            }

            const pendingWarning = await fetchPendingTimesheetWarning(connection, orgId, period_start, period_end);
            const arrearsSummary = summariseArrears(items);
            arrearsSummary.unpriced_hours = unpricedHours;

            await connection.commit();

            const arrearsNote = arrearsSummary.count > 0
                ? `, including ${arrearsSummary.count} catch-up item(s) worth ${arrearsSummary.hours} hr from ${arrearsSummary.periods.join(', ')}`
                : '';
            logAction({ orgId, module: 'payroll', action: 'Generated Payroll Run', entityType: 'PayrollRun', entityId: runId, entityName: period_label, performedBy: req.user.id, performedByRole: req.user.role, description: `Generated payroll run for ${period_label} (${period_start} to ${period_end}), ${responseItems.length} item(s) across ${new Set(responseItems.map(i => i.employee_id)).size} employee(s)${arrearsNote}` }).catch(() => {});

            return res.status(201).json({
                id: runId,
                period_label,
                period_start,
                period_end,
                year,
                status: 'DRAFT',
                run_date: getEasternDateString(),
                items: responseItems,
                adjustments: [],
                arrears_summary: arrearsSummary,
                pending_timesheets: pendingWarning,
                already_exists: false,
            });

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (err) {
        console.error('GENERATE PAYROLL RUN ERROR:', err);
        res.status(500).json({ error: 'Failed to generate payroll run.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Get detail of a single payroll run
// ─────────────────────────────────────────────────────────────────────────────
export const getPayrollRunDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const detail = await fetchPayrollDetail(id, req.user.orgId);
        if (!detail) return res.status(404).json({ error: 'Payroll run not found.' });
        res.json(detail);
    } catch (err) {
        console.error('GET PAYROLL RUN DETAIL ERROR:', err);
        res.status(500).json({ error: 'Failed to load payroll run.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Submit a payroll run
//    Non-LCA placements: one employee_transaction per approved segment item.
//    LCA placements:     aggregate all approved REGULAR items for the placement,
//                        compare combined earnings to lca_wage_per_period, post
//                        one net W2_LCA transaction (or skip if no surplus).
//    Arrears items:      settled individually, after the regular rows.
// ─────────────────────────────────────────────────────────────────────────────
export const submitPayrollRun = async (req, res) => {
    const { id }    = req.params;
    const { items } = req.body;
    const orgId     = req.user.orgId;

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'items array is required.' });
    }

    const connection = await pool.getConnection();
    try {
        const [runs] = await connection.query(`
            SELECT id, status,
                   DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start,
                   DATE_FORMAT(period_end,   '%Y-%m-%d') AS period_end,
                   period_label
            FROM payroll_runs
            WHERE id = ? AND organization_id = ?
            LIMIT 1
        `, [id, orgId]);

        if (runs.length === 0) { connection.release(); return res.status(404).json({ error: 'Payroll run not found.' }); }
        if (runs[0].status === 'SUBMITTED') { connection.release(); return res.status(400).json({ error: 'This payroll run has already been submitted.' }); }

        const run = runs[0];
        const periodString = `${run.period_start} to ${run.period_end}`;

        await connection.beginTransaction();

        // Persist each item's status/comments decision
        for (const item of items) {
            await connection.query(`
                UPDATE payroll_run_items
                SET item_status = ?, comments = ?
                WHERE id = ? AND payroll_run_id = ?
            `, [item.item_status, item.comments || null, item.id, id]);
        }

        // A rejected item keeps its consumption rows: rejection is a decision,
        // not an oversight, so those hours must not reappear as arrears in the
        // next run. They stay visible as rejected-and-unpaid in Reconcile.

        const [approvedItems] = await connection.query(`
            SELECT pri.*,
                   DATE_FORMAT(pri.segment_start,       '%Y-%m-%d') AS segment_start,
                   DATE_FORMAT(pri.segment_end,         '%Y-%m-%d') AS segment_end,
                   DATE_FORMAT(pri.source_period_start, '%Y-%m-%d') AS source_period_start,
                   DATE_FORMAT(pri.source_period_end,   '%Y-%m-%d') AS source_period_end
            FROM payroll_run_items pri
            WHERE pri.payroll_run_id = ? AND pri.item_status = 'APPROVED'
        `, [id]);

        // Build net adjustment per employee — baked into W2 transaction amounts, not posted separately
        const [adjRows] = await connection.query(
            `SELECT * FROM payroll_run_adjustments WHERE payroll_run_id = ? AND organization_id = ?`,
            [id, orgId]
        );
        const adjNetByEmp = {};
        for (const adj of adjRows) {
            if (!adjNetByEmp[adj.employee_id]) adjNetByEmp[adj.employee_id] = 0;
            adjNetByEmp[adj.employee_id] += adj.type === 'addition' ? parseFloat(adj.amount) : -parseFloat(adj.amount);
        }
        const adjApplied = new Set(); // ensures each employee's net adjustment is baked in only once

        const regularItems = approvedItems.filter(i => i.item_type !== 'ARREARS');
        const arrearsItems = approvedItems.filter(i => i.item_type === 'ARREARS');

        // Group approved regular items by placement so LCA placements can be aggregated
        const byPlacement = {};
        for (const item of regularItems) {
            if (!byPlacement[item.placement_id]) byPlacement[item.placement_id] = [];
            byPlacement[item.placement_id].push(item);
        }

        for (const [placementId, pItems] of Object.entries(byPlacement)) {
            // Re-fetch how this placement pays out, from placement_type_history as at
            // the period end date, so an edit made after generation is respected.
            const [plRows] = await connection.query(`
                SELECT COALESCE(pth.run_as_per_lca_wage, p.run_as_per_lca_wage) AS run_as_per_lca_wage,
                       COALESCE(pth.payout_basis, 'HOURS')                      AS payout_basis,
                       pth.fixed_pay_per_period                                 AS fixed_pay_per_period
                FROM placements p
                LEFT JOIN placement_type_history pth ON pth.placement_id = p.id
                    AND pth.start_date = (
                        SELECT MAX(pth2.start_date) FROM placement_type_history pth2
                        WHERE pth2.placement_id = p.id AND pth2.start_date <= ?
                    )
                WHERE p.id = ? LIMIT 1
            `, [run.period_end, placementId]);

            const lcaItem = pItems.find(i => parseFloat(i.lca_wage) > 0 && parseFloat(i.lca_wage_per_period) > 0);

            // LCA and FIXED are the same mechanic with a different payout figure:
            // pay a set amount for the period and carry earned-minus-paid as buffer.
            // HOURS pays what was worked, so there is no buffer to carry.
            const payoutBasis = plRows[0]?.payout_basis || 'HOURS';
            const fixedPay    = parseFloat(plRows[0]?.fixed_pay_per_period) || 0;
            // run_as_per_lca_wage is still honoured for rows predating payout_basis.
            const useLca      = (payoutBasis === 'LCA' || plRows[0]?.run_as_per_lca_wage) && lcaItem;
            const useFixed    = !useLca && payoutBasis === 'FIXED' && fixedPay > 0;

            const empId  = pItems[0].employee_id;
            const empAdj = !adjApplied.has(empId) ? (adjNetByEmp[empId] || 0) : 0;

            if (useLca) {
                // Idempotency: any prior transaction for this run + placement?
                const [existing] = await connection.query(`
                    SELECT id FROM employee_transactions
                    WHERE placement_id = ?
                      AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.payroll_run_id')) = ?
                      AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.item_type')) IS NULL
                    LIMIT 1
                `, [placementId, id]);
                if (existing.length > 0) {
                    adjApplied.add(empId);
                    continue;
                }

                const combinedAmount  = pItems.reduce((s, i) => s + parseFloat(i.total_amount), 0);
                const lcaPerPeriod    = parseFloat(lcaItem.lca_wage_per_period);
                // Buffer = what the employee earned minus what we actually paid out.
                // Running as per LCA means the payout is the LCA wage for the period,
                // moved by any adjustments: additions raise the payout (bonus), while
                // deductions lower it (tax, advance recovery) and so leave MORE of the
                // employee's money with us.
                //
                //   payout = lcaPerPeriod + (sum additions - sum deductions)
                //   buffer = combinedAmount - payout
                //
                // Sign convention: positive = we hold the employee's money;
                // negative = the employee owes us that amount back.
                const payout          = lcaPerPeriod + empAdj;
                const finalAmount     = parseFloat((combinedAmount - payout).toFixed(2));
                adjApplied.add(empId);

                // Only an exactly-zero buffer means there is nothing to record. A
                // negative buffer is a real receivable from the employee and must post.
                if (finalAmount === 0) continue;

                const metadata = JSON.stringify({
                    period:              periodString,
                    period_label:        run.period_label,
                    payroll_run_id:      id,
                    payroll_run_item_id: pItems[0].id,
                    hours:               pItems.reduce((s, i) => s + parseFloat(i.approved_hours), 0),
                    pay_rate:            parseFloat(pItems[0].pay_rate),
                    lca_wage:            parseFloat(lcaItem.lca_wage),
                    lca_wage_per_period: lcaPerPeriod,
                    comments:            pItems[0].comments,
                });

                await connection.query(`
                    INSERT INTO employee_transactions
                      (id, organization_id, employee_id, placement_id,
                       transaction_type, amount, metadata, transaction_date, created_by)
                    VALUES (?, ?, ?, ?, 'W2_LCA', ?, ?, CURDATE(), ?)
                `, [uuidv4(), orgId, pItems[0].employee_id, placementId,
                    finalAmount, metadata, req.user.id]);

            } else if (useFixed) {
                // C2C fixed pay: a WITHDRAWAL, not an accrual.
                //
                // The earnings for this placement already reached the balance sheet
                // when its invoices were paid (c2cLedgerService posts them at the pay
                // rate). This period we hand the employee the flat figure, so what
                // gets posted is the amount taken back OUT of that accrued balance.
                //
                //   drawn = fixedPay + empAdj
                //
                // Same sign convention the LCA branch uses: an addition raises what
                // the employee is handed and so draws more down; a deduction lowers it
                // and leaves more of their money with us. Stored positive and
                // SUBTRACTED by every balance view, exactly like a DEDUCTION row.
                const [existing] = await connection.query(`
                    SELECT id FROM employee_transactions
                    WHERE placement_id = ?
                      AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.payroll_run_id')) = ?
                      AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.item_type')) IS NULL
                    LIMIT 1
                `, [placementId, id]);
                if (existing.length > 0) {
                    adjApplied.add(empId);
                    continue;
                }

                const drawn = parseFloat((fixedPay + empAdj).toFixed(2));
                adjApplied.add(empId);

                // A net-zero draw means nothing changed hands, so nothing to record.
                // A negative draw (a deduction larger than the fixed figure) is real —
                // the employee owed us more than we paid them — and still posts.
                if (drawn === 0) continue;

                const metadata = JSON.stringify({
                    period:               periodString,
                    period_label:         run.period_label,
                    payroll_run_id:       id,
                    payroll_run_item_id:  pItems[0].id,
                    hours:                pItems.reduce((s, i) => s + parseFloat(i.approved_hours), 0),
                    payout_basis:         'FIXED',
                    fixed_pay_per_period: fixedPay,
                    adjustment:           empAdj,
                    balance_before:       pItems[0].balance_snapshot != null ? parseFloat(pItems[0].balance_snapshot) : null,
                    segment_start:        pItems[0].segment_start || null,
                    segment_end:          pItems[0].segment_end   || null,
                    comments:             pItems[0].comments,
                });

                await connection.query(`
                    INSERT INTO employee_transactions
                      (id, organization_id, employee_id, placement_id,
                       transaction_type, amount, metadata, transaction_date, created_by)
                    VALUES (?, ?, ?, ?, 'C2C_FIXED', ?, ?, CURDATE(), ?)
                `, [uuidv4(), orgId, pItems[0].employee_id, placementId,
                    drawn, metadata, req.user.id]);

            } else {
                // Non-LCA W2: use W2_NO_LCA type — excluded from balance sheet display (buffer is $0).
                // One transaction per segment item; adjustment baked into last item.
                for (let idx = 0; idx < pItems.length; idx++) {
                    const item       = pItems[idx];
                    const isLastItem = idx === pItems.length - 1;

                    const [existing] = await connection.query(`
                        SELECT id FROM employee_transactions
                        WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.payroll_run_item_id')) = ?
                        LIMIT 1
                    `, [item.id]);
                    if (existing.length > 0) {
                        if (isLastItem) adjApplied.add(empId);
                        continue;
                    }

                    // Not run as per LCA, so the payout IS what was earned, moved by
                    // any adjustments — the same `payout` term as the LCA branch above
                    // with `earned` in place of `lcaPerPeriod`. The amount recorded here
                    // is that payout, not a buffer (a non-LCA placement has no buffer),
                    // so the adjustment keeps its natural sign rather than being negated.
                    const baseAmount = parseFloat(item.total_amount);
                    const itemAmount = isLastItem
                        ? parseFloat((baseAmount + empAdj).toFixed(2))
                        : baseAmount;

                    if (isLastItem) adjApplied.add(empId);

                    const metadata = JSON.stringify({
                        period:              periodString,
                        period_label:        run.period_label,
                        payroll_run_id:      id,
                        payroll_run_item_id: item.id,
                        hours:               parseFloat(item.approved_hours),
                        pay_rate:            parseFloat(item.pay_rate),
                        segment_start:       item.segment_start || null,
                        segment_end:         item.segment_end   || null,
                        comments:            item.comments,
                    });

                    await connection.query(`
                        INSERT INTO employee_transactions
                          (id, organization_id, employee_id, placement_id,
                           transaction_type, amount, metadata, transaction_date, created_by)
                        VALUES (?, ?, ?, ?, 'W2_NO_LCA', ?, ?, CURDATE(), ?)
                    `, [uuidv4(), orgId, item.employee_id, item.placement_id,
                        itemAmount, metadata, req.user.id]);
                }
            }
        }

        // ── Arrears ──────────────────────────────────────────────────────────
        // Settled one row at a time, and always after the regular rows, so an
        // employee's adjustment lands on their regular payout when they have one
        // and only falls through to a catch-up row when they do not.
        //
        // For an LCA placement the payout for the source period was fixed at the
        // LCA wage and is already closed, so a catch-up adds earnings against a
        // settled payout: the entire amount is buffer, less anything the
        // adjustment actually pays out. That is the same
        // `buffer = earned - payout` identity used above, with payout = empAdj.
        for (const item of arrearsItems) {
            const [existing] = await connection.query(`
                SELECT id FROM employee_transactions
                WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.payroll_run_item_id')) = ?
                LIMIT 1
            `, [item.id]);
            if (existing.length > 0) continue;

            const sourceEnd = item.source_period_end || run.period_end;

            const [plRows] = await connection.query(`
                SELECT COALESCE(pth.run_as_per_lca_wage, p.run_as_per_lca_wage) AS run_as_per_lca_wage,
                       COALESCE(pth.payout_basis, 'HOURS')                      AS payout_basis,
                       pth.fixed_pay_per_period                                 AS fixed_pay_per_period,
                       (SELECT ei.lca_wage FROM employee_immigrations ei
                        WHERE ei.employee_id = p.employee_id
                          AND ei.start_date <= ? AND (ei.till_date IS NULL OR ei.till_date >= ?)
                        ORDER BY ei.start_date DESC, ei.id DESC LIMIT 1) AS lca_wage
                FROM placements p
                LEFT JOIN placement_type_history pth ON pth.placement_id = p.id
                    AND pth.start_date = (
                        SELECT MAX(pth2.start_date) FROM placement_type_history pth2
                        WHERE pth2.placement_id = p.id AND pth2.start_date <= ?
                    )
                WHERE p.id = ? LIMIT 1
            `, [sourceEnd, item.source_period_start || sourceEnd, sourceEnd, item.placement_id]);

            const pl       = plRows[0] || {};
            // The source period's LCA payout was already settled, so a catch-up
            // against an LCA placement is entirely buffer. An hourly placement pays
            // its catch-up out as wages.
            //
            // FIXED is not considered here: arrears are raised only for periods a
            // placement was W2 (see isW2On), and FIXED is a C2C-only basis.
            const srcBasis = pl.payout_basis || 'HOURS';
            const toBuffer = (srcBasis === 'LCA' || !!pl.run_as_per_lca_wage) && parseFloat(pl.lca_wage) > 0;

            const empId  = item.employee_id;
            const empAdj = !adjApplied.has(empId) ? (adjNetByEmp[empId] || 0) : 0;
            adjApplied.add(empId);

            const earned = parseFloat(item.total_amount);
            const amount = toBuffer
                ? parseFloat((earned - empAdj).toFixed(2))   // buffer
                : parseFloat((earned + empAdj).toFixed(2));  // payout

            if (toBuffer && amount === 0) continue;

            const metadata = JSON.stringify({
                period:              periodString,
                period_label:        run.period_label,
                payroll_run_id:      id,
                payroll_run_item_id: item.id,
                item_type:           'ARREARS',
                payout_basis:        toBuffer ? 'LCA' : 'HOURS',
                source_period_label: item.source_period_label,
                source_period_start: item.source_period_start,
                source_period_end:   item.source_period_end,
                hours:               parseFloat(item.approved_hours),
                pay_rate:            parseFloat(item.pay_rate),
                segment_start:       item.segment_start || null,
                segment_end:         item.segment_end   || null,
                comments:            item.comments,
            });

            await connection.query(`
                INSERT INTO employee_transactions
                  (id, organization_id, employee_id, placement_id,
                   transaction_type, amount, metadata, transaction_date, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)
            `, [uuidv4(), orgId, item.employee_id, item.placement_id,
                toBuffer ? 'W2_LCA' : 'W2_NO_LCA', amount, metadata, req.user.id]);
        }

        // Lock the run
        await connection.query(`
            UPDATE payroll_runs
            SET status = 'SUBMITTED', submitted_by = ?, submitted_at = NOW()
            WHERE id = ?
        `, [req.user.id, id]);

        await connection.commit();
        const arrearsNote = arrearsItems.length > 0 ? ` (${arrearsItems.length} catch-up item(s))` : '';
        logAction({ orgId, module: 'payroll', action: 'Submitted Payroll Run', entityType: 'PayrollRun', entityId: id, performedBy: req.user.id, performedByRole: req.user.role, description: `Submitted payroll run for period ${periodString}, ${approvedItems.length} item(s) approved${arrearsNote}` }).catch(() => {});
        res.json({ message: 'Payroll submitted successfully.' });

    } catch (err) {
        await connection.rollback();
        console.error('SUBMIT PAYROLL RUN ERROR:', err);
        res.status(500).json({ error: 'Failed to submit payroll run.' });
    } finally {
        connection.release();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Refresh a DRAFT payroll run
//    For each placement: deletes all PENDING items, recomputes segments and
//    catch-up rows, re-inserts. APPROVED / REJECTED items are never touched.
//    Deleting a PENDING item cascades away its consumption rows, so the hours
//    it had reserved become claimable again on the recompute.
// ─────────────────────────────────────────────────────────────────────────────
export const refreshPayrollRun = async (req, res) => {
    const { id } = req.params;
    const orgId  = req.user.orgId;

    try {
        const [runs] = await pool.query(`
            SELECT id, status,
                   DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start,
                   DATE_FORMAT(period_end,   '%Y-%m-%d') AS period_end
            FROM payroll_runs
            WHERE id = ? AND organization_id = ? LIMIT 1
        `, [id, orgId]);

        if (runs.length === 0) return res.status(404).json({ error: 'Payroll run not found.' });
        if (runs[0].status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT payroll runs can be refreshed.' });

        const { period_start, period_end } = runs[0];

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Clear every PENDING item FIRST. The recompute reads the
            // consumption ledger to decide which hours are still claimable, and
            // this run's own pending reservations would otherwise read as
            // "already paid" and the hours would vanish. Deleting the items
            // cascades their ledger rows away, releasing the hours.
            //
            // APPROVED / REJECTED items are untouched, so their hours stay
            // claimed — a decision already made is not reopened by a refresh.
            await connection.query(`
                DELETE FROM payroll_run_items
                WHERE payroll_run_id = ? AND item_status = 'PENDING'
            `, [id]);

            const w2Placements      = await fetchW2Placements(connection, orgId, period_start, period_end);
            const c2cFixedPlacements = await fetchC2CFixedPlacements(connection, orgId, period_start, period_end);
            // Which periods are actually closed decides what may be caught up here.
            const settledPeriods    = await fetchSettledPeriods(connection, orgId);
            const arrearsPlacements = await fetchArrearsCandidates(connection, orgId, period_start);

            const placementIds = [...new Set([
                ...w2Placements.map(p => p.placement_id),
                ...c2cFixedPlacements.map(p => p.placement_id),
                ...arrearsPlacements.map(p => p.placement_id),
            ])];

            const { prByPlacement, brByPlacement } = await fetchRateMaps(connection, placementIds);

            const items = [];
            let unpricedHours = 0;
            for (const pl of w2Placements) {
                items.push(...await buildRegularItems(connection, pl, prByPlacement, brByPlacement, period_start, period_end));
            }

            // Re-read balances rather than reusing the snapshot: a refresh exists
            // precisely to pick up what changed since generation, and invoices paid
            // in the meantime have moved the figure this row draws against.
            if (c2cFixedPlacements.length > 0) {
                const balances = await fetchEmployeeNetBalances(
                    connection, orgId, [...new Set(c2cFixedPlacements.map(p => p.employee_id))]
                );
                for (const pl of c2cFixedPlacements) {
                    // An already-decided row for this placement keeps its own figures;
                    // only PENDING rows were cleared above and are rebuilt here.
                    const [decided] = await connection.query(`
                        SELECT 1 FROM payroll_run_items
                        WHERE payroll_run_id = ? AND placement_id = ? AND item_status <> 'PENDING' LIMIT 1
                    `, [id, pl.placement_id]);
                    if (decided.length > 0) continue;

                    const hours = await sumApprovedHours(connection, pl.placement_id, period_start, period_end);
                    items.push(...buildC2CFixedItems(
                        pl, balances[pl.employee_id] ?? 0, period_start, period_end, hours,
                        fixedPayRateFor(pl, prByPlacement, brByPlacement, period_start, period_end)));
                }
            }

            for (const pl of arrearsPlacements) {
                const arrears = await buildArrearsItems(connection, pl, prByPlacement, brByPlacement, period_start, settledPeriods);
                items.push(...arrears.items);
                unpricedHours += arrears.unpricedHours;
            }
            unpricedHours = parseFloat(unpricedHours.toFixed(2));

            for (const it of items) {
                await insertItem(connection, id, orgId, it);
            }

            const arrearsSummary = summariseArrears(items);
            arrearsSummary.unpriced_hours = unpricedHours;

            await connection.commit();

            logAction({ orgId, module: 'payroll', action: 'Refreshed Payroll Run', entityType: 'PayrollRun', entityId: id, performedBy: req.user.id, performedByRole: req.user.role, description: `Refreshed draft payroll run — ${items.length} pending item(s) recomputed, ${arrearsSummary.count} catch-up item(s)` }).catch(() => {});

            const detail = await fetchPayrollDetail(id, orgId);
            return res.json({
                ...detail,
                recomputed: items.length,
                arrears_added: arrearsSummary.count,
                arrears_summary: arrearsSummary,
            });

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error('REFRESH PAYROLL RUN ERROR:', err);
        res.status(500).json({ error: 'Failed to refresh payroll run.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: fetch full payroll run + items (dates formatted as strings)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchPayrollDetail(runId, orgId) {
    const [runs] = await pool.query(`
        SELECT pr.id, pr.period_label,
               DATE_FORMAT(pr.period_start, '%Y-%m-%d')      AS period_start,
               DATE_FORMAT(pr.period_end,   '%Y-%m-%d')      AS period_end,
               pr.year, pr.status,
               DATE_FORMAT(pr.created_at, '%Y-%m-%d')        AS run_date,
               DATE_FORMAT(pr.submitted_at, '%Y-%m-%d %H:%i') AS submitted_at
        FROM payroll_runs pr
        WHERE pr.id = ? AND pr.organization_id = ?
        LIMIT 1
    `, [runId, orgId]);

    if (runs.length === 0) return null;

    const [items] = await pool.query(`
        SELECT pri.id, pri.employee_id, pri.placement_id,
               e.first_name, e.last_name, e.employee_code,
               pri.approved_hours, pri.pay_rate, pri.lca_wage,
               pri.lca_wage_per_period, pri.total_amount,
               -- Without these three the UI cannot tell a C2C fixed-pay row from an
               -- hourly one: payout_basis defaults to 'HOURS' when absent, so the row
               -- silently rendered in the wrong section on every re-open and refresh.
               pri.payout_basis, pri.fixed_pay_per_period, pri.balance_snapshot,
               DATE_FORMAT(pri.segment_start,       '%Y-%m-%d') AS segment_start,
               DATE_FORMAT(pri.segment_end,         '%Y-%m-%d') AS segment_end,
               pri.item_type, pri.source_period_label,
               DATE_FORMAT(pri.source_period_start, '%Y-%m-%d') AS source_period_start,
               DATE_FORMAT(pri.source_period_end,   '%Y-%m-%d') AS source_period_end,
               c.client_name, p.bill_rate,
               COALESCE(pth_active.run_as_per_lca_wage, p.run_as_per_lca_wage) AS run_as_per_lca_wage,
               pri.comments, pri.item_status
        FROM payroll_run_items pri
        JOIN employees e  ON pri.employee_id  = e.id
        JOIN placements p ON pri.placement_id = p.id
        JOIN clients c    ON p.client_id      = c.id
        JOIN payroll_runs pr ON pri.payroll_run_id = pr.id
        LEFT JOIN placement_type_history pth_active ON pth_active.placement_id = p.id
            AND pth_active.start_date = (
                SELECT MAX(pth2.start_date) FROM placement_type_history pth2
                WHERE pth2.placement_id = p.id AND pth2.start_date <= pr.period_end
            )
        WHERE pri.payroll_run_id = ?
        ORDER BY pri.item_type ASC, e.first_name ASC, pri.segment_start ASC
    `, [runId]);

    const [adjustments] = await pool.query(`
        SELECT pra.id, pra.employee_id, pra.type, pra.amount, pra.description,
               e.first_name, e.last_name
        FROM payroll_run_adjustments pra
        JOIN employees e ON pra.employee_id = e.id
        WHERE pra.payroll_run_id = ? AND pra.organization_id = ?
        ORDER BY pra.created_at ASC
    `, [runId, orgId]);

    const mapped = items.map(i => ({
        ...i,
        approved_hours:      parseFloat(i.approved_hours),
        pay_rate:            parseFloat(i.pay_rate),
        lca_wage:            i.lca_wage            != null ? parseFloat(i.lca_wage)            : null,
        lca_wage_per_period: i.lca_wage_per_period != null ? parseFloat(i.lca_wage_per_period) : null,
        total_amount:        parseFloat(i.total_amount),
        bill_rate:           parseFloat(i.bill_rate) || 0,
        run_as_per_lca_wage: !!i.run_as_per_lca_wage,
        payout_basis:         i.payout_basis || 'HOURS',
        fixed_pay_per_period: i.fixed_pay_per_period != null ? parseFloat(i.fixed_pay_per_period) : null,
        balance_snapshot:     i.balance_snapshot     != null ? parseFloat(i.balance_snapshot)     : null,
        item_type:           i.item_type || 'REGULAR',
    }));

    const arrears = mapped.filter(i => i.item_type === 'ARREARS');

    return {
        ...runs[0],
        items: mapped,
        adjustments: adjustments.map(a => ({
            ...a,
            amount: parseFloat(a.amount),
        })),
        arrears_summary: {
            count:   arrears.length,
            hours:   parseFloat(arrears.reduce((s, i) => s + i.approved_hours, 0).toFixed(2)),
            amount:  parseFloat(arrears.reduce((s, i) => s + i.total_amount, 0).toFixed(2)),
            periods: [...new Set(arrears.map(i => i.source_period_label).filter(Boolean))],
            unpriced_hours: 0,
        },
    };
}

// ─── Payroll Run Adjustments ──────────────────────────────────────────────────

export const getPayrollAdjustments = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(`
            SELECT pra.id, pra.employee_id, pra.type, pra.amount, pra.description,
                   e.first_name, e.last_name
            FROM payroll_run_adjustments pra
            JOIN employees e ON pra.employee_id = e.id
            WHERE pra.payroll_run_id = ? AND pra.organization_id = ?
            ORDER BY pra.created_at ASC
        `, [id, req.user.orgId]);
        res.json(rows.map(r => ({ ...r, amount: parseFloat(r.amount) })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const addPayrollAdjustment = async (req, res) => {
    const { id } = req.params;
    const { employee_id, type, amount, description } = req.body;

    if (!employee_id || !type || !amount || !description) {
        return res.status(400).json({ error: 'Employee, type, amount, and description are required.' });
    }
    if (!['addition', 'deduction'].includes(type)) {
        return res.status(400).json({ error: 'Type must be addition or deduction.' });
    }
    if (parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than zero.' });
    }

    try {
        const [runArr] = await pool.query(
            `SELECT status FROM payroll_runs WHERE id = ? AND organization_id = ?`,
            [id, req.user.orgId]
        );
        if (!runArr.length) return res.status(404).json({ error: 'Payroll run not found.' });
        if (runArr[0].status !== 'DRAFT') {
            return res.status(400).json({ error: 'Adjustments can only be added to DRAFT payroll runs.' });
        }

        const adjId = uuidv4();
        await pool.query(
            `INSERT INTO payroll_run_adjustments (id, payroll_run_id, organization_id, employee_id, type, amount, description, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [adjId, id, req.user.orgId, employee_id, type, parseFloat(amount), description.trim(), req.user.id]
        );
        res.status(201).json({ id: adjId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deletePayrollAdjustment = async (req, res) => {
    const { id, adjId } = req.params;
    try {
        const [runArr] = await pool.query(
            `SELECT status FROM payroll_runs WHERE id = ? AND organization_id = ?`,
            [id, req.user.orgId]
        );
        if (!runArr.length) return res.status(404).json({ error: 'Payroll run not found.' });
        if (runArr[0].status !== 'DRAFT') {
            return res.status(400).json({ error: 'Adjustments cannot be removed from a submitted payroll run.' });
        }

        const [result] = await pool.query(
            `DELETE FROM payroll_run_adjustments WHERE id = ? AND payroll_run_id = ? AND organization_id = ?`,
            [adjId, id, req.user.orgId]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Adjustment not found.' });
        res.json({ message: 'Adjustment removed.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
