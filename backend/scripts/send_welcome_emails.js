/**
 * send_welcome_emails.js
 *
 * Sends welcome emails to the employees listed in TARGET_EMAILS.
 * No database connection needed — just SMTP + the list below.
 *
 * Usage (from the backend/ folder):
 *   node scripts/send_welcome_emails.js
 *
 * Add --dry-run to preview without actually sending:
 *   node scripts/send_welcome_emails.js --dry-run
 */

import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// ─── Config ──────────────────────────────────────────────────────────────────

const PORTAL_URL    = 'https://ops.molinatek.com/';
const TEMP_PASSWORD = 'Molina@1234';
const DRY_RUN       = process.argv.includes('--dry-run');

// ── Add recipients here: { email, name } ─────────────────────────────────────
const TARGET_EMPLOYEES = [
    // { email: 'dhany.tdsn@gmail.com', name: 'Muthyala sai dhanush' } ,// test
    // { email: 'guduri.ravishankar@gmail.com', name: 'Ravi shankar Guduri' } ,// test
];

// Delay between each email to avoid SMTP rate limits (ms)
const EMAIL_DELAY_MS = 1500;

// ─── Email template ───────────────────────────────────────────────────────────

const buildEmailHtml = (toEmail, firstName) => `
    <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1f2937; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">

        <div style="background-color: #4f46e5; padding: 24px 28px;">
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.3px;">Molina Technologies LLC</h1>
            <p style="margin: 6px 0 0; color: #c7d2fe; font-size: 13px;">Employee Self Service Portal</p>
        </div>

        <div style="padding: 30px 28px;">

            <h2 style="margin: 0 0 20px; color: #4f46e5; font-size: 17px; font-weight: 700;">
                Congratulations and Welcome to Molina Technologies LLC Family${firstName ? `, ${firstName}` : ''},
            </h2>

            <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.75; color: #374151;">
                We believe that our talented and committed employees are our greatest asset who share our vision and deliver our mission. In an effort to create a strong employer-employee relationship and smoother work flow process, we are excited to have a Self Service portal for you.
            </p>

            <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.75; color: #374151;">
                The Employee Portal provides links to resources to help you access personal information, submit timesheets, track status reports, and submit expense forms.
            </p>

            <p style="margin: 0 0 20px; font-size: 14px; font-weight: 600; color: #1f2937;">
                Please find your login credentials below to access your Self Service Portal.
            </p>

            <div style="background: #f5f3ff; border-left: 4px solid #4f46e5; border-radius: 4px; padding: 18px 22px; margin-bottom: 22px;">
                <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
                    <tr>
                        <td style="padding: 5px 0; color: #6b7280; width: 110px; vertical-align: top;"><strong>URL</strong></td>
                        <td style="padding: 5px 0; color: #374151;">:</td>
                        <td style="padding: 5px 0 5px 10px; color: #374151;">
                            <a href="${PORTAL_URL}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${PORTAL_URL}</a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; color: #6b7280; vertical-align: top;"><strong>User ID</strong></td>
                        <td style="padding: 5px 0; color: #374151;">:</td>
                        <td style="padding: 5px 0 5px 10px; color: #1f2937; font-weight: 600;">${toEmail}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; color: #6b7280; vertical-align: top;"><strong>Password</strong></td>
                        <td style="padding: 5px 0; color: #374151;">:</td>
                        <td style="padding: 5px 0 5px 10px;">
                            <span style="font-family: 'Courier New', monospace; background: #ede9fe; color: #4f46e5; padding: 2px 8px; border-radius: 4px; font-size: 14px; font-weight: 700;">${TEMP_PASSWORD}</span>
                        </td>
                    </tr>
                </table>
            </div>

            <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 4px; padding: 14px 18px; margin-bottom: 22px;">
                <p style="margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #b91c1c;">Important – Action Required</p>
                <p style="margin: 0; font-size: 13px; color: #7f1d1d; line-height: 1.6;">
                    This is a temporary password. You <strong>must change it immediately</strong> after your first login.<br/>
                    Use the <strong>"Forgot Password"</strong> option on the login page to set a new secure password of your choice.
                </p>
            </div>

            <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 4px; padding: 12px 16px; margin-bottom: 22px;">
                <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.6;">
                    <strong>Note:</strong>&nbsp; Please be sure to submit your approved timesheet in the Employee Self Service portal prior to each pay period.
                </p>
            </div>

            <p style="margin: 0 0 28px; font-size: 14px; line-height: 1.75; color: #374151;">
                Please feel free to email&nbsp;<span style="color: #374151; font-weight: 600;">HR@molinatek.com</span>&nbsp;if you face any issues with portal access.
            </p>

            <p style="margin: 0; font-size: 14px; color: #374151;">Regards,</p>
            <p style="margin: 4px 0 0; font-size: 14px; font-weight: 700; color: #1f2937;">Timesheet Team</p>
        </div>

    </div>
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

const run = async () => {
    console.log(`\nWelcome Email Script — ${DRY_RUN ? 'DRY RUN (no emails sent)' : 'LIVE MODE'}`);
    console.log(`   Portal URL: ${PORTAL_URL}`);
    console.log(`   Password  : ${TEMP_PASSWORD}`);
    console.log(`   BCC       : ${process.env.SMTP_REPLY_TO_ACCOUNTS || '(not set)'}`);
    console.log(`   Recipients: ${TARGET_EMPLOYEES.length}\n`);

    if (TARGET_EMPLOYEES.length === 0) {
        console.log('TARGET_EMPLOYEES is empty. Add entries and re-run.');
        process.exit(0);
    }

    const transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    let sent = 0, failed = 0, skipped = 0;

    for (const emp of TARGET_EMPLOYEES) {
        const label = `${emp.name} <${emp.email}>`;

        if (DRY_RUN) {
            console.log(`  DRY   ${label}`);
            skipped++;
            continue;
        }

        try {
            await transporter.sendMail({
                from:    `"Timesheet Team" <${process.env.SMTP_FROM_HR}>`,
                replyTo: process.env.SMTP_REPLY_TO_HR,
                to:      emp.email,
                bcc:     process.env.SMTP_REPLY_TO_ACCOUNTS,
                subject: 'Welcome to Molina Technologies LLC – Your Self Service Portal Access',
                html:    buildEmailHtml(emp.email, emp.name),
            });
            console.log(`  SENT  ${label}`);
            sent++;
        } catch (err) {
            console.error(`  FAIL  ${label} — ${err.message}`);
            failed++;
        }

        await new Promise(r => setTimeout(r, EMAIL_DELAY_MS));
    }

    console.log(`\n─────────────────────────────────`);
    console.log(`  Sent   : ${sent}`);
    console.log(`  Failed : ${failed}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`─────────────────────────────────\n`);
};

run().catch(err => {
    console.error('\nScript failed:', err);
    process.exit(1);
});
