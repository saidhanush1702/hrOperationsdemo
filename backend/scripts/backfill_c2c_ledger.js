/**
 * backfill_c2c_ledger.js
 *
 * Posts the C2C balance-sheet rows for invoices that were already Paid before
 * their placement became C2C.
 *
 *   node scripts/backfill_c2c_ledger.js                  # dry run, writes nothing
 *   node scripts/backfill_c2c_ledger.js --placement 1200 # dry run, one placement
 *   node scripts/backfill_c2c_ledger.js --apply          # write
 *   node scripts/backfill_c2c_ledger.js --apply --placement 1200
 *   node scripts/backfill_c2c_ledger.js --csv report.csv # also dump a CSV
 *
 * WHY THIS EXISTS
 * ---------------
 * invoiceController._triggerPaidTransition writes the C2C ledger row only at the
 * moment an invoice flips to Paid, and only if the placement is C2C *at that
 * moment*:
 *
 *     if (invoice.pay_type_name !== 'C2C') return;
 *
 * Switch a placement from W2 to C2C afterwards and nothing backfills. Its already
 * paid invoices never reach the balance sheet, so the employee shows a $0 balance
 * and a fixed-pay payroll row has nothing to draw against.
 *
 * repriceC2CLedgerForPlacement cannot help: it deliberately RE-PRICES existing
 * rows and never creates missing ones.
 *
 * HOW THE PREVIEW IS EXACT
 * ------------------------
 * The dry run does not reimplement the pricing maths. It calls the real
 * postC2CLedgerForInvoice inside a transaction, reads back what was inserted, then
 * ROLLS BACK. What you see is what --apply writes, by construction.
 *
 * THE FLAT-RATE TRAP
 * ------------------
 * postC2CLedgerForInvoice RE-DERIVES hours from timesheet_entries. c2cLedgerService's
 * own header warns why that is dangerous: a flat-rate placement bills "1 unit" at
 * $14,000 while its timesheets hold 160 real hours, so re-deriving prices
 * 160 x $14,000 = $2,240,000 for a $14,000 invoice. Duplicated timesheets give
 * exactly 2x by the same route.
 *
 * So every row is sanity-checked against the invoice it came from. Anything that
 * would post materially more than was invoiced, or whose timesheet hours diverge
 * from the invoiced hours, is flagged SANITY and EXCLUDED from --apply. There is no
 * flag to override this one: a row that trips it needs a human decision about what
 * the employee is actually owed, not a bulk write.
 *
 * THE DOUBLE-PAY CHECK
 * --------------------
 * If the employee was genuinely paid through W2 payroll for the same period, adding
 * C2C earnings now would credit them twice. Every row is checked against the W2
 * ledger and against approved payroll items overlapping the invoice period, and
 * anything that overlaps is flagged RISK and EXCLUDED from --apply unless you pass
 * --include-risky.
 */
import 'dotenv/config';
import fs from 'fs';
import pool from '../config/db.js';
import { postC2CLedgerForInvoice } from '../services/c2cLedgerService.js';

