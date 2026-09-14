/**
 * reset_data.js
 *
 * Wipes ALL business data from every organisation while preserving:
 *   - organizations            (all rows kept)
 *   - users                    (only ORG_ADMIN and SUPER_ADMIN rows kept)
 *   - all lkp_* lookup tables  (all rows kept)
 *
 * Usage (from the backend/ folder):
 *   node scripts/reset_data.js --confirm
 *
 * The --confirm flag is REQUIRED. Without it the script only does a dry-run
 * and prints what it would delete.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const CONFIRM = process.argv.includes('--confirm');

// ─── Tables to TRUNCATE completely (order matters: children before parents) ───
const TABLES_TO_TRUNCATE = [
    // Audit / logs
    'audit_logs',
    'invoice_email_logs',

    // Payroll
    'payroll_run_adjustments',
    'payroll_run_items',
    'payroll_runs',

    // Invoice payments & adjustments
    'invoice_adjustments',
    'invoice_payments',

    // Invoices
    'invoice_setting_contacts',
    'invoice_settings',
    'invoices',

    // Timesheets
    'timesheet_entries',
    'timesheets',

    // Placement sub-tables
    'placement_type_history',
    'placement_bill_rates',
    'placement_pay_rates',

    // Employee sub-tables
    'employee_transactions',
    'employee_documents',
    'employee_immigrations',

    // Core business records (parents last)
    'placements',
    'client_contacts',
    'clients',
    'employees',
];

// ─── Users: delete everyone EXCEPT ORG_ADMIN and SUPER_ADMIN ─────────────────
const USERS_DELETE_SQL = `DELETE FROM users WHERE role NOT IN ('ORG_ADMIN', 'SUPER_ADMIN')`;

// ─── Prompt helper ────────────────────────────────────────────────────────────
const askConfirm = (question) =>
    new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (ans) => { rl.close(); resolve(ans.trim().toLowerCase()); });
    });

// ─── Main ─────────────────────────────────────────────────────────────────────
const run = async () => {
    console.log('\n========================================');
    console.log('  DATABASE RESET SCRIPT');
    console.log('========================================');
    console.log(`  Mode   : ${CONFIRM ? '⚠️  LIVE — DATA WILL BE DELETED' : '🔍 DRY RUN (no changes)'}`);
    console.log(`  DB     : ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
    console.log('========================================\n');

    console.log('Tables that will be TRUNCATED (all rows removed):');
    TABLES_TO_TRUNCATE.forEach(t => console.log(`  ✖  ${t}`));
    console.log('\nUsers table — rows that will be DELETED:');
    console.log(`  ✖  users WHERE role NOT IN ('ORG_ADMIN', 'SUPER_ADMIN')`);
    console.log('\nTables that will be KEPT intact:');
    console.log('  ✔  organizations');
    console.log('  ✔  users (ORG_ADMIN + SUPER_ADMIN only)');
    console.log('  ✔  all lkp_* lookup tables\n');

    if (!CONFIRM) {
        console.log('─────────────────────────────────────────');
        console.log('  DRY RUN complete. Nothing was changed.');
        console.log('  Run with --confirm to execute for real.');
        console.log('─────────────────────────────────────────\n');
        return;
    }

    // Extra interactive safety prompt when --confirm is passed
    const ans = await askConfirm(
        '⚠️  This will PERMANENTLY DELETE all business data. Type "yes" to proceed: '
    );
    if (ans !== 'yes') {
        console.log('\nAborted. No changes made.\n');
        return;
    }

    const pool = mysql.createPool({
        host:     process.env.DB_HOST,
        user:     process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port:     process.env.DB_PORT || 3306,
    });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Disable FK checks so TRUNCATE works regardless of reference order
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        for (const table of TABLES_TO_TRUNCATE) {
            await conn.query(`TRUNCATE TABLE \`${table}\``);
            console.log(`  ✅ TRUNCATED  ${table}`);
        }

        // Partial delete on users
        const [result] = await conn.query(USERS_DELETE_SQL);
        console.log(`  ✅ DELETED    ${result.affectedRows} non-admin user(s) from users`);

        // Re-enable FK checks before commit
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');

        await conn.commit();

        console.log('\n════════════════════════════════════════');
        console.log('  Reset complete. All business data has');
        console.log('  been removed. Organisations, admins,');
        console.log('  and lookup tables are untouched.');
        console.log('════════════════════════════════════════\n');

    } catch (err) {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        await conn.rollback();
        console.error('\n❌ Reset FAILED — transaction rolled back.');
        console.error(err.message);
        process.exit(1);
    } finally {
        conn.release();
        await pool.end();
    }
};

run().catch(err => {
    console.error('\n❌ Script failed:', err);
    process.exit(1);
});
