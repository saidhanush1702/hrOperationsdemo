/**
 * SMTP connection check.
 *
 *   node scripts/check_smtp.js              -- verify credentials only, sends nothing
 *   node scripts/check_smtp.js you@mail.com -- also send one plain test message
 *
 * Run from the backend directory: dotenv resolves .env relative to the working
 * directory, which is what made the app read an empty config before.
 *
 * verify() opens the connection and authenticates without queueing a message, so
 * the no-argument form is safe to run against a config pointed at real recipients.
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_HR, SMTP_FROM_ACCOUNTS } = process.env;

const mask = (v) => (v ? `${v.slice(0, 2)}${'*'.repeat(Math.max(v.length - 4, 0))}${v.slice(-2)}` : '(unset)');

console.log('Config as the app sees it');
console.log('  SMTP_HOST         :', SMTP_HOST || '(unset)');
console.log('  SMTP_PORT         :', SMTP_PORT || '(unset -> defaults to 587)');
console.log('  SMTP_USER         :', SMTP_USER || '(unset)');
console.log('  SMTP_PASS         :', mask(SMTP_PASS));
console.log('  SMTP_FROM_HR      :', SMTP_FROM_HR || '(unset)');
console.log('  SMTP_FROM_ACCOUNTS:', SMTP_FROM_ACCOUNTS || '(unset)');
console.log('');

const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]);
if (missing.length) {
    console.error(`FAIL  Missing: ${missing.join(', ')}`);
    process.exit(1);
}

// Matches mailer.js exactly: secure:false means STARTTLS, so port 587 (or 2525),
// never 465. A 465 config here will hang rather than fail cleanly.
const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10) || 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
});

try {
    await transporter.verify();
    console.log('PASS  Connected and authenticated.');
} catch (err) {
    console.error('FAIL  ' + err.message);
    if (/Invalid login|535/i.test(err.message)) {
        console.error('      For Gmail: use a 16-character App Password, not the account password,');
        console.error('      and make sure 2-Step Verification is on.');
    }
    if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(err.message)) {
        console.error(`      Could not reach ${SMTP_HOST}:${SMTP_PORT || 587}. If the port is 465,`);
        console.error('      change it to 587 — mailer.js hardcodes secure:false.');
    }
    process.exit(1);
}

const to = process.argv[2];
if (!to) {
    console.log('\nNo recipient given, so nothing was sent. Pass an address to send a test message.');
    process.exit(0);
}

const from = SMTP_FROM_HR || SMTP_USER;
const info = await transporter.sendMail({
    from: `"SMTP Test" <${from}>`,
    to,
    subject: 'SMTP test — Small Business Operations Platform',
    text: `Sent ${new Date().toISOString()} via ${SMTP_HOST}:${SMTP_PORT || 587} as ${SMTP_USER}.`,
});

console.log(`PASS  Sent to ${to}`);
console.log('      messageId :', info.messageId);
console.log('      accepted  :', info.accepted.join(', ') || '(none)');
if (info.rejected.length) console.log('      rejected  :', info.rejected.join(', '));
if (from !== SMTP_USER) {
    console.log(`\nNote: From is ${from} but you authenticated as ${SMTP_USER}.`);
    console.log('Gmail rewrites From to the authenticated account unless it is a verified alias.');
}
process.exit(0);
