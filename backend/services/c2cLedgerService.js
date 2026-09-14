/**
 * c2cLedgerService.js
 *
 * Single source of truth for how a C2C placement turns into balance-sheet money.
 *
 * The balance sheet never reads placements or invoices — it only sums
 * employee_transactions. A C2C ledger row is written once, when an invoice
 * becomes fully Paid, and it freezes the pay rate that was on file at that
 * moment. That is why a placement whose pay rate was missing (or 0) shows a $0
 * balance forever: fixing the pay rate later changes placement_pay_rates, but
 * nothing goes back and re-prices the rows that were already posted.
 *
 * This module owns three things:
 *
 *   1. buildC2CPayRateSegments / postC2CLedgerForInvoice
 *      The original posting logic, lifted out of invoiceController so the live
 *      path and the repricing path can never drift apart.
 *
 *   2. repriceC2CLedgerForPlacement
 *      Re-prices existing C2C rows against the *current* rate tables.
 *      It deliberately RE-PRICES rather than RE-DERIVES: the hours that were
 *      posted stay exactly as posted, only the rate (and therefore the amount)
 *      is recomputed. Re-deriving hours from timesheet_entries is what makes
 *      the backfill script dangerous — flat-rate placements bill "1 unit" while
 *      their timesheets hold 160 real hours, and duplicated timesheets produce
 *      exactly 2x. Holding hours fixed makes the operation impossible to get
 *      wrong: same hours, new rate, new amount.
 *
 *   3. repriceC2CLedgerForEmployee
 *      The same thing across every C2C placement an employee has.
 *
 * Both reprice functions support dryRun, which is what the preview endpoint and
 * the "N entries will change" confirmation are built on.
 */

import { v4 as uuidv4 } from 'uuid';
import { dateMinus1, normDateStr } from '../utils/dateUtils.js';

// ─── Rate segmentation ───────────────────────────────────────────────────────
// Build pay-rate segments covering an invoice period.
// Returns [{segStart, segEnd, payRate}].

export const buildC2CPayRateSegments = (payRates, billRates, payRateType, periodStart, periodEnd) => {
    const validPR = payRates
        .filter(r => r.effective_date <= periodEnd)
        .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1));

    if (validPR.length === 0) return [];

    const validBR = payRateType === 'Percentage'
        ? billRates.filter(r => r.effective_date <= periodEnd)
            .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1))
        : [];

    const breakSet = new Set([periodStart]);
    for (const r of validPR) {
        if (r.effective_date > periodStart && r.effective_date <= periodEnd) breakSet.add(r.effective_date);
    }
    for (const r of validBR) {
        if (r.effective_date > periodStart && r.effective_date <= periodEnd) breakSet.add(r.effective_date);
    }

    const breaks = [...breakSet].sort();

    const getPRVal = (date) => {
        const active = validPR.filter(r => r.effective_date <= date);
        return active.length ? parseFloat(active[active.length - 1].pay_rate_value) : null;
    };

    const getBRVal = (date) => {
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
        const prVal = getPRVal(segStart);
        if (prVal === null) continue;
        const payRate = payRateType === 'Percentage'
            ? getBRVal(segStart) * (prVal / 100)
            : prVal;
        segments.push({ segStart, segEnd, payRate });
    }
    return segments;
};

// ─── Live posting (invoice → Paid) ───────────────────────────────────────────
// Writes the C2C ledger rows for a newly-paid invoice. Caller is responsible
// for the pay-type check, the "already posted?" check, and the transaction.

