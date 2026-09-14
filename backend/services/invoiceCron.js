import cron from 'node-cron';
import pool from '../config/db.js';
import { sendInvoicePastDueReminder } from '../utils/mailer.js';
import { generateInvoicesForOrg } from './invoiceService.js';

export const startInvoiceCronJobs = () => {
    cron.schedule('0 1 * * *', async () => {
        // Runs at 1 AM Eastern — timezone locked via process.env.TZ = 'America/New_York' in db.js
        console.log('CRON: Running Daily Invoice Processing...');

        // ── Section 1: Past-due flagging + reminder emails ────────────────────
        // Finds all Open invoices whose due_date has passed, marks them Past Due,
        // and sends reminder emails to configured client contacts.
        const conn1 = await pool.getConnection();
        try {
            await conn1.beginTransaction();

            const [pastDueInvoices] = await conn1.query(`
                SELECT i.id, i.invoice_number, i.total_amount, i.due_date,
                       o.name AS org_name,
                       GROUP_CONCAT(cc.contact_email) AS emails,
                       GROUP_CONCAT(cc.contact_name)  AS names
                FROM invoices i
                JOIN organizations o ON i.organization_id = o.id
                LEFT JOIN invoice_setting_contacts isc ON i.placement_id = isc.placement_id
                LEFT JOIN client_contacts cc ON isc.contact_id = cc.id
                WHERE i.status_id = 4 AND i.due_date < CURDATE() AND o.is_active = 1
                GROUP BY i.id
            `);

            for (const inv of pastDueInvoices) {
                await conn1.query(`UPDATE invoices SET status_id = 5 WHERE id = ?`, [inv.id]);

                // Past-due reminder emails disabled — uncomment this block to re-enable.
                // Status flagging above stays active either way.
                // if (inv.emails) {
                //     const emailArray = inv.emails.split(',');
                //     const nameArray  = inv.names.split(',');
                //     for (let i = 0; i < emailArray.length; i++) {
                //         await sendInvoicePastDueReminder(
                //             emailArray[i], nameArray[i], inv.invoice_number,
                //             inv.total_amount, inv.due_date, inv.org_name
                //         ).catch(() => console.error(`CRON: Past-due email failed for ${emailArray[i]}`));
                //     }
                // }
            }

            await conn1.commit();
            if (pastDueInvoices.length > 0) {
                console.log(`CRON: ${pastDueInvoices.length} invoice(s) marked past-due.`);
            }
        } catch (error) {
            await conn1.rollback();
            console.error('CRON: Past-due processing failed:', error);
        } finally {
            conn1.release();
        }

        // ── Section 2: Invoice generation — identical logic to the manual Sync ─
        // Fetches all active orgs and runs the same 3-pass generation + readiness
        // promotion that the manual Sync button uses. Each org runs in its own
        // transaction so a failure in one org does not affect the others.
        let orgs = [];
        const conn2 = await pool.getConnection();
        try {
            const [rows] = await conn2.query(`SELECT id FROM organizations WHERE is_active = 1`);
            orgs = rows;
        } catch (error) {
            console.error('CRON: Failed to fetch organizations:', error);
        } finally {
            conn2.release();
        }

        for (const org of orgs) {
            const orgConn = await pool.getConnection();
            try {
                await orgConn.beginTransaction();
                const { timesheetCount, invoiceCount } = await generateInvoicesForOrg(org.id, orgConn);
                await orgConn.commit();
                if (timesheetCount > 0) {
                    console.log(`CRON: Org ${org.id} — synced ${timesheetCount} timesheet(s) across ${invoiceCount} invoice period(s).`);
                }
            } catch (error) {
                await orgConn.rollback();
                console.error(`CRON: Invoice generation failed for org ${org.id}:`, error.message);
            } finally {
                orgConn.release();
            }
        }

        console.log('CRON: Daily Invoice Processing complete.');
    });
};
