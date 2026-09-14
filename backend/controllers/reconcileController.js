/**
 * reconcileController.js
 *
 * Answers one question the system could not previously answer at all:
 * "for every employee, what have we earned them and what have we actually paid,
 *  and where exactly is the gap?"
 *
 * DEFINITIONS
 * -----------
 * EXPECTED  Every approved timesheet hour, priced at the pay rate that was in
 *           force on the day it was worked. Rate segmentation is shared with
 *           payroll (services/payrollService.js) so the two can never disagree.
 *
 * PAID      An hour counts as paid once it has been SETTLED:
 *             W2  — claimed by an APPROVED payroll item in a SUBMITTED run
 *                   (or by the legacy balance-sheet payroll path), which is what
 *                   payroll_item_entries records.
 *             C2C — carried by a C2C ledger row, which invoiceController writes
 *                   only when its invoice is FULLY paid. A part-paid invoice
 *                   therefore reads as unpaid, which is the intent: no money has
 *                   reached the employee ledger yet.
 *
 *           This is deliberately an EARNED/SETTLED basis rather than a cash-out
 *           basis. For an LCA placement the cash payout is the LCA wage, not
 *           hours x rate, and the ledger stores only the buffer — so a cash
 *           basis could not answer "which timesheets still owe money?", which is
 *           the question this page exists for.
 *
 * DIFFERENCE = expected - paid. Non-zero means hours are approved but not yet
 *           run through payroll, were rejected at payroll, or belong to a C2C
 *           invoice that has not been paid in full.
 */

import pool from '../config/db.js';
import {
    fetchRateMaps,
    buildRateSegments,
    isPlacementUnpriced,
    semiMonthlyPeriod,
} from '../services/payrollService.js';

const round2 = (n) => parseFloat((n || 0).toFixed(2));

// ─────────────────────────────────────────────────────────────────────────────
// Pricing
//
// Builds a day -> rate lookup for a placement across the whole span its
// timesheets cover. Rates are piecewise constant, so this walks the segments
// once rather than resolving the rate history per day.
// ─────────────────────────────────────────────────────────────────────────────
const buildRateLookup = (placement, prByPlacement, brByPlacement, from, to) => {
    let segments = buildRateSegments(
        prByPlacement[placement.placement_id] || [],
        brByPlacement[placement.placement_id] || [],
        placement.pay_rate_type,
        from, to
    );
    if (segments.length === 0 && parseFloat(placement.pay_rate) > 0) {
        segments = [{ segStart: from, segEnd: to, payRate: parseFloat(placement.pay_rate) }];
    }

    const rateOn = (dateStr) => {
        for (let i = segments.length - 1; i >= 0; i--) {
            if (dateStr >= segments[i].segStart && dateStr <= segments[i].segEnd) return segments[i].payRate;
        }
        // Before the first rate took effect there is no rate to price with, so
        // fall forward to the earliest known rate rather than pricing at zero.
        return segments.length ? segments[0].payRate : 0;
    };

    // A placement with no rate at all prices every hour at $0. Left unflagged
    // that reads as expected $0 / paid $0 / difference $0 — a perfectly balanced
    // row hiding genuinely unpaid time. The hours are tracked separately so the
    // report can say so out loud.
    rateOn.isUnpriced = isPlacementUnpriced(placement, prByPlacement);
    return rateOn;
};