export const postC2CLedgerForInvoice = async (connection, invoice, paidDate, userId, orgId) => {
    const periodStart = normDateStr(invoice.period_start);
    const periodEnd   = normDateStr(invoice.period_end);

    const [payRateRows] = await connection.query(`
        SELECT pay_rate_value, DATE_FORMAT(effective_date, '%Y-%m-%d') AS effective_date
        FROM placement_pay_rates WHERE placement_id = ?
    `, [invoice.placement_id]);

    const [billRateRows] = await connection.query(`
        SELECT bill_rate_value, discount_percentage, DATE_FORMAT(effective_date, '%Y-%m-%d') AS effective_date
        FROM placement_bill_rates WHERE placement_id = ?
    `, [invoice.placement_id]);

    const segments = buildC2CPayRateSegments(payRateRows, billRateRows, invoice.pay_rate_type, periodStart, periodEnd);

    if (segments.length > 0) {
        const [entries] = await connection.query(`
            SELECT DATE_FORMAT(te.work_date, '%Y-%m-%d') AS work_date, te.hours
            FROM timesheet_entries te
            JOIN timesheets t ON te.timesheet_id = t.id
            WHERE t.placement_id = ? AND t.status_id = 3
              AND te.work_date >= ? AND te.work_date <= ?
        `, [invoice.placement_id, periodStart, periodEnd]);

        for (const seg of segments) {
            const segHours = entries
                .filter(e => e.work_date >= seg.segStart && e.work_date <= seg.segEnd)
                .reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);
            if (segHours === 0) continue;

            const segAmount = parseFloat((segHours * seg.payRate).toFixed(2));
            const metadata  = JSON.stringify({
                invoice_hours: segHours, pay_rate: seg.payRate,
                invoice_number: invoice.invoice_number,
                segment_start: seg.segStart, segment_end: seg.segEnd,
            });
            await connection.query(`
                INSERT INTO employee_transactions
                  (id, organization_id, employee_id, placement_id,
                   transaction_type, amount, metadata, transaction_date, created_by)
                VALUES (?, ?, ?, ?, 'C2C', ?, ?, ?, ?)
            `, [uuidv4(), orgId, invoice.employee_id, invoice.placement_id,
                segAmount, metadata, paidDate, userId]);
        }
        return;
    }

    // No dated pay rates covering the period — fall back to the flat placement rate.
    const totalHours       = parseFloat(invoice.total_hours);
    const effectivePRValue = parseFloat(invoice.effective_pay_rate_value);
    const resolvedBillRate = parseFloat(invoice.effective_bill_rate ?? invoice.placement_bill_rate) || 0;
    let payRate;
    if (!isNaN(effectivePRValue) && effectivePRValue > 0) {
        payRate = invoice.pay_rate_type === 'Percentage'
            ? resolvedBillRate * (effectivePRValue / 100)
            : effectivePRValue;
    } else {
        payRate = parseFloat(invoice.pay_rate) || 0;
    }
    const metadata = JSON.stringify({
        invoice_hours: totalHours, pay_rate: payRate, invoice_number: invoice.invoice_number,
    });
    await connection.query(`
        INSERT INTO employee_transactions
          (id, organization_id, employee_id, placement_id,
           transaction_type, amount, metadata, transaction_date, created_by)
        VALUES (?, ?, ?, ?, 'C2C', ?, ?, ?, ?)
    `, [uuidv4(), orgId, invoice.employee_id, invoice.placement_id,
        totalHours * payRate, metadata, paidDate, userId]);
};

// ─── Repricing ───────────────────────────────────────────────────────────────

/**
 * Resolve the pay rate that applies on a given date, using the same precedence
 * the live posting path uses:
 *   1. the latest dated pay rate effective on or before `date`
 *   2. if the placement has NO dated pay rates at all, its flat placements.pay_rate
 *   3. otherwise 0 — rates exist but none had taken effect yet on that date,
 *      which is a real answer, not a failure: nothing was earned at a rate that
 *      did not exist. The preview surfaces this so the effective date can be fixed.
 */
const resolveRateForDate = ({ payRates, billRates, payRateType, date, flatFallback }) => {
    const activePR = payRates.filter(r => r.effective_date <= date);

    if (activePR.length === 0) {
        if (payRates.length === 0) {
            return { rate: parseFloat(flatFallback) || 0, source: 'placement_flat_rate' };
        }
        return { rate: 0, source: 'no_rate_effective_yet' };
    }

    const prVal = parseFloat(activePR[activePR.length - 1].pay_rate_value) || 0;

    if (payRateType !== 'Percentage') {
        return { rate: prVal, source: 'dated_pay_rate' };
    }

    const activeBR = billRates.filter(r => r.effective_date <= date);
    if (activeBR.length === 0) {
        return { rate: 0, source: 'no_bill_rate_effective_yet' };
    }
    const br   = activeBR[activeBR.length - 1];
    const base = parseFloat(br.bill_rate_value) || 0;
    const disc = parseFloat(br.discount_percentage) || 0;
    return { rate: (base - base * (disc / 100)) * (prVal / 100), source: 'dated_percentage_of_bill_rate' };
};