const argv        = process.argv.slice(2);
const APPLY       = argv.includes('--apply');
const INCLUDE_RISKY = argv.includes('--include-risky');
const placementArg  = argv.indexOf('--placement');
const PLACEMENT   = placementArg !== -1 ? argv[placementArg + 1] : null;
const csvArg      = argv.indexOf('--csv');
const CSV_PATH    = csvArg !== -1 ? argv[csvArg + 1] : null;

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const main = async () => {
    const conn = await pool.getConnection();

    // Candidates: Paid invoices whose placement is C2C today but which never got a
    // ledger row. Matching on invoice_number inside metadata is the same key
    // _triggerPaidTransition uses for its own idempotency check.
    const [candidates] = await conn.query(`
        SELECT i.id, i.organization_id, i.invoice_number, i.placement_id,
               DATE_FORMAT(i.period_start,'%Y-%m-%d') AS period_start,
               DATE_FORMAT(i.period_end,  '%Y-%m-%d') AS period_end,
               DATE_FORMAT(i.paid_date,   '%Y-%m-%d') AS paid_date,
               i.total_hours, i.total_amount,
               p.placement_code, p.employee_id,
               e.first_name, e.last_name, e.employee_code
        FROM invoices i
        JOIN placements p     ON p.id = i.placement_id
        JOIN employees e      ON e.id = p.employee_id
        JOIN lkp_pay_types pt ON pt.id = p.pay_type_id
        WHERE pt.name = 'C2C' AND i.status_id = 6
          ${PLACEMENT ? 'AND p.placement_code = ?' : ''}
          AND NOT EXISTS (
              SELECT 1 FROM employee_transactions t
              WHERE t.placement_id = i.placement_id
                AND t.transaction_type = 'C2C'
                AND JSON_UNQUOTE(JSON_EXTRACT(t.metadata,'$.invoice_number')) = i.invoice_number)
        ORDER BY e.first_name, e.last_name, i.period_start
    `, PLACEMENT ? [PLACEMENT] : []);

    if (candidates.length === 0) {
        console.log('Nothing to do — every paid C2C invoice already has a ledger row.');
        conn.release(); return;
    }

    // employee_transactions.created_by is NOT NULL, but older invoices carry no
    // created_by/updated_by of their own. Fall back to an org admin per org so the
    // row is still attributable to a real user rather than failing to post.
    const [admins] = await conn.query(`
        SELECT organization_id, MIN(id) AS user_id FROM users
        WHERE role = 'ORG_ADMIN' GROUP BY organization_id`);
    const adminByOrg = Object.fromEntries(admins.map(a => [a.organization_id, a.user_id]));
    const actorFor = (inv, orgId) => inv.updated_by || inv.created_by || adminByOrg[orgId] || null;

    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'}`);
    console.log(`${candidates.length} paid invoice(s) on C2C placements with no ledger row\n`);

    const rows = [];

    for (const c of candidates) {
        // Reload with exactly the shape addInvoicePayment builds, so the posting
        // function sees identical inputs to the live path. Rates are resolved as of
        // the paid date, matching that query.
        const [full] = await conn.query(`
            SELECT i.*, p.pay_rate, p.pay_rate_type, p.bill_rate AS placement_bill_rate,
                   p.employee_id, pt.name AS pay_type_name,
                   (SELECT ppr.pay_rate_value FROM placement_pay_rates ppr
                     WHERE ppr.placement_id = p.id AND ppr.effective_date <= ?
                     ORDER BY ppr.effective_date DESC LIMIT 1) AS effective_pay_rate_value,
                   (SELECT pbr.bill_rate_value * (1 - COALESCE(pbr.discount_percentage,0)/100)
                      FROM placement_bill_rates pbr
                     WHERE pbr.placement_id = p.id AND pbr.effective_date <= ?
                     ORDER BY pbr.effective_date DESC LIMIT 1) AS effective_bill_rate
            FROM invoices i
            LEFT JOIN placements p ON i.placement_id = p.id
            LEFT JOIN LATERAL (
                SELECT pay_type_id FROM placement_type_history
                WHERE placement_id = p.id AND start_date <= i.period_end
                ORDER BY start_date DESC LIMIT 1) pth_active ON TRUE
            LEFT JOIN lkp_pay_types pt ON COALESCE(pth_active.pay_type_id, p.pay_type_id) = pt.id
            WHERE i.id = ?`, [c.paid_date, c.paid_date, c.id]);
        const invoice = full[0];

        // Double-pay check: was this employee paid through W2 payroll for work
        // overlapping this invoice period?
        const [[w2]] = await conn.query(`
            SELECT
              (SELECT COUNT(*) FROM employee_transactions t
                WHERE t.employee_id = ? AND t.placement_id = ?
                  AND t.transaction_type IN ('W2_LCA','W2_NO_LCA','W2_STANDARD')) AS w2_ledger_rows,
              (SELECT COUNT(*) FROM payroll_run_items pri
                 JOIN payroll_runs r ON r.id = pri.payroll_run_id
                WHERE pri.placement_id = ? AND pri.item_status = 'APPROVED'
                  AND r.status = 'SUBMITTED'
                  AND pri.segment_start <= ? AND pri.segment_end >= ?) AS approved_payroll_items
        `, [c.employee_id, c.placement_id, c.placement_id, c.period_end, c.period_start]);

        const risky = w2.w2_ledger_rows > 0 || w2.approved_payroll_items > 0;

        // Approved timesheet hours inside the invoice period -- the figure
        // postC2CLedgerForInvoice will re-derive from. Divergence from the invoiced
        // hours is the flat-rate / duplicate-timesheet signature.
        const [[ts]] = await conn.query(`
            SELECT COALESCE(ROUND(SUM(te.hours), 2), 0) AS hours
            FROM timesheet_entries te
            JOIN timesheets t ON t.id = te.timesheet_id
            WHERE t.placement_id = ? AND t.status_id = 3
              AND te.work_date BETWEEN ? AND ?`,
            [c.placement_id, c.period_start, c.period_end]);
        const timesheetHours = parseFloat(ts.hours) || 0;
        const invoiceHours   = parseFloat(c.total_hours) || 0;

        // Run the real posting function, read what it wrote, then roll it back.
        let posted = [];
        await conn.beginTransaction();
        try {
            await postC2CLedgerForInvoice(conn, invoice, c.paid_date, actorFor(invoice, c.organization_id), c.organization_id);
            const [w] = await conn.query(`
                SELECT amount, metadata FROM employee_transactions
                WHERE placement_id = ? AND transaction_type = 'C2C'
                  AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.invoice_number')) = ?`,
                [c.placement_id, c.invoice_number]);
            posted = w;
        } catch (e) {
            posted = [{ error: e.message }];
        }
        await conn.rollback();   // dry run and apply-preview alike: nothing kept here

        const wouldPost = posted.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

        // Two independent tripwires, either of which means "do not bulk-write this".
        //   - posting materially more than the client was billed
        //   - timesheet hours that do not match the invoiced hours
        // A 5% tolerance absorbs rounding and genuine small rate differences.
        const invoiced   = parseFloat(c.total_amount) || 0;
        const overposts  = invoiced > 0 && wouldPost > invoiced * 1.05;
        const hoursDrift = invoiceHours > 0 && timesheetHours > 0
                           && Math.abs(timesheetHours - invoiceHours) > Math.max(invoiceHours * 0.05, 0.5);
        const sanity     = overposts || hoursDrift;

        rows.push({
            employee: `${c.first_name} ${c.last_name}`,
            code: c.employee_code,
            placement: c.placement_code,
            invoice: c.invoice_number,
            period: `${c.period_start} → ${c.period_end}`,
            paid_date: c.paid_date,
            invoiced: parseFloat(c.total_amount),
            hours: parseFloat(c.total_hours),
            ledger_rows: posted.length,
            would_post: wouldPost,
            timesheet_hours: timesheetHours,
            sanity, overposts, hoursDrift,
            risky,
            w2_ledger_rows: w2.w2_ledger_rows,
            approved_payroll_items: w2.approved_payroll_items,
            error: posted[0]?.error || null,
            _invoice: invoice,
            _c: c,
        });
    }

    // ── Report ──────────────────────────────────────────────────────────────
    let currentEmp = null;
    for (const r of rows) {
        if (r.employee !== currentEmp) {
            currentEmp = r.employee;
            const empRows = rows.filter(x => x.employee === currentEmp);
            const empTotal = empRows.reduce((s, x) => s + x.would_post, 0);
            console.log(`\n${'─'.repeat(78)}`);
            console.log(`${currentEmp} (${r.code})   ${empRows.length} invoice(s)   would post ${fmt$(empTotal)}`);
            console.log('─'.repeat(78));
        }
        const flag = r.error ? '  ERROR'
                   : r.sanity ? '  ** SANITY FAIL **'
                   : r.risky  ? '  ** RISK **' : '';
        console.log(`  ${r.placement.padEnd(16)} ${r.invoice.padEnd(12)} ${r.period}  paid ${r.paid_date}`);
        console.log(`      invoiced ${fmt$(r.invoiced).padStart(12)}   ${String(r.hours).padStart(7)} hrs   ` +
                    `would post ${fmt$(r.would_post).padStart(12)} in ${r.ledger_rows} row(s)${flag}`);
        if (r.error) console.log(`      ERROR: ${r.error}`);
        if (r.sanity) {
            const parts = [];
            if (r.overposts)  parts.push(`posts ${(r.would_post / r.invoiced).toFixed(1)}x the invoiced amount`);
            if (r.hoursDrift) parts.push(`invoice ${r.hours} hrs vs ${r.timesheet_hours} timesheet hrs`);
            console.log(`      SANITY: ${parts.join('; ')}  -- flat-rate billing or duplicated timesheets; needs a human decision`);
        }
        if (r.risky) console.log(`      W2 ledger rows: ${r.w2_ledger_rows}, approved+submitted payroll items overlapping: ${r.approved_payroll_items}`);
    }

    const safe    = rows.filter(r => !r.risky && !r.error && !r.sanity);
    const risky   = rows.filter(r =>  r.risky && !r.sanity);
    const sanityF = rows.filter(r =>  r.sanity);
    const errors  = rows.filter(r =>  r.error);
    const zero    = rows.filter(r => !r.error && r.would_post === 0);

    console.log(`\n${'='.repeat(78)}\nSUMMARY\n${'='.repeat(78)}`);
    console.log(`  invoices examined     : ${rows.length}`);
    console.log(`  employees             : ${new Set(rows.map(r => r.code)).size}`);
    console.log(`  clean, would post     : ${safe.length}  =  ${fmt$(safe.reduce((s, r) => s + r.would_post, 0))}`);
    console.log(`  flagged RISK (payroll): ${risky.length}  =  ${fmt$(risky.reduce((s, r) => s + r.would_post, 0))}`);
    console.log(`  flagged SANITY        : ${sanityF.length}  =  ${fmt$(sanityF.reduce((s, r) => s + r.would_post, 0))}   NEVER auto-written`);
    console.log(`  would post $0         : ${zero.length}   (no pay rate covering the period)`);
    console.log(`  errored               : ${errors.length}`);

    if (CSV_PATH) {
        const head = 'employee,code,placement,invoice,period_start,period_end,paid_date,invoiced,invoice_hours,timesheet_hours,ledger_rows,would_post,verdict,w2_ledger_rows,approved_payroll_items,error';
        const body = rows.map(r => [
            `"${r.employee}"`, r.code, r.placement, r.invoice,
            r._c.period_start, r._c.period_end, r.paid_date,
            r.invoiced, r.hours, r.timesheet_hours, r.ledger_rows, r.would_post.toFixed(2),
            r.sanity ? 'SANITY_FAIL' : r.risky ? 'RISK' : 'clean',
            r.w2_ledger_rows, r.approved_payroll_items,
            `"${r.error || ''}"`,
        ].join(','));
        fs.writeFileSync(CSV_PATH, [head, ...body].join('\n'), 'utf8');
        console.log(`\n  CSV written: ${CSV_PATH}`);
    }

    if (!APPLY) {
        console.log(`\nDRY RUN — nothing was written.`);
        console.log(`To write the ${safe.length} clean row-set(s): node scripts/backfill_c2c_ledger.js --apply`);
        if (risky.length)   console.log(`RISK rows are skipped unless you add --include-risky.`);
        if (sanityF.length) console.log(`SANITY rows are ALWAYS skipped -- review them by hand.`);
        conn.release(); return;
    }

    // ── Apply ───────────────────────────────────────────────────────────────
    // --include-risky relaxes the payroll-overlap check only. A sanity failure is
    // never bulk-written: the amount itself is not trustworthy.
    const toWrite = INCLUDE_RISKY ? rows.filter(r => !r.error && !r.sanity) : safe;
    console.log(`\nWriting ${toWrite.length} invoice(s)${INCLUDE_RISKY ? ' (including flagged)' : ''}…`);

    let written = 0, skipped = 0;
    await conn.beginTransaction();
    try {
        for (const r of toWrite) {
            // Re-check idempotency inside the transaction: never double-post.
            const [exists] = await conn.query(`
                SELECT id FROM employee_transactions
                WHERE placement_id = ? AND transaction_type = 'C2C'
                  AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.invoice_number')) = ?`,
                [r._c.placement_id, r._c.invoice_number]);
            if (exists.length) { skipped++; continue; }

            await postC2CLedgerForInvoice(
                conn, r._invoice, r._c.paid_date,
                actorFor(r._invoice, r._c.organization_id), r._c.organization_id
            );
            written++;
        }
        await conn.commit();
        console.log(`Done. ${written} invoice(s) posted, ${skipped} already had rows.`);
    } catch (e) {
        await conn.rollback();
        console.error('FAILED — rolled back, nothing written:', e.message);
        process.exitCode = 1;
    }
    conn.release();
};

main().then(() => process.exit(process.exitCode || 0))
      .catch(e => { console.error(e); process.exit(1); });
