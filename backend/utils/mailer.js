import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { parseDateStr } from './dateUtils.js';

dotenv.config();

// Self Service Portal address shown in every welcome email.
export const PORTAL_URL = 'https://ops.molinatek.com/';
// HR contact shown as plain text (never a mailto link) in welcome emails.
export const HR_CONTACT_EMAIL = 'HR@molinatek.com';

export const sendEmployeeWelcomeEmail = async (toEmail, tempPassword) => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error(" ENV ERROR: SMTP_USER or SMTP_PASS is undefined.");
        throw new Error("SMTP Credentials missing. Check your .env file.");
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: `"Timesheet Team" <${process.env.SMTP_FROM_HR}>`,
        replyTo: process.env.SMTP_REPLY_TO_HR,
        to: toEmail,
        subject: 'Welcome to Molina Technologies LLC – Your Self Service Portal Access',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1f2937; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">

                <!-- Header -->
                <div style="background-color: #4f46e5; padding: 24px 28px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.3px;">Molina Technologies LLC</h1>
                    <p style="margin: 6px 0 0; color: #c7d2fe; font-size: 13px;">Employee Self Service Portal</p>
                </div>

                <!-- Body -->
                <div style="padding: 30px 28px;">

                    <h2 style="margin: 0 0 20px; color: #4f46e5; font-size: 17px; font-weight: 700;">
                        Congratulations and Welcome to Molina Technologies LLC Family,
                    </h2>

                    <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.75; color: #374151;">
                        We believe that our talented and committed employees are our greatest asset who share our vision and deliver our mission. In an effort to create a strong employer-employee relationship and smoother work flow process, we are excited to have Self Service portal for you.
                    </p>

                    <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.75; color: #374151;">
                        Employee Portal provides links to resources to help employees access personal information, submit timesheets, status report, Expense form submission.
                    </p>

                    <p style="margin: 0 0 20px; font-size: 14px; font-weight: 600; color: #1f2937;">
                        Please find your logins below to access your Self Service Portal.
                    </p>

                    <!-- Credentials Box -->
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
                                    <span style="font-family: 'Courier New', monospace; background: #ede9fe; color: #4f46e5; padding: 2px 8px; border-radius: 4px; font-size: 14px; font-weight: 700;">${tempPassword}</span>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- Note -->
                    <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 4px; padding: 12px 16px; margin-bottom: 22px;">
                        <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.6;">
                            <strong>Note:</strong>&nbsp; We request you to change your password after you login to the portal.
                        </p>
                    </div>

                    <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.75; color: #374151;">
                        Please be sure to submit the approved timesheet in employee Self Service portal prior to each pay period.
                    </p>

                    <p style="margin: 0 0 28px; font-size: 14px; line-height: 1.75; color: #374151;">
                        Please feel free to email&nbsp;<span style="color: #374151; font-weight: 600;">${HR_CONTACT_EMAIL}</span>, if you face any issues with the portal access.
                    </p>

                    <p style="margin: 0; font-size: 14px; color: #374151;">Regards,</p>
                    <p style="margin: 4px 0 0; font-size: 14px; font-weight: 700; color: #1f2937;">Timesheet Team</p>
                </div>

                <!-- Footer -->
                <div style="background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 14px 28px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                        This is an automated email from Molina Technologies LLC. Please do not reply directly to this email.
                    </p>
                </div>
            </div>
        `
    };

    try {
        console.log(` Sending employee welcome email to ${toEmail}...`);
        await transporter.sendMail(mailOptions);
        console.log(" Employee welcome email sent successfully!");
    } catch (error) {
        console.error(" SMTP TRANSACTION ERROR:", error.message);
        throw new Error(`Email failed: ${error.message}`);
    }
};

export const sendWelcomeEmail = async (toEmail, tempPassword, orgName) => {
    
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error(" ENV ERROR: SMTP_USER or SMTP_PASS is undefined.");
        throw new Error("SMTP Credentials missing. Check your .env file.");
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, 
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: `"System Administrator" <${process.env.SMTP_FROM_ACCOUNTS}>`,
        replyTo: process.env.SMTP_REPLY_TO_ACCOUNTS,
        to: toEmail,
        subject: `Login Credentials for ${orgName}`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h2 style="color: #4f46e5;">Welcome to the Business Operations Platform by Molinatek !</h2>
                <p>An administrator account has been created for your organization <b>${orgName}</b>.</p>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 4px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>URL:</strong> <a href="${PORTAL_URL}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${PORTAL_URL}</a></p>
                    <p style="margin: 5px 0 0 0;"><strong>Email:</strong> ${toEmail}</p>
                    <p style="margin: 5px 0 0 0;"><strong>Temporary Password:</strong> <code style="color: #ef4444;">${tempPassword}</code></p>
                </div>
                <p style="font-size: 0.875rem; color: #6b7280;">Please log in and update your password immediately for security reasons.</p>
                <p style="font-size: 0.875rem; color: #6b7280;">Please feel free to email <span style="color: #374151; font-weight: 600;">${HR_CONTACT_EMAIL}</span> if you face any issues with portal access.</p>
            </div>
        `
    };

    try {
        console.log(` Sending email to ${toEmail}...`);
        await transporter.sendMail(mailOptions);
        console.log(" Email sent successfully!");
    } catch (error) {
        console.error(" SMTP TRANSACTION ERROR:", error.message);
        throw new Error(`Email failed: ${error.message}`);
    }
};

