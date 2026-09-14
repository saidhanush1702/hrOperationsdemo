import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { logAction } from './auditLogController.js';
import { repriceC2CLedgerForEmployee } from '../services/c2cLedgerService.js';
import { fetchClaimableEntries, writeItemEntries } from '../services/payrollService.js';

// 1. Get overview of all employees' balance sheets from the Ledger
export const getBalanceSheets = async (req, res) => {
    try {
        const orgId = req.user.orgId;
        
        // Sum up the ledger entries for every employee
        const [balances] = await pool.query(`
            SELECT e.id as employee_id, e.first_name, e.last_name, e.employee_code,
                   u.is_active as is_active,
                   COALESCE(SUM(CASE WHEN t.transaction_type IN ('C2C', 'W2_LCA', 'W2_STANDARD') THEN t.amount ELSE 0 END), 0) as placement_earnings,
                   COALESCE(SUM(CASE WHEN t.transaction_type = 'PAYOUT' THEN t.amount ELSE 0 END), 0) as manual_additions,
                   COALESCE(SUM(CASE WHEN t.transaction_type = 'DEDUCTION' THEN t.amount ELSE 0 END), 0) as manual_deductions,
                   -- Fixed-pay C2C payroll withdrawals. Stored positive and subtracted,
                   -- the same convention DEDUCTION uses, so the sign lives in one place
                   -- (the net_balance expression) rather than in the stored data.
                   COALESCE(SUM(CASE WHEN t.transaction_type = 'C2C_FIXED' THEN t.amount ELSE 0 END), 0) as c2c_fixed_payouts
            FROM users u
            JOIN employees e ON u.id = e.user_id
            LEFT JOIN employee_transactions t ON e.id = t.employee_id
            WHERE u.organization_id = ? AND u.role = 'EMPLOYEE'
            GROUP BY e.id, u.is_active
            ORDER BY e.first_name ASC, e.last_name ASC
        `, [orgId]);

        // Calculate net balance for each row
        const formattedBalances = balances.map(emp => ({
            ...emp,
            is_active: emp.is_active === 1 || emp.is_active === true,
            placement_earnings: parseFloat(emp.placement_earnings),
            manual_additions: parseFloat(emp.manual_additions),
            manual_deductions: parseFloat(emp.manual_deductions),
            c2c_fixed_payouts: parseFloat(emp.c2c_fixed_payouts),
            net_balance: parseFloat(emp.placement_earnings)
                       + parseFloat(emp.manual_additions)
                       - parseFloat(emp.manual_deductions)
                       - parseFloat(emp.c2c_fixed_payouts)
        }));

        res.json(formattedBalances);

    } catch (error) {
        console.error("BALANCE SHEET OVERVIEW ERROR:", error);
        res.status(500).json({ error: "Failed to load balance sheets." });
    }
};

// 2. Get detailed breakdown (The Transaction List for the Modal)
export const getEmployeeBalanceSheet = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [transactions] = await pool.query(`
            SELECT t.id, t.transaction_type as type, t.amount, t.metadata, t.transaction_date, 
                   p.placement_code, c.client_name
            FROM employee_transactions t
            LEFT JOIN placements p ON t.placement_id = p.id
            LEFT JOIN clients c ON p.client_id = c.id
            WHERE t.employee_id = ? AND t.organization_id = ?
            ORDER BY t.transaction_date DESC, t.created_at DESC
        `, [id, req.user.orgId]);
        
        res.json(transactions);
    } catch (error) {
        console.error("BALANCE SHEET DETAIL ERROR:", error);
        res.status(500).json({ error: "Failed to load balance sheet details." });
    }
};

