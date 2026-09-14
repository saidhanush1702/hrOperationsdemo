/**
 * payrollService.js
 *
 * Shared payroll primitives. Before this module the W2-placement query, the
 * rate-segment builder and the approved-hours sum were copy-pasted between
 * generatePayrollRun and refreshPayrollRun; arrears would have made that a third
 * copy, and the reconcile report a fourth. Everything that decides "which hours,
 * at which rate, for which period" lives here so those callers cannot drift.
 *
 * The central new concept is the CONSUMPTION LEDGER (payroll_item_entries):
 * every payroll item records the exact timesheet entries it paid for, with the
 * hours frozen at write time. That turns two previously unanswerable questions
 * into simple queries:
 *
 *   - "Which approved hours has payroll never paid?"  -> arrears
 *   - "Was this timesheet paid, and in which run?"    -> reconcile
 */

import { v4 as uuidv4 } from 'uuid';
import { dateMinus1, normDateStr } from '../utils/dateUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers — semi-monthly periods (1st–15th, 16th–EOM), matching the 24
// periods the Run Payroll modal offers.
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const round2 = (n) => parseFloat((n || 0).toFixed(2));

export const lastDayOfMonth = (year, month1) => new Date(year, month1, 0).getDate();

// Returns the semi-monthly period that contains a YYYY-MM-DD date.
export const semiMonthlyPeriod = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const isFirstHalf = d <= 15;
    const startDay = isFirstHalf ? 1 : 16;
    const endDay   = isFirstHalf ? 15 : lastDayOfMonth(y, m);
    const pad = (n) => String(n).padStart(2, '0');
    return {
        label: `${MONTH_ABBR[m - 1]} ${startDay}-${endDay}`,
        start: `${y}-${pad(m)}-${pad(startDay)}`,
        end:   `${y}-${pad(m)}-${pad(endDay)}`,
        year:  y,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Pro-rate LCA wage for the overlap between payroll period and immigration dates
// ─────────────────────────────────────────────────────────────────────────────
export const calcLcaWagePerPeriod = (lcaWage, immStart, immTill, periodStart, periodEnd) => {
    const annual = parseFloat(lcaWage) || 0;
    if (annual === 0) return 0;
    if (!immStart || !immTill) return annual / 24;
    const pStart = new Date(periodStart);
    const pEnd   = new Date(periodEnd);
    const iStart = new Date(immStart);
    const iTill  = new Date(immTill);
    if (iTill < pStart || iStart > pEnd) return 0;
    const overlapStart = new Date(Math.max(pStart.getTime(), iStart.getTime()));
    const overlapEnd   = new Date(Math.min(pEnd.getTime(),   iTill.getTime()));
    const overlapDays  = Math.round((overlapEnd - overlapStart) / 86400000) + 1;
    const periodDays   = Math.round((pEnd - pStart) / 86400000) + 1;
    return (annual / 24) * (overlapDays / periodDays);
};

// ─────────────────────────────────────────────────────────────────────────────
// Rate segment builder
//
// Given pay rates + bill rates (effective_date as YYYY-MM-DD strings), a pay
// rate type ('Amount' | 'Percentage') and a window, returns an array of
// {segStart, segEnd, payRate} covering the whole window.
//
//   - A rate is "active" once its effective_date arrives, until the next one.
//   - For 'Percentage' types, bill rate changes also create segment boundaries.
// ─────────────────────────────────────────────────────────────────────────────
export const buildRateSegments = (payRates, billRates, payRateType, periodStart, periodEnd) => {
    const validPR = payRates
        .filter(r => r.effective_date <= periodEnd)
        .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1));

    if (validPR.length === 0) return [];

    const validBR = payRateType === 'Percentage'
        ? billRates
            .filter(r => r.effective_date <= periodEnd)
            .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1))
        : [];

    const breakSet = new Set([periodStart]);
    for (const r of validPR) {
        if (r.effective_date > periodStart && r.effective_date <= periodEnd)
            breakSet.add(r.effective_date);
    }
    for (const r of validBR) {
        if (r.effective_date > periodStart && r.effective_date <= periodEnd)
            breakSet.add(r.effective_date);
    }

    const breaks = [...breakSet].sort();

    const getPayRateVal = (date) => {
        const active = validPR.filter(r => r.effective_date <= date);
        return active.length ? parseFloat(active[active.length - 1].pay_rate_value) : null;
    };

    const getEffectiveBR = (date) => {
        const active = validBR.filter(r => r.effective_date <= date);
        if (!active.length) return 0;
        const br = active[active.length - 1];
        const base = parseFloat(br.bill_rate_value) || 0;
        const disc = parseFloat(br.discount_percentage) || 0;
        return base - (base * (disc / 100));
    };

    const segments = [];
    for (let i = 0; i < breaks.length; i++) {
        const segStart = breaks[i];
        const segEnd   = i + 1 < breaks.length ? dateMinus1(breaks[i + 1]) : periodEnd;

        if (segStart > periodEnd) continue;

        const prVal = getPayRateVal(segStart);
        if (prVal === null) continue;

        const payRate = payRateType === 'Percentage'
            ? getEffectiveBR(segStart) * (prVal / 100)
            : prVal;

        segments.push({ segStart, segEnd, payRate });
    }
    return segments;
};