export const sendPasswordResetEmail = async (toEmail, code) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, 
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: `"Security Team" <${process.env.SMTP_FROM_HR}>`,
        replyTo: process.env.SMTP_REPLY_TO_HR,
        to: toEmail,
        subject: "Your Password Reset Code",
        html: `
            <div style="font-family: sans-serif; padding: 20px; text-align: center;">
                <h2 style="color: #1f2937;">Password Reset Request</h2>
                <p>Use the code below to reset your password. This code expires in 15 minutes.</p>
                <div style="margin: 30px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4f46e5; border: 2px dashed #e5e7eb; padding: 10px 20px;">
                        ${code}
                    </span>
                </div>
                <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email.</p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

export const sendInvoicePastDueReminder = async (clientEmail, clientName, invoiceNumber, amount, dueDate, orgName) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, 
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const _parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(parseDateStr(dueDate));
    const formattedDate = `${_parts.find(p => p.type === 'month').value}/${_parts.find(p => p.type === 'day').value}/${_parts.find(p => p.type === 'year').value}`;

    const mailOptions = {
        from: `"${orgName} Billing" <${process.env.SMTP_FROM_ACCOUNTS}>`,
        replyTo: process.env.SMTP_REPLY_TO_ACCOUNTS,
        to: clientEmail,
        subject: `ACTION REQUIRED: Invoice ${invoiceNumber} is Past Due`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; max-w: 600px;">
                <h2 style="color: #ef4444;">Past Due Invoice Reminder</h2>
                <p>Dear ${clientName},</p>
                <p>This is an automated reminder from <b>${orgName}</b> that the following invoice is now past due.</p>
                <div style="background: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Invoice #:</strong> ${invoiceNumber}</p>
                    <p style="margin: 5px 0;"><strong>Amount Due:</strong> $${parseFloat(amount).toFixed(2)}</p>
                    <p style="margin: 0;"><strong>Original Due Date:</strong> ${formattedDate}</p>
                </div>
                <p style="font-size: 0.875rem; color: #4b5563;">Please arrange for payment as soon as possible. If payment has already been sent, please disregard this notice.</p>
                <p style="margin-top: 20px;">Thank you,<br/><strong>${orgName} Accounts Receivable</strong></p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

export const sendTimesheetReminderEmail = async (toEmail, firstName, orgName, clientName, placementCode, startDate, endDate) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const fmt = (dateStr) => {
        const d = parseDateStr(dateStr);
        if (!d || isNaN(d.getTime())) return '—';
        const m   = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${m}/${day}/${d.getFullYear()}`;
    };

    const mailOptions = {
        from: `"${orgName} HR Team" <${process.env.SMTP_FROM_HR}>`,
        replyTo: process.env.SMTP_REPLY_TO_HR,
        to: toEmail,
        subject: `Action Required: Past Due Timesheet for ${clientName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #f87171; color: white; padding: 15px 20px; text-align: center;">
                    <h2 style="margin: 0;">Timesheet Reminder</h2>
                </div>
                <div style="padding: 20px;">
                    <p>Hi <strong>${firstName}</strong>,</p>
                    <p>This is a daily reminder from <strong>${orgName}</strong>. Our records indicate that you have not yet submitted your timesheet for a period that has already ended.</p>
                    <div style="background-color: #f9fafb; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0;">
                        <p style="margin: 0 0 5px 0;"><strong>Client:</strong> ${clientName}</p>
                        <p style="margin: 0 0 5px 0;"><strong>Placement ID:</strong> ${placementCode}</p>
                        <p style="margin: 0;"><strong>Missing Period:</strong> ${fmt(startDate)} to ${fmt(endDate)}</p>
                    </div>
                    <p>Please log in to your employee portal, log your daily hours, attach the mandatory client approval document, and submit for review as soon as possible.</p>
                    <br/>
                    <p style="margin-bottom: 5px;">Thank you,</p>
                    <p style="margin: 0;"><strong>${orgName} HR Team</strong></p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

export const sendCustomInvoiceEmail = async (toEmail, ccEmails, bccEmails, subject, bodyHtml, attachment, invoiceNumber) => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error(" ENV ERROR: SMTP_USER or SMTP_PASS is undefined.");
        throw new Error("SMTP Credentials missing. Check your .env file.");
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const senderEmail = process.env.SMTP_FROM_ACCOUNTS || process.env.SMTP_USER;

    // attachment can be a Buffer (in-memory) or a file path string
    let attachmentEntry = null;
    if (attachment) {
        attachmentEntry = Buffer.isBuffer(attachment)
            ? { filename: `Invoice_${invoiceNumber}.pdf`, content: attachment }
            : { filename: `Invoice_${invoiceNumber}.pdf`, path: attachment };
    }

    // Convert plain-text body (with \n line breaks) to an HTML body that renders correctly
    const bodyAsHtml = `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${
        bodyHtml
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>')
    }</div>`;

    const mailOptions = {
        from: `"Accounts Receivable" <${senderEmail}>`,
        replyTo: process.env.SMTP_REPLY_TO_ACCOUNTS,
        to: toEmail,
        cc: ccEmails || undefined,
        bcc: bccEmails || undefined,
        subject: subject,
        text: bodyHtml,
        html: bodyAsHtml,
        attachments: attachmentEntry ? [attachmentEntry] : []
    };

    try {
        console.log(` Sending invoice ${invoiceNumber} to ${toEmail}...`);
        await transporter.sendMail(mailOptions);
        console.log(" Invoice email sent successfully!");
    } catch (error) {
        console.error(" SMTP TRANSACTION ERROR:", error.message);
        throw new Error(`Invoice email failed: ${error.message}`);
    }
};