// Placements that carry timesheets, with the span their approved time covers.
const fetchPlacementsWithTime = async (orgId) => {
    const [rows] = await pool.query(`
        SELECT p.id AS placement_id, p.employee_id, p.placement_code,
               p.pay_rate, p.pay_rate_type,
               pt.name AS pay_type_name,
               c.client_name,
               DATE_FORMAT(MIN(te.work_date), '%Y-%m-%d') AS first_date,
               DATE_FORMAT(MAX(te.work_date), '%Y-%m-%d') AS last_date
        FROM placements p
        JOIN clients c ON p.client_id = c.id
        LEFT JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
        JOIN timesheets t ON t.placement_id = p.id
        JOIN timesheet_entries te ON te.timesheet_id = t.id
        WHERE p.organization_id = ? AND te.hours > 0
        GROUP BY p.id
    `, [orgId]);
    return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Summary — one row per employee
// ─────────────────────────────────────────────────────────────────────────────
export const getReconcileSummary = async (req, res) => {
    try {
        const orgId = req.user.orgId;

        const [employees] = await pool.query(`
            SELECT e.id AS employee_id, e.first_name, e.last_name, e.employee_code,
                   e.country_id, e.employee_type_id,
                   lc.name AS country_name,
                   let2.name AS employee_type_name,
                   u.is_active,
                   (SELECT pt.name
                    FROM placements p
                    LEFT JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
                    WHERE p.employee_id = e.id AND p.status = 'Active'
                    ORDER BY CASE pt.name WHEN 'W2' THEN 1 WHEN 'C2C' THEN 2 WHEN '1099' THEN 3 ELSE 4 END ASC
                    LIMIT 1) AS pay_type_name,
                   (SELECT p.pay_type_id
                    FROM placements p
                    LEFT JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
                    WHERE p.employee_id = e.id AND p.status = 'Active'
                    ORDER BY CASE pt.name WHEN 'W2' THEN 1 WHEN 'C2C' THEN 2 WHEN '1099' THEN 3 ELSE 4 END ASC
                    LIMIT 1) AS pay_type_id
            FROM users u
            JOIN employees e ON u.id = e.user_id
            LEFT JOIN lkp_countries lc ON e.country_id = lc.id
            LEFT JOIN lkp_employee_types let2 ON e.employee_type_id = let2.id
            WHERE u.organization_id = ? AND u.role = 'EMPLOYEE'
            ORDER BY e.first_name ASC, e.last_name ASC
        `, [orgId]);

        const placements = await fetchPlacementsWithTime(orgId);
        const byPlacementId = {};
        for (const p of placements) byPlacementId[p.placement_id] = p;

        const { prByPlacement, brByPlacement } = await fetchRateMaps(pool, placements.map(p => p.placement_id));

        // Approved time, one row per placement-day. Rates are piecewise constant
        // but the timesheet grain is daily, so this is the coarsest grouping that
        // still prices every hour at the rate in force when it was worked.
        const [approvedDays] = await pool.query(`
            SELECT t.placement_id,
                   DATE_FORMAT(te.work_date, '%Y-%m-%d') AS work_date,
                   SUM(te.hours) AS hours
            FROM timesheet_entries te
            JOIN timesheets t ON te.timesheet_id = t.id
            WHERE t.organization_id = ? AND t.status_id = 3 AND te.hours > 0
            GROUP BY t.placement_id, te.work_date
        `, [orgId]);

        // Settled W2 hours, priced at the rate the payroll item paid them at.
        const [paidW2] = await pool.query(`
            SELECT pie.placement_id,
                   SUM(pie.hours) AS paid_hours,
                   SUM(pie.hours * COALESCE(
                        pri.pay_rate,
                        CAST(JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.pay_rate')) AS DECIMAL(12,4)),
                        0)) AS paid_amount
            FROM payroll_item_entries pie
            LEFT JOIN payroll_run_items pri ON pie.payroll_run_item_id = pri.id
            LEFT JOIN payroll_runs pr       ON pri.payroll_run_id = pr.id
            LEFT JOIN employee_transactions et ON pie.legacy_transaction_id = et.id
            WHERE pie.organization_id = ?
              AND (
                    (pri.id IS NOT NULL AND pri.item_status = 'APPROVED' AND pr.status = 'SUBMITTED')
                 OR  pie.legacy_transaction_id IS NOT NULL
              )
            GROUP BY pie.placement_id
        `, [orgId]);

        // Settled C2C hours. The ledger row exists only once its invoice was paid
        // in full, so its presence IS the paid signal.
        const [paidC2C] = await pool.query(`
            SELECT et.placement_id,
                   SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_hours')) AS DECIMAL(12,4))) AS paid_hours,
                   SUM(et.amount) AS paid_amount
            FROM employee_transactions et
            WHERE et.organization_id = ? AND et.transaction_type = 'C2C'
              AND et.placement_id IS NOT NULL
            GROUP BY et.placement_id
        `, [orgId]);

        // ── Expected, per placement ──────────────────────────────────────────
        const expectedByPlacement = {};
        const rateLookups = {};
        for (const p of placements) {
            rateLookups[p.placement_id] = buildRateLookup(p, prByPlacement, brByPlacement, p.first_date, p.last_date);
            expectedByPlacement[p.placement_id] = { hours: 0, amount: 0, unpricedHours: 0 };
        }
        for (const d of approvedDays) {
            const bucket = expectedByPlacement[d.placement_id];
            if (!bucket) continue;
            const hours  = parseFloat(d.hours) || 0;
            const rateOn = rateLookups[d.placement_id];
            bucket.hours  += hours;
            bucket.amount += hours * rateOn(d.work_date);
            if (rateOn.isUnpriced) bucket.unpricedHours += hours;
        }

        // ── Roll up to employees ─────────────────────────────────────────────
        const byEmployee = {};
        const bucketFor = (employeeId) => {
            if (!byEmployee[employeeId]) {
                byEmployee[employeeId] = {
                    expected_hours: 0, expected_amount: 0,
                    paid_hours: 0, paid_amount: 0,
                    unpriced_hours: 0,
                };
            }
            return byEmployee[employeeId];
        };

        for (const [placementId, exp] of Object.entries(expectedByPlacement)) {
            const pl = byPlacementId[placementId];
            if (!pl) continue;
            const b = bucketFor(pl.employee_id);
            b.expected_hours  += exp.hours;
            b.expected_amount += exp.amount;
            b.unpriced_hours  += exp.unpricedHours;
        }
        for (const row of [...paidW2, ...paidC2C]) {
            const pl = byPlacementId[row.placement_id];
            if (!pl) continue;
            const b = bucketFor(pl.employee_id);
            b.paid_hours  += parseFloat(row.paid_hours) || 0;
            b.paid_amount += parseFloat(row.paid_amount) || 0;
        }

        const result = employees.map(emp => {
            const b = byEmployee[emp.employee_id] || { expected_hours: 0, expected_amount: 0, paid_hours: 0, paid_amount: 0, unpriced_hours: 0 };
            return {
                ...emp,
                is_active:       emp.is_active === 1 || emp.is_active === true,
                expected_hours:  round2(b.expected_hours),
                expected_amount: round2(b.expected_amount),
                paid_hours:      round2(b.paid_hours),
                paid_amount:     round2(b.paid_amount),
                difference:      round2(b.expected_amount - b.paid_amount),
                // Approved hours on a placement with no pay rate on file. They
                // price at $0, so they never move expected/paid/difference —
                // without this column the row would look settled when it is not.
                unpriced_hours:  round2(b.unpriced_hours),
            };
        });

        res.json(result);
    } catch (err) {
        console.error('RECONCILE SUMMARY ERROR:', err);
        res.status(500).json({ error: 'Failed to load reconciliation summary.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Detail — one row per timesheet, SPLIT by how it was settled
//
// Timesheet cycles are weekly or bi-weekly per placement while payroll periods
// are semi-monthly, so a single timesheet routinely straddles two payroll runs.
// A timesheet therefore yields one row per settlement bucket that touched it
// (each payroll period, each C2C invoice) plus a final row for whatever is still
// unpaid — instead of one row with an ambiguous single "paid?" flag.
// ─────────────────────────────────────────────────────────────────────────────
export const getReconcileDetail = async (req, res) => {
    try {
        const { id: employeeId } = req.params;
        const orgId = req.user.orgId;

        const [empRows] = await pool.query(`
            SELECT e.id AS employee_id, e.first_name, e.last_name, e.employee_code, u.is_active
            FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.id = ? AND u.organization_id = ?
            LIMIT 1
        `, [employeeId, orgId]);

        if (empRows.length === 0) return res.status(404).json({ error: 'Employee not found.' });

        const [timesheets] = await pool.query(`
            SELECT t.id, t.placement_id,
                   DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
                   DATE_FORMAT(t.end_date,   '%Y-%m-%d') AS end_date,
                   t.status_id, s.name AS status_name,
                   p.placement_code, c.client_name,
                   pt.name AS pay_type_name,
                   p.pay_rate, p.pay_rate_type
            FROM timesheets t
            JOIN lkp_timesheet_statuses s ON t.status_id = s.id
            JOIN placements p ON t.placement_id = p.id
            JOIN clients c ON p.client_id = c.id
            LEFT JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
            WHERE t.employee_id = ? AND t.organization_id = ?
            ORDER BY t.start_date DESC
        `, [employeeId, orgId]);

        if (timesheets.length === 0) {
            return res.json({ ...empRows[0], rows: [], totals: { expected_amount: 0, paid_amount: 0, difference: 0 } });
        }

        const timesheetIds = timesheets.map(t => t.id);
        const placementIds = [...new Set(timesheets.map(t => t.placement_id))];

        const [entries] = await pool.query(`
            SELECT te.id AS entry_id, te.timesheet_id,
                   DATE_FORMAT(te.work_date, '%Y-%m-%d') AS work_date,
                   te.hours
            FROM timesheet_entries te
            WHERE te.timesheet_id IN (?) AND te.hours > 0
            ORDER BY te.work_date ASC
        `, [timesheetIds]);

        // W2 settlements, resolved to the exact entry they paid for.
        const [allocations] = await pool.query(`
            SELECT pie.timesheet_entry_id, pie.timesheet_id, pie.hours,
                   DATE_FORMAT(pie.work_date, '%Y-%m-%d') AS work_date,
                   pri.id AS item_id, pri.pay_rate, pri.item_status, pri.item_type,
                   pri.source_period_label,
                   pr.id AS run_id, pr.period_label, pr.status AS run_status,
                   DATE_FORMAT(pr.submitted_at, '%Y-%m-%d') AS submitted_at,
                   pie.legacy_transaction_id,
                   CAST(JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.pay_rate')) AS DECIMAL(12,4)) AS legacy_pay_rate,
                   JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.period')) AS legacy_period,
                   DATE_FORMAT(et.transaction_date, '%Y-%m-%d') AS legacy_date
            FROM payroll_item_entries pie
            LEFT JOIN payroll_run_items pri ON pie.payroll_run_item_id = pri.id
            LEFT JOIN payroll_runs pr       ON pri.payroll_run_id = pr.id
            LEFT JOIN employee_transactions et ON pie.legacy_transaction_id = et.id
            WHERE pie.timesheet_id IN (?)
        `, [timesheetIds]);

        // C2C settlements. These are per invoice period, not per entry, so they
        // are matched to days by the segment window the ledger row recorded.
        const [c2cRows] = await pool.query(`
            SELECT et.placement_id, et.amount,
                   CAST(JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_hours')) AS DECIMAL(12,4)) AS invoice_hours,
                   CAST(JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.pay_rate'))      AS DECIMAL(12,4)) AS pay_rate,
                   JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number'))     AS invoice_number,
                   -- Rows written by the C2C reprice path carry no segment window.
                   -- Falling back to the invoice's own period keeps them matchable;
                   -- without it the window is unbounded and the row would claim
                   -- every timesheet on the placement.
                   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.segment_start')),
                            DATE_FORMAT(inv.period_start, '%Y-%m-%d'))              AS segment_start,
                   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.segment_end')),
                            DATE_FORMAT(inv.period_end,   '%Y-%m-%d'))              AS segment_end,
                   DATE_FORMAT(inv.paid_date,    '%Y-%m-%d') AS paid_date,
                   DATE_FORMAT(inv.period_start, '%Y-%m-%d') AS invoice_period_start
            FROM employee_transactions et
            LEFT JOIN invoices inv ON inv.organization_id = et.organization_id
                AND inv.invoice_number = JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number'))
            -- Keyed off the employee, not the placements that happen to have
            -- timesheets: a C2C payment on a placement with no timesheets is
            -- still money paid, and the summary counts it, so the detail must
            -- see it too or the two would disagree.
            WHERE et.organization_id = ? AND et.transaction_type = 'C2C'
              AND et.employee_id = ?
        `, [orgId, employeeId]);

        // Rate lookups, one per placement, spanning all its timesheet time.
        const [spans] = await pool.query(`
            SELECT t.placement_id,
                   DATE_FORMAT(MIN(t.start_date), '%Y-%m-%d') AS first_date,
                   DATE_FORMAT(MAX(t.end_date),   '%Y-%m-%d') AS last_date
            FROM timesheets t
            WHERE t.placement_id IN (?)
            GROUP BY t.placement_id
        `, [placementIds]);

        const { prByPlacement, brByPlacement } = await fetchRateMaps(pool, placementIds);
        const placementMeta = {};
        for (const t of timesheets) {
            if (!placementMeta[t.placement_id]) {
                placementMeta[t.placement_id] = {
                    placement_id: t.placement_id,
                    pay_rate: t.pay_rate,
                    pay_rate_type: t.pay_rate_type,
                };
            }
        }
        const rateLookups = {};
        for (const s of spans) {
            rateLookups[s.placement_id] = buildRateLookup(
                placementMeta[s.placement_id], prByPlacement, brByPlacement, s.first_date, s.last_date
            );
        }

        // ── Index the source data ────────────────────────────────────────────
        const entriesByTimesheet = {};
        for (const e of entries) {
            if (!entriesByTimesheet[e.timesheet_id]) entriesByTimesheet[e.timesheet_id] = [];
            entriesByTimesheet[e.timesheet_id].push(e);
        }

        const allocByTimesheet = {};
        for (const a of allocations) {
            if (!allocByTimesheet[a.timesheet_id]) allocByTimesheet[a.timesheet_id] = [];
            allocByTimesheet[a.timesheet_id].push(a);
        }

        const c2cByPlacement = {};
        for (const r of c2cRows) {
            if (!c2cByPlacement[r.placement_id]) c2cByPlacement[r.placement_id] = [];
            c2cByPlacement[r.placement_id].push(r);
        }
        // Oldest invoice period first. Because each row claims only the hours
        // nothing has taken yet, the order decides which invoice a shared day is
        // attributed to — fixing it here keeps the report stable between loads.
        for (const list of Object.values(c2cByPlacement)) {
            list.sort((a, b) => String(a.segment_start || '').localeCompare(String(b.segment_start || '')));
        }

        // ── Hours already represented by a row, keyed by timesheet entry ─────
        //
        // This is what the final "unpaid" row subtracts, and it counts every
        // claim — settled or not. A pending or rejected payroll item has reserved
        // its hours and already emits its own row for them; subtracting only
        // settled hours would list the same hours twice (once as "In payroll",
        // again as "Not paid") and make the timesheet look like it holds double
        // its actual time.
        //
        // Distinct from `totalPaid`, which counts only settled rows.
        const accountedByEntry = {};

        // Payroll claims are recorded per entry, so they are exact and they go
        // first — a C2C window must never take a day payroll already owns.
        for (const a of allocations) {
            accountedByEntry[a.timesheet_entry_id] =
                (accountedByEntry[a.timesheet_entry_id] || 0) + (parseFloat(a.hours) || 0);
        }

        // ── C2C allocation pre-pass ──────────────────────────────────────────
        //
        // C2C ledger rows record no per-entry allocation, only a date window, so
        // they are matched to days here. Two things this must get right:
        //
        //   1. Each entry yields only the hours nothing has claimed yet, so
        //      overlapping invoice periods cannot pay the same day twice.
        //   2. The row amounts must sum to the LEDGER amount, not to
        //      hours x rate. The ledger row is the money that actually moved
        //      (the reprice path can rewrite it), so the ledger amount is spread
        //      across the days it covers. Recomputing instead would make this
        //      page disagree with the summary and with the balance sheet.
        //
        // Anything that cannot be tied to a timesheet still has to appear, or
        // real money would vanish from the report — it becomes an unmatched row.
        const c2cAllocByTimesheet = {};
        const unmatchedC2C        = [];

        for (const [placementId, ledgerRows] of Object.entries(c2cByPlacement)) {
            const placementTimesheets = timesheets
                .filter(t => t.placement_id === placementId)
                .sort((a, b) => a.start_date.localeCompare(b.start_date));

            for (const c of ledgerRows) {
                const ledgerAmount = parseFloat(c.amount) || 0;
                const claims = [];   // [{ timesheet_id, hours }]

                if (c.segment_start && c.segment_end) {
                    for (const ts of placementTimesheets) {
                        let claimed = 0;
                        for (const e of (entriesByTimesheet[ts.id] || [])) {
                            if (e.work_date < c.segment_start || e.work_date > c.segment_end) continue;
                            const free = Math.max(0, parseFloat(e.hours) - (accountedByEntry[e.entry_id] || 0));
                            if (free <= 0.001) continue;
                            accountedByEntry[e.entry_id] = (accountedByEntry[e.entry_id] || 0) + free;
                            claimed += free;
                        }
                        if (claimed > 0.001) claims.push({ timesheet_id: ts.id, hours: round2(claimed) });
                    }
                }

                if (claims.length === 0) {
                    unmatchedC2C.push({ c, amount: ledgerAmount });
                    continue;
                }

                // Spread the ledger amount across the days it covers, giving the
                // rounding remainder to the last piece so the pieces sum exactly.
                const totalClaimed = claims.reduce((s, x) => s + x.hours, 0);
                let allocated = 0;
                claims.forEach((x, i) => {
                    const amount = i === claims.length - 1
                        ? round2(ledgerAmount - allocated)
                        : round2(ledgerAmount * (x.hours / totalClaimed));
                    allocated = round2(allocated + amount);
                    if (!c2cAllocByTimesheet[x.timesheet_id]) c2cAllocByTimesheet[x.timesheet_id] = [];
                    c2cAllocByTimesheet[x.timesheet_id].push({ c, hours: x.hours, amount });
                });
            }
        }

        // ── Build the split rows ─────────────────────────────────────────────
        const rows = [];
        let totalExpected = 0;
        let totalPaid     = 0;

        for (const ts of timesheets) {
            const tsEntries = entriesByTimesheet[ts.id] || [];
            const rateOn    = rateLookups[ts.placement_id] || (() => parseFloat(ts.pay_rate) || 0);

            const totalHours  = round2(tsEntries.reduce((s, e) => s + parseFloat(e.hours), 0));
            const totalAmount = round2(tsEntries.reduce((s, e) => s + parseFloat(e.hours) * rateOn(e.work_date), 0));
            const isApproved  = ts.status_id === 3;

            // Only approved time is ever expected to be paid.
            if (isApproved) totalExpected += totalAmount;

            const base = {
                unpriced:        !!rateOn.isUnpriced,
                timesheet_id:    ts.id,
                placement_id:    ts.placement_id,
                placement_code:  ts.placement_code,
                client_name:     ts.client_name,
                pay_type_name:   ts.pay_type_name,
                period_start:    ts.start_date,
                period_end:      ts.end_date,
                status_id:       ts.status_id,
                status_name:     ts.status_name,
                timesheet_hours: totalHours,
                timesheet_amount: totalAmount,
            };

            // 1. W2 buckets — one row per payroll run that touched this timesheet.
            const buckets = {};
            for (const a of (allocByTimesheet[ts.id] || [])) {
                // A pending or rejected item has RESERVED the hours but has not
                // paid them. It is shown as its own row so the hours are never
                // silently invisible, but it does not count toward paid.
                const settled = a.legacy_transaction_id
                    ? true
                    : (a.item_status === 'APPROVED' && a.run_status === 'SUBMITTED');

                const key = a.legacy_transaction_id
                    ? `legacy:${a.legacy_transaction_id}`
                    : `run:${a.run_id}:${a.item_status}`;

                if (!buckets[key]) {
                    buckets[key] = {
                        settled,
                        hours: 0,
                        amount: 0,
                        pay_rate: parseFloat(a.pay_rate ?? a.legacy_pay_rate ?? 0),
                        kind: a.legacy_transaction_id ? 'LEGACY_PAYROLL' : 'PAYROLL',
                        run_id: a.run_id || null,
                        period_label: a.period_label || a.legacy_period || null,
                        item_status: a.legacy_transaction_id ? 'APPROVED' : a.item_status,
                        run_status: a.legacy_transaction_id ? 'SUBMITTED' : a.run_status,
                        is_arrears: a.item_type === 'ARREARS',
                        source_period_label: a.source_period_label || null,
                        paid_date: a.submitted_at || a.legacy_date || null,
                    };
                }

                const hrs  = parseFloat(a.hours) || 0;
                const rate = parseFloat(a.pay_rate ?? a.legacy_pay_rate ?? 0);
                buckets[key].hours  += hrs;
                buckets[key].amount += hrs * rate;
            }

            for (const b of Object.values(buckets)) {
                if (b.settled) totalPaid += b.amount;
                rows.push({
                    ...base,
                    row_kind:     b.kind,
                    hours:        round2(b.hours),
                    pay_rate:     round2(b.pay_rate),
                    amount:       round2(b.amount),
                    is_paid:      b.settled,
                    // Rejected is a decision, not a queue position: those hours
                    // keep their ledger claim (so they never resurface as a
                    // catch-up row) but were deliberately not paid, and saying
                    // "In payroll" would hide that.
                    paid_via:     b.settled
                        ? (b.is_arrears ? 'PAYROLL_CATCHUP' : 'PAYROLL')
                        : (b.item_status === 'REJECTED' ? 'REJECTED_PAYROLL' : 'PENDING_PAYROLL'),
                    paid_label:   b.is_arrears && b.source_period_label
                        ? `${b.period_label} (catch-up for ${b.source_period_label})`
                        : b.period_label,
                    paid_date:    b.settled ? b.paid_date : null,
                    payroll_run_id: b.run_id,
                    item_status:  b.item_status,
                    run_status:   b.run_status,
                });
            }

            // 2. C2C rows, from the pre-pass above.
            for (const alloc of (c2cAllocByTimesheet[ts.id] || [])) {
                totalPaid += alloc.amount;
                rows.push({
                    ...base,
                    row_kind:   'C2C',
                    hours:      alloc.hours,
                    // The effective rate this invoice actually paid these hours
                    // at, derived from the ledger amount rather than assumed.
                    pay_rate:   alloc.hours > 0 ? round2(alloc.amount / alloc.hours) : 0,
                    amount:     alloc.amount,
                    is_paid:    true,
                    paid_via:   'C2C',
                    paid_label: alloc.c.invoice_number ? `Invoice ${alloc.c.invoice_number}` : 'C2C invoice',
                    paid_date:  alloc.c.paid_date || null,
                    payroll_run_id: null,
                    item_status: 'APPROVED',
                    run_status:  'SUBMITTED',
                });
            }

            // 3. Whatever no row above already accounts for. Hours sitting in a
            //    draft or rejected payroll item are NOT left over — they have
            //    their own row already.
            const unsettledHours = round2(tsEntries.reduce((s, e) => {
                const accounted = accountedByEntry[e.entry_id] || 0;
                return s + Math.max(0, parseFloat(e.hours) - accounted);
            }, 0));

            if (unsettledHours > 0.001) {
                const unsettledAmount = round2(tsEntries.reduce((s, e) => {
                    const accounted = accountedByEntry[e.entry_id] || 0;
                    const rem = Math.max(0, parseFloat(e.hours) - accounted);
                    return s + rem * rateOn(e.work_date);
                }, 0));

                rows.push({
                    ...base,
                    row_kind:   'UNPAID',
                    hours:      unsettledHours,
                    pay_rate:   tsEntries.length ? round2(rateOn(tsEntries[0].work_date)) : 0,
                    amount:     unsettledAmount,
                    is_paid:    false,
                    paid_via:   isApproved ? 'NOT_RUN' : 'NOT_APPROVED',
                    paid_label: isApproved
                        ? `Approved — expected in ${semiMonthlyPeriod(tsEntries[0].work_date).label}`
                        : ts.status_name,
                    paid_date:  null,
                    payroll_run_id: null,
                    item_status: null,
                    run_status:  null,
                });
            }
        }

        // C2C money that could not be tied to any timesheet day — the ledger row
        // has no usable window, or its days are already claimed. It was still
        // paid, so it is listed rather than quietly dropped; otherwise this page
        // would understate what the employee received and overstate the gap.
        for (const u of unmatchedC2C) {
            totalPaid += u.amount;
            rows.push({
                unpriced:         false,
                timesheet_id:     null,
                placement_id:     u.c.placement_id,
                placement_code:   null,
                client_name:      null,
                pay_type_name:    'C2C',
                period_start:     u.c.segment_start || u.c.invoice_period_start || null,
                period_end:       u.c.segment_end || null,
                status_id:        null,
                status_name:      'Not matched to a timesheet',
                timesheet_hours:  0,
                timesheet_amount: 0,
                row_kind:         'C2C_UNMATCHED',
                hours:            parseFloat(u.c.invoice_hours) || 0,
                pay_rate:         round2(parseFloat(u.c.pay_rate) || 0),
                amount:           round2(u.amount),
                is_paid:          true,
                paid_via:         'C2C',
                paid_label:       u.c.invoice_number ? `Invoice ${u.c.invoice_number}` : 'C2C invoice',
                paid_date:        u.c.paid_date || null,
                payroll_run_id:   null,
                item_status:      'APPROVED',
                run_status:       'SUBMITTED',
            });
        }

        res.json({
            ...empRows[0],
            is_active: empRows[0].is_active === 1 || empRows[0].is_active === true,
            rows,
            totals: {
                expected_amount: round2(totalExpected),
                paid_amount:     round2(totalPaid),
                difference:      round2(totalExpected - totalPaid),
            },
        });
    } catch (err) {
        console.error('RECONCILE DETAIL ERROR:', err);
        res.status(500).json({ error: 'Failed to load reconciliation detail.' });
    }
};
