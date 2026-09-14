import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument } from 'pdf-lib';
import { logAction } from './auditLogController.js';
import path from 'path';
import XLSX from 'xlsx';
import html_to_pdf from 'html-pdf-node';
import { uploadBuffer } from '../utils/cloudinary.js';

const EXCEL_MIMETYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
]);

const isExcelFile = (file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    return EXCEL_MIMETYPES.has(file.mimetype) || ext === '.xlsx' || ext === '.xls';
};

// Renders every sheet in the workbook as an HTML table, then rasterizes that
// HTML to a PDF via headless Chrome (same html-pdf-node engine used for invoices).
const convertExcelToPdfBuffer = async (fileBuffer) => {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetsHtml = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const tableHtml = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' });
        return `<h3>${sheetName}</h3>${tableHtml}`;
    }).join('<div style="page-break-after: always;"></div>');

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, Helvetica, sans-serif; padding: 20px; }
            h3 { font-size: 13px; margin: 0 0 8px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
            td, th { border: 1px solid #999; padding: 4px 8px; font-size: 11px; }
        </style>
    </head>
    <body>${sheetsHtml}</body>
    </html>`;

    const options = {
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    };
    return html_to_pdf.generatePdf({ content: htmlContent }, options);
};

// Strips directory separators/unsafe characters so the original upload name
// can be reused as the saved filename without a path-traversal risk.
const sanitizeBaseName = (originalname) => {
    const ext = path.extname(originalname);
    const base = path.basename(originalname, ext);
    const cleaned = base.replace(/[^a-zA-Z0-9-_ ]/g, '_').trim();
    return cleaned || 'document';
};

// --- AUTO FILE-TO-PDF CONVERTER ---
// Accepts PDF, JPG/PNG, or Excel (XLSX/XLS); always stores a PDF in Cloudinary,
// under a folder scoped to the timesheet, named after the original upload
// (extension swapped to .pdf). Returns the stored file's URL.
const convertToPDF = async (file, timesheetId) => {
    if (!file) return null;

    let pdfBytes;
    if (file.mimetype === 'application/pdf') {
        pdfBytes = file.buffer;
    } else if (file.mimetype.startsWith('image/')) {
        const imageBytes = file.buffer;
        const pdfDoc = await PDFDocument.create();

        let image;
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
            image = await pdfDoc.embedJpg(imageBytes);
        } else if (file.mimetype === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
        } else {
            throw new Error("Unsupported image format for PDF conversion. Please use JPG or PNG.");
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        pdfBytes = await pdfDoc.save();
    } else if (isExcelFile(file)) {
        pdfBytes = await convertExcelToPdfBuffer(file.buffer);
    } else {
        throw new Error("Unsupported file format. Please upload PDF, JPG, PNG, or Excel (XLSX/XLS).");
    }

    return uploadBuffer(Buffer.from(pdfBytes), {
        folder: `timesheets/${timesheetId}`,
        fileName: `${sanitizeBaseName(file.originalname)}.pdf`,
        mimeType: 'application/pdf',
    });
};

// --- SAFE DATE FORMATTERS ---

// Parse "YYYY-MM-DD" as LOCAL midnight (not UTC midnight).
// new Date("YYYY-MM-DD") is UTC midnight — in Eastern (UTC-4) that's 8 PM the previous day,
// causing .setHours() and getDate() to land on the wrong calendar date.
const parseDateStr = (s) => {
    const [yr, mo, dy] = String(s).split('T')[0].split('-');
    return new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, parseInt(dy, 10));
};

const formatDate = (date) => {
    if (!date) return null;
    // If already a string, return the date portion directly — no Date object needed.
    if (typeof date === 'string') {
        return date.split('T')[0].substring(0, 10);
    }
    // For Date objects (mysql2 returns these at local midnight), use local-time methods.
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Gets the precise current day in US Timezone at midnight
const getUSCurrentDate = () => {
    const now = new Date();
    const options = { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
    const y = parseInt(parts.find(p => p.type === 'year').value, 10);
    const m = parseInt(parts.find(p => p.type === 'month').value, 10) - 1;
    const d = parseInt(parts.find(p => p.type === 'day').value, 10);
    return new Date(y, m, d);
};

// --- CORE GENERATION LOGIC: Start Date -> Current US Date + 1 Period ---
const DAY_NAME_TO_NUM = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };

// maxFuturePeriods: how many periods *starting after today* to include.
// Auto-generation uses 1 (generate just the next upcoming period).
// Manual creation uses 52 (show up to a year of future periods for advance entry).
const getPeriodsToGenerate = (cycleName, placementStartDate, weekStartDay, maxFuturePeriods = 1) => {
    const todayUS = getUSCurrentDate();
    const periods = [];

    if (!placementStartDate) return periods;
    if (!cycleName) return periods; // Bug 2: no cycle assigned — skip generation

    // Safely parse the start date (handles both MySQL Date objects and standard strings)
    let datePart;
    if (placementStartDate instanceof Date) {
        const year = placementStartDate.getFullYear();
        const month = String(placementStartDate.getMonth() + 1).padStart(2, '0');
        const day = String(placementStartDate.getDate()).padStart(2, '0');
        datePart = `${year}-${month}-${day}`;
    } else {
        const strDate = String(placementStartDate);
        datePart = strDate.includes('T') ? strDate.split('T')[0] : strDate;
    }

    const [y, m, d] = datePart.split('-');
    let currentStart = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));

    const cycleLower = cycleName.toLowerCase();
    const isSemiMonthly = cycleLower.includes('semi') && cycleLower.includes('month');
    const isSemiWeekly  = cycleLower.includes('semi') && cycleLower.includes('week');
    const isMonthly     = cycleLower.includes('month') && !isSemiMonthly;

    let futurePeriodCount = 0;

    if (isSemiMonthly) {
        // Semi-monthly: rolling 15-day periods (end = start + 14 days)
        // e.g. 9/10 → 9/24, 9/25 → 10/9, 10/10 → 10/24 …
        while (futurePeriodCount < maxFuturePeriods && periods.length < 300) {
            const currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() + 14);

            periods.push({ start: new Date(currentStart), end: new Date(currentEnd) });
            if (currentStart > todayUS) futurePeriodCount++;

            currentStart = new Date(currentEnd);
            currentStart.setDate(currentStart.getDate() + 1);
        }
    } else if (isSemiWeekly) {
        // Semi-weekly: rolling 3-day periods (end = start + 2 days)
        while (futurePeriodCount < maxFuturePeriods && periods.length < 300) {
            const currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() + 2);

            periods.push({ start: new Date(currentStart), end: new Date(currentEnd) });
            if (currentStart > todayUS) futurePeriodCount++;

            currentStart = new Date(currentEnd);
            currentStart.setDate(currentStart.getDate() + 1);
        }
    } else if (isMonthly) {
        // Monthly: first period from start_date to end of that month, then full calendar months
        while (futurePeriodCount < maxFuturePeriods && periods.length < 300) {
            const currentEnd = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0);

            periods.push({ start: new Date(currentStart), end: new Date(currentEnd) });
            if (currentStart > todayUS) futurePeriodCount++;

            // Advance to 1st of next month
            currentStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 1);
        }
    } else {
        // Weekly: periods aligned to week_start_day (e.g., Monday → each week runs Mon–Sun)
        // If week_start_day is not set, align to the start date's own day of week.
        const currentDayOfWeek = currentStart.getDay();
        const weekStartDayNum = weekStartDay != null
            ? (DAY_NAME_TO_NUM[weekStartDay] ?? currentDayOfWeek)
            : currentDayOfWeek;

        // First period: from start_date to the day before the next occurrence of weekStartDayNum.
        // If start_date already IS the weekStartDayNum, the first period is a full 7-day week.
        let firstPeriodEnd;
        if (currentDayOfWeek === weekStartDayNum) {
            firstPeriodEnd = new Date(currentStart);
            firstPeriodEnd.setDate(firstPeriodEnd.getDate() + 6);
        } else {
            let daysUntil = weekStartDayNum - currentDayOfWeek;
            if (daysUntil <= 0) daysUntil += 7;
            firstPeriodEnd = new Date(currentStart);
            firstPeriodEnd.setDate(firstPeriodEnd.getDate() + daysUntil - 1);
        }

        periods.push({ start: new Date(currentStart), end: new Date(firstPeriodEnd) });
        if (currentStart > todayUS) futurePeriodCount++;

        currentStart = new Date(firstPeriodEnd);
        currentStart.setDate(currentStart.getDate() + 1);

        // Subsequent full 7-day periods
        while (futurePeriodCount < maxFuturePeriods && periods.length < 300) {
            const currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() + 6);

            periods.push({ start: new Date(currentStart), end: new Date(currentEnd) });
            if (currentStart > todayUS) futurePeriodCount++;

            currentStart = new Date(currentEnd);
            currentStart.setDate(currentStart.getDate() + 1);
        }
    }

    return periods.map(p => ({
        start: formatDate(p.start),
        end: formatDate(p.end)
    }));
};

// --- INTERNAL TIMESHEET GENERATOR ---
export const runTimesheetGeneration = async (orgId, adminId) => {
    const connection = await pool.getConnection();
    let generatedCount = 0;
    try {
        await connection.beginTransaction();

        const [placements] = await connection.query(`
            SELECT p.id as placement_id, p.employee_id, c.name as cycle_name,
                   p.timesheet_start_date, p.start_date, p.end_date, p.week_start_day
            FROM placements p
            LEFT JOIN lkp_cycles c ON p.timesheet_cycle_id = c.id
            WHERE p.organization_id = ? AND p.status = 'Active' AND p.has_timesheets = 1
        `, [orgId]);

        for (const p of placements) {
            // Bug 2: no cycle assigned — skip to avoid generating wrong-cycle timesheets
            if (!p.cycle_name) continue;

            // Single query: get last end date AND count of already-future timesheets.
            const [tsStats] = await connection.query(`
                SELECT MAX(end_date) AS last_end,
                       SUM(CASE WHEN start_date > CURDATE() THEN 1 ELSE 0 END) AS future_count
                FROM timesheets WHERE placement_id = ?
            `, [p.placement_id]);

            const futureCount = parseInt(tsStats[0].future_count || 0, 10);

            // Rule: at most 2 timesheets with start_date after today may exist at any time.
            // If 2 are already there, nothing to do — skip this placement entirely.
            if (futureCount >= 2) continue;

            // Anchor from the day AFTER the last existing timesheet so new periods continue
            // exactly where the last one left off (handles old calendar-logic timesheets too).
            let anchorDate;
            if (tsStats[0].last_end) {
                const lastEnd = parseDateStr(formatDate(tsStats[0].last_end));
                lastEnd.setDate(lastEnd.getDate() + 1);
                anchorDate = formatDate(lastEnd);
            } else {
                anchorDate = p.timesheet_start_date || p.start_date;
            }

            // Only generate enough periods to bring future count up to 2.
            const periodsNeeded = 2 - futureCount;
            const periods = getPeriodsToGenerate(p.cycle_name, anchorDate, p.week_start_day, periodsNeeded);

            const finalEndDate = p.end_date ? new Date(p.end_date) : null;
            if (finalEndDate) finalEndDate.setHours(23, 59, 59, 999);

            for (const { start, end } of periods) {
                // Only create a timesheet if the ENTIRE period fits within the placement end date
                if (finalEndDate && new Date(end) > finalEndDate) continue;
                
                const [existing] = await connection.query(
                    `SELECT id FROM timesheets WHERE placement_id = ? AND start_date <= ? AND end_date >= ?`,
                    [p.placement_id, end, start]
                );

                if (existing.length === 0) {
                    const timesheetId = uuidv4();
                    
                    try {
                        await connection.query(`
                            INSERT INTO timesheets (id, organization_id, employee_id, placement_id, start_date, end_date, status_id, created_by, updated_by)
                            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                        `, [timesheetId, orgId, p.employee_id, p.placement_id, start, end, adminId, adminId]);

                        let currentDate = parseDateStr(start);
                        currentDate.setHours(12, 0, 0, 0);

                        let actualEndObj = parseDateStr(end);
                        if (finalEndDate && actualEndObj > finalEndDate) actualEndObj = new Date(finalEndDate);
                        actualEndObj.setHours(12, 0, 0, 0);
                        
                        while (currentDate <= actualEndObj) {
                            await connection.query(`
                                INSERT INTO timesheet_entries (id, timesheet_id, work_date, hours)
                                VALUES (?, ?, ?, 0)
                            `, [uuidv4(), timesheetId, formatDate(currentDate)]);
                            
                            currentDate.setDate(currentDate.getDate() + 1);
                        }
                        generatedCount++;
                    } catch (insertError) {
                        if (insertError.code !== 'ER_DUP_ENTRY') throw insertError; 
                    }
                }
            }
        }
        await connection.commit();
        return generatedCount;
    } catch (error) {
        await connection.rollback();
        console.error("ERROR IN INTERNAL TIMESHEET GENERATOR:", error);
        throw error;
    } finally {
        connection.release();
    }
};

// Express route wrapper
export const generateTimesheets = async (req, res) => {
    try {
        const count = await runTimesheetGeneration(req.user.orgId, req.user.id);
        res.json({ message: `Successfully generated ${count} new timesheets.` });
    } catch (error) {
        console.error("Express Gen Error:", error);
        res.status(500).json({ error: error.message });
    }
};

// 2. GET TIMESHEETS (Management View)
export const getManagementTimesheets = async (req, res) => {
    try {
        // activeOnly=true (default) → only Active placements; activeOnly=false → all placements
        const activeOnly = req.query.activeOnly !== 'false';
        const placementFilter = activeOnly ? "AND p.status = 'Active'" : '';

        const [timesheets] = await pool.query(`
            SELECT t.*, s.name as status_name, e.first_name, e.last_name, e.employee_code,
                   p.placement_code, p.week_start_day, p.pay_type_id, p.status as placement_status,
                   c.client_name, c.id as client_id,
                   cyc.name as cycle_name,
                   pt.name as pay_type_name,
                   u.is_active as employee_is_active
            FROM timesheets t
            JOIN lkp_timesheet_statuses s ON t.status_id = s.id
            JOIN employees e ON t.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            JOIN placements p ON t.placement_id = p.id
            JOIN clients c ON p.client_id = c.id
            LEFT JOIN lkp_cycles cyc ON p.timesheet_cycle_id = cyc.id
            LEFT JOIN (
                SELECT placement_id, pay_type_id,
                       ROW_NUMBER() OVER (PARTITION BY placement_id ORDER BY start_date DESC) AS rn
                FROM placement_type_history
                WHERE start_date <= CURDATE()
            ) pth_active ON pth_active.placement_id = p.id AND pth_active.rn = 1
            LEFT JOIN lkp_pay_types pt ON COALESCE(pth_active.pay_type_id, p.pay_type_id) = pt.id
            WHERE t.organization_id = ? ${placementFilter}
            ORDER BY t.start_date DESC
        `, [req.user.orgId]);
        res.json(timesheets.map(t => ({ ...t, start_date: formatDate(t.start_date), end_date: formatDate(t.end_date) })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. GET TIMESHEET DETAILS & ENTRIES
export const getTimesheetDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const [timesheet] = await pool.query(`
            SELECT t.*, s.name as status_name, p.job_title, p.week_start_day, c.client_name,
                   cyc.name as cycle_name
            FROM timesheets t
            JOIN lkp_timesheet_statuses s ON t.status_id = s.id
            JOIN placements p ON t.placement_id = p.id
            JOIN clients c ON p.client_id = c.id
            LEFT JOIN lkp_cycles cyc ON p.timesheet_cycle_id = cyc.id
            WHERE t.id = ? AND t.organization_id = ?
        `, [id, req.user.orgId]);

        if (timesheet.length === 0) return res.status(404).json({ error: "Timesheet not found" });

        const [entries] = await pool.query(`
            SELECT * FROM timesheet_entries WHERE timesheet_id = ? ORDER BY work_date ASC
        `, [id]);

        const ts = timesheet[0];
        res.json({
            ...ts,
            start_date: formatDate(ts.start_date),
            end_date: formatDate(ts.end_date),
            entries: entries.map(e => ({ ...e, work_date: formatDate(e.work_date) }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. SUBMIT TIMESHEET
export const submitTimesheet = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { entries } = req.body; 
        const employeeId = req.user.id; 

        if (!req.file) throw new Error("Approval attachment is mandatory to submit a timesheet.");

        const attachmentUrl = await convertToPDF(req.file, id);
        
        let totalHours = 0;
        const entriesList = JSON.parse(entries); 

        for (const entry of entriesList) {
            const hrs = parseFloat(entry.hours) || 0;
            totalHours += hrs;
            await connection.query(`
                UPDATE timesheet_entries SET hours = ?, notes = ? WHERE id = ? AND timesheet_id = ?
            `, [hrs, entry.notes || null, entry.id, id]);
        }

        await connection.query(`
            UPDATE timesheets 
            SET total_hours = ?, status_id = 2, attachment_url = ?, submitted_at = NOW(), updated_by = ?
            WHERE id = ? AND organization_id = ?
        `, [totalHours, attachmentUrl, employeeId, id, req.user.orgId]);

        await connection.commit();
        const [subTsRow] = await pool.query(`SELECT t.start_date, t.end_date, p.placement_code, c.client_name FROM timesheets t JOIN placements p ON t.placement_id = p.id JOIN clients c ON p.client_id = c.id WHERE t.id = ? LIMIT 1`, [id]);
        const subTs = subTsRow[0];
        const subPeriod = subTs ? `${subTs.start_date?.toString().slice(0,10)} to ${subTs.end_date?.toString().slice(0,10)}` : id;
        logAction({ orgId: req.user.orgId, module: 'timesheets', action: 'Submitted Timesheet', entityType: 'Timesheet', entityId: id, entityName: subTs?.placement_code || id, performedBy: employeeId, performedByRole: req.user.role, description: `Submitted timesheet for ${subTs?.client_name || '?'} — period: ${subPeriod}, total hours: ${totalHours}` }).catch(() => {});
        res.json({ message: "Timesheet submitted successfully for approval." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// 5. REVIEW TIMESHEET
export const reviewTimesheet = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, rejection_reason } = req.body;
        const adminId = req.user.id;

        const statusId = action === 'approve' ? 3 : 4;
        const reason = action === 'reject' ? rejection_reason : null;

        await pool.query(`
            UPDATE timesheets
            SET status_id = ?, rejection_reason = ?, approved_by = ?, approved_at = NOW(), updated_by = ?
            WHERE id = ? AND organization_id = ?
        `, [statusId, reason, adminId, adminId, id, req.user.orgId]);

        const [tsRow] = await pool.query(`
            SELECT t.total_hours, t.start_date, t.end_date, e.first_name, e.last_name, c.client_name, p.placement_code
            FROM timesheets t
            JOIN placements p ON t.placement_id = p.id
            JOIN employees e ON p.employee_id = e.id
            JOIN clients c ON p.client_id = c.id
            WHERE t.id = ? LIMIT 1
        `, [id]);
        const ts = tsRow[0];
        const empName = ts ? `${ts.first_name} ${ts.last_name}` : id;
        const period = ts ? `${ts.start_date?.toString().slice(0,10)} to ${ts.end_date?.toString().slice(0,10)}` : '';
        const hoursInfo = ts ? ` (${ts.total_hours} hrs)` : '';
        const actionDesc = action === 'approve' ? 'Approved' : 'Rejected';
        logAction({ orgId: req.user.orgId, module: 'timesheets', action: `${actionDesc} Timesheet`, entityType: 'Timesheet', entityId: id, entityName: ts?.placement_code || id, performedBy: adminId, performedByRole: req.user.role, description: `${actionDesc} timesheet for ${empName} @ ${ts?.client_name || '?'} — period: ${period}${hoursInfo}${action === 'reject' ? `. Reason: ${rejection_reason || 'Not provided'}` : ''}` }).catch(() => {});
        res.json({ message: `Timesheet successfully ${action}d.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 6. ADMIN OVERRIDE TIMESHEET
export const adminOverrideTimesheet = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { entries, action, rejection_reason } = req.body;
        const adminId = req.user.id;

        let attachmentUrl = undefined;
        if (req.file) attachmentUrl = await convertToPDF(req.file, id);

        let totalHours = 0;
        if (entries) {
            const entriesList = JSON.parse(entries);
            for (const entry of entriesList) {
                const hrs = parseFloat(entry.hours) || 0;
                totalHours += hrs;
                await connection.query(`
                    UPDATE timesheet_entries SET hours = ?, notes = ? WHERE id = ? AND timesheet_id = ?
                `, [hrs, entry.notes || null, entry.id, id]);
            }
        }

        const statusId = action === 'approve' ? 3 : 4;
        const reason = action === 'reject' ? rejection_reason : null;

        let query = `UPDATE timesheets SET status_id = ?, rejection_reason = ?, approved_by = ?, approved_at = NOW(), updated_by = ?`;
        let params = [statusId, reason, adminId, adminId];

        if (entries) {
            query += `, total_hours = ?`;
            params.push(totalHours);
        }

        if (attachmentUrl) {
            query += `, attachment_url = ?`;
            params.push(attachmentUrl);
        }

        query += ` WHERE id = ? AND organization_id = ?`;
        params.push(id, req.user.orgId);

        await connection.query(query, params);
        await connection.commit();
        const [ovTsRow] = await pool.query(`SELECT t.start_date, t.end_date, t.total_hours, p.placement_code, e.first_name, e.last_name, c.client_name FROM timesheets t JOIN placements p ON t.placement_id = p.id JOIN employees e ON p.employee_id = e.id JOIN clients c ON p.client_id = c.id WHERE t.id = ? LIMIT 1`, [id]);
        const ovTs = ovTsRow[0];
        const ovEmpName = ovTs ? `${ovTs.first_name} ${ovTs.last_name}` : id;
        const ovPeriod = ovTs ? `${ovTs.start_date?.toString().slice(0,10)} to ${ovTs.end_date?.toString().slice(0,10)}` : '';
        logAction({ orgId: req.user.orgId, module: 'timesheets', action: action === 'approve' ? 'Approved Timesheet (Override)' : 'Rejected Timesheet (Override)', entityType: 'Timesheet', entityId: id, entityName: ovTs?.placement_code || id, performedBy: adminId, performedByRole: req.user.role, description: `Admin override — ${action}d timesheet for ${ovEmpName} @ ${ovTs?.client_name || '?'}, period: ${ovPeriod}, hours: ${entries ? totalHours : ovTs?.total_hours || '?'}` }).catch(() => {});
        res.json({ message: `Timesheet overridden and ${action}d successfully.` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const getEmployeeTimesheets = async (req, res) => {
    try {
        const [emp] = await pool.query('SELECT id FROM employees WHERE user_id = ?', [req.user.id]);
        if (emp.length === 0) return res.status(404).json({ error: "Employee profile not found." });
        const employeeId = emp[0].id;

        const [timesheets] = await pool.query(`
            SELECT t.*, s.name as status_name, p.placement_code, p.week_start_day,
                   c.client_name, cyc.name as cycle_name,
                   e.first_name, e.last_name
            FROM timesheets t
            JOIN lkp_timesheet_statuses s ON t.status_id = s.id
            JOIN placements p ON t.placement_id = p.id
            JOIN clients c ON p.client_id = c.id
            JOIN employees e ON t.employee_id = e.id
            LEFT JOIN lkp_cycles cyc ON p.timesheet_cycle_id = cyc.id
            WHERE t.employee_id = ? AND t.organization_id = ?
            ORDER BY t.start_date DESC
        `, [employeeId, req.user.orgId]);

        res.json(timesheets.map(t => ({ ...t, start_date: formatDate(t.start_date), end_date: formatDate(t.end_date) })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- GET MISSING PERIODS FOR MANUAL DROPDOWN ---
export const getMissingPeriods = async (req, res) => {
    try {
        const { placementId } = req.params;
        // lookahead: how many future periods to include (default 1 for auto-gen, 52 for manual modal)
        const maxFuturePeriods = Math.min(parseInt(req.query.lookahead) || 1, 104);

        const [placement] = await pool.query(`
            SELECT c.name as cycle_name, p.timesheet_start_date, p.start_date, p.end_date, p.week_start_day
            FROM placements p
            LEFT JOIN lkp_cycles c ON p.timesheet_cycle_id = c.id
            WHERE p.id = ? AND p.organization_id = ?
        `, [placementId, req.user.orgId]);

        if (placement.length === 0) return res.status(404).json({ error: "Placement not found" });

        const specificStart = placement[0].start_date;
        const possiblePeriods = getPeriodsToGenerate(
            placement[0].cycle_name, specificStart, placement[0].week_start_day, maxFuturePeriods
        );

        // If placement has an end date, cap periods to it
        const placementEnd = placement[0].end_date ? formatDate(placement[0].end_date) : null;
        const cappedPeriods = placementEnd
            ? possiblePeriods.filter(p => p.start <= placementEnd)
            : possiblePeriods;

        const [existing] = await pool.query(`
            SELECT start_date, end_date FROM timesheets WHERE placement_id = ?
        `, [placementId]);

        // Same predicate as runTimesheetGeneration: a period is missing only if it
        // overlaps nothing. Exact-boundary matching wrongly re-offers historical
        // periods when a placement's cycle has changed (e.g. weekly -> monthly),
        // because the rebuilt monthly grid never lines up with the stored weeklies.
        const existingRanges = existing.map(e => ({
            s: formatDate(e.start_date),
            e: formatDate(e.end_date)
        }));
        const missingPeriods = cappedPeriods.filter(
            p => !existingRanges.some(r => r.s <= p.end && r.e >= p.start)
        );

        res.json(missingPeriods);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- MANUALLY CREATE TIMESHEET ---
export const createManualTimesheet = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { placement_id, start_date, end_date } = req.body;
        const orgId = req.user.orgId;
        const adminId = req.user.id;

        const [placement] = await connection.query(`SELECT employee_id FROM placements WHERE id = ? AND organization_id = ?`, [placement_id, orgId]);
        if (placement.length === 0) throw new Error("Invalid placement");
        const employeeId = placement[0].employee_id;

        // Overlap check, not exact-boundary: mirrors runTimesheetGeneration so the
        // manual path cannot create a timesheet on top of an existing one.
        // NOTE: params are crossed on purpose - existing.start <= new.end AND existing.end >= new.start.
        const [existing] = await connection.query(
            `SELECT id, DATE_FORMAT(start_date, '%Y-%m-%d') AS s,
                        DATE_FORMAT(end_date,   '%Y-%m-%d') AS e
             FROM timesheets
             WHERE placement_id = ? AND start_date <= ? AND end_date >= ?`,
            [placement_id, end_date, start_date]
        );
        if (existing.length > 0) {
            throw new Error(`This period overlaps an existing timesheet (${existing[0].s} - ${existing[0].e}).`);
        }

        const timesheetId = uuidv4();

        await connection.query(`
            INSERT INTO timesheets (id, organization_id, employee_id, placement_id, start_date, end_date, status_id, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `, [timesheetId, orgId, employeeId, placement_id, start_date, end_date, adminId, adminId]);

        let currentDate = parseDateStr(start_date);
        currentDate.setHours(12, 0, 0, 0);
        const endDateObj = parseDateStr(end_date);
        endDateObj.setHours(12, 0, 0, 0);
        
        while (currentDate <= endDateObj) {
            await connection.query(`
                INSERT INTO timesheet_entries (id, timesheet_id, work_date, hours)
                VALUES (?, ?, ?, 0)
            `, [uuidv4(), timesheetId, formatDate(currentDate)]);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        await connection.commit();
        logAction({ orgId, module: 'timesheets', action: 'Created Manual Timesheet', entityType: 'Timesheet', entityId: timesheetId, performedBy: adminId, performedByRole: req.user.role, description: `Manually created timesheet for placement ${placement_id} (${start_date} to ${end_date})` }).catch(() => {});
        res.json({ message: "Timesheet manually created successfully." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// --- DELETE TIMESHEET (ORG_ADMIN only; Not Submitted or Past Due only) ---
export const deleteTimesheet = async (req, res) => {
    if (req.user.role !== 'ORG_ADMIN') {
        return res.status(403).json({ error: 'Only ORG_ADMIN can delete timesheets.' });
    }
    const { id } = req.params;
    try {
        const [ts] = await pool.query(
            `SELECT id, status_id, start_date, end_date FROM timesheets WHERE id = ? AND organization_id = ?`,
            [id, req.user.orgId]
        );
        if (ts.length === 0) return res.status(404).json({ error: 'Timesheet not found.' });
        if (![1, 5].includes(ts[0].status_id)) {
            return res.status(400).json({ error: 'Only Not Submitted or Past Due timesheets can be deleted.' });
        }
        await pool.query(`DELETE FROM timesheet_entries WHERE timesheet_id = ?`, [id]);
        await pool.query(`DELETE FROM timesheets WHERE id = ? AND organization_id = ?`, [id, req.user.orgId]);
        logAction({ orgId: req.user.orgId, module: 'timesheets', action: 'Deleted Timesheet', entityType: 'Timesheet', entityId: id, performedBy: req.user.id, performedByRole: req.user.role, description: `Deleted timesheet ${formatDate(ts[0].start_date)} – ${formatDate(ts[0].end_date)}` }).catch(() => {});
        res.json({ message: 'Timesheet deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};