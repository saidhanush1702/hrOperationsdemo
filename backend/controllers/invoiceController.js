import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs/promises';
import { logAction } from './auditLogController.js';
import path from 'path';
import { generateAndSaveInvoicePDF, buildCombinedPDFBuffer, computeInvoiceLineItems } from '../utils/pdfGenerator.js';
import { sendCustomInvoiceEmail } from '../utils/mailer.js';
import { generateInvoicesForOrg } from '../services/invoiceService.js';
import { postC2CLedgerForInvoice } from '../services/c2cLedgerService.js';
import { getEasternDateString, normDateStr } from '../utils/dateUtils.js';

// ─── Module-scope date utilities ─────────────────────────────────────────────

const normDate = (d) => {
    if (!d) return '';
    if (typeof d === 'string') return d.split('T')[0];
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const monthEndStr = (year, month) => {
    const d = new Date(year, month, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};


// ─── Invoice list: shared query core ──────────────────────────────────────────
//
// The list, the tab counts, the select-all id lookup and the export all have to
// agree on exactly which invoices match. They share the FROM and the WHERE
// builders below, so a filter can never mean one thing on screen and another in
// an export or a bulk delete.

// An Open invoice (4) past its due date reads as Past Due (5) without being
// written. This mirrors the JS derivation applied to returned rows further down;
// both must change together.
const EFFECTIVE_STATUS = `
    CASE WHEN i.status_id = 4 AND i.due_date IS NOT NULL AND i.due_date < CURDATE()
         THEN 5 ELSE i.status_id END`;

const INVOICE_FROM = `
    FROM invoices i
    LEFT JOIN lkp_invoice_statuses s ON i.status_id = s.id
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN placements p ON i.placement_id = p.id
    LEFT JOIN (
        SELECT placement_id, pay_type_id,
               ROW_NUMBER() OVER (PARTITION BY placement_id ORDER BY start_date DESC) AS rn
        FROM placement_type_history
        WHERE start_date <= CURDATE()
    ) pth_active ON pth_active.placement_id = p.id AND pth_active.rn = 1
    LEFT JOIN lkp_pay_types pt ON COALESCE(pth_active.pay_type_id, p.pay_type_id) = pt.id
    LEFT JOIN employees e ON p.employee_id = e.id
    LEFT JOIN invoice_settings ise ON p.id = ise.placement_id
    LEFT JOIN organizations o ON i.organization_id = o.id`;

const TAB_STATUS = { DRAFT: 1, READY: 2, OPEN: 4, PAST_DUE: 5, PAID: 6 };

// Everything except the status tab. The tab counts need this on its own, so that
// each tab's number reflects the other active filters without being narrowed by
// its own status — which is what the old client-side counts did.
const buildInvoiceWhere = (q, orgId) => {
    const where  = ['i.organization_id = ?'];
    const params = [orgId];

    // activeOnly=true (default) → only Active placements; 'false' → all placements
    if (q.activeOnly !== 'false') where.push("p.status = 'Active'");

    if (q.payType  && q.payType  !== 'ALL') { where.push('pt.name = ?');       params.push(q.payType); }
    if (q.employee && q.employee !== 'ALL') { where.push('p.employee_id = ?'); params.push(q.employee); }
    if (q.client   && q.client   !== 'ALL') { where.push('i.client_id = ?');   params.push(q.client); }

    // Date range matches on period overlap, the same rule the UI applied
    // client-side: keep an invoice whose billing period touches the range.
    if (q.dateFrom) { where.push('i.period_end   >= ?'); params.push(q.dateFrom); }
    if (q.dateTo)   { where.push('i.period_start <= ?'); params.push(q.dateTo); }

    // Each whitespace-separated term must match SOMETHING, but not necessarily the
    // same column — so "sruthi 30881" finds the row whose employee matches one term
    // and whose invoice number matches the other. Mirrors utils/searchMatch.js on
    // the client, which the client-side lists use.
    if (q.search && String(q.search).trim()) {
        const COLUMNS = [
            'i.invoice_number',
            'c.client_name',
            "CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,''))",
            'e.employee_code',
            'p.placement_code',
        ];
        for (const term of String(q.search).trim().split(/\s+/)) {
            where.push(`(${COLUMNS.map(col => `${col} LIKE ?`).join(' OR ')})`);
            const like = `%${term}%`;
            COLUMNS.forEach(() => params.push(like));
        }
    }

    return { sql: where.join(' AND '), params };
};

const addTabFilter = (base, tab) => {
    const status = TAB_STATUS[tab];
    if (!status) return base; // ALL, or an unknown tab, means no status narrowing
    return { sql: `${base.sql} AND (${EFFECTIVE_STATUS}) = ?`, params: [...base.params, status] };
};

// Same rule as EFFECTIVE_STATUS, applied to the rows we return so the client sees
// Past Due immediately rather than waiting for the 01:00 sweep to persist it.
const deriveOverdue = (rows) => {
    const today = getEasternDateString();
    return rows.map(inv => {
        if (inv.status_id !== 4 || !inv.due_date) return inv;
        if (normDateStr(inv.due_date) >= today) return inv;
        return { ...inv, status_id: 5, status_name: 'Past Due' };
    });
};

const LIST_COLUMNS = `
    SELECT i.*, s.name as status_name,
           c.client_name, c.address as client_address,
           p.placement_code, p.employee_id, p.status as placement_status,
           pt.name as pay_type_name,
           e.first_name as emp_first, e.last_name as emp_last,
           ise.custom_notes_1, ise.custom_notes_2, ise.pay_when_paid, ise.net_terms as settings_net_terms,
           o.name as org_name, o.logo_url as org_logo_url, o.address as org_address,
           COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = i.id), 0) AS amount_paid,
           COALESCE((SELECT SUM(CASE WHEN ia.type='addition' THEN ia.amount ELSE -ia.amount END) FROM invoice_adjustments ia WHERE ia.invoice_id = i.id), 0) AS adj_total`;

// One page of invoices, plus the tab counts the page needs.
//
// Past-due flagging deliberately does NOT run here. It used to, which made this
// read endpoint take a write lock over every Open invoice on each page load —
// expensive on a single-core box. services/invoiceCron.js performs that sweep
// nightly at 01:00; this endpoint derives past-due instead.
export const getInvoices = async (req, res) => {
    try {
        const orgId    = req.user.orgId;
        const page     = Math.max(1, parseInt(req.query.page) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 20));
        const offset   = (page - 1) * pageSize;

        const base   = buildInvoiceWhere(req.query, orgId);
        const scoped = addTabFilter(base, req.query.tab);

        const [[rows], [[totalRow]], [countRows]] = await Promise.all([
            pool.query(
                `${LIST_COLUMNS} ${INVOICE_FROM}
                 WHERE ${scoped.sql}
                 ORDER BY i.period_end DESC, i.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...scoped.params, pageSize, offset]
            ),
            pool.query(`SELECT COUNT(*) AS n ${INVOICE_FROM} WHERE ${scoped.sql}`, scoped.params),
            pool.query(
                `SELECT (${EFFECTIVE_STATUS}) AS es, COUNT(*) AS n
                 ${INVOICE_FROM} WHERE ${base.sql} GROUP BY es`,
                base.params
            ),
        ]);

        const byStatus = Object.fromEntries(countRows.map(r => [Number(r.es), Number(r.n)]));
        const counts = {
            ALL:      countRows.reduce((sum, r) => sum + Number(r.n), 0),
            DRAFT:    byStatus[1] || 0,
            READY:    byStatus[2] || 0,
            OPEN:     byStatus[4] || 0,
            PAST_DUE: byStatus[5] || 0,
            PAID:     byStatus[6] || 0,
        };

        res.json({ rows: deriveOverdue(rows), total: Number(totalRow.n), page, pageSize, counts });
    } catch (error) {
        console.error("DATABASE ERROR in getInvoices:", error);
        res.status(500).json({ error: error.message });
    }
};

// Employee and client options for the filter drawer. Scoped to the org and the
// active/all toggle only — deliberately NOT narrowed by the other filters, so the
// dropdowns do not shrink out from under the user while they are picking values.
export const getInvoiceFilterOptions = async (req, res) => {
    try {
        const scope = buildInvoiceWhere({ activeOnly: req.query.activeOnly }, req.user.orgId);
        const [rows] = await pool.query(
            `SELECT DISTINCT p.employee_id, e.first_name, e.last_name, i.client_id, c.client_name
             ${INVOICE_FROM} WHERE ${scope.sql}`,
            scope.params
        );

        const employees = [...new Map(rows
            .filter(r => r.employee_id)
            .map(r => [r.employee_id, { id: r.employee_id, name: `${r.first_name} ${r.last_name}` }])
        ).values()].sort((a, b) => a.name.localeCompare(b.name));

        const clients = [...new Map(rows
            .filter(r => r.client_id)
            .map(r => [r.client_id, { id: r.client_id, name: r.client_name }])
        ).values()].sort((a, b) => a.name.localeCompare(b.name));

        res.json({ employees, clients });
    } catch (error) {
        console.error("DATABASE ERROR in getInvoiceFilterOptions:", error);
        res.status(500).json({ error: error.message });
    }
};

// Ids of every invoice matching the current filters, for "select all N matching".
// Ids only, so selecting thousands stays a few KB rather than several MB.
export const getInvoiceIds = async (req, res) => {
    try {
        const scoped = addTabFilter(buildInvoiceWhere(req.query, req.user.orgId), req.query.tab);
        const [rows] = await pool.query(`SELECT i.id ${INVOICE_FROM} WHERE ${scoped.sql}`, scoped.params);
        res.json({ ids: rows.map(r => r.id) });
    } catch (error) {
        console.error("DATABASE ERROR in getInvoiceIds:", error);
        res.status(500).json({ error: error.message });
    }
};

// Every invoice matching the current filters, unpaginated, for Excel export.
export const getInvoicesForExport = async (req, res) => {
    try {
        const scoped = addTabFilter(buildInvoiceWhere(req.query, req.user.orgId), req.query.tab);
        const [rows] = await pool.query(
            `${LIST_COLUMNS} ${INVOICE_FROM}
             WHERE ${scoped.sql}
             ORDER BY i.period_end DESC, i.created_at DESC`,
            scoped.params
        );
        res.json(deriveOverdue(rows));
    } catch (error) {
        console.error("DATABASE ERROR in getInvoicesForExport:", error);
        res.status(500).json({ error: error.message });
    }
};

// ─── Shared: C2C ledger + paid transition ────────────────────────────────────
// Called by both updateInvoiceStatus (legacy open→paid) and addInvoicePayment (fully paid).
const _triggerPaidTransition = async (connection, invoice, paidDate, userId, orgId) => {
    await connection.query(
        `UPDATE invoices SET status_id = 6, paid_date = ?, updated_by = ? WHERE id = ? AND organization_id = ?`,
        [paidDate, userId, invoice.id, orgId]
    );

    if (invoice.pay_type_name !== 'C2C') return;

    const [existingLedger] = await connection.query(`
        SELECT id FROM employee_transactions
        WHERE placement_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.invoice_number')) = ?
    `, [invoice.placement_id, invoice.invoice_number]);

    if (existingLedger.length > 0) return;

    // Posting logic lives in c2cLedgerService so the live path and the repricing
    // path (placement pay-rate edits) can never compute earnings differently.
    await postC2CLedgerForInvoice(connection, invoice, paidDate, userId, orgId);
};

// HR updates invoice status (Open ↔ Past Due only — Paid is handled by addInvoicePayment)
export const updateInvoiceStatus = async (req, res) => {
    const { id } = req.params;
    const { status_id } = req.body;

    if (parseInt(status_id) === 6) {
        return res.status(400).json({ error: 'Use the Record Payment feature to mark an invoice as Paid. Full payment must be received before the invoice can be closed.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [invoiceArr] = await connection.query(`
            SELECT i.*, ise.net_terms, p.pay_rate, p.pay_rate_type, p.bill_rate as placement_bill_rate,
                   p.employee_id, pt.name as pay_type_name
            FROM invoices i
            LEFT JOIN invoice_settings ise ON i.placement_id = ise.placement_id
            LEFT JOIN placements p ON i.placement_id = p.id
            LEFT JOIN LATERAL (
                SELECT pay_type_id FROM placement_type_history
                WHERE placement_id = p.id AND start_date <= i.period_end
                ORDER BY start_date DESC LIMIT 1
            ) pth_active ON TRUE
            LEFT JOIN lkp_pay_types pt ON COALESCE(pth_active.pay_type_id, p.pay_type_id) = pt.id
            WHERE i.id = ? AND i.organization_id = ?
        `, [id, req.user.orgId]);

        if (invoiceArr.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: "Invoice not found" });
        }

        const invoice = invoiceArr[0];

        let query = `UPDATE invoices SET status_id = ?, updated_by = ?`;
        const params = [status_id, req.user.id];

        // First transition to "Open Invoice" (Status 4) → stamp issue_date = today
        // and due_date = issue_date + net_terms (plain calendar days).
        //
        // Gated on issue_date being NULL, not on the previous status, so the pair is
        // frozen at first issue and never recalculated. Without that gate a Past Due
        // invoice (5) sent back to Open would be re-stamped with today's date and
        // silently granted a fresh net-terms window.
        if (parseInt(status_id) === 4 && !invoice.issue_date) {
            const terms = invoice.net_terms ?? 30;
            query += `, issue_date = CURDATE(), due_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)`;
            params.push(terms);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        await connection.query(query, params);
        await connection.commit();

        const STATUS_NAMES = { 1: 'Not Ready', 2: 'Ready to Approve', 3: 'Ready to Invoice', 4: 'Open Invoice', 5: 'Past Due', 6: 'Paid' };
        logAction({ orgId: req.user.orgId, module: 'invoices', action: 'Updated Invoice Status', entityType: 'Invoice', entityId: id, entityName: invoice.invoice_number, performedBy: req.user.id, performedByRole: req.user.role, description: `Invoice ${invoice.invoice_number} status changed: ${STATUS_NAMES[invoice.status_id]} → ${STATUS_NAMES[status_id]}` }).catch(() => {});
        res.json({ message: "Invoice status updated successfully." });
    } catch (error) {
        await connection.rollback();
        console.error("DATABASE ERROR in updateInvoiceStatus:", error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// ─── Payment recording ────────────────────────────────────────────────────────

export const getInvoicePayments = async (req, res) => {
    const { id } = req.params;
    const orgId  = req.user.orgId;
    try {
        const [payments] = await pool.query(`
            SELECT ip.id, ip.amount, ip.payment_date, ip.comment, ip.created_at,
                   lpt.name AS payment_type_name,
                   CONCAT(COALESCE(e.first_name, ''), ' ', COALESCE(e.last_name, '')) AS recorded_by_name
            FROM invoice_payments ip
            LEFT JOIN lkp_payment_types lpt ON ip.payment_type_id = lpt.id
            LEFT JOIN users u ON ip.recorded_by = u.id
            LEFT JOIN employees e ON e.user_id = ip.recorded_by AND e.organization_id = ip.organization_id
            WHERE ip.invoice_id = ? AND ip.organization_id = ?
            ORDER BY ip.payment_date ASC, ip.created_at ASC
        `, [id, orgId]);

        const [[{ total_paid }]] = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM invoice_payments WHERE invoice_id = ?`,
            [id]
        );

        res.json({ payments, total_paid: parseFloat(total_paid) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const addInvoicePayment = async (req, res) => {
    const { id }    = req.params;
    const orgId     = req.user.orgId;
    const userId    = req.user.id;
    const { amount, payment_type_id, payment_date, comment } = req.body;

    if (!amount || !payment_type_id || !payment_date) {
        return res.status(400).json({ error: 'Amount, payment type, and payment date are required.' });
    }
    if (parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than zero.' });
    }
    if (!comment || !comment.trim()) {
        return res.status(400).json({ error: 'Comment is required.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const paidDateForLookup = payment_date;

        const [invoiceArr] = await connection.query(`
            SELECT i.*, p.pay_rate, p.pay_rate_type, p.bill_rate as placement_bill_rate,
                   p.employee_id, pt.name as pay_type_name,
                   (SELECT ppr.pay_rate_value
                    FROM placement_pay_rates ppr
                    WHERE ppr.placement_id = p.id AND ppr.effective_date <= ?
                    ORDER BY ppr.effective_date DESC LIMIT 1) as effective_pay_rate_value,
                   (SELECT pbr.bill_rate_value * (1 - COALESCE(pbr.discount_percentage, 0) / 100)
                    FROM placement_bill_rates pbr
                    WHERE pbr.placement_id = p.id AND pbr.effective_date <= ?
                    ORDER BY pbr.effective_date DESC LIMIT 1) as effective_bill_rate
            FROM invoices i
            LEFT JOIN placements p ON i.placement_id = p.id
            LEFT JOIN LATERAL (
                SELECT pay_type_id FROM placement_type_history
                WHERE placement_id = p.id AND start_date <= i.period_end
                ORDER BY start_date DESC LIMIT 1
            ) pth_active ON TRUE
            LEFT JOIN lkp_pay_types pt ON COALESCE(pth_active.pay_type_id, p.pay_type_id) = pt.id
            WHERE i.id = ? AND i.organization_id = ?
            FOR UPDATE
        `, [paidDateForLookup, paidDateForLookup, id, orgId]);

        if (!invoiceArr.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'Invoice not found.' });
        }

        const invoice = invoiceArr[0];

        if (![4, 5].includes(invoice.status_id)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Payments can only be recorded for Open Invoice or Past Due invoices.' });
        }

        const [[{ total_paid: existingPaid }]] = await connection.query(
            `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM invoice_payments WHERE invoice_id = ? FOR UPDATE`,
            [id]
        );

        const [[{ adj_total }]] = await connection.query(
            `SELECT COALESCE(SUM(CASE WHEN type='addition' THEN amount ELSE -amount END), 0) AS adj_total
             FROM invoice_adjustments WHERE invoice_id = ?`,
            [id]
        );

        const invoiceTotal  = parseFloat(invoice.total_amount) + parseFloat(adj_total);
        const alreadyPaid   = parseFloat(existingPaid);
        const remaining     = parseFloat((invoiceTotal - alreadyPaid).toFixed(2));
        const paymentAmount = parseFloat(parseFloat(amount).toFixed(2));

        if (paymentAmount > remaining + 0.005) {
            await connection.rollback();
            return res.status(400).json({ error: `Payment of $${paymentAmount.toFixed(2)} exceeds the remaining balance of $${remaining.toFixed(2)}.` });
        }

        await connection.query(
            `INSERT INTO invoice_payments (id, invoice_id, organization_id, amount, payment_type_id, payment_date, comment, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), id, orgId, paymentAmount, payment_type_id, payment_date, comment.trim(), userId]
        );

        const newTotal    = alreadyPaid + paymentAmount;
        const fullyPaid   = newTotal >= invoiceTotal - 0.005;

        if (fullyPaid) {
            await _triggerPaidTransition(connection, invoice, payment_date, userId, orgId);
        }

        await connection.commit();

        logAction({ orgId, module: 'invoices', action: 'Payment Recorded', entityType: 'Invoice', entityId: id, entityName: invoice.invoice_number, performedBy: userId, performedByRole: req.user.role, description: `Payment of $${paymentAmount.toFixed(2)} recorded for invoice ${invoice.invoice_number}. Total paid: $${newTotal.toFixed(2)} / $${invoiceTotal.toFixed(2)}${fullyPaid ? ' — FULLY PAID' : ''}` }).catch(() => {});

        res.json({ message: fullyPaid ? 'Payment recorded. Invoice is now fully paid.' : 'Payment recorded.', fully_paid: fullyPaid, new_total_paid: newTotal, remaining: fullyPaid ? 0 : invoiceTotal - newTotal });
    } catch (error) {
        await connection.rollback();
        console.error("DATABASE ERROR in addInvoicePayment:", error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// DELETE INVOICE (Org Admin Only)
export const deleteInvoice = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        const [delInvRow] = await connection.query(
            `SELECT invoice_number, total_amount, total_hours, placement_id, status_id FROM invoices WHERE id = ? AND organization_id = ? LIMIT 1`,
            [id, req.user.orgId]
        );
        const delInv = delInvRow[0];

        if (!delInv) {
            await connection.rollback();
            return res.status(404).json({ error: "Invoice not found." });
        }

        // 1. If the invoice was Paid and belongs to a C2C placement, remove the ledger entries it created.
        //    This keeps the balance sheet consistent — no orphaned C2C earnings rows.
        if (delInv.status_id === 6 && delInv.placement_id && delInv.invoice_number) {
            await connection.query(`
                DELETE FROM employee_transactions
                WHERE placement_id = ?
                  AND organization_id = ?
                  AND transaction_type = 'C2C'
                  AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.invoice_number')) = ?
            `, [delInv.placement_id, req.user.orgId, delInv.invoice_number]);
        }

        // 2. Remove any invoice_payments recorded against this invoice
        await connection.query(`DELETE FROM invoice_payments WHERE invoice_id = ?`, [id]);

        // 3. Unlink timesheets — the next sync recalculates all totals from scratch, so
        //    simply freeing the directly-linked timesheets is sufficient.
        await connection.query(`UPDATE timesheets SET invoice_id = NULL WHERE invoice_id = ?`, [id]);

        // 4. Delete the invoice
        await connection.query(`DELETE FROM invoices WHERE id = ? AND organization_id = ?`, [id, req.user.orgId]);

        await connection.commit();
        const wasPaid = delInv.status_id === 61;
        logAction({ orgId: req.user.orgId, module: 'invoices', action: 'Deleted Invoice', entityType: 'Invoice', entityId: id, entityName: delInv.invoice_number || id, performedBy: req.user.id, performedByRole: req.user.role, description: `Deleted invoice ${delInv.invoice_number || id} ($${parseFloat(delInv.total_amount || 0).toFixed(2)}, ${delInv.total_hours || 0} hrs) — timesheets returned to billing queue${wasPaid ? '; C2C balance sheet entries removed' : ''}` }).catch(() => {});
        res.json({ message: "Invoice deleted successfully. Timesheets returned to billing queue." });
    } catch (error) {
        await connection.rollback();
        console.error("DATABASE ERROR in deleteInvoice:", error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const generateInvoices = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { timesheetCount, invoiceCount } = await generateInvoicesForOrg(req.user.orgId, connection);
        if (timesheetCount === 0) {
            await connection.rollback();
            return res.json({ message: "No approved timesheets found to invoice." });
        }
        await connection.commit();
        logAction({ orgId: req.user.orgId, module: 'invoices', action: 'Generated Invoices', entityType: 'Invoice', performedBy: req.user.id, performedByRole: req.user.role, description: `Synced invoices from ${timesheetCount} approved timesheet(s) across ${invoiceCount} invoice period(s)` }).catch(() => {});
        res.json({ message: `Successfully synced invoices from ${timesheetCount} approved timesheet(s).` });
    } catch (error) {
        await connection.rollback();
        console.error("INVOICE GEN ERROR:", error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const getInvoiceSettings = async (req, res) => {
    try {
        const [settings] = await pool.query(`
            SELECT p.id as placement_id, p.placement_code, p.timesheet_start_date, c.client_name, e.first_name, e.last_name,
                   ise.id as setting_id, ise.invoice_cycle_id, ise.net_terms, ise.pay_when_paid, 
                   ise.custom_notes_1, ise.custom_notes_2,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', cc.id, 'name', cc.contact_name, 'email', cc.contact_email, 'title', cc.contact_title)) 
                    FROM client_contacts cc WHERE cc.client_id = p.client_id) as contacts,
                   (SELECT JSON_ARRAYAGG(isc.contact_id)
                    FROM invoice_setting_contacts isc WHERE isc.placement_id = p.id) as selected_contact_ids
            FROM placements p
            JOIN clients c ON p.client_id = c.id
            JOIN employees e ON p.employee_id = e.id
            LEFT JOIN invoice_settings ise ON p.id = ise.placement_id
            WHERE p.organization_id = ? AND p.status = 'Active'
        `, [req.user.orgId]);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// In backend/controllers/invoiceController.js

export const updateInvoiceSettings = async (req, res) => {
    const { id } = req.params; // This is the placement_id sent from the frontend
    const { invoice_cycle_id, net_terms, pay_when_paid, client_contact_ids, custom_notes_1, custom_notes_2 } = req.body;
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Update Placement's billing cycle
        if (invoice_cycle_id) {
            await connection.query('UPDATE placements SET invoice_cycle_id = ? WHERE id = ?', [invoice_cycle_id, id]);
        }

        // 2. Upsert the Settings
        // Generate a new UUID for the invoice_settings table itself.
        const newSettingId = uuidv4();
        await connection.query(`
            INSERT INTO invoice_settings (id, placement_id, invoice_cycle_id, net_terms, pay_when_paid, custom_notes_1, custom_notes_2)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            invoice_cycle_id = VALUES(invoice_cycle_id),
            net_terms = VALUES(net_terms),
            pay_when_paid = VALUES(pay_when_paid),
            custom_notes_1 = VALUES(custom_notes_1),
            custom_notes_2 = VALUES(custom_notes_2)
        `, [newSettingId, id, invoice_cycle_id || null, net_terms, pay_when_paid || false, custom_notes_1, custom_notes_2]);

        // 3. Refresh Contacts list (Delete old, insert new)
        await connection.query('DELETE FROM invoice_setting_contacts WHERE placement_id = ?', [id]);
        
        if (client_contact_ids && client_contact_ids.length > 0) {
            // FIX: Removed the UUID generation here. Only map placement_id and contact_id.
            const contactValues = client_contact_ids.map(contactId => [id, contactId]);
            await connection.query('INSERT INTO invoice_setting_contacts (placement_id, contact_id) VALUES ?', [contactValues]);
        }

        await connection.commit();
        res.json({ message: "Invoice settings updated successfully." });
    } catch (error) {
        await connection.rollback();
        console.error("SAVE SETTINGS ERROR:", error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// 2. NEW ENDPOINT: Fetch the physical file
export const downloadInvoicePDF = async (req, res) => {
    try {
        const { id } = req.params;

        const [invoices] = await pool.query(`
            SELECT invoice_file_path FROM invoices
            WHERE id = ? AND organization_id = ?
        `, [id, req.user.orgId]);

        if (invoices.length === 0) return res.status(404).json({ error: "Invoice not found" });

        let filePath = invoices[0].invoice_file_path;

        // Failsafe: Rebuild if it somehow went missing between modal open and click
        try {
            await fs.access(filePath);
        } catch {
            console.log("PDF missing during download request, rebuilding...");
            filePath = await generateAndSaveInvoicePDF(id);
        }

        // Send the physical file from the server disk to the browser
        res.sendFile(path.resolve(filePath), (err) => {
            if (err) {
                console.error("Express SendFile Error:", err);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Failed to send PDF to browser" });
                }
            }
        });

    } catch (error) {
        console.error("PDF DOWNLOAD ERROR:", error);
        res.status(500).json({ error: "Failed to load or generate PDF" });
    }
};

// Returns the combined invoice + timesheet PDF in-memory (for email preview).
// Nothing is stored to disk — same buffer that will be emailed.
export const downloadCombinedPDF = async (req, res) => {
    try {
        const { id } = req.params;

        const [invoices] = await pool.query(
            `SELECT id FROM invoices WHERE id = ? AND organization_id = ?`,
            [id, req.user.orgId]
        );
        if (invoices.length === 0) return res.status(404).json({ error: "Invoice not found" });

        const combinedBuffer = await buildCombinedPDFBuffer(id);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="Combined_Invoice.pdf"',
            'Content-Length': combinedBuffer.length,
        });
        res.send(combinedBuffer);
    } catch (error) {
        console.error("COMBINED PDF PREVIEW ERROR:", error);
        res.status(500).json({ error: "Failed to generate combined PDF preview." });
    }
};



export const getInvoiceEmailInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const emailType = req.query.type || 'INVOICE_SENT'; // 'INVOICE_SENT' | 'PAST_DUE_REMINDER'

        // 1. Ensure PDF is generated before loading email modal
        const [invCheck] = await pool.query('SELECT invoice_file_path FROM invoices WHERE id = ?', [id]);
        let fileNeedsGeneration = false;

        // "Generate & Send Email" passes regenerate=true so the attachment is always
        // rendered from the invoice's current line items and adjustments. Without it
        // an invoice edited after its PDF was first written would be emailed with the
        // old figures, because the stored file is otherwise only rebuilt when missing.
        const forceRegenerate = req.query.regenerate === 'true';

        if (invCheck.length > 0) {
            if (forceRegenerate || !invCheck[0].invoice_file_path) {
                fileNeedsGeneration = true;
            } else {
                try {
                    await fs.access(invCheck[0].invoice_file_path);
                } catch (err) {
                    fileNeedsGeneration = true;
                }
            }
        }

        if (fileNeedsGeneration) {
            try {
                await generateAndSaveInvoicePDF(id);
            } catch (pdfErr) {
                console.error("Failed to pre-generate PDF:", pdfErr);
            }
        }

        // 2. Fetch Invoice Base Data (includes org accounts_email for auto-BCC)
        const [invoices] = await pool.query(`
            SELECT i.*, o.name as org_name, o.accounts_email, c.client_name,
                   e.first_name as emp_first, e.last_name as emp_last
            FROM invoices i
            LEFT JOIN organizations o ON i.organization_id = o.id
            LEFT JOIN clients c ON i.client_id = c.id
            LEFT JOIN placements p ON i.placement_id = p.id
            LEFT JOIN employees e ON p.employee_id = e.id
            WHERE i.id = ? AND i.organization_id = ?
        `, [id, req.user.orgId]);

        if (invoices.length === 0) return res.status(404).json({ error: "Invoice not found" });
        const inv = invoices[0];

        // 3. Fetch ALL available client contacts for the dropdown
        const [allContactsData] = await pool.query(`
            SELECT id, contact_name as name, contact_email as email
            FROM client_contacts
            WHERE client_id = ?
        `, [inv.client_id]);

        // 4. Fetch explicitly saved "Selected" contact emails for the 'To' field
        const [selectedContactsData] = await pool.query(`
            SELECT cc.contact_email
            FROM invoice_setting_contacts isc
            JOIN client_contacts cc ON isc.contact_id = cc.id
            WHERE isc.placement_id = ?
        `, [inv.placement_id]);

        const allContacts = allContactsData || [];
        const initialToEmails = selectedContactsData.map(row => row.contact_email) || [];

        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            return new Date(dateStr).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        };

        const periodStart = formatDate(inv.period_start);
        const periodEnd   = formatDate(inv.period_end);
        const dueDate     = formatDate(inv.due_date);
        const employeeName = `${inv.emp_first} ${inv.emp_last}`.trim();
        const [[{ adj_total: emailAdjTotal }]] = await pool.query(
            `SELECT COALESCE(SUM(CASE WHEN type='addition' THEN amount ELSE -amount END), 0) AS adj_total FROM invoice_adjustments WHERE invoice_id = ?`,
            [id]
        );
        // Recorded part-payments must come off the figure we ask for. Without this the
        // email quotes the original invoice total, so a client who has paid all but
        // $110 of a $10,491 invoice is chased for the full amount.
        const [[{ paid_total: emailPaidTotal }]] = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS paid_total FROM invoice_payments WHERE invoice_id = ?`,
            [id]
        );

        const grossAmount = parseFloat(inv.total_amount) + parseFloat(emailAdjTotal);
        const paidAmount  = parseFloat(emailPaidTotal);
        const balanceDue  = grossAmount - paidAmount;

        const money  = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const amount = money(balanceDue);           // what we actually ask for
        const isPartlyPaid = paidAmount > 0;

        // Shown only when something has been received, so a fully unpaid invoice
        // reads exactly as it did before.
        const paymentNote = isPartlyPaid
            ? `

Invoice Total: $${money(grossAmount)}
Payment Received: $${money(paidAmount)}
Balance Due: $${amount}`
            : '';

        let subject, body;

        if (emailType === 'PAST_DUE_REMINDER') {
            subject = `Payment Overdue — Invoice ${inv.invoice_number}`;
            body =
`Hi Accounts Payable,

${isPartlyPaid
    ? `Our records show that $${amount} remains outstanding on Invoice ${inv.invoice_number}, which is overdue. It would be appreciated if you look into this.`
    : `Our records show that we haven't yet received payment of $${amount} for Invoice ${inv.invoice_number}, which is overdue. It would be appreciated if you look into this.`}

Invoice Period: ${periodStart} - ${periodEnd}

Invoice due Date: ${dueDate}${paymentNote}

In case the payment is already sent, please disregard this notice. And in case you have lost this invoice, please find another copy attached herewith.

Thank You,
Accounts Team`;
        } else {
            subject = `${employeeName}'s Invoice & Timesheet for the period : ${periodStart} - ${periodEnd}`;
            body =
`Hi ${inv.client_name},

Your invoice for ${employeeName}'s services for the period of ${periodStart} - ${periodEnd} is attached. Please remit the payment at your earliest convenience.

Invoice Number: ${inv.invoice_number}
${isPartlyPaid ? paymentNote.trimStart() : `Invoice Amount: $${amount}`}

Thank you for your business.`;
        }

        res.json({
            to: initialToEmails,
            availableContacts: allContacts,
            accounts_email: inv.accounts_email || null,
            subject,
            body
        });
    } catch (error) {
        console.error("GET EMAIL INFO ERROR:", error);
        res.status(500).json({ error: error.message });
    }
};

// Fetch email send history for an invoice
export const getInvoiceEmailLogs = async (req, res) => {
    try {
        const { id } = req.params;
        const [logs] = await pool.query(`
            SELECT iel.id, iel.email_type, iel.sent_to, iel.sent_at, iel.subject,
                   TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) as sent_by_name,
                   u.email as sent_by_email
            FROM invoice_email_logs iel
            LEFT JOIN users u ON iel.sent_by = u.id
            WHERE iel.invoice_id = ? AND iel.organization_id = ?
            ORDER BY iel.sent_at DESC
        `, [id, req.user.orgId]);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Returns the readiness blockers for a Draft invoice so the frontend can explain
// why it is still in Draft and what needs to be resolved before it can be sent.
export const getInvoiceDraftStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const [invRows] = await pool.query(`
            SELECT i.period_start, i.period_end, i.placement_id, i.status_id,
                   COALESCE(ise.net_terms, 30) as net_terms,
                   COALESCE(p.bill_rate, 0)    as fallback_bill_rate
            FROM invoices i
            LEFT JOIN invoice_settings ise ON i.placement_id = ise.placement_id
            LEFT JOIN placements p         ON i.placement_id = p.id
            WHERE i.id = ? AND i.organization_id = ?
        `, [id, req.user.orgId]);

        if (!invRows.length) return res.status(404).json({ error: 'Invoice not found' });
        const inv = invRows[0];

        const periodStart = normDate(inv.period_start);
        const periodEnd   = normDate(inv.period_end);
        const today       = new Date().toISOString().split('T')[0];
        const periodEnded = today > periodEnd;

        // Must mirror Gate 2 in checkAndPromoteInvoice (services/invoiceService.js)
        // exactly, or the UI will report "ready" for an invoice the gate blocks.
        const [pendingTs] = await pool.query(`
            SELECT COUNT(*) as cnt FROM timesheets
            WHERE placement_id = ? AND organization_id = ?
              AND start_date <= ? AND end_date >= ?
              AND status_id <> 3
        `, [inv.placement_id, req.user.orgId, periodEnd, periodStart]);
        const pendingCount = parseInt(pendingTs[0].cnt);

        const [brRows] = await pool.query(`
            SELECT COUNT(*) as cnt FROM placement_bill_rates
            WHERE placement_id = ? AND effective_date <= ?
        `, [inv.placement_id, periodStart]);
        const hasBillRate = parseInt(brRows[0].cnt) > 0 || parseFloat(inv.fallback_bill_rate) > 0;

        res.json({
            period_ended:       periodEnded,
            period_end:         periodEnd,
            pending_timesheets: pendingCount,
            has_bill_rate:      hasBillRate,
            net_terms:          inv.net_terms,
            is_ready:           periodEnded && pendingCount === 0 && hasBillRate,
        });
    } catch (error) {
        console.error('DRAFT STATUS ERROR:', error);
        res.status(500).json({ error: error.message });
    }
};

// Returns computed bill-rate line items for an invoice (used by the preview modal).
export const getInvoiceLineItems = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(`
            SELECT i.placement_id, i.period_start, i.period_end, i.total_hours, i.total_amount,
                   e.first_name as emp_first, e.last_name as emp_last
            FROM invoices i
            LEFT JOIN placements p ON i.placement_id = p.id
            LEFT JOIN employees e ON p.employee_id = e.id
            WHERE i.id = ? AND i.organization_id = ?
        `, [id, req.user.orgId]);
        if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });

        const lineItems = await computeInvoiceLineItems(rows[0]);

        // Recompute the correct total (bill_rate × hours per segment) and persist it.
        // This corrects any stored total_amount that was calculated incorrectly at generation time.
        const computedTotal = parseFloat(
            lineItems.reduce((sum, li) => sum + parseFloat(li.amount || 0), 0).toFixed(2)
        );
        const storedTotal = parseFloat(rows[0].total_amount) || 0;
        if (Math.abs(computedTotal - storedTotal) > 0.005) {
            await pool.query(
                'UPDATE invoices SET total_amount = ? WHERE id = ? AND organization_id = ?',
                [computedTotal, id, req.user.orgId]
            );
        }

        res.json(lineItems.map(li => ({ ...li, emp_first: rows[0].emp_first, emp_last: rows[0].emp_last })));
    } catch (error) {
        console.error('GET LINE ITEMS ERROR:', error);
        res.status(500).json({ error: error.message });
    }
};

// 2. Send the Email and Update Status
// In backend/controllers/invoiceController.js

export const sendInvoiceEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { to, cc, bcc, subject, body, email_type } = req.body;
        const emailType = email_type || 'INVOICE_SENT'; // 'INVOICE_SENT' | 'PAST_DUE_REMINDER'

        if (!to) return res.status(400).json({ error: "Recipient email is required." });

        const [invoices] = await pool.query(`
            SELECT i.invoice_file_path, i.invoice_number, i.status_id, ise.net_terms
            FROM invoices i
            LEFT JOIN invoice_settings ise ON i.placement_id = ise.placement_id
            WHERE i.id = ?
        `, [id]);

        if (invoices.length === 0) return res.status(404).json({ error: "Invoice not found" });
        const invoice = invoices[0];

        // Ensure the stored invoice-only PDF exists (used for downloads), but do NOT
        // use it as the email attachment — we build a fresh combined buffer instead.
        if (!invoice.invoice_file_path) {
            await generateAndSaveInvoicePDF(id);
        } else {
            try {
                await fs.access(invoice.invoice_file_path);
            } catch {
                await generateAndSaveInvoicePDF(id);
            }
        }

        // Build invoice + timesheets combined PDF in memory; never stored to disk.
        const combinedBuffer = await buildCombinedPDFBuffer(id);

        await sendCustomInvoiceEmail(to, cc, bcc, subject, body, combinedBuffer, invoice.invoice_number);

        // Log the email in invoice_email_logs
        await pool.query(`
            INSERT INTO invoice_email_logs (id, invoice_id, organization_id, email_type, sent_to, sent_by, subject)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [uuidv4(), id, req.user.orgId, emailType, to, req.user.id, subject || null]);

        const actionLabel = emailType === 'PAST_DUE_REMINDER' ? 'Sent Past Due Reminder' : 'Sent Invoice Email';
        logAction({ orgId: req.user.orgId, module: 'invoices', action: actionLabel, entityType: 'Invoice', entityId: id, entityName: invoice.invoice_number, performedBy: req.user.id, performedByRole: req.user.role, description: `${actionLabel} for ${invoice.invoice_number} → ${to}` }).catch(() => {});
        res.json({ message: "Email sent successfully." });
    } catch (error) {
        console.error("SEND EMAIL ERROR:", error);
        res.status(500).json({ error: "Failed to send email. Check recipient address and server logs." });
    }
};

// ─── Invoice Adjustments (additions / deductions) ────────────────────────────

export const getInvoiceAdjustments = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT id, type, amount, description, DATE_FORMAT(date, '%Y-%m-%d') AS date, created_at
             FROM invoice_adjustments
             WHERE invoice_id = ? AND organization_id = ?
             ORDER BY created_at ASC`,
            [id, req.user.orgId]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const addInvoiceAdjustment = async (req, res) => {
    const { id } = req.params;
    const { type, amount, description, date } = req.body;

    if (!type || !amount || !description || !date) {
        return res.status(400).json({ error: 'Type, amount, description, and date are required.' });
    }
    if (!['addition', 'deduction'].includes(type)) {
        return res.status(400).json({ error: 'Type must be addition or deduction.' });
    }
    if (parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than zero.' });
    }

    try {
        const [invArr] = await pool.query(
            `SELECT status_id FROM invoices WHERE id = ? AND organization_id = ?`,
            [id, req.user.orgId]
        );
        if (!invArr.length) return res.status(404).json({ error: 'Invoice not found.' });
        if (invArr[0].status_id !== 2) {
            return res.status(400).json({ error: 'Adjustments can only be added to Ready to Send invoices.' });
        }

        const adjId = uuidv4();
        await pool.query(
            `INSERT INTO invoice_adjustments (id, invoice_id, organization_id, type, amount, description, date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [adjId, id, req.user.orgId, type, parseFloat(amount), description.trim(), date, req.user.id]
        );
        res.status(201).json({ id: adjId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteInvoiceAdjustment = async (req, res) => {
    const { id, adjId } = req.params;
    try {
        const [result] = await pool.query(
            `DELETE FROM invoice_adjustments WHERE id = ? AND invoice_id = ? AND organization_id = ?`,
            [adjId, id, req.user.orgId]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Adjustment not found.' });
        res.json({ message: 'Adjustment deleted.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};