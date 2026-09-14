import html_to_pdf from 'html-pdf-node';
import { PDFDocument } from 'pdf-lib';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import { parseDateStr, getEasternDateString } from './dateUtils.js';
import { uploadBuffer, readFileRef, deleteFileRef, fileRefExt, isRemoteUrl, isCloudinaryFolderUrl } from './cloudinary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Invoice PDFs are uploaded to this Cloudinary folder. INVOICE_DIR is where they were
// written before the move, so those older files are still recognised as app-generated.
const INVOICE_FOLDER = 'invoices';
const INVOICE_DIR = path.join(__dirname, '../uploads/invoices');

// Invoice PDFs produced by this app, as opposed to old-portal imports (blob/…, 2022/…).
const isAppGeneratedInvoice = (ref) => isRemoteUrl(ref)
    ? isCloudinaryFolderUrl(ref, INVOICE_FOLDER)
    : path.resolve(ref).startsWith(path.resolve(INVOICE_DIR) + path.sep);

const LOGO_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

// Loads the org logo (Cloudinary URL or legacy /uploads path) as a data URI for the invoice HTML.
const loadOrgLogoBase64 = async (logoUrl) => {
    if (!logoUrl) return null;
    try {
        const logoBuffer = await readFileRef(logoUrl);
        const mime = LOGO_MIME[fileRefExt(logoUrl).replace('.', '')] || 'image/png';
        return `data:${mime};base64,${logoBuffer.toString('base64')}`;
    } catch (e) {
        console.warn('Could not load org logo for PDF, skipping:', e.message);
        return null;
    }
};

// ─── Local helpers ────────────────────────────────────────────────────────────

const _normDate = (d) => {
    if (!d) return '';
    if (typeof d === 'string') return d.split('T')[0];
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const _dateMinus1 = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Build bill-rate segments for the invoice period.
// Returns [{segStart, segEnd, billRate}] sorted ascending by segStart.
const buildBillRateSegments = (billRates, periodStart, periodEnd) => {
    const valid = billRates
        .filter(r => _normDate(r.effective_date) <= periodEnd)
        .sort((a, b) => (_normDate(a.effective_date) < _normDate(b.effective_date) ? -1 : 1));

    if (valid.length === 0) return [];

    const breakSet = new Set([periodStart]);
    for (const r of valid) {
        const d = _normDate(r.effective_date);
        if (d > periodStart && d <= periodEnd) breakSet.add(d);
    }

    const breaks = [...breakSet].sort();

    const getBR = (date) => {
        const active = valid.filter(r => _normDate(r.effective_date) <= date);
        if (!active.length) return 0;
        const br   = active[active.length - 1];
        const base = parseFloat(br.bill_rate_value) || 0;
        const disc = parseFloat(br.discount_percentage) || 0;
        return base - (base * (disc / 100));
    };

    const segments = [];
    for (let i = 0; i < breaks.length; i++) {
        const segStart = breaks[i];
        const segEnd   = i + 1 < breaks.length ? _dateMinus1(breaks[i + 1]) : periodEnd;
        if (segStart > periodEnd) continue;
        segments.push({ segStart, segEnd, billRate: getBR(segStart) });
    }
    return segments;
};

// Compute line items for an invoice by joining timesheet_entries with bill-rate segments.
// Returns [{period_start, period_end, hours, bill_rate, amount}].
// Falls back to a single row from invoice totals when no segment data is available.
const computeInvoiceLineItems = async (invoiceData) => {
    const periodStart = _normDate(invoiceData.period_start);
    const periodEnd   = _normDate(invoiceData.period_end);

    try {
        const [billRateRows] = await pool.query(`
            SELECT bill_rate_value, discount_percentage,
                   DATE_FORMAT(effective_date, '%Y-%m-%d') AS effective_date
            FROM placement_bill_rates WHERE placement_id = ?
        `, [invoiceData.placement_id]);

        const segments = buildBillRateSegments(billRateRows, periodStart, periodEnd);

        if (segments.length <= 1) {
            const hours = parseFloat(invoiceData.total_hours) || 0;
            if (segments.length === 1) {
                // Recalculate amount from hours × current bill rate (source of truth)
                const rate   = segments[0].billRate;
                const amount = parseFloat((hours * rate).toFixed(2));
                return [{ period_start: periodStart, period_end: periodEnd, hours, bill_rate: rate, amount }];
            }
            // No bill rate records at all — fall back to stored total with blended rate
            const storedAmount = parseFloat(invoiceData.total_amount) || 0;
            const rate = hours > 0 ? storedAmount / hours : 0;
            return [{ period_start: periodStart, period_end: periodEnd, hours, bill_rate: rate, amount: storedAmount }];
        }

        // Multiple bill-rate segments — sum hours per segment from timesheet_entries
        const [entries] = await pool.query(`
            SELECT DATE_FORMAT(te.work_date, '%Y-%m-%d') AS work_date,
                   te.hours
            FROM timesheet_entries te
            JOIN timesheets t ON te.timesheet_id = t.id
            WHERE t.placement_id = ? AND t.status_id = 3
              AND te.work_date >= ? AND te.work_date <= ?
        `, [invoiceData.placement_id, periodStart, periodEnd]);

        const lineItems = [];
        for (const seg of segments) {
            const segHours = entries
                .filter(e => e.work_date >= seg.segStart && e.work_date <= seg.segEnd)
                .reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);
            if (segHours === 0) continue;
            lineItems.push({
                period_start: seg.segStart,
                period_end:   seg.segEnd,
                hours:        segHours,
                bill_rate:    seg.billRate,
                amount:       parseFloat((segHours * seg.billRate).toFixed(2)),
            });
        }

        return lineItems.length > 0
            ? lineItems
            : [{ period_start: periodStart, period_end: periodEnd,
                 hours: parseFloat(invoiceData.total_hours) || 0,
                 bill_rate: 0,
                 amount: parseFloat(invoiceData.total_amount) || 0 }];

    } catch {
        const hours  = parseFloat(invoiceData.total_hours) || 0;
        const amount = parseFloat(invoiceData.total_amount) || 0;
        return [{ period_start: periodStart, period_end: periodEnd,
                  hours, bill_rate: hours > 0 ? amount / hours : 0, amount }];
    }
};

