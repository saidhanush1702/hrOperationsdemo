import cron from 'node-cron';
import pool from '../config/db.js';
import { sendTimesheetReminderEmail } from '../utils/mailer.js';
import { runTimesheetGeneration } from '../controllers/timesheetController.js';

export const startTimesheetCronJobs = () => {
    // Runs every day at 8:00 AM Eastern (TZ locked via process.env.TZ in db.js)
    cron.schedule('0 8 * * *', async () => {

        // ── Section 1: Generate upcoming timesheet periods ────────────────────
        // New periods become due because time passes, not because someone opened
        // the Timesheets page — this job is what creates them. Placement create and
        // update still generate inline, so new or changed placements get their
        // periods immediately rather than waiting for tomorrow.
        //
        // Runs before the past-due scan below, which returns early when it finds
        // nothing. Each org is generated independently so one failure cannot stop
        // the rest.
        console.log('CRON: Generating upcoming timesheet periods...');
        let orgs = [];
        try {
            const [rows] = await pool.query(`
                SELECT o.id,
                       (SELECT u.id FROM users u
                         WHERE u.organization_id = o.id AND u.role = 'ORG_ADMIN' AND u.is_active = 1
                         ORDER BY u.created_at ASC LIMIT 1) AS admin_id
                FROM organizations o
                WHERE o.is_active = 1
            `);
            orgs = rows;
        } catch (error) {
            console.error('CRON: Failed to load organizations for timesheet generation:', error.message);
        }

        for (const org of orgs) {
            // created_by / updated_by are NOT NULL, so the records need a real user
            // to be attributed to. Without an admin we skip rather than invent an id.
            if (!org.admin_id) {
                console.warn(`CRON: Skipped timesheet generation for org ${org.id} — no active ORG_ADMIN to attribute records to.`);
                continue;
            }
            try {
                const count = await runTimesheetGeneration(org.id, org.admin_id);
                if (count > 0) console.log(`CRON: Org ${org.id} — generated ${count} timesheet(s).`);
            } catch (error) {
                console.error(`CRON: Timesheet generation failed for org ${org.id}:`, error.message);
            }
        }

        // ── Section 2: Past-due reminders ─────────────────────────────────────
        console.log('CRON: Running daily reminders for Past Due timesheets...');

        try {
            // Find all timesheets that are Past Due (status_id = 5), belonging to
            // active employees in active (non-suspended) organisations, and still
            // tied to an Active placement — a closed placement must not keep
            // nagging an employee about a client they no longer work for.
            const [pastDueTimesheets] = await pool.query(`
                SELECT
                    t.id, t.start_date, t.end_date,
                    u.email, e.first_name, e.last_name,
                    o.name AS org_name,
                    c.client_name, p.placement_code
                FROM timesheets t
                JOIN employees   e ON t.employee_id      = e.id
                JOIN users       u ON e.user_id          = u.id
                JOIN organizations o ON t.organization_id = o.id
                JOIN placements  p ON t.placement_id     = p.id
                JOIN clients     c ON p.client_id        = c.id
                WHERE t.status_id = 5
                  AND u.is_active = 1
                  AND o.is_active = 1
                  AND p.status = 'Active'
            `);

            if (pastDueTimesheets.length === 0) {
                console.log('CRON: No Past Due timesheets found today.');
                return;
            }

            let sentCount = 0;

            for (const ts of pastDueTimesheets) {
                try {
                    await sendTimesheetReminderEmail(
                        ts.email,
                        ts.first_name,
                        ts.org_name,
                        ts.client_name,
                        ts.placement_code,
                        ts.start_date,
                        ts.end_date
                    );
                    sentCount++;
                } catch (emailErr) {
                    console.error(`CRON: Failed to send reminder to ${ts.email}:`, emailErr.message);
                }
            }

            console.log(`CRON: Sent ${sentCount} past-due timesheet reminder(s).`);

        } catch (error) {
            console.error('CRON ERROR: Past-due timesheet job failed:', error);
        }
    });
};