const parseMeta = (raw) => {
    if (!raw) return {};
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
};

const daysBetween = (a, b) =>
    Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1;

/**
 * Split one ledger row's posted hours across the rate segments that cover its
 * span, when a rate change lands *inside* the span.
 *
 * The hours are only ever redistributed, never recomputed: the split weights come
 * from the approved timesheet entries when they exist (calendar days otherwise),
 * and the result is scaled so the segment hours sum to EXACTLY the hours that
 * were already posted. That keeps the guarantee that matters — re-pricing can
 * never invent or lose hours — while still honouring the effective dates, which
 * is what the original invoice-payment path does via buildC2CPayRateSegments.
 */
const splitHoursAcrossSegments = async (connection, { placementId, segments, spanStart, spanEnd, postedHours }) => {
    const [entries] = await connection.query(`
        SELECT DATE_FORMAT(te.work_date, '%Y-%m-%d') AS work_date, te.hours
        FROM timesheet_entries te
        JOIN timesheets t ON te.timesheet_id = t.id
        WHERE t.placement_id = ? AND t.status_id = 3
          AND te.work_date >= ? AND te.work_date <= ?
    `, [placementId, spanStart, spanEnd]);

    let weights = segments.map(seg =>
        entries
            .filter(e => e.work_date >= seg.segStart && e.work_date <= seg.segEnd)
            .reduce((s, e) => s + parseFloat(e.hours || 0), 0)
    );
    let weightTotal = weights.reduce((s, w) => s + w, 0);
    let basis = 'timesheet_entries';

    // No approved entries in range (or they sum to nothing) — fall back to
    // calendar days so the split still reflects the effective dates.
    if (weightTotal <= 0) {
        weights = segments.map(seg => daysBetween(seg.segStart, seg.segEnd));
        weightTotal = weights.reduce((s, w) => s + w, 0);
        basis = 'calendar_days';
    }
    if (weightTotal <= 0) return null;

    // Scale to the hours actually posted, letting the final segment absorb the
    // rounding remainder so the total is exact to the cent-hour.
    const out = [];
    let allocated = 0;
    for (let i = 0; i < segments.length; i++) {
        const isLast = i === segments.length - 1;
        const hrs = isLast
            ? parseFloat((postedHours - allocated).toFixed(2))
            : parseFloat((postedHours * (weights[i] / weightTotal)).toFixed(2));
        allocated = parseFloat((allocated + hrs).toFixed(2));
        if (hrs <= 0) continue;
        out.push({ ...segments[i], hours: hrs, split_basis: basis });
    }
    return out.length > 1 ? out : null;
};

/**
 * Re-price every posted C2C ledger row on one placement against the current
 * rate tables. Hours are never recomputed — only the rate and the amount.
 *
 * @param {*}       connection  an open pool connection; the caller owns the transaction
 * @param {object}  opts
 * @param {string}  opts.placementId
 * @param {string}  opts.orgId
 * @param {boolean} opts.dryRun  when true, computes the diff and writes nothing
 *
 * @returns {{
 *   placement_id, placement_code, pay_rate_type,
 *   changes: Array<{transaction_id, invoice_number, period_start, period_end,
 *                   hours, old_pay_rate, new_pay_rate, old_amount, new_amount,
 *                   delta, rate_source}>,
 *   skipped: Array<{invoice_number, reason}>,
 *   unchanged_count, total_before, total_after, delta, missing_ledger_rows
 * }}
 */