export { computeInvoiceLineItems };

// ─────────────────────────────────────────────────────────────────────────────
// Builds the invoice HTML and returns a single-page PDF buffer.
// lineItems: [{period_start, period_end, hours, bill_rate, amount}]
//   — if provided and has multiple rows, the table is rendered with one row per segment.
// ─────────────────────────────────────────────────────────────────────────────
export const generateInvoicePageBuffer = async (invoiceData, clientData, orgLogoBase64 = null, lineItems = null, adjustments = []) => {
    const termsDisplay = invoiceData.pay_when_paid
        ? "Pay when paid"
        : `Net ${clientData.net_terms || 30}`;

    const _fmtDate = (d) => {
        if (!d) return '';
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(parseDateStr(d));
        const month = parts.find(p => p.type === 'month').value;
        const day   = parts.find(p => p.type === 'day').value;
        const year  = parts.find(p => p.type === 'year').value;
        return `${month}/${day}/${year}`;
    };

    // Due Date is never derived here — it is only ever the stored due_date, which is
    // written once as issue_date + net_terms when the invoice is opened. An invoice
    // that has not been sent yet has no issue date, so no due date exists to print:
    // it shows "TBD" rather than a guess that would shift on every preview.
    const issueDate = invoiceData.issue_date
        ? _fmtDate(invoiceData.issue_date)
        : _fmtDate(getEasternDateString());
    const dueDate = invoiceData.due_date ? _fmtDate(invoiceData.due_date) : 'TBD';

    // Build line item rows
    const rows = lineItems && lineItems.length > 0 ? lineItems : null;
    const baseTotal = rows
        ? rows.reduce((s, r) => s + parseFloat(r.amount), 0)
        : parseFloat(invoiceData.total_amount) || 0;

    const adjTotal = (adjustments || []).reduce((sum, adj) => {
        return adj.type === 'addition' ? sum + parseFloat(adj.amount) : sum - parseFloat(adj.amount);
    }, 0);
    const totalAmount = baseTotal + adjTotal;

    const tableRowsHtml = rows
        ? rows.map(r => `
            <tr>
                <td>
                    <strong>${invoiceData.emp_first} ${invoiceData.emp_last}</strong><br/>
                    <span style="color:#4b5563;">${_fmtDate(r.period_start)} &ndash; ${_fmtDate(r.period_end)}</span>
                </td>
                <td class="text-center">${parseFloat(r.hours).toFixed(2)}</td>
                <td class="text-center">$${parseFloat(r.bill_rate).toFixed(2)}</td>
                <td class="text-right" style="font-weight:bold;">$${parseFloat(r.amount).toFixed(2)}</td>
            </tr>`).join('')
        : (() => {
            const hours    = parseFloat(invoiceData.total_hours) || 0;
            const amount   = parseFloat(invoiceData.total_amount) || 0;
            const billRate = hours > 0 ? (amount / hours).toFixed(2) : '0.00';
            const pStart   = _fmtDate(invoiceData.period_start);
            const pEnd     = _fmtDate(invoiceData.period_end);
            return `
            <tr>
                <td>
                    <strong>${invoiceData.emp_first} ${invoiceData.emp_last}</strong><br/>
                    <span style="color:#4b5563;">${pStart} &ndash; ${pEnd}</span>
                </td>
                <td class="text-center">${hours}</td>
                <td class="text-center">$${billRate}</td>
                <td class="text-right" style="font-weight:bold;">$${amount.toFixed(2)}</td>
            </tr>`;
        })();

    const adjustmentRowsHtml = (adjustments || []).map(adj => `
        <tr style="background-color:${adj.type === 'addition' ? '#f0fdf4' : '#fef2f2'};">
            <td>
                <strong style="font-size:10px;text-transform:uppercase;color:${adj.type === 'addition' ? '#166534' : '#991b1b'};">${adj.type}</strong>
                <span style="margin-left:8px;color:#374151;">${adj.description}</span>
            </td>
            <td class="text-center" style="color:#9ca3af;">—</td>
            <td class="text-center" style="color:#9ca3af;">—</td>
            <td class="text-right" style="font-weight:bold;color:${adj.type === 'addition' ? '#166534' : '#991b1b'};">
                ${adj.type === 'addition' ? '+' : '-'}$${parseFloat(adj.amount).toFixed(2)}
            </td>
        </tr>`).join('');

    const customNote1Html = invoiceData.custom_notes_1 ? `
        <tr>
            <td colspan="4" style="background-color:#f9fafb;padding:12px 16px;border:1px solid #d1d5db;font-size:12px;font-style:italic;color:#374151;">
                <strong>Note:</strong> ${invoiceData.custom_notes_1}
            </td>
        </tr>` : '';

    const customNote2Html = invoiceData.custom_notes_2 || 'Thank you for your business. If you have any questions about this invoice, please contact us.';
    const logoHtml = orgLogoBase64
        ? `<img src="${orgLogoBase64}" alt="Logo" style="max-height:64px;max-width:200px;object-fit:contain;display:block;margin-bottom:6px;"/>`
        : '';
    const orgAddress = (invoiceData.org_address || '').replace(/\n/g, '<br/>');

    // Feature 1: hide Due Date column when pay_when_paid is true
    const metaTermsTableHtml = invoiceData.pay_when_paid
        ? `<table class="mini-table">
                <tr><th>Terms</th></tr>
                <tr><td>${termsDisplay}</td></tr>
           </table>`
        : `<table class="mini-table">
                <tr><th>Terms</th><th>Due Date</th></tr>
                <tr><td>${termsDisplay}</td><td>${dueDate}</td></tr>
           </table>`;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 40px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
            .org-title { font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 0.5px; }
            .org-address { font-size: 12px; color: #4b5563; margin-top: 4px; line-height: 1.4; }
            .invoice-title { font-size: 32px; font-weight: 300; color: #d1d5db; text-transform: uppercase; letter-spacing: 4px; margin: 0; }
            .bill-to-section { margin-bottom: 30px; }
            .bill-to-title { font-size: 14px; font-weight: bold; border-bottom: 2px solid #111827; display: inline-block; padding-bottom: 2px; margin-bottom: 8px; }
            .client-name { font-size: 14px; font-weight: 600; margin: 0; }
            .client-dept { font-size: 12px; color: #4b5563; margin: 2px 0; }
            .meta-tables { display: flex; gap: 30px; margin-bottom: 30px; }
            .mini-table { border-collapse: collapse; text-align: center; font-size: 12px; width: 200px; }
            .mini-table th { background-color: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 10px; font-weight: 600; }
            .mini-table td { border: 1px solid #d1d5db; padding: 6px 10px; }
            .main-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; text-align: left; }
            .main-table th { background-color: #f3f4f6; border: 1px solid #d1d5db; padding: 10px 12px; font-size: 12px; font-weight: 600; }
            .main-table td { border: 1px solid #d1d5db; padding: 12px; font-size: 12px; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .total-section { display: flex; justify-content: flex-end; width: 100%; margin-bottom: 40px; }
            .total-box { width: 300px; display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; border-bottom: 2px solid #111827; padding-bottom: 4px; }
            .footer-note { text-align: center; font-size: 12px; color: #6b7280; font-style: italic; margin-top: 50px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
        </style>
    </head>
    <body>
        <div class="header">
            <div>
                ${logoHtml}
                <h2 class="org-title">${invoiceData.org_name || 'YOUR ORGANIZATION LLC'}</h2>
                ${orgAddress ? `<p class="org-address">${orgAddress}</p>` : ''}
            </div>
            <div><h1 class="invoice-title">Invoice</h1></div>
        </div>

        <div class="bill-to-section">
            <div class="bill-to-title">Bill To</div>
            <p class="client-name">${clientData.client_name}</p>
            <p class="client-dept">Accounts Payable</p>
            <p class="client-dept">${clientData.address || 'Address Not Provided'}</p>
        </div>

        <div class="meta-tables">
            <table class="mini-table">
                <tr><th>Date</th><th>Invoice #</th></tr>
                <tr><td>${issueDate}</td><td style="font-weight:bold;">${invoiceData.invoice_number}</td></tr>
            </table>
            ${metaTermsTableHtml}
        </div>

        <table class="main-table">
            <thead>
                <tr>
                    <th style="width:50%;">Description</th>
                    <th class="text-center" style="width:15%;">Qty. (Hrs)</th>
                    <th class="text-center" style="width:15%;">Bill Rate</th>
                    <th class="text-right" style="width:20%;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${tableRowsHtml}
                ${adjustmentRowsHtml}
                ${customNote1Html}
            </tbody>
        </table>

        <div class="total-section">
            <div class="total-box">
                <span>Total:</span>
                <span>$${totalAmount.toFixed(2)}</span>
            </div>
        </div>

        <div class="footer-note">${customNote2Html}</div>
    </body>
    </html>`;

    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
    const options = {
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px' },
        args: launchArgs,
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    };
    return html_to_pdf.generatePdf({ content: htmlContent }, options);
};

// Fetches invoice data, computes bill-rate line items, generates invoice page
// + appends timesheet PDFs, returns a combined buffer for email attachments.
export const buildCombinedPDFBuffer = async (invoiceId) => {
    const [invoices] = await pool.query(`
        SELECT i.*, ise.custom_notes_1, ise.custom_notes_2, ise.pay_when_paid,
               e.first_name as emp_first, e.last_name as emp_last,
               o.name as org_name, o.logo_url as org_logo_url, o.address as org_address
        FROM invoices i
        LEFT JOIN invoice_settings ise ON i.placement_id = ise.placement_id
        LEFT JOIN placements p ON i.placement_id = p.id
        LEFT JOIN employees e ON p.employee_id = e.id
        LEFT JOIN organizations o ON i.organization_id = o.id
        WHERE i.id = ?
    `, [invoiceId]);
    if (!invoices.length) throw new Error(`Invoice ${invoiceId} not found`);
    const invoiceData = invoices[0];

    const [clients] = await pool.query(`
        SELECT c.client_name, c.address, ise.net_terms
        FROM clients c
        JOIN invoices i ON c.id = i.client_id
        LEFT JOIN invoice_settings ise ON i.placement_id = ise.placement_id
        WHERE i.id = ?
    `, [invoiceId]);
    const clientData = clients[0] || { client_name: 'Unknown', address: '', net_terms: 30 };

    // ─── Pick the base document ──────────────────────────────────────────────
    // Prefer the PDF already stored at invoice_file_path over rendering a new one,
    // so the client is sent the document that was actually produced for the invoice.
    //
    // Whether the timesheets still need appending depends on which kind of file it is:
    //
    //   A. generated by this app (Cloudinary invoices folder, or INVOICE_DIR for
    //      older files) — the invoice page only,
    //      so the timesheets are appended below as usual.
    //   B. imported from the old portal (blob/…, 2022/…) — those exports already
    //      bundle the timesheet scans behind the invoice page, so appending would
    //      send every scan to the client twice.
    //   C. no path recorded, or the file is missing or unreadable — render a fresh
    //      invoice page and append, exactly as before.
    //
    // ignoreEncryption keeps an old-portal export that carries permissions flags
    // from throwing; a genuinely unreadable file falls through to case C.
    let combinedPdf = null;
    let appendTimesheets = true;

    if (invoiceData.invoice_file_path) {
        try {
            const storedBytes = await readFileRef(invoiceData.invoice_file_path);
            combinedPdf = await PDFDocument.load(storedBytes, { ignoreEncryption: true });

            appendTimesheets = isAppGeneratedInvoice(invoiceData.invoice_file_path); // case B keeps its own bundled scans
        } catch (e) {
            console.warn(`Stored invoice PDF unusable for ${invoiceId}, rendering a fresh page:`, e.message);
            combinedPdf = null;
        }
    }

    // Nothing usable stored: render the invoice page, SAVE it, and read it back from
    // the URL just written. Doing the save here rather than in the callers means
    // every entry point leaves invoice_file_path populated -- previously only the two
    // email routes did, so downloading a combined PDF re-rendered on every request
    // and left the column NULL forever.
    if (!combinedPdf) {
        try {
            const savedPath  = await generateAndSaveInvoicePDF(invoiceId);
            combinedPdf      = await PDFDocument.load(await readFileRef(savedPath));
            appendTimesheets = true;
        } catch (e) {
            console.warn(`Could not save a fresh invoice PDF for ${invoiceId}, building in memory:`, e.message);
            combinedPdf = null;
        }
    }

    // Last resort: the save failed (Cloudinary not configured or unreachable). Build
    // the page in memory so downloads and emails still work, just without persisting.
    if (!combinedPdf) {
        const orgLogoBase64 = await loadOrgLogoBase64(invoiceData.org_logo_url);

        // Compute bill-rate line items for this invoice
        const lineItems = await computeInvoiceLineItems(invoiceData);

        const [adjRows] = await pool.query(
            `SELECT type, amount, description, DATE_FORMAT(date, '%Y-%m-%d') AS date FROM invoice_adjustments WHERE invoice_id = ?`,
            [invoiceId]
        );

        const invoiceBuffer = await generateInvoicePageBuffer(invoiceData, clientData, orgLogoBase64, lineItems, adjRows);
        combinedPdf = await PDFDocument.load(invoiceBuffer);
        appendTimesheets = true;
    }

    if (!appendTimesheets) return Buffer.from(await combinedPdf.save());

    try {
        const [timesheets] = await pool.query(`
            SELECT DISTINCT t.attachment_url, t.start_date
            FROM timesheets t
            JOIN invoices i ON t.placement_id = i.placement_id AND i.id = ?
            WHERE t.attachment_url IS NOT NULL
              AND t.status_id = 3
              AND t.start_date <= i.period_end
              AND t.end_date   >= i.period_start
            ORDER BY t.start_date ASC
        `, [invoiceId]);

        const A4_W = 595.28;
        const A4_H = 841.89;

        for (const ts of timesheets) {
            try {
                // Cloudinary URL, or a legacy path relative to the backend root
                const fileBytes = await readFileRef(ts.attachment_url);
                const ext = fileRefExt(ts.attachment_url);

                if (ext === '.pdf') {
                    const tsPdf = await PDFDocument.load(fileBytes);
                    const copiedPages = await combinedPdf.copyPages(tsPdf, tsPdf.getPageIndices());
                    copiedPages.forEach(page => combinedPdf.addPage(page));
                } else if (ext === '.jpg' || ext === '.jpeg') {
                    const img    = await combinedPdf.embedJpg(fileBytes);
                    const scaled = img.scaleToFit(A4_W, A4_H);
                    const page   = combinedPdf.addPage([A4_W, A4_H]);
                    page.drawImage(img, { x: (A4_W - scaled.width) / 2, y: (A4_H - scaled.height) / 2, width: scaled.width, height: scaled.height });
                } else if (ext === '.png') {
                    const img    = await combinedPdf.embedPng(fileBytes);
                    const scaled = img.scaleToFit(A4_W, A4_H);
                    const page   = combinedPdf.addPage([A4_W, A4_H]);
                    page.drawImage(img, { x: (A4_W - scaled.width) / 2, y: (A4_H - scaled.height) / 2, width: scaled.width, height: scaled.height });
                }
            } catch (fsError) {
                console.error(`Failed to embed timesheet attachment at ${ts.attachment_url}:`, fsError);
            }
        }
    } catch (dbError) {
        console.error("Failed to query timesheets for combined PDF:", dbError);
    }

    return Buffer.from(await combinedPdf.save());
};

// Saves only the invoice single-page PDF to disk and updates the DB.
export const generateAndSaveInvoicePDF = async (invoiceId) => {
    const [invoices] = await pool.query(`
        SELECT i.*, ise.custom_notes_1, ise.custom_notes_2, ise.pay_when_paid,
               e.first_name as emp_first, e.last_name as emp_last,
               o.name as org_name, o.logo_url as org_logo_url, o.address as org_address
        FROM invoices i
        LEFT JOIN invoice_settings ise ON i.placement_id = ise.placement_id
        LEFT JOIN placements p ON i.placement_id = p.id
        LEFT JOIN employees e ON p.employee_id = e.id
        LEFT JOIN organizations o ON i.organization_id = o.id
        WHERE i.id = ?
    `, [invoiceId]);
    const invoiceData = invoices[0];

    const [clients] = await pool.query(`
        SELECT c.client_name, c.address, ise.net_terms
        FROM clients c
        JOIN invoices i ON c.id = i.client_id
        LEFT JOIN invoice_settings ise ON i.placement_id = ise.placement_id
        WHERE i.id = ?
    `, [invoiceId]);
    const clientData = clients[0] || { client_name: 'Unknown', address: '', net_terms: 30 };

    const orgLogoBase64 = await loadOrgLogoBase64(invoiceData.org_logo_url);

    const lineItems = await computeInvoiceLineItems(invoiceData);

    const [adjRows] = await pool.query(
        `SELECT type, amount, description, DATE_FORMAT(date, '%Y-%m-%d') AS date FROM invoice_adjustments WHERE invoice_id = ?`,
        [invoiceId]
    );

    const invoiceBuffer = await generateInvoicePageBuffer(invoiceData, clientData, orgLogoBase64, lineItems, adjRows);

    const fileUrl = await uploadBuffer(invoiceBuffer, {
        folder: INVOICE_FOLDER,
        fileName: `${invoiceData.invoice_number}.pdf`,
        mimeType: 'application/pdf',
    });

    const previousPath = invoiceData.invoice_file_path;
    await pool.query(`UPDATE invoices SET invoice_file_path = ? WHERE id = ?`, [fileUrl, invoiceId]);

    // Every regeneration uploads a new file (its name carries a random suffix) and
    // would otherwise orphan the last one. Remove the superseded copy once the DB
    // points at the replacement, so a failure here can never leave the row
    // referencing a file that is already gone.
    //
    // Only ever delete our own output: old-portal imports (blob/..., 2022/...) are
    // the sole copy of those documents.
    if (previousPath && previousPath !== fileUrl && isAppGeneratedInvoice(previousPath)) {
        try { await deleteFileRef(previousPath); }
        catch (e) { console.warn('Could not remove superseded invoice PDF:', e.message); }
    }

    return fileUrl;
};
