import pool from '../config/db.js';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/portal/org-info
// Returns org name + logo for the employee's organization
// ─────────────────────────────────────────────────────────────────────────────
export const getMyOrgInfo = async (req, res) => {
    try {
        const [orgs] = await pool.query(
            'SELECT name, logo_url FROM organizations WHERE id = ?',
            [req.user.orgId]
        );
        if (!orgs[0]) return res.status(404).json({ error: 'Organization not found.' });
        res.json(orgs[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load organization info.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve employee_id from the JWT user id
// ─────────────────────────────────────────────────────────────────────────────
const getEmployeeId = async (userId, orgId) => {
    const [rows] = await pool.query(
        'SELECT id FROM employees WHERE user_id = ? AND organization_id = ?',
        [userId, orgId]
    );
    return rows[0]?.id || null;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/portal/my-profile
// Returns full employee profile + immigration records + user email
// ─────────────────────────────────────────────────────────────────────────────
export const getMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const orgId  = req.user.orgId;

        const [rows] = await pool.query(`
            SELECT
                e.id, e.first_name, e.last_name,
                DATE_FORMAT(e.birth_date,       '%Y-%m-%d') AS birth_date,
                e.title, e.employee_code, e.ssn,
                DATE_FORMAT(e.joining_date,     '%Y-%m-%d') AS joining_date,
                DATE_FORMAT(e.termination_date, '%Y-%m-%d') AS termination_date,
                e.personal_email,
                e.phone_number, e.e_verification_code,
                g.name   AS gender_name,
                ms.name  AS marital_status_name,
                et.name  AS employee_type_name,
                c.name   AS country_name,
                pc.dial_code AS phone_dial_code,
                u.email  AS work_email,
                u.is_active,
                (SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id',          i.id,
                        'status_name', lis.name,
                        'start_date',  DATE_FORMAT(i.start_date, '%Y-%m-%d'),
                        'till_date',   DATE_FORMAT(i.till_date,  '%Y-%m-%d'),
                        'lca_wage',    i.lca_wage
                    )
                )
                FROM employee_immigrations i
                LEFT JOIN lkp_immigration_statuses lis ON i.status_id = lis.id
                WHERE i.employee_id = e.id) AS immigrations
            FROM employees e
            LEFT JOIN users                 u   ON e.user_id          = u.id
            LEFT JOIN lkp_genders           g   ON e.gender_id         = g.id
            LEFT JOIN lkp_marital_statuses  ms  ON e.marital_status_id = ms.id
            LEFT JOIN lkp_employee_types    et  ON e.employee_type_id  = et.id
            LEFT JOIN lkp_countries         c   ON e.country_id        = c.id
            LEFT JOIN lkp_phone_codes       pc  ON e.phone_code_id     = pc.id
            WHERE e.user_id = ? AND e.organization_id = ?
            LIMIT 1
        `, [userId, orgId]);

        if (!rows[0]) return res.status(404).json({ error: 'Profile not found.' });

        const profile = rows[0];
        // Parse immigrations JSON string if needed
        if (typeof profile.immigrations === 'string') {
            try { profile.immigrations = JSON.parse(profile.immigrations); } catch { profile.immigrations = []; }
        }
        profile.immigrations = profile.immigrations || [];

        res.json(profile);
    } catch (err) {
        console.error('GET MY PROFILE ERROR:', err);
        res.status(500).json({ error: 'Failed to load profile.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/portal/my-placements
// Returns the authenticated employee's placements with client info
// ─────────────────────────────────────────────────────────────────────────────
export const getMyPlacements = async (req, res) => {
    try {
        const userId = req.user.id;
        const orgId  = req.user.orgId;

        const empId = await getEmployeeId(userId, orgId);
        if (!empId) return res.json([]);

        const [placements] = await pool.query(`
            SELECT
                p.id, p.placement_code, p.job_title,
                p.status, p.has_timesheets,
                DATE_FORMAT(p.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(p.end_date,   '%Y-%m-%d') AS end_date,
                CAST(p.bill_rate AS DECIMAL(10,2))    AS bill_rate,
                CAST(p.pay_rate  AS DECIMAL(10,2))    AS pay_rate,
                p.pay_rate_type,
                pt.name  AS pay_type_name,
                c.client_name,
                cyc.name AS timesheet_cycle_name,
                (SELECT ppr.pay_rate_value
                 FROM placement_pay_rates ppr
                 WHERE ppr.placement_id = p.id AND ppr.effective_date <= CURDATE()
                 ORDER BY ppr.effective_date DESC LIMIT 1) AS current_pay_rate_override
            FROM placements p
            LEFT JOIN lkp_pay_types pt  ON p.pay_type_id           = pt.id
            LEFT JOIN clients       c   ON p.client_id             = c.id
            LEFT JOIN lkp_cycles    cyc ON p.timesheet_cycle_id    = cyc.id
            WHERE p.employee_id = ? AND p.organization_id = ?
            ORDER BY p.status ASC, p.start_date DESC
        `, [empId, orgId]);

        res.json(placements);
    } catch (err) {
        console.error('GET MY PLACEMENTS ERROR:', err);
        res.status(500).json({ error: 'Failed to load placements.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/portal/my-balance-sheet-summary
// Returns same structure as management getEmployeeBalanceSheetSummary
// but scoped to the authenticated employee only
// ─────────────────────────────────────────────────────────────────────────────
export const getMyBalanceSheetSummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const orgId  = req.user.orgId;

        const empId = await getEmployeeId(userId, orgId);
        if (!empId) {
            return res.json({
                summary: { placement_earnings: 0, manual_additions: 0, manual_deductions: 0, net_balance: 0 },
                placements: [],
                manual_adjustments: { total_additions: 0, total_deductions: 0, net: 0, items: [] }
            });
        }

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
                DATE_FORMAT(inv.paid_date, '%Y-%m-%d')                     AS invoice_paid_date
            FROM employee_transactions et
            LEFT JOIN placements        p   ON et.placement_id = p.id
            LEFT JOIN clients           c   ON p.client_id     = c.id
            LEFT JOIN lkp_pay_types     pt  ON p.pay_type_id   = pt.id
            LEFT JOIN invoices          inv ON inv.organization_id = et.organization_id
                AND inv.invoice_number = JSON_UNQUOTE(JSON_EXTRACT(et.metadata, '$.invoice_number'))
            WHERE et.employee_id = ? AND et.organization_id = ?
            ORDER BY et.transaction_date DESC, et.created_at DESC
        `, [empId, orgId]);

        const placementMap = {};
        const manualItems  = [];

        for (const tx of rows) {
            let meta = tx.metadata || {};
            if (typeof meta === 'string') {
                try { meta = JSON.parse(meta); } catch { meta = {}; }
            }
            const amount = parseFloat(tx.amount);

            if (tx.transaction_type === 'C2C') {
                if (!placementMap[tx.placement_id]) {
                    placementMap[tx.placement_id] = {
                        placement_id:   tx.placement_id,
                        placement_code: tx.placement_code,
                        pay_type:       tx.pay_type || 'C2C',
                        client_name:    tx.client_name,
                        total_amount:   0,
                        items:          [],
                    };
                }
                placementMap[tx.placement_id].total_amount += amount;
                placementMap[tx.placement_id].items.push({
                    id:             tx.id,
                    invoice_number: meta.invoice_number || '—',
                    paid_date:      tx.invoice_paid_date || tx.transaction_date,
                    total_hours:    parseFloat(meta.invoice_hours || 0),
                    pay_rate:       parseFloat(meta.pay_rate || 0),
                    amount,
                });

            } else if (['W2_STANDARD', 'W2_LCA'].includes(tx.transaction_type)) {
                if (!placementMap[tx.placement_id]) {
                    placementMap[tx.placement_id] = {
                        placement_id:   tx.placement_id,
                        placement_code: tx.placement_code,
                        pay_type:       tx.pay_type || 'W2',
                        client_name:    tx.client_name,
                        total_amount:   0,
                        items:          [],
                    };
                }
                placementMap[tx.placement_id].total_amount += amount;
                placementMap[tx.placement_id].items.push({
                    id:                  tx.id,
                    tx_type:             tx.transaction_type,
                    run_date:            tx.transaction_date,
                    period_label:        meta.period_label || meta.period || '—',
                    approved_hours:      parseFloat(meta.hours || 0),
                    pay_rate:            parseFloat(meta.pay_rate || 0),
                    lca_wage_per_period: meta.lca_wage_per_period != null
                        ? parseFloat(meta.lca_wage_per_period) : null,
                    amount,
                });

            } else if (tx.transaction_type === 'C2C_FIXED') {
                // Payroll handing over the flat figure, drawn back out of what this
                // placement accrued. Its own group so the employee can see
                // "earned X, paid out Y" rather than one netted number.
                //
                // Stored positive; negated here so placementTotal (and therefore
                // net_balance) picks up the sign without a special case downstream.
                const key = `${tx.placement_id}_C2C_FIXED`;
                if (!placementMap[key]) {
                    placementMap[key] = {
                        placement_id:     tx.placement_id,
                        placement_code:   tx.placement_code,
                        pay_type:         'C2C',
                        transaction_type: 'C2C_FIXED',
                        client_name:      tx.client_name,
                        total_amount:     0,
                        items:            [],
                    };
                }
                placementMap[key].total_amount -= amount;
                placementMap[key].items.push({
                    id:                   tx.id,
                    tx_type:              'C2C_FIXED',
                    run_date:             tx.transaction_date,
                    period_label:         meta.period_label || meta.period || '\u2014',
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

        const totalAdditions  = manualItems.filter(i => i.type === 'PAYOUT').reduce((s, i) => s + i.amount, 0);
        const totalDeductions = manualItems.filter(i => i.type === 'DEDUCTION').reduce((s, i) => s + i.amount, 0);
        const placementsArr   = Object.values(placementMap);
        const placementTotal  = placementsArr.reduce((s, p) => s + p.total_amount, 0);
        const manualNet       = totalAdditions - totalDeductions;

        res.json({
            summary: {
                placement_earnings:  parseFloat(placementTotal.toFixed(2)),
                manual_additions:    parseFloat(totalAdditions.toFixed(2)),
                manual_deductions:   parseFloat(totalDeductions.toFixed(2)),
                net_balance:         parseFloat((placementTotal + manualNet).toFixed(2)),
            },
            placements: placementsArr,
            manual_adjustments: {
                total_additions:  parseFloat(totalAdditions.toFixed(2)),
                total_deductions: parseFloat(totalDeductions.toFixed(2)),
                net:              parseFloat(manualNet.toFixed(2)),
                items:            manualItems,
            },
        });
    } catch (err) {
        console.error('GET MY BALANCE SHEET ERROR:', err);
        res.status(500).json({ error: 'Failed to load balance sheet.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/portal/dashboard-stats
// Returns quick-view stats for the employee's personal dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getMyDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const orgId  = req.user.orgId;

        const empId = await getEmployeeId(userId, orgId);
        if (!empId) {
            return res.json({
                active_placements: 0, pending_timesheets: 0,
                hours_this_week: 0,   net_balance: 0,
                is_verified: false,
            });
        }

        // Active placements
        const [[{ active_placements }]] = await pool.query(
            `SELECT COUNT(*) AS active_placements FROM placements WHERE employee_id = ? AND status = 'Active'`,
            [empId]
        );

        // Pending timesheets (Draft = 1, Rejected = 4 → need attention)
        const [[{ pending_timesheets }]] = await pool.query(
            `SELECT COUNT(*) AS pending_timesheets FROM timesheets WHERE employee_id = ? AND status_id IN (1,4)`,
            [empId]
        );

        // Hours this week (Mon–Sun)
        const [[{ hours_this_week }]] = await pool.query(`
            SELECT COALESCE(SUM(te.hours), 0) AS hours_this_week
            FROM timesheet_entries te
            JOIN timesheets t ON te.timesheet_id = t.id
            WHERE t.employee_id = ?
              AND te.work_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
              AND te.work_date <= DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)
        `, [empId]);

        // Net balance from ledger
        const [[balRow]] = await pool.query(`
            SELECT
                -- C2C_FIXED is a payroll withdrawal against accrued C2C earnings, so it
                -- reduces what the placement has banked rather than counting as a manual
                -- deduction. Netting it into the earnings term keeps this figure identical
                -- to the balance-sheet summary built above, which groups it the same way.
                COALESCE(SUM(CASE WHEN transaction_type IN ('C2C','W2_LCA','W2_STANDARD') THEN amount
                                  WHEN transaction_type = 'C2C_FIXED' THEN -amount ELSE 0 END), 0) AS earnings,
                COALESCE(SUM(CASE WHEN transaction_type = 'PAYOUT'    THEN amount ELSE 0 END), 0) AS additions,
                COALESCE(SUM(CASE WHEN transaction_type = 'DEDUCTION' THEN amount ELSE 0 END), 0) AS deductions
            FROM employee_transactions WHERE employee_id = ?
        `, [empId]);

        const net_balance = parseFloat(balRow.earnings) + parseFloat(balRow.additions) - parseFloat(balRow.deductions);

        // Verification status (e_verification_code present = verified)
        const [[empRow]] = await pool.query(
            'SELECT e_verification_code FROM employees WHERE id = ?', [empId]
        );
        const is_verified = !!(empRow?.e_verification_code);

        res.json({
            active_placements: parseInt(active_placements),
            pending_timesheets: parseInt(pending_timesheets),
            hours_this_week: parseFloat(parseFloat(hours_this_week).toFixed(2)),
            net_balance: parseFloat(net_balance.toFixed(2)),
            is_verified,
        });
    } catch (err) {
        console.error('DASHBOARD STATS ERROR:', err);
        res.status(500).json({ error: 'Failed to load dashboard stats.' });
    }
};