export const repriceC2CLedgerForPlacement = async (connection, { placementId, orgId, userId = null, dryRun = false }) => {
    if (!dryRun && !userId) {
        throw new Error('repriceC2CLedgerForPlacement: userId is required when dryRun is false.');
    }
    const [placementRows] = await connection.query(`
        SELECT p.id, p.placement_code, p.pay_rate, p.pay_rate_type
        FROM placements p
        WHERE p.id = ? AND p.organization_id = ?
        LIMIT 1
    `, [placementId, orgId]);

    const empty = {
        placement_id: placementId, placement_code: null, pay_rate_type: null,
        changes: [], skipped: [], warnings: [], unchanged_count: 0,
        total_before: 0, total_after: 0, delta: 0, missing_ledger_rows: 0,
    };
    if (placementRows.length === 0) return empty;

    const placement = placementRows[0];

    // Every posted C2C row on this placement, joined to the invoice that produced it.
    const [ledgerRows] = await connection.query(`
        SELECT et.id, et.employee_id, CAST(et.amount AS DECIMAL(12,2)) AS amount, et.metadata,
               DATE_FORMAT(et.transaction_date, '%Y-%m-%d') AS transaction_date,
               i.id                                          AS invoice_id,
               i.status_id                                   AS invoice_status_id,
               DATE_FORMAT(i.period_start, '%Y-%m-%d')       AS period_start,
               DATE_FORMAT(i.period_end,   '%Y-%m-%d')       AS period_end
        FROM employee_transactions et
        LEFT JOIN invoices i
               ON i.organization_id = et.organization_id
              AND i.invoice_number  = JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number'))
        WHERE et.placement_id = ? AND et.organization_id = ? AND et.transaction_type = 'C2C'
        ORDER BY et.transaction_date ASC, et.created_at ASC
    `, [placementId, orgId]);

    // Paid C2C invoices that never produced a ledger row. Repricing cannot invent
    // them — that is the backfill script's job — but the caller should know.
    const [[{ missing_ledger_rows }]] = await connection.query(`
        SELECT COUNT(*) AS missing_ledger_rows
        FROM invoices i
        WHERE i.placement_id = ? AND i.organization_id = ? AND i.status_id = 6
          AND NOT EXISTS (
              SELECT 1 FROM employee_transactions et
              WHERE et.placement_id = i.placement_id
                AND JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number')) = i.invoice_number
          )
    `, [placementId, orgId]);

    if (ledgerRows.length === 0) {
        return { ...empty, placement_code: placement.placement_code, pay_rate_type: placement.pay_rate_type, missing_ledger_rows };
    }

    const [payRates] = await connection.query(`
        SELECT pay_rate_value, DATE_FORMAT(effective_date, '%Y-%m-%d') AS effective_date
        FROM placement_pay_rates WHERE placement_id = ? ORDER BY effective_date ASC
    `, [placementId]);

    const [billRates] = await connection.query(`
        SELECT bill_rate_value, discount_percentage, DATE_FORMAT(effective_date, '%Y-%m-%d') AS effective_date
        FROM placement_bill_rates WHERE placement_id = ? ORDER BY effective_date ASC
    `, [placementId]);

    const changes  = [];
    const skipped  = [];
    const warnings = [];
    let unchanged  = 0;
    let totalBefore = 0;
    let totalAfter  = 0;

    for (const row of ledgerRows) {
        const meta      = parseMeta(row.metadata);
        const oldAmount = parseFloat(row.amount) || 0;
        totalBefore += oldAmount;

        const invoiceNumber = meta.invoice_number || '—';

        // Only rows that still trace back to a Paid invoice are repriced. A row
        // whose invoice was deleted or reopened is left exactly as it is.
        if (!row.invoice_id) {
            skipped.push({ invoice_number: invoiceNumber, reason: 'invoice_not_found' });
            totalAfter += oldAmount;
            continue;
        }
        if (row.invoice_status_id !== 6) {
            skipped.push({ invoice_number: invoiceNumber, reason: 'invoice_not_paid' });
            totalAfter += oldAmount;
            continue;
        }

        const hours = parseFloat(meta.invoice_hours);
        if (!isFinite(hours) || hours <= 0) {
            skipped.push({ invoice_number: invoiceNumber, reason: 'no_hours_recorded' });
            totalAfter += oldAmount;
            continue;
        }

        // The span this row was posted for: its own rate segment if it had one,
        // otherwise the whole invoice period.
        const spanStart = meta.segment_start || row.period_start || row.transaction_date;
        const spanEnd   = meta.segment_end   || row.period_end   || row.transaction_date;

        // If a rate change lands *inside* this row's span, the row has to become
        // several rows — one per rate — exactly as a freshly-paid invoice would.
        // Pricing the whole span at one rate would silently under- or over-pay
        // the days on the other side of the change.
        const spanSegments = buildC2CPayRateSegments(
            payRates, billRates, placement.pay_rate_type, spanStart, spanEnd
        );

        if (spanSegments.length > 1) {
            const split = await splitHoursAcrossSegments(connection, {
                placementId, segments: spanSegments, spanStart, spanEnd, postedHours: hours,
            });
            if (split) {
                const parts = split.map(s => ({
                    segment_start: s.segStart,
                    segment_end:   s.segEnd,
                    hours:         s.hours,
                    pay_rate:      parseFloat(s.payRate.toFixed(4)),
                    amount:        parseFloat((s.hours * s.payRate).toFixed(2)),
                    split_basis:   s.split_basis,
                }));
                const newTotal = parseFloat(parts.reduce((s, p) => s + p.amount, 0).toFixed(2));
                totalAfter += newTotal;

                changes.push({
                    transaction_id: row.id,
                    employee_id:    row.employee_id,
                    invoice_number: invoiceNumber,
                    period_start:   row.period_start,
                    period_end:     row.period_end,
                    segment_start:  meta.segment_start || null,
                    segment_end:    meta.segment_end   || null,
                    hours,
                    old_pay_rate:   parseFloat(meta.pay_rate) || 0,
                    new_pay_rate:   null,             // several rates — see `parts`
                    old_amount:     oldAmount,
                    new_amount:     newTotal,
                    delta:          parseFloat((newTotal - oldAmount).toFixed(2)),
                    rate_source:    'split_across_rate_change',
                    transaction_date: row.transaction_date,
                    parts,
                    _meta:          meta,
                });
                continue;
            }
        }

        const pricingDate = spanStart;

        const { rate: newRate, source } = resolveRateForDate({
            payRates, billRates,
            payRateType: placement.pay_rate_type,
            date: pricingDate,
            flatFallback: placement.pay_rate,
        });

        const newAmount = parseFloat((hours * newRate).toFixed(2));
        totalAfter += newAmount;

        // A rate exists on the placement but its effective date starts after this
        // invoice period, so the entry prices at $0. Without calling this out the
        // entry is simply "unchanged" and the operator has no idea their effective
        // date does not reach back far enough — which is the single most likely
        // reason a $0 balance stays $0 after the rate is entered.
        if (newRate === 0 && (source === 'no_rate_effective_yet' || source === 'no_bill_rate_effective_yet')) {
            warnings.push({
                invoice_number: invoiceNumber,
                period_start:   row.period_start,
                period_end:     row.period_end,
                hours,
                reason:         source,
                earliest_rate_date: source === 'no_rate_effective_yet'
                    ? (payRates[0]?.effective_date  || null)
                    : (billRates[0]?.effective_date || null),
            });
        }

        const oldRate = parseFloat(meta.pay_rate) || 0;
        if (Math.abs(newAmount - oldAmount) < 0.005 && Math.abs(newRate - oldRate) < 0.00005) {
            unchanged++;
            continue;
        }

        changes.push({
            transaction_id: row.id,
            employee_id:    row.employee_id,
            invoice_number: invoiceNumber,
            period_start:   row.period_start,
            period_end:     row.period_end,
            segment_start:  meta.segment_start || null,
            segment_end:    meta.segment_end   || null,
            hours,
            old_pay_rate:   oldRate,
            new_pay_rate:   parseFloat(newRate.toFixed(4)),
            old_amount:     oldAmount,
            new_amount:     newAmount,
            delta:          parseFloat((newAmount - oldAmount).toFixed(2)),
            rate_source:    source,
            transaction_date: row.transaction_date,
            parts:          null,
            _meta:          meta,
        });
    }

    if (!dryRun) {
        const today = normDateStr(new Date());
        for (const ch of changes) {
            const baseMeta = { ...ch._meta };
            // Capture the first-ever posted values once, so the original invoice
            // posting stays recoverable no matter how often the rate is corrected.
            if (baseMeta.original_pay_rate === undefined) baseMeta.original_pay_rate = ch.old_pay_rate;
            if (baseMeta.original_amount   === undefined) baseMeta.original_amount   = ch.old_amount;
            baseMeta.repriced_at   = today;
            baseMeta.repriced_from = { pay_rate: ch.old_pay_rate, amount: ch.old_amount };

            if (!ch.parts) {
                baseMeta.pay_rate = ch.new_pay_rate;
                await connection.query(
                    `UPDATE employee_transactions SET amount = ?, metadata = ? WHERE id = ? AND organization_id = ?`,
                    [ch.new_amount, JSON.stringify(baseMeta), ch.transaction_id, orgId]
                );
                continue;
            }

            // Split: the existing row becomes the first segment, the remaining
            // segments become new rows on the same invoice and paid date.
            for (let i = 0; i < ch.parts.length; i++) {
                const part = ch.parts[i];
                const meta = {
                    ...baseMeta,
                    invoice_hours: part.hours,
                    pay_rate:      part.pay_rate,
                    segment_start: part.segment_start,
                    segment_end:   part.segment_end,
                    split_basis:   part.split_basis,
                    split_of:      ch.transaction_id,
                };
                if (i === 0) {
                    await connection.query(
                        `UPDATE employee_transactions SET amount = ?, metadata = ? WHERE id = ? AND organization_id = ?`,
                        [part.amount, JSON.stringify(meta), ch.transaction_id, orgId]
                    );
                } else {
                    await connection.query(`
                        INSERT INTO employee_transactions
                          (id, organization_id, employee_id, placement_id,
                           transaction_type, amount, metadata, transaction_date, created_by)
                        VALUES (?, ?, ?, ?, 'C2C', ?, ?, ?, ?)
                    `, [uuidv4(), orgId, ch.employee_id, placementId,
                        part.amount, JSON.stringify(meta), ch.transaction_date, userId]);
                }
            }
        }
    }

    for (const ch of changes) delete ch._meta;

    return {
        placement_id:    placementId,
        placement_code:  placement.placement_code,
        pay_rate_type:   placement.pay_rate_type,
        changes,
        skipped,
        warnings,
        unchanged_count: unchanged,
        total_before:    parseFloat(totalBefore.toFixed(2)),
        total_after:     parseFloat(totalAfter.toFixed(2)),
        delta:           parseFloat((totalAfter - totalBefore).toFixed(2)),
        missing_ledger_rows,
    };
};

