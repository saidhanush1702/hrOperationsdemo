
import pool from '../config/db.js';

export const getManagementStats = async (req, res) => {
    try {
        const orgId = req.user.orgId;

        // 1. Active Employees — `total` is the same population without the is_active
        //    filter, so the tile's sub-label matches the Workforce page's ALL tab.
        const [[empCount]] = await pool.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN u.is_active = 1 THEN 1 END) as count
            FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.organization_id = ? AND u.role = 'EMPLOYEE'
        `, [orgId]);

        // 2. Active Placements — `total` counts every placement regardless of status.
        const [[placementCount]] = await pool.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN status = 'Active' THEN 1 END) as count
            FROM placements
            WHERE organization_id = ?
        `, [orgId]);

        // Tiles 3–6 each report two numbers: the headline count is scoped to Active
        // placements (matching the default view of the page the tile links to), and
        // `total` covers every placement so the sub-label can show the wider figure.
        // COUNT(CASE ...) rather than SUM(CASE ...) keeps both values integer-typed —
        // mysql2 hands SUM() back as a string because it types the result DECIMAL.

        // 3. Pending Approval Timesheets (Status 2 = Submitted, waiting for HR review)
        const [[tsCount]] = await pool.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN p.status = 'Active' THEN 1 END) as count
            FROM timesheets t
            JOIN placements p ON t.placement_id = p.id
            WHERE t.organization_id = ? AND t.status_id = 2
        `, [orgId]);

        // 4. Past Due Timesheets — mirrors the Timesheets page "Past Due" tab:
        //    explicitly flagged (status 5), or still unsubmitted (status 1) past its period end.
        const [[pastDueCount]] = await pool.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN p.status = 'Active' THEN 1 END) as count
            FROM timesheets t
            JOIN placements p ON t.placement_id = p.id
            WHERE t.organization_id = ?
              AND (t.status_id = 5 OR (t.status_id = 1 AND t.end_date < CURDATE()))
        `, [orgId]);

        // 5. Past Due Invoices — mirrors the Invoices page "Past Due" tab. That page
        //    sweeps Open invoices past their due date into status 5 before rendering;
        //    this reproduces the post-sweep state read-only, so the dashboard stays a
        //    pure read and the count still matches what the user sees on arrival.
        const [[pastDueInvCount]] = await pool.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN p.status = 'Active' THEN 1 END) as count
            FROM invoices i
            JOIN placements p ON i.placement_id = p.id
            WHERE i.organization_id = ?
              AND (i.status_id = 5
                   OR (i.status_id = 4 AND i.due_date IS NOT NULL AND i.due_date < CURDATE()))
        `, [orgId]);

        // 6. Invoices in "Ready to Send" status (status_id = 2)
        const [[readyInvoiceCount]] = await pool.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN p.status = 'Active' THEN 1 END) as count
            FROM invoices i
            JOIN placements p ON i.placement_id = p.id
            WHERE i.organization_id = ? AND i.status_id = 2
        `, [orgId]);

        // 7. Total Net Balance across all employees
        const [[netBalanceRow]] = await pool.query(`
            SELECT COALESCE(SUM(
                CASE WHEN t.transaction_type IN ('C2C', 'W2_LCA', 'W2_STANDARD', 'PAYOUT') THEN t.amount
                     WHEN t.transaction_type IN ('DEDUCTION', 'C2C_FIXED') THEN -t.amount
                     ELSE 0 END
            ), 0) as total_net_balance
            FROM employee_transactions t
            JOIN employees e ON t.employee_id = e.id
            WHERE e.organization_id = ?
        `, [orgId]);

        // 8. Today's Birthdays (active, non-terminated employees born today)
        const [todayBirthdays] = await pool.query(`
            SELECT CONCAT(e.first_name, ' ', e.last_name) as name,
                   e.employee_code,
                   e.birth_date
            FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.organization_id = ?
              AND u.is_active = 1
              AND e.termination_date IS NULL
              AND e.birth_date IS NOT NULL
              AND MONTH(e.birth_date) = MONTH(CURDATE())
              AND DAY(e.birth_date) = DAY(CURDATE())
            ORDER BY e.first_name
        `, [orgId]);

        // 9. Work Anniversaries Today (active, non-terminated employees hired on this date in a prior year)
        const [todayAnniversaries] = await pool.query(`
            SELECT CONCAT(e.first_name, ' ', e.last_name) as name,
                   e.employee_code,
                   e.joining_date,
                   (YEAR(CURDATE()) - YEAR(e.joining_date)) as years
            FROM employees e
            JOIN users u ON e.user_id = u.id
            WHERE e.organization_id = ?
              AND u.is_active = 1
              AND e.termination_date IS NULL
              AND e.joining_date IS NOT NULL
              AND MONTH(e.joining_date) = MONTH(CURDATE())
              AND DAY(e.joining_date) = DAY(CURDATE())
              AND YEAR(e.joining_date) < YEAR(CURDATE())
            ORDER BY years DESC
        `, [orgId]);

        // 10. Immigration Status Expiring Within 180 Days
        const [immigrationExpiring] = await pool.query(`
            SELECT CONCAT(e.first_name, ' ', e.last_name) as name,
                   e.employee_code,
                   COALESCE(li.name, 'Unknown') as status_name,
                   ei.till_date,
                   DATEDIFF(ei.till_date, CURDATE()) as days_remaining
            FROM employee_immigrations ei
            JOIN employees e ON ei.employee_id = e.id
            JOIN users u ON e.user_id = u.id
            LEFT JOIN lkp_immigration_statuses li ON ei.status_id = li.id
            WHERE e.organization_id = ?
              AND u.is_active = 1
              AND e.termination_date IS NULL
              AND ei.till_date IS NOT NULL
              AND ei.till_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 180 DAY)
            ORDER BY ei.till_date ASC
        `, [orgId]);

        res.json({
            stats: {
                employees: empCount.count,
                employeesTotal: empCount.total,
                placements: placementCount.count,
                placementsTotal: placementCount.total,
                pendingTimesheets: tsCount.count,
                pendingTimesheetsTotal: tsCount.total,
                pastDueTimesheets: pastDueCount.count,
                pastDueTimesheetsTotal: pastDueCount.total,
                pastDueInvoices: pastDueInvCount.count,
                pastDueInvoicesTotal: pastDueInvCount.total,
                readyToSendInvoices: readyInvoiceCount.count,
                readyToSendInvoicesTotal: readyInvoiceCount.total,
                totalNetBalance: parseFloat(netBalanceRow.total_net_balance)
            },
            todayBirthdays,
            todayAnniversaries,
            immigrationExpiring
        });

    } catch (error) {
        console.error("DASHBOARD STATS ERROR:", error);
        res.status(500).json({ error: "Failed to load dashboard statistics." });
    }
};
