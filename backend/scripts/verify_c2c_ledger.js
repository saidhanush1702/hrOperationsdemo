/**
 * verify_c2c_ledger.js
 *
 * Read-only reconciliation report for the C2C balance sheet. Runs no writes of
 * any kind — safe against any environment, including production.
 *
 * Answers three questions:
 *   1. How many paid C2C invoices have no ledger row? (balance sheet is blind to these)
 *   2. Are there ledger rows worth $0 even though the placement has a pay rate?
 *      That is the real defect — a genuine $0 rate posting $0 is correct.
 *   3. What does each employee's C2C total actually come to?
 *
 * Usage (from the backend/ folder):
 *   node scripts/verify_c2c_ledger.js
 *   node scripts/verify_c2c_ledger.js --org=<uuid>
 *   node scripts/verify_c2c_ledger.js --employees      # add per-employee breakdown
 */

import pool from '../config/db.js';

const argVal = (name) => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : null;
};

const ORG_ARG        = argVal('org');
const SHOW_EMPLOYEES = process.argv.includes('--employees');

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const resolveOrg = async () => {
    if (ORG_ARG) return ORG_ARG;
    if (process.env.ORG_ID) return process.env.ORG_ID;
    const [rows] = await pool.query(`SELECT DISTINCT organization_id AS id FROM invoices`);
    if (rows.length !== 1) throw new Error(`Found ${rows.length} organizations. Pass --org=<uuid>.`);
    return rows[0].id;
};

// Same pay-type resolution the live code uses (placement_type_history first).
const C2C_INVOICE_BASE = `
    FROM invoices i
    LEFT JOIN placements p ON i.placement_id = p.id
    LEFT JOIN LATERAL (
        SELECT pay_type_id FROM placement_type_history
         WHERE placement_id = p.id AND start_date <= i.period_end
         ORDER BY start_date DESC LIMIT 1
    ) pth ON TRUE
    LEFT JOIN lkp_pay_types pt ON COALESCE(pth.pay_type_id, p.pay_type_id) = pt.id
`;

const main = async () => {
    const orgId = await resolveOrg();

    console.log('');
    console.log('C2C ledger reconciliation (read-only)');
    console.log(`  organization: ${orgId}`);
    console.log('');

    // ── 1. Coverage ──────────────────────────────────────────────────────────
    const [[cov]] = await pool.query(`
        SELECT COUNT(*) AS paid_c2c_invoices,
               SUM(CASE WHEN et.id IS NULL THEN 1 ELSE 0 END) AS missing_ledger,
               ROUND(SUM(CASE WHEN et.id IS NULL THEN i.total_amount ELSE 0 END), 2) AS unposted_invoice_value,
               COUNT(DISTINCT CASE WHEN et.id IS NULL THEN p.employee_id END) AS employees_affected
        ${C2C_INVOICE_BASE}
        LEFT JOIN employee_transactions et
               ON et.placement_id = i.placement_id
              AND JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number')) = i.invoice_number
        WHERE i.organization_id = ? AND i.status_id = 6 AND pt.name = 'C2C'
    `, [orgId]);

    const posted = cov.paid_c2c_invoices - cov.missing_ledger;
    const pct    = cov.paid_c2c_invoices ? ((posted / cov.paid_c2c_invoices) * 100).toFixed(1) : '0.0';

    console.log('  LEDGER COVERAGE');
    console.log(`    paid C2C invoices        : ${cov.paid_c2c_invoices}`);
    console.log(`    with ledger rows         : ${posted}  (${pct}%)`);
    console.log(`    MISSING from balance sheet: ${cov.missing_ledger}`);
    console.log(`    unposted invoice value   : ${money(cov.unposted_invoice_value)}`);
    console.log(`    employees affected       : ${cov.employees_affected}`);
    console.log('');

    // ── 2. Ledger health ─────────────────────────────────────────────────────
    const [[health]] = await pool.query(`
        SELECT COUNT(*) AS c2c_rows,
               ROUND(SUM(et.amount), 2) AS c2c_total,
               SUM(CASE WHEN et.amount = 0 THEN 1 ELSE 0 END) AS zero_rows,
               SUM(CASE WHEN et.amount = 0
                         AND (COALESCE(rc.n, 0) > 0 OR COALESCE(p.pay_rate, 0) > 0)
                        THEN 1 ELSE 0 END) AS zero_but_rate_exists
        FROM employee_transactions et
        LEFT JOIN placements p ON et.placement_id = p.id
        LEFT JOIN (SELECT placement_id, COUNT(*) n FROM placement_pay_rates GROUP BY placement_id) rc
               ON rc.placement_id = et.placement_id
        WHERE et.organization_id = ? AND et.transaction_type = 'C2C'
    `, [orgId]);

    console.log('  LEDGER HEALTH');
    console.log(`    C2C ledger rows          : ${health.c2c_rows}`);
    console.log(`    C2C earnings total       : ${money(health.c2c_total)}`);
    console.log(`    rows worth $0            : ${health.zero_rows}`);
    console.log(`    ...of which a rate EXISTS: ${health.zero_but_rate_exists}   <-- the only real defect`);
    console.log('');
    if (Number(health.zero_but_rate_exists) > 0) {
        const [bad] = await pool.query(`
            SELECT JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number')) AS invoice_number,
                   p.placement_code, COALESCE(rc.n, 0) AS rate_rows, COALESCE(p.pay_rate, 0) AS legacy_rate
            FROM employee_transactions et
            LEFT JOIN placements p ON et.placement_id = p.id
            LEFT JOIN (SELECT placement_id, COUNT(*) n FROM placement_pay_rates GROUP BY placement_id) rc
                   ON rc.placement_id = et.placement_id
            WHERE et.organization_id = ? AND et.transaction_type = 'C2C' AND et.amount = 0
              AND (COALESCE(rc.n, 0) > 0 OR COALESCE(p.pay_rate, 0) > 0)
            LIMIT 25
        `, [orgId]);
        console.table(bad);
    }

    // ── 3. Per-employee totals ───────────────────────────────────────────────
    if (SHOW_EMPLOYEES) {
        const [emps] = await pool.query(`
            SELECT e.employee_code,
                   CONCAT(e.first_name, ' ', e.last_name) AS employee,
                   COUNT(et.id) AS c2c_rows,
                   ROUND(COALESCE(SUM(et.amount), 0), 2) AS c2c_earnings
            FROM employees e
            LEFT JOIN employee_transactions et
                   ON et.employee_id = e.id AND et.transaction_type = 'C2C'
            WHERE e.organization_id = ?
            GROUP BY e.id
            HAVING c2c_rows > 0
            ORDER BY c2c_earnings DESC
        `, [orgId]);
        console.log(`  EMPLOYEES WITH C2C EARNINGS (${emps.length})`);
        console.table(emps);
    } else {
        console.log('  (pass --employees for the per-employee breakdown)');
        console.log('');
    }

    if (cov.missing_ledger > 0) {
        console.log(`  ${cov.missing_ledger} invoice(s) are invisible to the balance sheet.`);
        console.log('  Fix with:  node scripts/backfill_c2c_ledger.js --commit');
        console.log('');
    }
};

main()
    .then(() => pool.end())
    .catch(async (err) => {
        console.error('\nVERIFY FAILED:', err.message);
        await pool.end().catch(() => {});
        process.exit(1);
    });