/**
 * Reprice every C2C placement that has posted rows for one employee.
 * Returns the same shape as the placement version, plus a per-placement breakdown.
 */
export const repriceC2CLedgerForEmployee = async (connection, { employeeId, orgId, userId = null, dryRun = false }) => {
    const [placementIdRows] = await connection.query(`
        SELECT DISTINCT et.placement_id
        FROM employee_transactions et
        WHERE et.employee_id = ? AND et.organization_id = ?
          AND et.transaction_type = 'C2C' AND et.placement_id IS NOT NULL
    `, [employeeId, orgId]);

    const placements = [];
    for (const { placement_id } of placementIdRows) {
        const result = await repriceC2CLedgerForPlacement(connection, { placementId: placement_id, orgId, userId, dryRun });
        if (result.placement_code === null && result.changes.length === 0) continue;
        placements.push(result);
    }

    const sum = (key) => placements.reduce((s, p) => s + p[key], 0);

    return {
        employee_id:         employeeId,
        placements,
        changed_count:       placements.reduce((s, p) => s + p.changes.length, 0),
        unchanged_count:     sum('unchanged_count'),
        skipped_count:       placements.reduce((s, p) => s + p.skipped.length, 0),
        warning_count:       placements.reduce((s, p) => s + p.warnings.length, 0),
        missing_ledger_rows: sum('missing_ledger_rows'),
        total_before:        parseFloat(sum('total_before').toFixed(2)),
        total_after:         parseFloat(sum('total_after').toFixed(2)),
        delta:               parseFloat(sum('delta').toFixed(2)),
    };
};