// 3. Save a new Manual Adjustment
export const addBalanceAdjustment = async (req, res) => {
    try {
        const { employee_id, type, amount, adjustment_date, description } = req.body;
        // 'type' from frontend is 'PAYOUT' or 'DEDUCTION'
        
        const metadata = JSON.stringify({ reason: description });

        await pool.query(`
            INSERT INTO employee_transactions (id, organization_id, employee_id, transaction_type, amount, metadata, transaction_date, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [uuidv4(), req.user.orgId, employee_id, type, amount, metadata, adjustment_date, req.user.id]);

        const [empRow] = await pool.query(`SELECT first_name, last_name, employee_code FROM employees WHERE id = ? AND organization_id = ? LIMIT 1`, [employee_id, req.user.orgId]);
        const empInfo = empRow[0];
        const empLabel = empInfo ? `${empInfo.first_name} ${empInfo.last_name} (${empInfo.employee_code})` : employee_id;
        logAction({ orgId: req.user.orgId, module: 'balance-sheet', action: type === 'PAYOUT' ? 'Added Payout' : 'Added Deduction', entityType: 'BalanceAdjustment', entityId: employee_id, entityName: empInfo ? `${empInfo.first_name} ${empInfo.last_name}` : employee_id, performedBy: req.user.id, performedByRole: req.user.role, description: `${type === 'PAYOUT' ? 'Payout' : 'Deduction'} of $${amount} for ${empLabel} on ${adjustment_date}${description ? ` — "${description}"` : ''}` }).catch(() => {});
        res.json({ message: "Adjustment added successfully." });
    } catch (error) {
        console.error("ADD ADJUSTMENT ERROR:", error);
        res.status(500).json({ error: "Failed to add manual adjustment." });
    }
};

// 3a. Delete a manual adjustment
//
// Only PAYOUT / DEDUCTION rows may be removed. The other ledger types (C2C,
// W2_STANDARD, W2_LCA) are derived from paid invoices and payroll runs — deleting
// one here would silently desync the ledger from its source, so those are corrected
// through re-pricing or the payroll run instead. The type check is enforced here
// rather than only in the UI, so a direct API call cannot get around it.
export const deleteBalanceAdjustment = async (req, res) => {
    try {
        const { id } = req.params;
        const orgId  = req.user.orgId;

        const [rows] = await pool.query(`
            SELECT t.id, t.transaction_type, t.amount, t.metadata,
                   DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transaction_date,
                   t.employee_id, e.first_name, e.last_name, e.employee_code
            FROM employee_transactions t
            JOIN employees e ON t.employee_id = e.id
            WHERE t.id = ? AND t.organization_id = ?
            LIMIT 1
        `, [id, orgId]);

        if (rows.length === 0) return res.status(404).json({ error: 'Adjustment not found.' });

        const tx = rows[0];
        if (!['PAYOUT', 'DEDUCTION'].includes(tx.transaction_type)) {
            return res.status(400).json({
                error: 'Only manual additions and deductions can be deleted. Placement earnings come from paid invoices and payroll runs.',
            });
        }

        // Type guard repeated in the DELETE so the write itself can never touch a
        // system-generated row, even if the row changed between the read and here.
        const [result] = await pool.query(
            `DELETE FROM employee_transactions
             WHERE id = ? AND organization_id = ? AND transaction_type IN ('PAYOUT', 'DEDUCTION')`,
            [id, orgId]
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Adjustment not found.' });

        let meta = tx.metadata || {};
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }

        const isPayout = tx.transaction_type === 'PAYOUT';
        const reason   = meta.reason || meta.description || '';
        const empLabel = `${tx.first_name} ${tx.last_name} (${tx.employee_code})`;
        logAction({
            orgId, module: 'balance-sheet',
            action: isPayout ? 'Deleted Payout' : 'Deleted Deduction',
            entityType: 'BalanceAdjustment', entityId: tx.employee_id,
            entityName: `${tx.first_name} ${tx.last_name}`,
            performedBy: req.user.id, performedByRole: req.user.role,
            description: `Deleted ${isPayout ? 'payout' : 'deduction'} of $${parseFloat(tx.amount).toFixed(2)} for ${empLabel} dated ${tx.transaction_date}${reason ? ` — "${reason}"` : ''}`,
        }).catch(() => {});

        res.json({ message: 'Adjustment deleted successfully.' });
    } catch (error) {
        console.error('DELETE ADJUSTMENT ERROR:', error);
        res.status(500).json({ error: 'Failed to delete manual adjustment.' });
    }
};

// 3b. Get structured summary for the BalanceSheet Detail Modal
//     Groups transactions by placement (C2C / W2) and manual adjustments
export const getEmployeeBalanceSheetSummary = async (req, res) => {
    try {
        const { id } = req.params; // employee_id
        const orgId = req.user.orgId;

        const [rows] = await pool.query(`
            SELECT
                et.id,
                et.transaction_type,
                et.placement_id,
                CAST(et.amount AS DECIMAL(12,2))                           AS amount,
                et.metadata,
                DATE_FORMAT(et.transaction_date, '%Y-%m-%d')               AS transaction_date,
                p.placement_code,
                pt.name                                                     AS pay_type,
                c.client_name,
                DATE_FORMAT(inv.paid_date,     '%Y-%m-%d')                  AS invoice_paid_date,
                DATE_FORMAT(inv.period_start,  '%Y-%m-%d')                  AS invoice_period_start,
                DATE_FORMAT(inv.period_end,    '%Y-%m-%d')                  AS invoice_period_end
            FROM employee_transactions et
            LEFT JOIN placements        p   ON et.placement_id = p.id
            LEFT JOIN clients           c   ON p.client_id = c.id
            LEFT JOIN lkp_pay_types     pt  ON p.pay_type_id = pt.id
            LEFT JOIN invoices          inv ON inv.organization_id = et.organization_id
                AND inv.invoice_number = JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number'))
            WHERE et.employee_id = ? AND et.organization_id = ?
            ORDER BY et.transaction_date DESC, et.created_at DESC
        `, [id, orgId]);

        const placementMap = {}; // keyed by `${placement_id}_${transaction_type}`
        const manualItems  = [];

        for (const tx of rows) {
            let meta = tx.metadata || {};
            if (typeof meta === 'string') {
                try { meta = JSON.parse(meta); } catch { meta = {}; }
            }

            const amount = parseFloat(tx.amount);

            // W2_NO_LCA is excluded from the balance sheet entirely
            if (tx.transaction_type === 'W2_NO_LCA') continue;

            if (tx.transaction_type === 'C2C') {
                const key = `${tx.placement_id}_C2C`;
                if (!placementMap[key]) {
                    placementMap[key] = {
                        group_key: key,
                        placement_id: tx.placement_id,
                        placement_code: tx.placement_code,
                        pay_type: 'C2C',
                        transaction_type: 'C2C',
                        client_name: tx.client_name,
                        total_amount: 0,
                        items: [],
                    };
                }
                placementMap[key].total_amount += amount;
                placementMap[key].items.push({
                    id: tx.id,
                    invoice_number: meta.invoice_number || '—',
                    period_start:  tx.invoice_period_start || null,
                    period_end:    tx.invoice_period_end   || null,
                    paid_date: tx.invoice_paid_date || tx.transaction_date,
                    total_hours: parseFloat(meta.invoice_hours || 0),
                    pay_rate:    parseFloat(meta.pay_rate    || 0),
                    amount,
                });

            } else if (['W2_STANDARD', 'W2_LCA'].includes(tx.transaction_type)) {
                const key = `${tx.placement_id}_${tx.transaction_type}`;
                if (!placementMap[key]) {
                    placementMap[key] = {
                        group_key: key,
                        placement_id: tx.placement_id,
                        placement_code: tx.placement_code,
                        pay_type: 'W2',
                        transaction_type: tx.transaction_type,
                        client_name: tx.client_name,
                        total_amount: 0,
                        items: [],
                    };
                }
                placementMap[key].total_amount += amount;
                placementMap[key].items.push({
                    id: tx.id,
                    tx_type:          tx.transaction_type,
                    run_date:         tx.transaction_date,
                    period_label:     meta.period_label || meta.period || '—',
                    approved_hours:   parseFloat(meta.hours || 0),
                    pay_rate:         parseFloat(meta.pay_rate || 0),
                    lca_wage_per_period: meta.lca_wage_per_period != null
                        ? parseFloat(meta.lca_wage_per_period) : null,
                    amount,
                });

            } else if (tx.transaction_type === 'C2C_FIXED') {
                // Payroll withdrawing the flat figure from what this C2C placement
                // has accrued. Its own group, alongside the placement's C2C earnings
                // rather than merged into them, so the sheet reads as
                // "earned X, paid out Y, Z remains" instead of one netted number.
                //
                // Stored positive; negated here so the section total carries the sign
                // it has in the running balance and the rows sum straight into net.
                const key = `${tx.placement_id}_C2C_FIXED`;
                if (!placementMap[key]) {
                    placementMap[key] = {
                        group_key: key,
                        placement_id: tx.placement_id,
                        placement_code: tx.placement_code,
                        pay_type: 'C2C',
                        transaction_type: 'C2C_FIXED',
                        client_name: tx.client_name,
                        total_amount: 0,
                        items: [],
                    };
                }
                placementMap[key].total_amount -= amount;
                placementMap[key].items.push({
                    id:                   tx.id,
                    tx_type:              'C2C_FIXED',
                    run_date:             tx.transaction_date,
                    period_label:         meta.period_label || meta.period || '—',
                    approved_hours:       parseFloat(meta.hours || 0),
                    fixed_pay_per_period: meta.fixed_pay_per_period != null ? parseFloat(meta.fixed_pay_per_period) : null,
                    adjustment:           meta.adjustment != null ? parseFloat(meta.adjustment) : 0,
                    balance_before:       meta.balance_before != null ? parseFloat(meta.balance_before) : null,
                    amount:               -amount,
                });

            } else if (['PAYOUT', 'DEDUCTION'].includes(tx.transaction_type)) {
                manualItems.push({
                    id:     tx.id,
                    date:   tx.transaction_date,
                    type:   tx.transaction_type,
                    reason: meta.reason || meta.description || '',
                    amount,
                });
            }
        }

        const totalAdditions  = manualItems.filter(i => i.type === 'PAYOUT')
            .reduce((s, i) => s + i.amount, 0);
        const totalDeductions = manualItems.filter(i => i.type === 'DEDUCTION')
            .reduce((s, i) => s + i.amount, 0);

        res.json({
            placements: Object.values(placementMap),
            manual_adjustments: {
                total_additions:  parseFloat(totalAdditions.toFixed(2)),
                total_deductions: parseFloat(totalDeductions.toFixed(2)),
                net:              parseFloat((totalAdditions - totalDeductions).toFixed(2)),
                items:            manualItems,
            },
        });

    } catch (error) {
        console.error('BALANCE SHEET SUMMARY ERROR:', error);
        res.status(500).json({ error: 'Failed to load balance sheet summary.' });
    }
};

// 3c. Bulk export — all transactions for all employees, flat rows ready for Excel
export const getBalanceSheetsExport = async (req, res) => {
    try {
        const orgId = req.user.orgId;

        const [rows] = await pool.query(`
            SELECT
                e.employee_code,
                e.first_name,
                e.last_name,
                et.id            AS tx_id,
                et.transaction_type,
                CAST(et.amount AS DECIMAL(12,2)) AS amount,
                et.metadata,
                DATE_FORMAT(et.transaction_date, '%Y-%m-%d') AS transaction_date,
                p.placement_code,
                pt.name          AS pay_type,
                c.client_name,
                DATE_FORMAT(inv.paid_date, '%Y-%m-%d') AS invoice_paid_date
            FROM employees e
            LEFT JOIN employee_transactions et ON e.id = et.employee_id AND et.organization_id = ?
            LEFT JOIN placements   p   ON et.placement_id  = p.id
            LEFT JOIN clients      c   ON p.client_id      = c.id
            LEFT JOIN lkp_pay_types pt ON p.pay_type_id    = pt.id
            LEFT JOIN invoices     inv ON inv.organization_id = et.organization_id
                AND inv.invoice_number = JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number'))
            WHERE e.organization_id = ?
            ORDER BY e.first_name ASC, e.last_name ASC, et.transaction_date DESC
        `, [orgId, orgId]);

        const exportRows = rows
            .filter(row => row.tx_id !== null && row.transaction_type !== 'W2_NO_LCA')
            .map(row => {
                let meta = row.metadata || {};
                if (typeof meta === 'string') {
                    try { meta = JSON.parse(meta); } catch { meta = {}; }
                }

                const isC2C    = row.transaction_type === 'C2C';
                const isW2     = ['W2_STANDARD', 'W2_LCA'].includes(row.transaction_type);
                const isFixed  = row.transaction_type === 'C2C_FIXED';
                const isManual = ['PAYOUT', 'DEDUCTION'].includes(row.transaction_type);

                return {
                    employee_code:    row.employee_code,
                    employee_name:    `${row.first_name} ${row.last_name}`,
                    transaction_type: row.transaction_type,
                    section:          isManual ? 'Manual Adjustment' : (row.placement_code || 'Placement'),
                    placement_code:   row.placement_code || '',
                    client_name:      row.client_name || '',
                    pay_type:         row.pay_type || '',
                    date:             isC2C ? (row.invoice_paid_date || row.transaction_date) : row.transaction_date,
                    invoice_number:   isC2C ? (meta.invoice_number || '') : '',
                    period:           (isW2 || isFixed) ? (meta.period_label || meta.period || '') : '',
                    hours:            isC2C  ? parseFloat(meta.invoice_hours || 0)
                                    : (isW2 || isFixed) ? parseFloat(meta.hours || 0) : '',
                    pay_rate:         parseFloat(meta.pay_rate || 0),
                    // A fixed-pay withdrawal reduces the balance, so it exports negative
                    // to match how it reads on the sheet.
                    amount:           isFixed ? -parseFloat(row.amount || 0) : parseFloat(row.amount || 0),
                    reason:           isManual ? (meta.reason || meta.description || '') : '',
                };
            });

        res.json(exportRows);
    } catch (error) {
        console.error('BALANCE SHEET EXPORT ERROR:', error);
        res.status(500).json({ error: 'Failed to load balance sheet export data.' });
    }
};

// 3d. C2C re-pricing — preview and apply
//
// C2C earnings are posted once, when an invoice is paid, freezing the pay rate
// that was on file at that moment. Correcting the placement's pay rate later
// does not move money that was already posted, which is why employees whose
// rate was 0 sit at a $0 balance. Saving a new pay rate on the placement now
// re-prices automatically; these two endpoints are the manual equivalent, for
// rows that were already correct on the placement but stale in the ledger.
//
// Re-pricing keeps the posted hours exactly as they are and only recomputes the
// rate, so it can never invent or lose hours.

const resolveEmployeeLabel = async (employeeId, orgId) => {
    const [rows] = await pool.query(
        `SELECT first_name, last_name, employee_code FROM employees WHERE id = ? AND organization_id = ? LIMIT 1`,
        [employeeId, orgId]
    );
    return rows[0] || null;
};

export const previewEmployeeC2CReprice = async (req, res) => {
    const { id } = req.params;
    const orgId  = req.user.orgId;

    const connection = await pool.getConnection();
    try {
        const emp = await resolveEmployeeLabel(id, orgId);
        if (!emp) return res.status(404).json({ error: 'Employee not found.' });

        // dryRun — reads only, no transaction needed.
        const result = await repriceC2CLedgerForEmployee(connection, { employeeId: id, orgId, dryRun: true });
        res.json({ ...result, employee_name: `${emp.first_name} ${emp.last_name}`, employee_code: emp.employee_code });
    } catch (error) {
        console.error('C2C REPRICE PREVIEW ERROR:', error);
        res.status(500).json({ error: 'Failed to preview C2C re-pricing.' });
    } finally {
        connection.release();
    }
};

export const applyEmployeeC2CReprice = async (req, res) => {
    const { id } = req.params;
    const orgId  = req.user.orgId;

    const connection = await pool.getConnection();
    try {
        const emp = await resolveEmployeeLabel(id, orgId);
        if (!emp) return res.status(404).json({ error: 'Employee not found.' });

        await connection.beginTransaction();
        const result = await repriceC2CLedgerForEmployee(connection, { employeeId: id, orgId, userId: req.user.id, dryRun: false });
        await connection.commit();

        const empLabel = `${emp.first_name} ${emp.last_name} (${emp.employee_code})`;
        if (result.changed_count > 0) {
            logAction({
                orgId, module: 'balance-sheet', action: 'Re-priced C2C Earnings',
                entityType: 'BalanceSheet', entityId: id, entityName: `${emp.first_name} ${emp.last_name}`,
                performedBy: req.user.id, performedByRole: req.user.role,
                description: `Re-priced ${result.changed_count} C2C entr${result.changed_count === 1 ? 'y' : 'ies'} for ${empLabel} against current pay rates: $${result.total_before.toFixed(2)} → $${result.total_after.toFixed(2)} (${result.delta >= 0 ? '+' : '−'}$${Math.abs(result.delta).toFixed(2)})`
            }).catch(() => {});
        }

        res.json({ ...result, employee_name: `${emp.first_name} ${emp.last_name}`, employee_code: emp.employee_code });
    } catch (error) {
        await connection.rollback();
        console.error('C2C REPRICE APPLY ERROR:', error);
        res.status(500).json({ error: 'Failed to apply C2C re-pricing.' });
    } finally {
        connection.release();
    }
};

// Helper: pro-rate LCA wage for the portion of a payroll period that overlaps immigration dates
const calcLcaWagePerPeriod = (lcaWage, immStart, immTill, periodStart, periodEnd) => {
    const annual = parseFloat(lcaWage) || 0;
    if (annual === 0) return 0;
    if (!immStart || !immTill) return annual / 24;
    const pStart = new Date(periodStart);
    const pEnd   = new Date(periodEnd);
    const iStart = new Date(immStart);
    const iTill  = new Date(immTill);
    if (iTill < pStart || iStart > pEnd) return 0; // period is entirely outside immigration range
    const overlapStart = new Date(Math.max(pStart.getTime(), iStart.getTime()));
    const overlapEnd   = new Date(Math.min(pEnd.getTime(),   iTill.getTime()));
    const overlapDays  = Math.round((overlapEnd - overlapStart) / 86400000) + 1;
    const periodDays   = Math.round((pEnd - pStart) / 86400000) + 1;
    return (annual / 24) * (overlapDays / periodDays);
};

// 4. Run Manual Payroll for W2 (Triggered every 15 days)
export const runManualPayroll = async (req, res) => {
    const { periodStart, periodEnd } = req.body;

    if (!periodStart || !periodEnd) {
        return res.status(400).json({ error: "periodStart and periodEnd are required to run payroll." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const periodString = `${periodStart} to ${periodEnd}`;
        let payrollProcessedCount = 0;

        // Fetch all active W2 placements, including their LCA wage from employee_immigrations.
        // Also pull the most recent effective pay rate from placement_pay_rates active on or before periodEnd.
        const [w2Placements] = await connection.query(`
            SELECT p.id as placement_id, p.employee_id, p.pay_rate, p.pay_rate_type, p.bill_rate,
                   p.run_as_per_lca_wage, i.lca_wage, i.start_date as imm_start_date, i.till_date as imm_till_date,
                   (SELECT ppr.pay_rate_value
                    FROM placement_pay_rates ppr
                    WHERE ppr.placement_id = p.id AND ppr.effective_date <= ?
                    ORDER BY ppr.effective_date DESC LIMIT 1) as effective_pay_rate_value,
                   (SELECT pbr.bill_rate_value * (1 - COALESCE(pbr.discount_percentage, 0) / 100)
                    FROM placement_bill_rates pbr
                    WHERE pbr.placement_id = p.id AND pbr.effective_date <= ?
                    ORDER BY pbr.effective_date DESC LIMIT 1) as effective_bill_rate
            FROM placements p
            JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
            LEFT JOIN employee_immigrations i ON i.employee_id = p.employee_id
                AND i.id = (
                    SELECT ei.id FROM employee_immigrations ei
                    WHERE ei.employee_id = p.employee_id
                    ORDER BY ei.start_date DESC, ei.id DESC LIMIT 1
                )
            WHERE pt.name = 'W2' AND p.status = 'Active' AND p.organization_id = ?
        `, [periodEnd, periodEnd, req.user.orgId]);

        for (const placement of w2Placements) {
            // IDEMPOTENCY CHECK: Ensure we haven't already processed this placement for this exact period
            const [existing] = await connection.query(`
                SELECT id FROM employee_transactions 
                WHERE placement_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.period')) = ?
            `, [placement.placement_id, periodString]);

            if (existing.length > 0) continue; // Skip, already processed

            // Sum Approved Hours for this 15-day period
            const [timesheets] = await connection.query(`
                SELECT SUM(total_hours) as total_hours FROM timesheets 
                WHERE placement_id = ? AND status_id = 3 
                AND start_date >= ? AND end_date <= ?
            `, [placement.placement_id, periodStart, periodEnd]);

            const totalHours = parseFloat(timesheets[0].total_hours || 0);
            if (totalHours === 0) continue; // Skip if no hours worked

            // Resolve pay rate: prefer placement_pay_rates (effective date-based),
            // fall back to placements.pay_rate for legacy data.
            let resolvedPayRate;
            const effectivePRValue = parseFloat(placement.effective_pay_rate_value);
            const resolvedBillRate = parseFloat(placement.effective_bill_rate ?? placement.bill_rate) || 0;
            if (!isNaN(effectivePRValue) && effectivePRValue > 0) {
                resolvedPayRate = placement.pay_rate_type === 'Percentage'
                    ? resolvedBillRate * (effectivePRValue / 100)
                    : effectivePRValue;
            } else {
                resolvedPayRate = parseFloat(placement.pay_rate) || 0;
            }

            const actualEarned = totalHours * resolvedPayRate;

            const lcaWagePerPeriod = (placement.run_as_per_lca_wage && placement.lca_wage > 0)
                ? calcLcaWagePerPeriod(placement.lca_wage, placement.imm_start_date, placement.imm_till_date, periodStart, periodEnd)
                : null;
            const useLca = lcaWagePerPeriod !== null && lcaWagePerPeriod > 0;

            // Whatever this legacy path pays must be recorded in the payroll
            // consumption ledger, exactly as a payroll run records it. Without
            // this the hours look untouched to the arrears scan and the next
            // payroll run would pay them a SECOND time as catch-up rows.
            const claimable   = await fetchClaimableEntries(connection, placement.placement_id, periodStart, periodEnd);
            const allocations = claimable.filter(e => e.outstanding > 0);
            const transactionId = uuidv4();

            if (useLca) {
                // --- W2 WITH LCA WAGE ---
                const difference = actualEarned - lcaWagePerPeriod;

                // Only post if there is a positive surplus
                if (difference <= 0) continue;

                const metadata = JSON.stringify({
                    period: periodString,
                    lca_wage_amount: lcaWagePerPeriod.toFixed(2),
                    actual_earned: actualEarned.toFixed(2),
                    difference: difference.toFixed(2),
                    total_hours: totalHours,
                    pay_rate: resolvedPayRate
                });

                await connection.query(`
                    INSERT INTO employee_transactions (id, organization_id, employee_id, placement_id, transaction_type, amount, metadata, transaction_date, created_by)
                    VALUES (?, ?, ?, ?, 'W2_LCA', ?, ?, CURDATE(), ?)
                `, [transactionId, req.user.orgId, placement.employee_id, placement.placement_id, difference, metadata, req.user.id]);

            } else {
                // --- W2 STANDARD (no LCA, or period outside immigration dates) ---
                const metadata = JSON.stringify({
                    period: periodString,
                    hours: totalHours,
                    pay_rate: resolvedPayRate
                });

                await connection.query(`
                    INSERT INTO employee_transactions (id, organization_id, employee_id, placement_id, transaction_type, amount, metadata, transaction_date, created_by)
                    VALUES (?, ?, ?, ?, 'W2_STANDARD', ?, ?, CURDATE(), ?)
                `, [transactionId, req.user.orgId, placement.employee_id, placement.placement_id, actualEarned, metadata, req.user.id]);
            }

            await writeItemEntries(
                connection,
                { orgId: req.user.orgId, placementId: placement.placement_id, legacyTransactionId: transactionId },
                allocations
            );
            payrollProcessedCount++;
        }

        await connection.commit();
        logAction({ orgId: req.user.orgId, module: 'balance-sheet', action: 'Ran W2 Payroll', entityType: 'Payroll', performedBy: req.user.id, performedByRole: req.user.role, description: `W2 payroll run for period ${periodString}, ${payrollProcessedCount} placement(s) processed` }).catch(() => {});
        res.status(200).json({
            message: "Payroll processing complete.",
            placementsProcessed: payrollProcessedCount,
            period: periodString
        });

    } catch (error) {
        await connection.rollback();
        console.error("MANUAL PAYROLL ERROR:", error);
        res.status(500).json({ error: "An error occurred while processing payroll." });
    } finally {
        connection.release();
    }
};