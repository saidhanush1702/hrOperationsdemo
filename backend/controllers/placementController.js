import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { runTimesheetGeneration } from './timesheetController.js';
import { logAction } from './auditLogController.js';
import { repriceC2CLedgerForPlacement } from '../services/c2cLedgerService.js';

// --- USA TIMEZONE DATE FORMATTER ---
const safeDate = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val.split('T')[0];
    
    if (val instanceof Date) {
        const year = val.getFullYear();
        const month = String(val.getMonth() + 1).padStart(2, '0');
        const day = String(val.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return null;
};

// --- GET USA CURRENT DATE FOR PLACEMENT CODES ---
const getUSADateParts = () => {
    const now = new Date();
    const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    
    return {
        year: parts.find(p => p.type === 'year').value,
        month: parts.find(p => p.type === 'month').value,
        day: parts.find(p => p.type === 'day').value
    };
};

// Compute the effective final bill rate from a bill_rates array at a given target date.
// Each entry: { bill_rate_value, effective_date, discount_percentage }
const getFinalBillRateFromArray = (billRates, targetDate = null) => {
    const cutoff = targetDate ? new Date(targetDate) : new Date();
    const active = (billRates || [])
        .filter(br => br.effective_date && new Date(br.effective_date) <= cutoff)
        .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
    if (active.length === 0) return 0;
    const br = active[0];
    const base = parseFloat(br.bill_rate_value) || 0;
    const disc = parseFloat(br.discount_percentage) || 0;
    return base - (base * (disc / 100));
};

// Resolve how a placement type entry decides its payout.
//
//   HOURS : approved hours x pay rate (the default, valid on either pay type)
//   LCA   : the LCA wage for the period                       — W2 only
//   FIXED : a flat amount per period, regardless of hours     — C2C only
//
// LCA and FIXED are NOT interchangeable, despite both naming a set figure. An LCA
// W2 run accrues the buffer (earned - paid) onto the balance sheet; a fixed-pay
// C2C placement accrues its earnings from paid invoices instead, and payroll draws
// the flat figure back down out of that balance. Different direction, different
// source, so each basis is confined to the pay type whose flow it belongs to.
//
// run_as_per_lca_wage is kept in sync so queries still reading it keep working.
const resolvePayoutBasis = (ptEntry, isW2) => {
    const legacyLca = ptEntry.run_as_per_lca_wage === true || ptEntry.run_as_per_lca_wage === 'true' || ptEntry.run_as_per_lca_wage === 1;
    let basis = ptEntry.payout_basis || (legacyLca ? 'LCA' : 'HOURS');
    if (!['HOURS', 'LCA', 'FIXED'].includes(basis)) basis = 'HOURS';

    // Confine each basis to its pay type rather than rejecting the save: a pay type
    // switched from W2 to C2C (or back) carries its old basis in the payload, and
    // silently falling back to hourly is the safe reading of an impossible combination.
    if (isW2  && basis === 'FIXED') basis = 'HOURS';
    if (!isW2 && basis === 'LCA')   basis = 'HOURS';

    const fixed = basis === 'FIXED' ? (parseFloat(ptEntry.fixed_pay_per_period) || 0) : null;
    // A FIXED basis with no usable amount would silently pay zero, so fall back to hours.
    if (basis === 'FIXED' && !(fixed > 0)) return { basis: 'HOURS', fixed: null, runAsLca: 0 };

    return { basis, fixed, runAsLca: basis === 'LCA' ? 1 : 0 };
};

// Helper: check W2 uniqueness via placement_type_history on a specific date.
// Returns the placement_code of a conflicting placement, or null if clear.
// checkDate: the start_date of the W2 entry being added — checks if W2 is active on that date
// in any other active placement for the same employee.
const checkW2Uniqueness = async (connection, orgId, employeeId, excludePlacementId, checkDate) => {
    const [existing] = await connection.query(`
        SELECT p.placement_code
        FROM placements p
        JOIN placement_type_history pth ON pth.placement_id = p.id
            AND pth.start_date = (
                SELECT MAX(pth2.start_date) FROM placement_type_history pth2
                WHERE pth2.placement_id = p.id
                  AND pth2.start_date <= ?
            )
        JOIN lkp_pay_types pt ON pth.pay_type_id = pt.id
        WHERE p.organization_id = ?
          AND p.employee_id = ?
          AND pt.name = 'W2'
          AND p.is_completed = 0
          ${excludePlacementId ? 'AND p.id != ?' : ''}
        LIMIT 1
    `, excludePlacementId
        ? [checkDate, orgId, employeeId, excludePlacementId]
        : [checkDate, orgId, employeeId]);
    return existing.length > 0 ? existing[0].placement_code : null;
};

// Stable fingerprint of a rate set, used to detect whether an edit actually
// changed the rates (rather than just reordering the rows in the form).
const rateSignature = (rates, valueKey) => (rates || [])
    .map(r => `${(parseFloat(r[valueKey]) || 0).toFixed(4)}@${safeDate(r.effective_date) || ''}`)
    .sort()
    .join('|');

export const createPlacement = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const data = req.body;
        const orgId = req.user.orgId;
        const creatorId = req.user.id;
        const placementId = uuidv4();

        const billRates = data.bill_rates || [];
        const payRateType = data.pay_rate_type || 'Amount';
        const payRates = data.pay_rates || [];
        const completionReason = data.completion_reason || null;

        // placement_types: [{ start_date, pay_type_id, run_as_per_lca_wage }]
        // Falls back to legacy single pay_type_id + run_as_per_lca_wage for backwards compat.
        const placementTypes = data.placement_types && data.placement_types.length > 0
            ? data.placement_types
            : [{ start_date: data.start_date, pay_type_id: data.pay_type_id, run_as_per_lca_wage: data.run_as_per_lca_wage }];

        if (placementTypes.length === 0 || !placementTypes[0].pay_type_id) {
            throw new Error('At least one Placement Type record is required.');
        }
        for (const pt of placementTypes) {
            if (!pt.start_date || !pt.pay_type_id) throw new Error('Each Placement Type record must have a Start Date and Type.');
        }

        // Use the first entry as the primary pay_type for legacy columns and validation
        const primaryPayTypeId = placementTypes[0].pay_type_id;
        const primaryRunAsLca  = placementTypes[0].run_as_per_lca_wage === true || placementTypes[0].run_as_per_lca_wage === 'true' || placementTypes[0].run_as_per_lca_wage === 1;

        const finalCalculatedPayRate = parseFloat(data.pay_rate) || 0.00;
        const finalBillRate = getFinalBillRateFromArray(billRates);
        const billRate = finalBillRate;

        // Resolve primary pay type name for validation
        let payTypeName = '';
        const [ptRows] = await connection.query('SELECT name FROM lkp_pay_types WHERE id = ?', [primaryPayTypeId]);
        payTypeName = ptRows[0]?.name || '';
        const isW2Like = payTypeName === 'W2';

        for (const pr of payRates) {
            const val = parseFloat(pr.pay_rate_value) || 0;
            const actualAmt = payRateType === 'Percentage' ? (finalBillRate * (val / 100)) : val;
            if (actualAmt >= finalBillRate && finalBillRate > 0) {
                throw new Error(`Pay rate ($${actualAmt.toFixed(2)}) must be strictly less than the final bill rate ($${finalBillRate.toFixed(2)}).`);
            }
            if (isW2Like) {
                const maxW2Like = finalBillRate * 0.85;
                if (actualAmt > maxW2Like && finalBillRate > 0) {
                    throw new Error(`For W2, pay rate ($${actualAmt.toFixed(2)}) cannot exceed 85% of final bill rate ($${maxW2Like.toFixed(2)}).`);
                }
            }
        }

        const [emp] = await connection.query(
            `SELECT e.id AS real_employee_id, e.first_name, e.last_name, e.employee_code, u.is_active FROM employees e JOIN users u ON e.user_id = u.id WHERE e.id = ? AND e.organization_id = ?`,
            [data.employee_id, orgId]
        );
        if (emp.length === 0 || !emp[0].is_active) throw new Error("Cannot create a placement for an inactive or non-existent employee.");

        // W2 uniqueness: for each W2 entry, check no other active placement has W2 on that date
        for (const ptEntry of placementTypes) {
            const [ptNameRow] = await connection.query('SELECT name FROM lkp_pay_types WHERE id = ? LIMIT 1', [ptEntry.pay_type_id]);
            if (ptNameRow[0]?.name === 'W2') {
                const checkDate = safeDate(ptEntry.start_date);
                const conflict = await checkW2Uniqueness(connection, orgId, emp[0].real_employee_id, null, checkDate);
                if (conflict) throw new Error(`This employee already has an active W2 placement (${conflict}) on ${checkDate}. An employee can only have one active W2 placement at a time.`);
            }
        }

        const safeStartDate = safeDate(data.start_date);
        const safeEndDate = safeDate(data.end_date);

        const [overlappingPlacements] = await connection.query(`
            SELECT placement_code FROM placements
            WHERE organization_id = ?
              AND employee_id = ?
              AND client_id = ?
              AND is_completed = false
              AND start_date <= COALESCE(?, '9999-12-31')
              AND COALESCE(end_date, '9999-12-31') >= ?
        `, [orgId, emp[0].real_employee_id, data.client_id, safeEndDate, safeStartDate]);
        if (overlappingPlacements.length > 0) {
            throw new Error(`This employee already has an active placement (${overlappingPlacements[0].placement_code}) with this client that overlaps with the selected dates.`);
        }

        const isCompleted = data.is_completed === true || data.is_completed === 1 || data.is_completed === 'true';
        const finalStatus = isCompleted ? 'Completed' : (data.status || 'Active');

        const usDate = getUSADateParts();
        const prefix = `PLC${usDate.year}${usDate.month}${usDate.day}`;
        const [rows] = await connection.query(
            `SELECT placement_code FROM placements WHERE organization_id = ? AND placement_code LIKE ? ORDER BY placement_code DESC LIMIT 1`,
            [orgId, `${prefix}%`]
        );
        let sequenceNumber = 1;
        if (rows.length > 0 && rows[0].placement_code) {
            const lastSeqNum = parseInt(rows[0].placement_code.slice(prefix.length), 10);
            if (!isNaN(lastSeqNum)) sequenceNumber = lastSeqNum + 1;
        }
        const generatedPlacementCode = `${prefix}${String(sequenceNumber).padStart(3, '0')}`;

        await connection.query(
            `INSERT INTO placements (
                id, organization_id, employee_id, client_id, job_title, placement_code, start_date, end_date, status, is_completed, completion_reason,
                has_timesheets, timesheet_cycle_id, timesheet_start_date, week_start_day, bill_rate, pay_rate, pay_rate_type, pay_type_id, run_as_per_lca_wage, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                placementId, orgId, emp[0].real_employee_id, data.client_id, data.job_title, generatedPlacementCode, safeStartDate, safeEndDate, finalStatus, isCompleted, completionReason,
                data.has_timesheets || false, data.timesheet_cycle_id || null, safeDate(data.timesheet_start_date), data.week_start_day || null, billRate, finalCalculatedPayRate, payRateType, primaryPayTypeId, primaryRunAsLca, creatorId, creatorId
            ]
        );

        // Insert placement type history entries
        for (const ptEntry of placementTypes) {
            const [ptNameCheck] = await connection.query('SELECT name FROM lkp_pay_types WHERE id = ? LIMIT 1', [ptEntry.pay_type_id]);
            const isW2 = ptNameCheck[0]?.name === 'W2';
            const { basis, fixed, runAsLca } = resolvePayoutBasis(ptEntry, isW2);
            await connection.query(
                `INSERT INTO placement_type_history (id, placement_id, pay_type_id, run_as_per_lca_wage, payout_basis, fixed_pay_per_period, start_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), placementId, ptEntry.pay_type_id, runAsLca, basis, fixed, safeDate(ptEntry.start_date), creatorId]
            );
        }

        for (const br of billRates) {
            await connection.query(
                `INSERT INTO placement_bill_rates (id, placement_id, bill_rate_value, effective_date, discount_percentage, discount_reason) VALUES (?, ?, ?, ?, ?, ?)`,
                [uuidv4(), placementId, parseFloat(br.bill_rate_value) || 0, safeDate(br.effective_date), br.discount_percentage ? parseFloat(br.discount_percentage) : null, br.discount_reason || null]
            );
        }
        for (const pr of payRates) {
            await connection.query(
                `INSERT INTO placement_pay_rates (id, placement_id, pay_rate_value, effective_date) VALUES (?, ?, ?, ?)`,
                [uuidv4(), placementId, parseFloat(pr.pay_rate_value) || 0, safeDate(pr.effective_date)]
            );
        }

        await connection.commit();
        const empFullName = `${emp[0].first_name} ${emp[0].last_name}`;
        const [clientRow] = await pool.query(`SELECT client_name FROM clients WHERE id = ? LIMIT 1`, [data.client_id]);
        const clientName = clientRow[0]?.client_name || data.client_id;
        logAction({ orgId, module: 'placements', action: 'Created Placement', entityType: 'Placement', entityId: placementId, entityName: generatedPlacementCode, performedBy: creatorId, performedByRole: req.user.role, description: `Created placement ${generatedPlacementCode} for ${empFullName} (${emp[0].employee_code}) at ${clientName} — job: "${data.job_title}", bill: $${billRate.toFixed(2)}/hr, status: ${finalStatus}` }).catch(() => {});
        try { await runTimesheetGeneration(orgId, creatorId); } catch (tsError) {
            console.error("Timesheet auto-gen failed on creation, but placement saved:", tsError);
        }
        res.status(201).json({ message: "Placement created successfully", id: placementId });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const updatePlacement = async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const connection = await pool.getConnection(); 
    
    try {
        await connection.beginTransaction();

        // Snapshot old values FIRST for audit diff — before any mutations
        const [oldPlacRows] = await connection.query(
            `SELECT p.job_title, p.status, p.start_date, p.end_date, p.pay_rate_type FROM placements p WHERE p.id = ? AND p.organization_id = ? LIMIT 1`,
            [id, req.user.orgId]
        );
        const oldPlac = oldPlacRows[0] || {};
        const [oldBillRates] = await connection.query(
            `SELECT bill_rate_value, effective_date, discount_percentage FROM placement_bill_rates WHERE placement_id = ? ORDER BY effective_date ASC`,
            [id]
        );
        const [oldPayRates] = await connection.query(
            `SELECT pay_rate_value, effective_date FROM placement_pay_rates WHERE placement_id = ? ORDER BY effective_date ASC`,
            [id]
        );

        const billRates = data.bill_rates || [];
        const payRateType = data.pay_rate_type || 'Amount';
        const payRates = data.pay_rates || [];
        const completionReason = data.completion_reason || null;

        // placement_types array (same as create)
        const placementTypes = data.placement_types && data.placement_types.length > 0
            ? data.placement_types
            : [{ start_date: data.start_date, pay_type_id: data.pay_type_id, run_as_per_lca_wage: data.run_as_per_lca_wage }];

        if (!placementTypes[0]?.pay_type_id) throw new Error('At least one Placement Type record is required.');
        for (const pt of placementTypes) {
            if (!pt.start_date || !pt.pay_type_id) throw new Error('Each Placement Type record must have a Start Date and Type.');
        }

        const primaryPayTypeId = placementTypes[0].pay_type_id;
        const primaryRunAsLca  = placementTypes[0].run_as_per_lca_wage === true || placementTypes[0].run_as_per_lca_wage === 'true' || placementTypes[0].run_as_per_lca_wage === 1;

        const finalCalculatedPayRate = parseFloat(data.pay_rate) || 0.00;
        const finalBillRate = getFinalBillRateFromArray(billRates);
        const billRate = finalBillRate;

        let payTypeName = '';
        const [ptRows] = await connection.query('SELECT name FROM lkp_pay_types WHERE id = ?', [primaryPayTypeId]);
        payTypeName = ptRows[0]?.name || '';
        const isW2Like = payTypeName === 'W2';

        for (const pr of payRates) {
            const val = parseFloat(pr.pay_rate_value) || 0;
            const actualAmt = payRateType === 'Percentage' ? (finalBillRate * (val / 100)) : val;
            if (actualAmt >= finalBillRate && finalBillRate > 0) {
                throw new Error(`Pay rate ($${actualAmt.toFixed(2)}) must be strictly less than the final bill rate ($${finalBillRate.toFixed(2)}).`);
            }
            if (isW2Like) {
                const maxW2Like = finalBillRate * 0.85;
                if (actualAmt > maxW2Like && finalBillRate > 0) {
                    throw new Error(`For W2, pay rate ($${actualAmt.toFixed(2)}) cannot exceed 85% of final bill rate ($${maxW2Like.toFixed(2)}).`);
                }
            }
        }

        // W2 uniqueness: for each W2 entry, check no other active placement has W2 on that date
        for (const ptEntry of placementTypes) {
            const [r] = await connection.query('SELECT name FROM lkp_pay_types WHERE id = ? LIMIT 1', [ptEntry.pay_type_id]);
            if (r[0]?.name === 'W2') {
                const checkDate = safeDate(ptEntry.start_date);
                const conflict = await checkW2Uniqueness(connection, req.user.orgId, data.employee_id, id, checkDate);
                if (conflict) throw new Error(`This employee already has an active W2 placement (${conflict}) on ${checkDate}. An employee can only have one active W2 placement at a time.`);
            }
        }

        const safeStartDate = safeDate(data.start_date);
        const safeEndDate = safeDate(data.end_date);

        // If an end_date is being set, block only if protected timesheets (pending/approved/rejected) exist on or after it
        if (safeEndDate) {
            const [protectedTS] = await connection.query(`
                SELECT start_date, end_date, status_id FROM timesheets
                WHERE placement_id = ? AND start_date >= ? AND status_id IN (2, 3, 4)
                ORDER BY start_date ASC LIMIT 1
            `, [id, safeEndDate]);
            if (protectedTS.length > 0) {
                const ts = protectedTS[0];
                const statusNames = { 2: 'Pending Approval', 3: 'Approved', 4: 'Rejected' };
                throw new Error(`Cannot set end date to ${safeEndDate}. A "${statusNames[ts.status_id]}" timesheet (${safeDate(ts.start_date)} – ${safeDate(ts.end_date)}) exists on or after that date. Resolve it first.`);
            }
        }

        const [overlappingPlacements] = await connection.query(`
            SELECT placement_code FROM placements
            WHERE organization_id = ?
              AND id != ?
              AND employee_id = ?
              AND client_id = ?
              AND is_completed = false
              AND start_date <= COALESCE(?, '9999-12-31')
              AND COALESCE(end_date, '9999-12-31') >= ?
        `, [req.user.orgId, id, data.employee_id, data.client_id, safeEndDate, safeStartDate]);
        if (overlappingPlacements.length > 0) {
            throw new Error(`This employee already has another active placement (${overlappingPlacements[0].placement_code}) with this client that overlaps with the selected dates.`);
        }

        const isCompleted = data.is_completed === true || data.is_completed === 1 || data.is_completed === 'true';
        const finalStatus = isCompleted ? 'Completed' : (data.status || 'Active');

        await connection.query(
            `UPDATE placements SET
                client_id=?, employee_id=?, job_title=?, start_date=?, end_date=?, status=?, is_completed=?, completion_reason=?,
                has_timesheets=?, timesheet_cycle_id=?, timesheet_start_date=?, week_start_day=?,
                bill_rate=?, pay_rate=?, pay_rate_type=?, pay_type_id=?, run_as_per_lca_wage=?, updated_by=?
             WHERE id = ? AND organization_id = ?`,
            [
                data.client_id, data.employee_id, data.job_title, safeStartDate, safeEndDate, finalStatus, isCompleted, completionReason,
                data.has_timesheets || false, data.timesheet_cycle_id || null, safeDate(data.timesheet_start_date), data.week_start_day || null,
                billRate, finalCalculatedPayRate, payRateType, primaryPayTypeId, primaryRunAsLca, req.user.id, id, req.user.orgId
            ]
        );

        // Sync placement_type_history: replace all entries
        await connection.query(`DELETE FROM placement_type_history WHERE placement_id = ?`, [id]);
        for (const ptEntry of placementTypes) {
            const [ptNameCheck] = await connection.query('SELECT name FROM lkp_pay_types WHERE id = ? LIMIT 1', [ptEntry.pay_type_id]);
            const isW2 = ptNameCheck[0]?.name === 'W2';
            const { basis, fixed, runAsLca } = resolvePayoutBasis(ptEntry, isW2);
            await connection.query(
                `INSERT INTO placement_type_history (id, placement_id, pay_type_id, run_as_per_lca_wage, payout_basis, fixed_pay_per_period, start_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), id, ptEntry.pay_type_id, runAsLca, basis, fixed, safeDate(ptEntry.start_date), req.user.id]
            );
        }

        await connection.query(`DELETE FROM placement_bill_rates WHERE placement_id = ?`, [id]);
        for (const br of billRates) {
            await connection.query(
                `INSERT INTO placement_bill_rates (id, placement_id, bill_rate_value, effective_date, discount_percentage, discount_reason) VALUES (?, ?, ?, ?, ?, ?)`,
                [uuidv4(), id, parseFloat(br.bill_rate_value) || 0, safeDate(br.effective_date), br.discount_percentage ? parseFloat(br.discount_percentage) : null, br.discount_reason || null]
            );
        }

        await connection.query(`DELETE FROM placement_pay_rates WHERE placement_id = ?`, [id]);
        for (const pr of payRates) {
            await connection.query(
                `INSERT INTO placement_pay_rates (id, placement_id, pay_rate_value, effective_date) VALUES (?, ?, ?, ?)`,
                [uuidv4(), id, parseFloat(pr.pay_rate_value) || 0, safeDate(pr.effective_date)]
            );
        }

        // ── Keep the C2C balance sheet in step with the new pay rate ─────────
        // C2C earnings are posted once, when an invoice is paid, and they freeze
        // the rate that was on file at that moment — so a placement whose rate
        // was missing or wrong sits at $0 forever. When the pay rate changes we
        // re-price the already-posted rows here, inside the same transaction, so
        // the balance sheet shows the corrected earnings on the next refresh.
        // Hours are never recomputed; only the rate and the resulting amount.
        // W2 placements are untouched — they have no C2C rows, and their own
        // earnings already flow through the payroll run's refresh step.
        let balanceSheetSync = null;
        const payRatesChanged =
            rateSignature(oldPayRates, 'pay_rate_value') !== rateSignature(payRates, 'pay_rate_value') ||
            (oldPlac.pay_rate_type || 'Amount') !== payRateType;

        if (payRatesChanged) {
            balanceSheetSync = await repriceC2CLedgerForPlacement(connection, {
                placementId: id,
                orgId: req.user.orgId,
                userId: req.user.id,
            });
        }

        // Delete not-submitted (1) and past-due (5) timesheets whose start_date falls on or after the new end_date
        if (safeEndDate) {
            const [tsToDelete] = await connection.query(`
                SELECT id FROM timesheets
                WHERE placement_id = ? AND start_date >= ? AND status_id IN (1, 5)
            `, [id, safeEndDate]);
            if (tsToDelete.length > 0) {
                const tsIds = tsToDelete.map(t => t.id);
                await connection.query(`DELETE FROM timesheet_entries WHERE timesheet_id IN (?)`, [tsIds]);
                await connection.query(`DELETE FROM timesheets WHERE id IN (?)`, [tsIds]);
            }
        }

        await connection.commit();
        const [placRow] = await pool.query(`SELECT placement_code, e.first_name, e.last_name, c.client_name FROM placements p JOIN employees e ON p.employee_id = e.id JOIN clients c ON p.client_id = c.id WHERE p.id = ? LIMIT 1`, [id]);
        const placCode    = placRow[0]?.placement_code || id;
        const placEmpName = placRow[0] ? `${placRow[0].first_name} ${placRow[0].last_name}` : 'N/A';
        const placClient  = placRow[0]?.client_name || 'N/A';

        // Build diff description using snapshotted old values
        const auditChanges = [];
        const fmtD = (v) => (v != null && v !== '' ? String(v).trim().split('T')[0] : '');
        const fmtBR = (rates) => rates.map(r => `$${parseFloat(r.bill_rate_value).toFixed(2)} eff. ${fmtD(r.effective_date) || '?'}`).join(', ') || 'none';
        const fmtPR = (rates) => rates.map(r => `$${parseFloat(r.pay_rate_value).toFixed(2)} eff. ${fmtD(r.effective_date) || '?'}`).join(', ') || 'none';

        // Scalar field diffs
        const scalarDiffs = [
            { label: 'Job Title', ov: fmtD(oldPlac.job_title),   nv: fmtD(data.job_title) },
            { label: 'Status',    ov: fmtD(oldPlac.status),       nv: fmtD(finalStatus) },
            { label: 'Start Date', ov: fmtD(oldPlac.start_date),  nv: fmtD(safeStartDate) },
            { label: 'End Date',   ov: fmtD(oldPlac.end_date),    nv: fmtD(safeEndDate) },
        ];
        for (const f of scalarDiffs) {
            if (f.ov === f.nv) continue;
            if (!f.ov)       auditChanges.push(`Set ${f.label} to "${f.nv}"`);
            else if (!f.nv)  auditChanges.push(`Cleared ${f.label} (was "${f.ov}")`);
            else             auditChanges.push(`Changed ${f.label} from "${f.ov}" to "${f.nv}"`);
        }

        // Bill rate diffs
        const oldBRStr = fmtBR(oldBillRates);
        const newBRStr = fmtBR(billRates);
        if (oldBRStr !== newBRStr) {
            if (!oldBillRates.length) auditChanges.push(`Added bill rate(s): ${newBRStr}`);
            else if (!billRates.length) auditChanges.push(`Removed all bill rates (was: ${oldBRStr})`);
            else auditChanges.push(`Changed bill rates from [${oldBRStr}] to [${newBRStr}]`);
        }

        // Pay rate diffs
        const oldPRFmt = fmtPR(oldPayRates);
        const newPRFmt = fmtPR(payRates);
        if (oldPRFmt !== newPRFmt) {
            if (!oldPayRates.length) auditChanges.push(`Added pay rate(s): ${newPRFmt}`);
            else if (!payRates.length) auditChanges.push(`Removed all pay rates (was: ${oldPRFmt})`);
            else auditChanges.push(`Changed pay rates from [${oldPRFmt}] to [${newPRFmt}]`);
        }

        // Balance sheet re-pricing note
        const syncChangedCount = balanceSheetSync?.changes.length || 0;
        if (syncChangedCount > 0) {
            const d = balanceSheetSync.delta;
            auditChanges.push(
                `Re-priced ${syncChangedCount} C2C balance sheet entr${syncChangedCount === 1 ? 'y' : 'ies'} ` +
                `(${d >= 0 ? '+' : '−'}$${Math.abs(d).toFixed(2)}, new total $${balanceSheetSync.total_after.toFixed(2)})`
            );
        }

        const description = auditChanges.length > 0
            ? `Updated placement ${placCode} (${placEmpName} @ ${placClient}): ${auditChanges.join('; ')}`
            : `Updated placement ${placCode} (${placEmpName} @ ${placClient}) (no field changes)`;

        logAction({ orgId: req.user.orgId, module: 'placements', action: 'Updated Placement', entityType: 'Placement', entityId: id, entityName: placCode, performedBy: req.user.id, performedByRole: req.user.role, description }).catch(() => {});
        if (syncChangedCount > 0) {
            logAction({ orgId: req.user.orgId, module: 'balance-sheet', action: 'Re-priced C2C Earnings', entityType: 'Placement', entityId: id, entityName: placCode, performedBy: req.user.id, performedByRole: req.user.role, description: `Pay rate change on ${placCode} (${placEmpName}) re-priced ${syncChangedCount} C2C entr${syncChangedCount === 1 ? 'y' : 'ies'}: $${balanceSheetSync.total_before.toFixed(2)} → $${balanceSheetSync.total_after.toFixed(2)} (${balanceSheetSync.delta >= 0 ? '+' : '−'}$${Math.abs(balanceSheetSync.delta).toFixed(2)})` }).catch(() => {});
        }
        try { await runTimesheetGeneration(req.user.orgId, req.user.id); } catch (tsError) {
            console.error("Timesheet auto-gen failed on update:", tsError);
        }

        res.json({ message: "Placement updated successfully", balance_sheet_sync: balanceSheetSync });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const getPlacements = async (req, res) => {
    try {
        const [placements] = await pool.query(`
            SELECT p.*, pt.name as pay_type_name, tc.name as timesheet_cycle_name, e.first_name, e.last_name, e.employee_code, c.client_name,
                (SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id', pbr.id, 'bill_rate_value', pbr.bill_rate_value, 'effective_date', pbr.effective_date, 'discount_percentage', pbr.discount_percentage, 'discount_reason', pbr.discount_reason)), '[]')
                 FROM placement_bill_rates pbr WHERE pbr.placement_id = p.id) as bill_rates,
                (SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id', ppr.id, 'pay_rate_value', ppr.pay_rate_value, 'effective_date', ppr.effective_date)), '[]')
                 FROM placement_pay_rates ppr WHERE ppr.placement_id = p.id) as pay_rates,
                (SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id', s.id, 'pay_type_id', s.pay_type_id, 'pay_type_name', s.pt_name, 'run_as_per_lca_wage', s.run_as_per_lca_wage, 'payout_basis', s.payout_basis, 'fixed_pay_per_period', s.fixed_pay_per_period, 'start_date', s.start_date_fmt)), '[]')
                 FROM (SELECT pth.id, pth.pay_type_id, lpt.name AS pt_name, pth.run_as_per_lca_wage, pth.payout_basis, pth.fixed_pay_per_period, DATE_FORMAT(pth.start_date,'%Y-%m-%d') AS start_date_fmt
                       FROM placement_type_history pth JOIN lkp_pay_types lpt ON pth.pay_type_id = lpt.id
                       WHERE pth.placement_id = p.id ORDER BY pth.start_date ASC) s) as placement_types
            FROM placements p
            JOIN employees e ON p.employee_id = e.id
            JOIN clients c ON p.client_id = c.id
            LEFT JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
            LEFT JOIN lkp_cycles tc ON p.timesheet_cycle_id = tc.id
            WHERE p.organization_id = ? ORDER BY p.created_at DESC
        `, [req.user.orgId]);

        const parsed = placements.map(p => ({
            ...p,
            start_date: safeDate(p.start_date),
            end_date: safeDate(p.end_date),
            timesheet_start_date: safeDate(p.timesheet_start_date),
            run_as_per_lca_wage: !!p.run_as_per_lca_wage,
            bill_rates: (typeof p.bill_rates === 'string' ? JSON.parse(p.bill_rates) : (p.bill_rates || [])).map(br => ({
                ...br, effective_date: safeDate(br.effective_date)
            })).filter(br => br && br.id),
            pay_rates: (typeof p.pay_rates === 'string' ? JSON.parse(p.pay_rates) : (p.pay_rates || [])).map(pr => ({
                ...pr, effective_date: safeDate(pr.effective_date)
            })).filter(pr => pr && pr.id),
            placement_types: (typeof p.placement_types === 'string' ? JSON.parse(p.placement_types) : (p.placement_types || [])).map(pt => ({
                ...pt, run_as_per_lca_wage: !!pt.run_as_per_lca_wage
            })).filter(pt => pt && pt.id),
        }));
        
        res.json(parsed);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
// ─── Placement history ────────────────────────────────────────────────────────
//
// The list of placements belonging to ONE employee or ONE client, for the
// "Placement History" section inside the Workforce and Clients detail modals.
//
// Deliberately not served by getPlacements: that returns every placement in the
// org along with its full bill-rate, pay-rate and pay-type history as nested JSON,
// which is a lot of payload for a panel that shows six columns. This returns only
// what the panel renders, filtered in SQL rather than in the browser.
//
// Exactly one of employee_id / client_id is required — both would be ambiguous
// (an employee at a client is a narrower question this panel never asks) and
// neither would silently return the whole org.
export const getPlacementHistory = async (req, res) => {
    const { employee_id, client_id } = req.query;

    if (!employee_id && !client_id) {
        return res.status(400).json({ error: 'employee_id or client_id is required.' });
    }
    if (employee_id && client_id) {
        return res.status(400).json({ error: 'Provide either employee_id or client_id, not both.' });
    }

    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.placement_code, p.job_title, p.status, p.start_date, p.end_date,
                   p.employee_id, p.client_id,
                   e.first_name, e.last_name, e.employee_code,
                   c.client_name,
                   -- The pay type in force today, falling back to the placement's own
                   -- column for rows predating placement_type_history.
                   COALESCE(pth_pt.name, pt.name) AS pay_type_name
            FROM placements p
            JOIN employees e ON e.id = p.employee_id
            JOIN clients c   ON c.id = p.client_id
            LEFT JOIN lkp_pay_types pt ON pt.id = p.pay_type_id
            LEFT JOIN placement_type_history pth ON pth.placement_id = p.id
                AND pth.start_date = (
                    SELECT MAX(pth2.start_date) FROM placement_type_history pth2
                    WHERE pth2.placement_id = p.id AND pth2.start_date <= CURDATE()
                )
            LEFT JOIN lkp_pay_types pth_pt ON pth_pt.id = pth.pay_type_id
            WHERE p.organization_id = ?
              AND ${employee_id ? 'p.employee_id = ?' : 'p.client_id = ?'}
            ORDER BY p.start_date DESC, p.created_at DESC
        `, [req.user.orgId, employee_id || client_id]);

        res.json(rows.map(r => ({
            ...r,
            start_date: safeDate(r.start_date),
            end_date:   safeDate(r.end_date),
        })));
    } catch (error) {
        console.error('PLACEMENT HISTORY ERROR:', error);
        res.status(500).json({ error: 'Failed to load placement history.' });
    }
};
