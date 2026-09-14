import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// ─── Date utilities ───────────────────────────────────────────────────────────

const normDate = (d) => {
    if (!d) return '';
    if (typeof d === 'string') return d.split('T')[0];
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const monthEndStr = (year, month) => {
    const d = new Date(year, month, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Readiness promotion helper ───────────────────────────────────────────────
// Checks a single Draft invoice against all prerequisites; if all pass, promotes
// to "Ready to Send" (status 2). due_date is not set here — see below.
// Must be called inside an active DB transaction.
const checkAndPromoteInvoice = async (connection, invoiceId, orgId) => {
    const [invRows] = await connection.query(`
        SELECT i.period_start, i.period_end, i.placement_id,
               COALESCE(p.bill_rate, 0)    as fallback_bill_rate
        FROM invoices i
        LEFT JOIN placements p         ON i.placement_id = p.id
        WHERE i.id = ? AND i.organization_id = ? AND i.status_id = 1
    `, [invoiceId, orgId]);
    if (!invRows.length) return;
    const inv = invRows[0];

    const periodStart = normDate(inv.period_start);
    const periodEnd   = normDate(inv.period_end);
    const today       = new Date().toISOString().split('T')[0];

    // Gate 1: invoice period must have fully elapsed
    if (today <= periodEnd) return;

    // Gate 2: every timesheet OVERLAPPING this period must be Approved.
    // Overlap, not containment: a weekly timesheet straddling a month boundary
    // (e.g. 07/27–08/02 against a July invoice) contributes its in-period days to
    // the invoice via Pass 1, so it must be able to hold the invoice back too.
    // Anything other than Approved (3) blocks — Not Submitted, Pending Approval,
    // Rejected and Past Due are all unapproved work.
    const [pendingTs] = await connection.query(`
        SELECT COUNT(*) as cnt FROM timesheets
        WHERE placement_id = ? AND organization_id = ?
          AND start_date <= ? AND end_date >= ?
          AND status_id <> 3
    `, [inv.placement_id, orgId, periodEnd, periodStart]);
    if (parseInt(pendingTs[0].cnt) > 0) return;

    // Gate 3: at least one bill rate covers the start of this period
    const [brRows] = await connection.query(`
        SELECT COUNT(*) as cnt FROM placement_bill_rates
        WHERE placement_id = ? AND effective_date <= ?
    `, [inv.placement_id, periodStart]);
    const hasBillRate = parseInt(brRows[0].cnt) > 0 || parseFloat(inv.fallback_bill_rate) > 0;
    if (!hasBillRate) return;

    // All gates passed → promote to Ready to Send.
    // due_date is deliberately NOT set here. It is issue_date + net_terms, and the
    // invoice has no issue_date until someone opens it (status 4), so there is
    // nothing to anchor to yet. It stays NULL and renders as "TBD" until issued.
    await connection.query(`
        UPDATE invoices
        SET status_id = 2
        WHERE id = ?
    `, [invoiceId]);
};

// ─── Core 3-pass invoice generation ──────────────────────────────────────────
// Single source of truth for invoice generation — used by both the manual Sync
// button (invoiceController) and the nightly cron job (invoiceCron).
//
// `connection` must already have an active transaction; the caller is responsible
// for commit / rollback. Returns { timesheetCount, invoiceCount }.
export const generateInvoicesForOrg = async (orgId, connection) => {

    // Fetch ALL approved timesheets — not just unlinked ones.
    // Sync recalculates every invoice total from scratch on each run, so it is
    // always correct regardless of prior delete/edit operations.
    const [allApproved] = await connection.query(`
        SELECT t.id as ts_id, t.placement_id, t.total_hours, t.start_date, t.end_date,
               p.client_id, p.bill_rate as fallback_bill_rate, p.invoice_cycle_id, cyc.name as invoice_cycle_name
        FROM timesheets t
        JOIN placements p       ON t.placement_id = p.id
        JOIN invoice_settings s ON p.id = s.placement_id
        LEFT JOIN lkp_cycles cyc ON p.invoice_cycle_id = cyc.id
        WHERE t.organization_id = ? AND t.status_id = 3 AND p.invoice_cycle_id IS NOT NULL AND p.status = 'Active'
    `, [orgId]);

    if (allApproved.length === 0) return { timesheetCount: 0, invoiceCount: 0 };

    // Pre-fetch placement_bill_rates for all relevant placements for date-aware lookup
    const uniquePlacementIds = [...new Set(allApproved.map(t => t.placement_id))];
    const allBillRateRows = uniquePlacementIds.length > 0
        ? (await connection.query(
            'SELECT placement_id, bill_rate_value, discount_percentage, DATE_FORMAT(effective_date, \'%Y-%m-%d\') AS effective_date FROM placement_bill_rates WHERE placement_id IN (?)',
            [uniquePlacementIds]
          ))[0]
        : [];
    const billRatesByPlacement = {};
    for (const br of allBillRateRows) {
        if (!billRatesByPlacement[br.placement_id]) billRatesByPlacement[br.placement_id] = [];
        billRatesByPlacement[br.placement_id].push(br);
    }
    const getEffectiveBillRate = (placementId, targetDate, fallback = 0) => {
        const rates = billRatesByPlacement[placementId] || [];
        const targetStr = String(targetDate).split('T')[0];
        const active = rates
            .filter(br => String(br.effective_date).split('T')[0] <= targetStr)
            .sort((a, b) => {
                const aStr = String(a.effective_date).split('T')[0];
                const bStr = String(b.effective_date).split('T')[0];
                return bStr > aStr ? 1 : bStr < aStr ? -1 : 0;
            });
        if (active.length === 0) return parseFloat(fallback) || 0;
        const br = active[0];
        const base = parseFloat(br.bill_rate_value) || 0;
        const disc = parseFloat(br.discount_percentage) || 0;
        return base - (base * (disc / 100));
    };

    const genInvNumber = async () => {
        let invNumber, isUnique = false;
        while (!isUnique) {
            invNumber = `INV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            const [dup] = await connection.query(`SELECT id FROM invoices WHERE invoice_number = ?`, [invNumber]);
            if (dup.length === 0) isUnique = true;
        }
        return invNumber;
    };

    // ─── Pass 1: collect every approved timesheet into period buckets ─────────
    // Each bucket holds the complete correct total for one (placement, period) pair.
    // key → { placementId, clientId, periodStart, periodEnd, hours, amount,
    //         periodStartRate, tsHours: Map<tsId, hoursInThisPeriod>,
    //         invoiceId, isFallback }
    const periodBuckets = new Map();

    for (const ts of allApproved) {
        const cycleLower    = (ts.invoice_cycle_name || '').toLowerCase();
        const isMonthly     = cycleLower.includes('month') && !cycleLower.includes('semi');
        const isSemiMonthly = cycleLower.includes('semi')  && cycleLower.includes('month');
        const isWeekly      = cycleLower.includes('week')  && !cycleLower.includes('semi');

        if (isMonthly || isSemiMonthly) {
            const [entries] = await connection.query(
                `SELECT work_date, hours FROM timesheet_entries WHERE timesheet_id = ? ORDER BY work_date ASC`,
                [ts.ts_id]
            );
            for (const entry of entries) {
                const dateStr = normDate(entry.work_date);
                const [y, m, d] = dateStr.split('-');
                const year  = parseInt(y);
                const month = parseInt(m);
                const day   = parseInt(d);

                let key, periodStart, periodEnd;
                if (isMonthly) {
                    key         = `${ts.placement_id}::${y}-${m}-01`;
                    periodStart = `${y}-${m}-01`;
                    periodEnd   = monthEndStr(year, month);
                } else {
                    const half  = day <= 15 ? '1' : '2';
                    key         = `${ts.placement_id}::${y}-${m}-${half === '1' ? '01' : '16'}`;
                    periodStart = half === '1' ? `${y}-${m}-01` : `${y}-${m}-16`;
                    periodEnd   = half === '1' ? `${y}-${m}-15` : monthEndStr(year, month);
                }

                if (!periodBuckets.has(key)) {
                    periodBuckets.set(key, {
                        placementId: ts.placement_id, clientId: ts.client_id,
                        periodStart, periodEnd, hours: 0, amount: 0,
                        periodStartRate: getEffectiveBillRate(ts.placement_id, periodStart, ts.fallback_bill_rate),
                        tsHours: new Map(), invoiceId: null
                    });
                }
                const bucket = periodBuckets.get(key);
                const h    = parseFloat(entry.hours) || 0;
                const rate = getEffectiveBillRate(ts.placement_id, dateStr, ts.fallback_bill_rate);
                bucket.hours  += h;
                bucket.amount += h * rate;
                bucket.tsHours.set(ts.ts_id, (bucket.tsHours.get(ts.ts_id) || 0) + h);
            }

        } else if (isWeekly) {
            const periodStart = normDate(ts.start_date);
            const periodEnd   = normDate(ts.end_date);
            const key         = `${ts.placement_id}::${periodStart}::${periodEnd}`;

            if (!periodBuckets.has(key)) {
                periodBuckets.set(key, {
                    placementId: ts.placement_id, clientId: ts.client_id,
                    periodStart, periodEnd, hours: 0, amount: 0,
                    periodStartRate: getEffectiveBillRate(ts.placement_id, periodStart, ts.fallback_bill_rate),
                    tsHours: new Map(), invoiceId: null
                });
            }
            const bucket = periodBuckets.get(key);
            const [weekEntries] = await connection.query(
                `SELECT work_date, hours FROM timesheet_entries WHERE timesheet_id = ? ORDER BY work_date ASC`,
                [ts.ts_id]
            );
            let tsHours = 0, tsAmount = 0;
            for (const entry of weekEntries) {
                const dateStr = normDate(entry.work_date);
                const h    = parseFloat(entry.hours) || 0;
                const rate = getEffectiveBillRate(ts.placement_id, dateStr, ts.fallback_bill_rate);
                tsHours  += h;
                tsAmount += h * rate;
            }
            bucket.hours  += tsHours;
            bucket.amount += tsAmount;
            bucket.tsHours.set(ts.ts_id, (bucket.tsHours.get(ts.ts_id) || 0) + tsHours);

        } else {
            // ─── FALLBACK (Semi-Weekly or unrecognized): one rolling invoice per placement ───
            const key         = `${ts.placement_id}::fallback`;
            const periodStart = normDate(ts.start_date);
            const periodEnd   = normDate(ts.end_date);

            if (!periodBuckets.has(key)) {
                periodBuckets.set(key, {
                    placementId: ts.placement_id, clientId: ts.client_id,
                    periodStart, periodEnd, hours: 0, amount: 0,
                    periodStartRate: getEffectiveBillRate(ts.placement_id, periodStart, ts.fallback_bill_rate),
                    tsHours: new Map(), invoiceId: null, isFallback: true
                });
            }
            const bucket = periodBuckets.get(key);
            if (periodEnd > bucket.periodEnd) bucket.periodEnd = periodEnd;

            const [fbEntries] = await connection.query(
                `SELECT work_date, hours FROM timesheet_entries WHERE timesheet_id = ? ORDER BY work_date ASC`,
                [ts.ts_id]
            );
            let fbHours = parseFloat(ts.total_hours) || 0, fbAmount = 0;
            for (const entry of fbEntries) {
                const dateStr = normDate(entry.work_date);
                const rate    = getEffectiveBillRate(ts.placement_id, dateStr, ts.fallback_bill_rate);
                fbAmount += rate * (parseFloat(entry.hours) || 0);
            }
            bucket.hours  += fbHours;
            bucket.amount += fbAmount;
            bucket.tsHours.set(ts.ts_id, (bucket.tsHours.get(ts.ts_id) || 0) + fbHours);
        }
    }

    // ─── Pass 2: upsert one invoice per bucket, SET totals (not ADD) ─────────
    // Skips any period that already has a locked invoice (Open / Past Due / Paid).
    const affectedInvoiceIds = new Set();

    for (const [, bucket] of periodBuckets.entries()) {
        if (bucket.hours === 0) continue;

        // Never recalculate a finalized invoice.
        // Overlap, not an exact period_start match: an invoice raised from the legacy
        // system starts on the placement start date (e.g. 08/15) while this generator
        // buckets by calendar month (08/01). An exact match misses that and re-bills
        // work the client has already paid for.
        const lockQuery  = bucket.isFallback
            ? `SELECT id FROM invoices WHERE placement_id = ? AND status_id IN (3,4,5,6) LIMIT 1`
            : `SELECT id FROM invoices WHERE placement_id = ? AND period_start <= ? AND period_end >= ? AND status_id IN (3,4,5,6) LIMIT 1`;
        const lockParams = bucket.isFallback
            ? [bucket.placementId]
            : [bucket.placementId, bucket.periodEnd, bucket.periodStart];
        const [lockedInv] = await connection.query(lockQuery, lockParams);
        if (lockedInv.length > 0) continue;

        const findQuery  = bucket.isFallback
            ? `SELECT id FROM invoices WHERE placement_id = ? AND status_id IN (1,2) LIMIT 1`
            : `SELECT id FROM invoices WHERE placement_id = ? AND period_start = ? AND status_id IN (1,2) LIMIT 1`;
        const findParams = bucket.isFallback ? [bucket.placementId] : [bucket.placementId, bucket.periodStart];
        const [existingInv] = await connection.query(findQuery, findParams);

        let invoiceId;
        if (existingInv.length > 0) {
            invoiceId = existingInv[0].id;
            await connection.query(
                `UPDATE invoices SET total_hours = ?, total_amount = ?, period_end = ? WHERE id = ?`,
                [bucket.hours, bucket.amount, bucket.periodEnd, invoiceId]
            );
        } else {
            invoiceId = uuidv4();
            const invNumber = await genInvNumber();
            await connection.query(`
                INSERT INTO invoices (id, organization_id, client_id, placement_id, invoice_number,
                                     period_start, period_end, total_hours, bill_rate, total_amount, status_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `, [invoiceId, orgId, bucket.clientId, bucket.placementId, invNumber,
                bucket.periodStart, bucket.periodEnd, bucket.hours, bucket.periodStartRate, bucket.amount]);
        }

        bucket.invoiceId = invoiceId;
        affectedInvoiceIds.add(invoiceId);
    }

    // ─── Pass 3: link each timesheet to the invoice of its largest contribution ─
    const tsInvoiceLink = new Map();
    for (const [, bucket] of periodBuckets.entries()) {
        if (!bucket.invoiceId) continue;
        for (const [tsId, hours] of bucket.tsHours.entries()) {
            const current = tsInvoiceLink.get(tsId);
            if (!current || hours > current.maxHours) {
                tsInvoiceLink.set(tsId, { invoiceId: bucket.invoiceId, maxHours: hours });
            }
        }
    }
    for (const [tsId, { invoiceId }] of tsInvoiceLink.entries()) {
        await connection.query(`UPDATE timesheets SET invoice_id = ? WHERE id = ?`, [invoiceId, tsId]);
    }

    // Re-check every Draft invoice for this org — promotes any that now meet all
    // readiness prerequisites (period ended, all timesheets approved, bill rate set).
    const [allDraftInvoices] = await connection.query(
        `SELECT id FROM invoices WHERE organization_id = ? AND status_id = 1`,
        [orgId]
    );
    for (const { id: draftId } of allDraftInvoices) {
        await checkAndPromoteInvoice(connection, draftId, orgId);
    }

    return { timesheetCount: allApproved.length, invoiceCount: affectedInvoiceIds.size };
};