// ─────────────────────────────────────────────────────────────────────────────
// Placement / rate loading
// ─────────────────────────────────────────────────────────────────────────────

// W2 placements that were live at some point during [periodStart, periodEnd].
// Pay type, LCA flag and immigration record are all resolved point-in-time, so a
// back-dated run sees the world as it was, not as it is today.
export const fetchW2Placements = async (conn, orgId, periodStart, periodEnd) => {
    const [rows] = await conn.query(`
        SELECT p.id AS placement_id, p.employee_id, p.pay_rate, p.pay_rate_type, p.bill_rate,
               COALESCE(pth.run_as_per_lca_wage, p.run_as_per_lca_wage) AS run_as_per_lca_wage,
               COALESCE(pth.payout_basis, 'HOURS') AS payout_basis,
               pth.fixed_pay_per_period,
               e.first_name, e.last_name, e.employee_code,
               c.client_name,
               i.lca_wage, i.start_date AS imm_start_date, i.till_date AS imm_till_date
        FROM placements p
        LEFT JOIN placement_type_history pth ON pth.placement_id = p.id
            AND pth.start_date = (
                SELECT MAX(pth2.start_date) FROM placement_type_history pth2
                WHERE pth2.placement_id = p.id AND pth2.start_date <= ?
            )
        LEFT JOIN lkp_pay_types pth_pt ON pth.pay_type_id = pth_pt.id
        JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
        JOIN employees e ON p.employee_id = e.id
        JOIN clients c ON p.client_id = c.id
        LEFT JOIN employee_immigrations i ON i.employee_id = p.employee_id
            AND i.id = (
                SELECT ei.id FROM employee_immigrations ei
                WHERE ei.employee_id = p.employee_id
                  AND ei.start_date <= ? AND (ei.till_date IS NULL OR ei.till_date >= ?)
                ORDER BY ei.start_date DESC, ei.id DESC LIMIT 1
            )
        WHERE COALESCE(pth_pt.name, pt.name) = 'W2'
          -- Point-in-time eligibility: the placement must have been running
          -- during the period, not merely be Active today.
          AND p.start_date <= ?
          AND (p.end_date IS NULL OR p.end_date >= ?)
          AND p.organization_id = ?
    `, [periodEnd, periodEnd, periodStart, periodEnd, periodStart, orgId]);
    return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// C2C fixed pay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * C2C placements on a FIXED payout basis that were live during the period.
 *
 * These behave nothing like a W2 line. A C2C placement's earnings reach the
 * balance sheet when its INVOICE is paid (see c2cLedgerService), priced at the
 * pay rate — that is untouched by fixed pay. What fixed pay adds is the other
 * side: every period, payroll withdraws a flat figure from the balance the
 * employee has accrued, and the remainder carries forward.
 *
 * The payout therefore does not depend on hours at all, which is why — unlike
 * fetchW2Placements, whose rows only matter when there are claimable hours —
 * a row here is owed for every period the placement is live, timesheets or not.
 */
export const fetchC2CFixedPlacements = async (conn, orgId, periodStart, periodEnd) => {
    const [rows] = await conn.query(`
        SELECT p.id AS placement_id, p.employee_id, p.pay_rate, p.pay_rate_type, p.bill_rate,
               pth.fixed_pay_per_period,
               e.first_name, e.last_name, e.employee_code,
               c.client_name
        FROM placements p
        LEFT JOIN placement_type_history pth ON pth.placement_id = p.id
            AND pth.start_date = (
                SELECT MAX(pth2.start_date) FROM placement_type_history pth2
                WHERE pth2.placement_id = p.id AND pth2.start_date <= ?
            )
        LEFT JOIN lkp_pay_types pth_pt ON pth.pay_type_id = pth_pt.id
        JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
        JOIN employees e ON p.employee_id = e.id
        JOIN clients c ON p.client_id = c.id
        WHERE COALESCE(pth_pt.name, pt.name) = 'C2C'
          AND pth.payout_basis = 'FIXED'
          AND pth.fixed_pay_per_period > 0
          -- Point-in-time eligibility, matching fetchW2Placements: the placement
          -- must have been running during the period, not merely be Active today.
          AND p.start_date <= ?
          AND (p.end_date IS NULL OR p.end_date >= ?)
          AND p.organization_id = ?
    `, [periodEnd, periodEnd, periodStart, orgId]);
    return rows;
};

/**
 * Each employee's net balance-sheet position, keyed by employee id.
 *
 * This is deliberately the SAME arithmetic getBalanceSheets uses for its
 * net_balance column, so the figure a payroll reviewer sees against an employee
 * is the figure the Balance Sheet page shows them. Duplicating the CASE
 * expression is the cost of not having a view; keep the two in step.
 */
export const fetchEmployeeNetBalances = async (conn, orgId, employeeIds) => {
    if (!employeeIds.length) return {};
    const [rows] = await conn.query(`
        SELECT t.employee_id,
               COALESCE(SUM(CASE WHEN t.transaction_type IN ('C2C','W2_LCA','W2_STANDARD') THEN t.amount ELSE 0 END), 0)
             + COALESCE(SUM(CASE WHEN t.transaction_type = 'PAYOUT'    THEN t.amount ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN t.transaction_type = 'DEDUCTION' THEN t.amount ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN t.transaction_type = 'C2C_FIXED' THEN t.amount ELSE 0 END), 0) AS net_balance
        FROM employee_transactions t
        WHERE t.organization_id = ? AND t.employee_id IN (?)
        GROUP BY t.employee_id
    `, [orgId, employeeIds]);

    const byEmp = {};
    for (const r of rows) byEmp[r.employee_id] = parseFloat(r.net_balance) || 0;
    // An employee with no ledger rows at all has a zero balance, not an absent one.
    for (const id of employeeIds) if (byEmp[id] === undefined) byEmp[id] = 0;
    return byEmp;
};

// Pay/bill rate history for a set of placements, grouped by placement id.
export const fetchRateMaps = async (conn, placementIds) => {
    if (!placementIds.length) return { prByPlacement: {}, brByPlacement: {} };

    const [allPayRates] = await conn.query(`
        SELECT placement_id, pay_rate_value,
               DATE_FORMAT(effective_date, '%Y-%m-%d') AS effective_date
        FROM placement_pay_rates WHERE placement_id IN (?)
    `, [placementIds]);

    const [allBillRates] = await conn.query(`
        SELECT placement_id, bill_rate_value, discount_percentage,
               DATE_FORMAT(effective_date, '%Y-%m-%d') AS effective_date
        FROM placement_bill_rates WHERE placement_id IN (?)
    `, [placementIds]);

    const prByPlacement = {};
    const brByPlacement = {};
    for (const r of allPayRates) {
        if (!prByPlacement[r.placement_id]) prByPlacement[r.placement_id] = [];
        prByPlacement[r.placement_id].push(r);
    }
    for (const r of allBillRates) {
        if (!brByPlacement[r.placement_id]) brByPlacement[r.placement_id] = [];
        brByPlacement[r.placement_id].push(r);
    }
    return { prByPlacement, brByPlacement };
};

// Segments for a placement over a window, with the legacy single-rate fallback
// used when a placement has no rows in placement_pay_rates at all.
//
// An empty result means the placement has NO usable rate — no rate rows and no
// legacy placements.pay_rate. Payroll cannot price those hours, so it skips
// them. Callers must report that rather than swallow it: skipping silently is
// what lets real unpaid time disappear without a trace.
export const segmentsForPlacement = (pl, prByPlacement, brByPlacement, from, to) => {
    let segments = buildRateSegments(
        prByPlacement[pl.placement_id] || [],
        brByPlacement[pl.placement_id] || [],
        pl.pay_rate_type,
        from, to
    );
    if (segments.length === 0 && parseFloat(pl.pay_rate) > 0) {
        segments = [{ segStart: from, segEnd: to, payRate: parseFloat(pl.pay_rate) }];
    }
    return segments;
};

// True when no rate can be resolved for this placement anywhere in its life.
export const isPlacementUnpriced = (pl, prByPlacement) =>
    (prByPlacement[pl.placement_id] || []).length === 0 && !(parseFloat(pl.pay_rate) > 0);

// ─────────────────────────────────────────────────────────────────────────────
// The consumption ledger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Approved timesheet entries for a placement in a window, each annotated with
 * how many of its hours payroll has already consumed.
 *
 * `outstanding` is what a new payroll item may still claim. It is clamped at
 * zero: if an already-paid timesheet is later edited DOWN, we do not claw the
 * money back (an approved timesheet is final) — the surplus simply shows up in
 * the reconcile report as paid-above-expected.
 */
export const fetchClaimableEntries = async (conn, placementId, from, to) => {
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

    return rows.map(r => {
        const approved = parseFloat(r.approved_hours) || 0;
        const paid     = parseFloat(r.paid_hours) || 0;
        return {
            entry_id:       r.entry_id,
            timesheet_id:   r.timesheet_id,
            work_date:      r.work_date,
            approved_hours: approved,
            paid_hours:     paid,
            outstanding:    Math.max(0, parseFloat((approved - paid).toFixed(2))),
        };
    });
};

// Writes the consumption rows for a payroll item. `allocations` are the entries
// (each carrying an `outstanding` amount) this item is paying for.
//
// Batched: a first catch-up run over a backlog can allocate tens of thousands of
// entry-days, and one round trip each turns a payroll generate into minutes of
// waiting. Chunked so a single statement never grows past what MySQL will accept.
const ENTRY_INSERT_CHUNK = 500;

export const writeItemEntries = async (conn, { orgId, placementId, payrollRunItemId = null, legacyTransactionId = null }, allocations) => {
    const rows = allocations
        .filter(a => a.outstanding > 0)
        .map(a => [uuidv4(), orgId, placementId, payrollRunItemId, legacyTransactionId,
                   a.timesheet_id, a.entry_id, a.work_date, a.outstanding]);

    for (let i = 0; i < rows.length; i += ENTRY_INSERT_CHUNK) {
        const chunk = rows.slice(i, i + ENTRY_INSERT_CHUNK);
        await conn.query(`
            INSERT INTO payroll_item_entries
              (id, organization_id, placement_id, payroll_run_item_id, legacy_transaction_id,
               timesheet_id, timesheet_entry_id, work_date, hours)
            VALUES ?
        `, [chunk]);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pay-type history
//
// A placement can switch between C2C and W2 over its life. Arrears look far
// back in time, so days when the placement was NOT W2 must be excluded — those
// hours are settled through the C2C invoice ledger, not payroll, and pulling
// them into a W2 run would pay them a second time.
//
// The same history also decides whether a given past period ran as per LCA,
// which is what tells submit whether a catch-up amount is a payout or a buffer.
// ─────────────────────────────────────────────────────────────────────────────
export const fetchPayTypeHistory = async (conn, placementId) => {
    const [rows] = await conn.query(`
        SELECT DATE_FORMAT(pth.start_date, '%Y-%m-%d') AS start_date,
               pt.name                                 AS pay_type,
               pth.run_as_per_lca_wage
        FROM placement_type_history pth
        JOIN lkp_pay_types pt ON pth.pay_type_id = pt.id
        WHERE pth.placement_id = ?
        ORDER BY pth.start_date ASC
    `, [placementId]);

    // No history at all -> the caller already established the placement is W2,
    // so treat its whole life as W2 (matches the COALESCE fallback elsewhere).
    return rows.length === 0 ? null : rows;
};

// The history row in force on a date, or null when the date predates the first
// row (the placement's type before that point is unknown).
const historyEntryOn = (history, dateStr) => {
    if (history === null) return null;
    let active = null;
    for (const row of history) {
        if (row.start_date <= dateStr) active = row; else break;
    }
    return active;
};

// A date before the first history row is treated as W2. Migration 043 seeds one
// row per placement at its start_date, so this only comes up for time worked
// before the placement officially began — which the caller has already
// established is a W2 placement.
export const isW2On = (history, dateStr) => {
    if (history === null) return true;
    const entry = historyEntryOn(history, dateStr);
    return entry === null ? true : entry.pay_type === 'W2';
};

export const runAsLcaOn = (history, dateStr, placementFallback) => {
    if (history === null) return placementFallback === 1 || placementFallback === true;
    const entry = historyEntryOn(history, dateStr);
    if (entry === null) return placementFallback === 1 || placementFallback === true;
    return entry.run_as_per_lca_wage === 1 || entry.run_as_per_lca_wage === true;
};

// ─────────────────────────────────────────────────────────────────────────────
// Arrears candidates
//
// Scanning every placement on every run would be needlessly slow, and the set
// that matters is small: placements holding approved hours that no payroll item
// has claimed. One aggregate query finds them.
//
// GREATEST(..., 0) per entry rather than a net SUM, so a placement with one
// over-paid entry and one under-paid entry is still picked up instead of
// cancelling itself out to zero.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The periods payroll has actually CLOSED: one range per SUBMITTED run.
 *
 * This is what makes a day eligible for catch-up. Arrears exists for one reason --
 * a submitted run is locked and uk_org_period forbids re-running that period, so
 * hours approved afterwards have nowhere to go. That reasoning only holds once the
 * period is closed.
 *
 * If the period's run is still DRAFT, or was never generated at all, the hours are
 * NOT stranded: they belong in that period's own run, and pulling them into a later
 * one would both misattribute them and (for an open draft) steal the hours out from
 * under it, since a pending claim suppresses the day everywhere else.
 */
export const fetchSettledPeriods = async (conn, orgId) => {
    const [rows] = await conn.query(`
        SELECT DATE_FORMAT(period_start, '%Y-%m-%d') AS start,
               DATE_FORMAT(period_end,   '%Y-%m-%d') AS end
        FROM payroll_runs
        WHERE organization_id = ? AND status = 'SUBMITTED'
        ORDER BY period_start
    `, [orgId]);
    return rows;
};

// True when a submitted run already covers this date, i.e. the period it belongs to
// is closed and the day can no longer be paid where it was worked.
export const isPeriodSettled = (settled, dateStr) =>
    settled.some(r => dateStr >= r.start && dateStr <= r.end);

export const fetchArrearsCandidates = async (conn, orgId, beforeDate) => {
    const [outstanding] = await conn.query(`
        SELECT t.placement_id,
               SUM(GREATEST(te.hours - COALESCE(pie.paid_hours, 0), 0)) AS outstanding_hours
        FROM timesheet_entries te
        JOIN timesheets t ON te.timesheet_id = t.id
        LEFT JOIN (
            SELECT timesheet_entry_id, SUM(hours) AS paid_hours
            FROM payroll_item_entries
            WHERE organization_id = ? AND work_date < ?
            GROUP BY timesheet_entry_id
        ) pie ON pie.timesheet_entry_id = te.id
        WHERE t.organization_id = ? AND t.status_id = 3
          AND te.work_date < ? AND te.hours > 0
          -- Only days whose own pay period is already closed. Days sitting in an
          -- open draft, or in a period nobody has run yet, are still payable where
          -- they were worked and must not be dragged forward.
          AND EXISTS (
              SELECT 1 FROM payroll_runs r
              WHERE r.organization_id = ? AND r.status = 'SUBMITTED'
                AND te.work_date BETWEEN r.period_start AND r.period_end
          )
        GROUP BY t.placement_id
        HAVING outstanding_hours > 0.001
    `, [orgId, beforeDate, orgId, beforeDate, orgId]);

    if (outstanding.length === 0) return [];

    const ids = outstanding.map(r => r.placement_id);

    // W2 at ANY point in its life, not merely today. A placement that was W2 in
    // June and switched to C2C in July still owes its June hours, and resolving
    // the pay type only as of the run's period_end would silently drop them.
    const [rows] = await conn.query(`
        SELECT p.id AS placement_id, p.employee_id, p.pay_rate, p.pay_rate_type, p.bill_rate,
               p.run_as_per_lca_wage,
               e.first_name, e.last_name, e.employee_code,
               c.client_name
        FROM placements p
        JOIN employees e ON p.employee_id = e.id
        JOIN clients c ON p.client_id = c.id
        LEFT JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
        WHERE p.organization_id = ?
          AND p.id IN (?)
          AND (
            pt.name = 'W2'
            OR EXISTS (
                SELECT 1 FROM placement_type_history pth
                JOIN lkp_pay_types pt2 ON pth.pay_type_id = pt2.id
                WHERE pth.placement_id = p.id AND pt2.name = 'W2'
            )
          )
    `, [orgId, ids]);

    return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// Arrears
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds every approved hour before `beforeDate` that payroll has never paid for,
 * and groups it into rows ready to be inserted as ARREARS payroll items.
 *
 * Grouping is (source semi-monthly period x rate segment): the period is what
 * the user recognises ("Jul 1-15"), the rate segment is what guarantees the
 * hours are priced at the rate that was in force when they were worked rather
 * than at today's rate.
 *
 * Any existing consumption row suppresses a day — including one from an item
 * still PENDING in an open draft, or one that was REJECTED. That is deliberate:
 * pending hours must not be claimed twice by two open runs, and rejected hours
 * are a decision, not an oversight (they surface in the reconcile report instead
 * of coming back every period forever).
 *
 * Returns { items, unpricedHours }. Hours the placement has no rate for cannot
 * be turned into a payroll row, but they ARE owed, so they are counted and
 * reported back instead of being dropped in silence.
 */
export const buildArrearsForPlacement = async (conn, pl, prByPlacement, brByPlacement, beforeDate, settled = []) => {
    const EMPTY = { items: [], unpricedHours: 0 };
    // Earliest approved timesheet day for this placement — the natural floor,
    // since nothing can be owed before the placement first reported time.
    const [boundRows] = await conn.query(`
        SELECT DATE_FORMAT(MIN(te.work_date), '%Y-%m-%d') AS first_date
        FROM timesheet_entries te
        JOIN timesheets t ON te.timesheet_id = t.id
        WHERE t.placement_id = ? AND t.status_id = 3 AND te.hours > 0
    `, [pl.placement_id]);

    const firstDate = boundRows[0] && boundRows[0].first_date;
    if (!firstDate) return EMPTY;

    const from = firstDate;
    const to   = dateMinus1(beforeDate);
    if (from > to) return EMPTY;

    const entries = await fetchClaimableEntries(conn, pl.placement_id, from, to);
    const outstanding = entries.filter(e => e.outstanding > 0);
    if (outstanding.length === 0) return EMPTY;

    // Drop days the placement was not on W2, and days whose own pay period has not
    // been closed yet -- those are still payable in their own run (see
    // fetchSettledPeriods). The candidate scan already applies the same rule at the
    // placement level; repeating it per day is what keeps a placement that has SOME
    // settled unpaid days from also dragging in its unsettled ones.
    const history  = await fetchPayTypeHistory(conn, pl.placement_id);
    const eligible = outstanding.filter(e => isW2On(history, e.work_date) && isPeriodSettled(settled, e.work_date));
    if (eligible.length === 0) return EMPTY;

    // No rate anywhere in this placement's life: the hours are genuinely owed
    // but cannot be priced, so they are reported rather than silently skipped.
    if (isPlacementUnpriced(pl, prByPlacement)) {
        return { items: [], unpricedHours: round2(eligible.reduce((s, e) => s + e.outstanding, 0)) };
    }

    // Bucket by source period.
    const byPeriod = {};
    for (const e of eligible) {
        const period = semiMonthlyPeriod(e.work_date);
        if (!byPeriod[period.start]) byPeriod[period.start] = { period, entries: [] };
        byPeriod[period.start].entries.push(e);
    }

    const items = [];
    let unpricedHours = 0;
    for (const bucket of Object.values(byPeriod)) {
        const { period, entries: periodEntries } = bucket;
        const segments = segmentsForPlacement(pl, prByPlacement, brByPlacement, period.start, period.end);
        if (segments.length === 0) {
            // Time worked before the placement's first rate took effect.
            unpricedHours = round2(unpricedHours + periodEntries.reduce((s, e) => s + e.outstanding, 0));
            continue;
        }

        for (const seg of segments) {
            const segEntries = periodEntries.filter(e => e.work_date >= seg.segStart && e.work_date <= seg.segEnd);
            if (segEntries.length === 0) continue;

            const hours = parseFloat(segEntries.reduce((s, e) => s + e.outstanding, 0).toFixed(2));
            if (hours <= 0) continue;

            items.push({
                placement_id: pl.placement_id,
                employee_id:  pl.employee_id,
                hours,
                payRate:      seg.payRate,
                totalAmount:  parseFloat((hours * seg.payRate).toFixed(2)),
                // The actual worked days being caught up, not the whole segment —
                // reads correctly in the UI and stays inside the source period.
                segStart:     segEntries[0].work_date,
                segEnd:       segEntries[segEntries.length - 1].work_date,
                sourcePeriodLabel: period.label,
                sourcePeriodStart: period.start,
                sourcePeriodEnd:   period.end,
                // Resolved as of the SOURCE period, not today: whether these
                // hours were paid against an LCA wage is a fact about the period
                // they were worked in.
                runAsLca:     runAsLcaOn(history, period.end, pl.run_as_per_lca_wage),
                allocations:  segEntries,
            });
        }
    }

    // Oldest period first, so the catch-up section reads chronologically.
    items.sort((a, b) => (a.segStart < b.segStart ? -1 : 1));
    return { items, unpricedHours };
};

export { normDateStr };
