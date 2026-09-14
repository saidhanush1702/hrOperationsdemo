import pool from '../config/db.js';
import { toPersonName, toTitleText } from '../utils/nameCase.js';
import { v4 as uuidv4 } from 'uuid';
import { encryptPassword, decryptPassword } from '../utils/crypto.js';
import { sendEmployeeWelcomeEmail } from '../utils/mailer.js';
import { uploadBuffer, deleteFileRef } from '../utils/cloudinary.js';
import { logAction } from './auditLogController.js';

export const addEmployee = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { auth, profile } = req.body;
        const orgId = req.user.orgId;
        const creatorId = req.user.id;

        const [existing] = await connection.query(
            'SELECT id FROM users WHERE email = ?', [auth.email]
        );
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'This email is already registered. Please use a different email address.' });
        }

        const userId = uuidv4();
        const hashedPw = encryptPassword(auth.password);

        await connection.query(
            `INSERT INTO users (id, organization_id, email, password_hash, role, created_by, updated_by)
             VALUES (?, ?, ?, ?, 'EMPLOYEE', ?, ?)`,
            [userId, orgId, auth.email, hashedPw, creatorId, creatorId]
        );

        const employeeId = uuidv4();

        // Names are stored display-ready, so every screen shows the same casing
        // without any of them having to re-case it.
        const firstName = toPersonName(profile.first_name);
        const lastName  = toPersonName(profile.last_name);
        const empTitle  = toTitleText(profile.title);
        
        const profileQuery = `
            INSERT INTO employees (
                id, organization_id, user_id, first_name, last_name,
                birth_date, gender_id, marital_status_id, title,
                employee_code, employee_type_id, 
                ssn, joining_date, personal_email, phone_code_id, phone_number, country_id, 
                e_verification_code, created_by, updated_by
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

        const values = [
            employeeId, orgId, userId, firstName, lastName,
            profile.birth_date || null, profile.gender_id || null, profile.marital_status_id || null, empTitle,
            profile.employee_code, profile.employee_type_id || null,
            profile.ssn, profile.joining_date, profile.personal_email, profile.phone_code_id || null, profile.phone_number, profile.country_id || null,
            profile.e_verification_code, creatorId, creatorId
        ];

        await connection.query(profileQuery, values);

        if (profile.immigration_status_id) {
            await connection.query(
                `INSERT INTO employee_immigrations (id, employee_id, status_id, start_date, till_date, lca_wage, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), employeeId, profile.immigration_status_id, profile.immigration_start_date || null, profile.immigration_till_date || null, profile.lca_wage || null, creatorId, creatorId]
            );
        }

        await sendEmployeeWelcomeEmail(auth.email, auth.password);

        await connection.commit();
        logAction({ orgId, module: 'workforce', action: 'Added Employee', entityType: 'Employee', entityId: employeeId, entityName: `${profile.first_name} ${profile.last_name}`, performedBy: creatorId, performedByRole: req.user.role, description: `Added employee ${profile.first_name} ${profile.last_name} (${profile.employee_code})` }).catch(() => {});
        res.status(201).json({ message: "Full employee profile created." });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'This email is already registered. Please use a different email address.' });
        }
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const getEmployees = async (req, res) => {
    try {
        const [employees] = await pool.query(`
            SELECT 
                e.*, 
                g.name as gender_name,
                et.name as employee_type_name,
                c.name as country_name,
                ms.name as marital_status_name,
                pc.dial_code as phone_dial_code,
                u.id as user_account_id, u.email, u.role, u.is_active,
                u.password_hash,
                (SELECT pt.name
                 FROM placements p
                 LEFT JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
                 WHERE p.employee_id = e.id AND p.status = 'Active'
                 ORDER BY CASE pt.name WHEN 'W2' THEN 1 WHEN 'C2C' THEN 2 WHEN '1099' THEN 3 ELSE 4 END ASC
                 LIMIT 1) as pay_type_name,
                (SELECT p.pay_type_id
                 FROM placements p
                 LEFT JOIN lkp_pay_types pt ON p.pay_type_id = pt.id
                 WHERE p.employee_id = e.id AND p.status = 'Active'
                 ORDER BY CASE pt.name WHEN 'W2' THEN 1 WHEN 'C2C' THEN 2 WHEN '1099' THEN 3 ELSE 4 END ASC
                 LIMIT 1) as pay_type_id,
                (SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', i.id,
                        'status_id', i.status_id,
                        'status_name', lis.name,
                        'start_date', i.start_date,
                        'till_date', i.till_date,
                        'lca_wage', i.lca_wage
                    )
                 )
                 FROM employee_immigrations i
                 LEFT JOIN lkp_immigration_statuses lis ON i.status_id = lis.id
                 WHERE i.employee_id = e.id) as immigrations,
                (SELECT JSON_ARRAYAGG(d.file_name)
                 FROM employee_documents d
                 WHERE d.employee_id = e.id) as document_names
            FROM users u
            LEFT JOIN employees e ON u.id = e.user_id
            LEFT JOIN lkp_genders g ON e.gender_id = g.id
            LEFT JOIN lkp_employee_types et ON e.employee_type_id = et.id
            LEFT JOIN lkp_countries c ON e.country_id = c.id
            LEFT JOIN lkp_marital_statuses ms ON e.marital_status_id = ms.id
            LEFT JOIN lkp_phone_codes pc ON e.phone_code_id = pc.id
            WHERE u.organization_id = ? AND u.role = 'EMPLOYEE' AND e.id IS NOT NULL
            ORDER BY e.first_name ASC, e.last_name ASC
        `, [req.user.orgId]);

        const formattedEmployees = employees.map(emp => ({
            ...emp,
            plain_password: decryptPassword(emp.password_hash) || 'Encrypted (Old Hash)'
        }));

        res.json(formattedEmployees);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateEmployee = async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const orgId = req.user.orgId;

    try {
        // Snapshot old values for audit diff (fetch before overwriting)
        const [oldRows] = await pool.query(
            `SELECT e.first_name, e.last_name, e.title, e.employee_code, e.personal_email,
                    e.phone_number, e.joining_date, e.birth_date,
                    g.name AS gender_name, ms.name AS marital_status_name,
                    et.name AS employee_type_name
             FROM employees e
             LEFT JOIN lkp_genders g ON e.gender_id = g.id
             LEFT JOIN lkp_marital_statuses ms ON e.marital_status_id = ms.id
             LEFT JOIN lkp_employee_types et ON e.employee_type_id = et.id
             WHERE e.id = ? AND e.organization_id = ? LIMIT 1`,
            [id, orgId]
        );
        const old = oldRows[0] || {};

        await pool.query(
            `UPDATE employees SET
                first_name=?, last_name=?, birth_date=?,
                gender_id=?, marital_status_id=?, title=?,
                employee_code=?, employee_type_id=?,
                ssn=?, joining_date=?, personal_email=?, phone_code_id=?, phone_number=?,
                country_id=?, e_verification_code=?, updated_by=?
            WHERE id = ? AND organization_id = ?`,
            [
                toPersonName(data.first_name) || '', toPersonName(data.last_name) || '', data.birth_date || null,
                data.gender_id || null, data.marital_status_id || null, toTitleText(data.title) || null,
                data.employee_code || null, data.employee_type_id || null,
                data.ssn || null, data.joining_date || null, data.personal_email || null,
                data.phone_code_id || null, data.phone_number || null,
                data.country_id || null, data.e_verification_code || null,
                req.user.id, id, orgId
            ]
        );

        // Build diff for audit log
        const changes = [];
        const fmt = (v) => (v != null && v !== '' ? String(v).trim() : '');
        const scalarFields = [
            { label: 'First Name',     oldVal: fmt(old.first_name),           newVal: fmt(data.first_name) },
            { label: 'Last Name',      oldVal: fmt(old.last_name),            newVal: fmt(data.last_name) },
            { label: 'Job Title',      oldVal: fmt(old.title),                newVal: fmt(data.title) },
            { label: 'Employee Code',  oldVal: fmt(old.employee_code),        newVal: fmt(data.employee_code) },
            { label: 'Personal Email', oldVal: fmt(old.personal_email),       newVal: fmt(data.personal_email) },
            { label: 'Phone',          oldVal: fmt(old.phone_number),         newVal: fmt(data.phone_number) },
            { label: 'Joining Date',   oldVal: fmt(old.joining_date),         newVal: fmt(data.joining_date) },
            { label: 'Birth Date',     oldVal: fmt(old.birth_date),           newVal: fmt(data.birth_date) },
            { label: 'Gender',         oldVal: fmt(old.gender_name),          newVal: data.gender_id        ? `ID:${data.gender_id}`          : '' },
            { label: 'Marital Status', oldVal: fmt(old.marital_status_name),  newVal: data.marital_status_id ? `ID:${data.marital_status_id}` : '' },
            { label: 'Employee Type',  oldVal: fmt(old.employee_type_name),   newVal: data.employee_type_id  ? `ID:${data.employee_type_id}`  : '' },
        ];
        // Resolve lookup names for new values so the log is human-readable
        if (data.gender_id) {
            const [gRow] = await pool.query('SELECT name FROM lkp_genders WHERE id = ?', [data.gender_id]);
            const idx = scalarFields.findIndex(f => f.label === 'Gender');
            if (idx >= 0) scalarFields[idx].newVal = gRow[0]?.name || String(data.gender_id);
        }
        if (data.marital_status_id) {
            const [msRow] = await pool.query('SELECT name FROM lkp_marital_statuses WHERE id = ?', [data.marital_status_id]);
            const idx = scalarFields.findIndex(f => f.label === 'Marital Status');
            if (idx >= 0) scalarFields[idx].newVal = msRow[0]?.name || String(data.marital_status_id);
        }
        if (data.employee_type_id) {
            const [etRow] = await pool.query('SELECT name FROM lkp_employee_types WHERE id = ?', [data.employee_type_id]);
            const idx = scalarFields.findIndex(f => f.label === 'Employee Type');
            if (idx >= 0) scalarFields[idx].newVal = etRow[0]?.name || String(data.employee_type_id);
        }
        for (const f of scalarFields) {
            const ov = f.oldVal; const nv = f.newVal;
            if (ov === nv) continue;
            if (!ov)      changes.push(`Set ${f.label} to "${nv}"`);
            else if (!nv) changes.push(`Cleared ${f.label} (was "${ov}")`);
            else          changes.push(`Changed ${f.label} from "${ov}" to "${nv}"`);
        }
        const description = changes.length > 0
            ? `Updated ${data.first_name} ${data.last_name}: ${changes.join('; ')}`
            : `Updated ${data.first_name} ${data.last_name} (no field changes)`;

        logAction({ orgId, module: 'workforce', action: 'Updated Employee', entityType: 'Employee', entityId: id, entityName: `${data.first_name} ${data.last_name}`, performedBy: req.user.id, performedByRole: req.user.role, description }).catch(() => {});
        res.json({ message: "Profile synchronized successfully." });
    } catch (error) {
        console.error("Backend Update Error:", error);
        res.status(500).json({ error: error.message });
    }
};

export const addImmigrationRecord = async (req, res) => {
    const { empId } = req.params;
    const { status_id, start_date, till_date, lca_wage } = req.body;
    const creatorId = req.user.id;
    try {
        await pool.query(
            `INSERT INTO employee_immigrations (id, employee_id, status_id, start_date, till_date, lca_wage, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), empId, status_id || null, start_date || null, till_date || null, lca_wage || null, creatorId, creatorId]
        );
        logAction({ orgId: req.user.orgId, module: 'workforce', action: 'Added Immigration Record', entityType: 'Employee', entityId: empId, performedBy: creatorId, performedByRole: req.user.role, description: `Added immigration record for employee ${empId} — status ID: ${status_id || 'N/A'}, LCA wage: ${lca_wage ? '$' + lca_wage : 'N/A'}, valid: ${start_date || '?'} to ${till_date || 'ongoing'}` }).catch(() => {});
        res.status(201).json({ message: "Immigration record added." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


export const updateImmigrationRecord = async (req, res) => {
    const { immId } = req.params;
    const { status_id, start_date, till_date, lca_wage } = req.body;
    const updatedBy = req.user.id;

    try {
        await pool.query(
            `UPDATE employee_immigrations 
             SET status_id = ?, start_date = ?, till_date = ?, lca_wage = ?, updated_by = ? 
             WHERE id = ?`,
            [status_id || null, start_date || null, till_date || null, lca_wage || null, updatedBy, immId]
        );
        logAction({ orgId: req.user.orgId, module: 'workforce', action: 'Updated Immigration Record', entityType: 'Immigration', entityId: immId, performedBy: updatedBy, performedByRole: req.user.role, description: `Updated immigration record ${immId}` }).catch(() => {});
        res.json({ message: "Immigration record updated successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteEmployee = async (req, res) => {
    const { id } = req.params; // This is the Employee ID
    const userRole = req.user.role;

    try {
        if (userRole !== 'ORG_ADMIN') {
            return res.status(403).json({ message: "Access Denied: Only Admins can delete users." });
        }

        // 1. Find the exact user_id linked to this employee profile
        const [emp] = await pool.query(`SELECT user_id, first_name, last_name, employee_code FROM employees WHERE id = ? AND organization_id = ?`, [id, req.user.orgId]);

        if (emp.length === 0) {
            return res.status(404).json({ message: "Employee not found." });
        }

        const targetUserId = emp[0].user_id;
        const empName = `${emp[0].first_name} ${emp[0].last_name}`;
        const empCode = emp[0].employee_code || id;

        if (targetUserId === req.user.id) return res.status(400).json({ message: "Cannot delete yourself." });

        await pool.query('DELETE FROM users WHERE id = ? AND organization_id = ?', [targetUserId, req.user.orgId]);
        logAction({ orgId: req.user.orgId, module: 'workforce', action: 'Deleted Employee', entityType: 'Employee', entityId: id, entityName: empName, performedBy: req.user.id, performedByRole: req.user.role, description: `Permanently deleted employee ${empName} (${empCode}) and all associated records` }).catch(() => {});
        res.json({ message: "Employee deleted successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const terminateEmployee = async (req, res) => {
    const { id } = req.params; // This is the Employee ID
    const { date, reason } = req.body;
    const orgId = req.user.orgId;
    const userRole = req.user.role;

    if (!['ORG_ADMIN', 'ACCOUNTANT'].includes(userRole)) {
        return res.status(403).json({ message: "Access Denied: Only Admins and Accountants can terminate users." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Find the user_id tied to this employee record
        const [emp] = await connection.query(`SELECT user_id, first_name, last_name, employee_code FROM employees WHERE id = ? AND organization_id = ?`, [id, orgId]);

        if (emp.length === 0) {
            throw new Error("Employee record not found.");
        }

        const targetUserId = emp[0].user_id;
        const empName = `${emp[0].first_name} ${emp[0].last_name}`;
        const empCode = emp[0].employee_code || id;

        if (targetUserId === req.user.id) {
            return res.status(400).json({ message: "Cannot terminate yourself." });
        }

        // 2. Update Employee Table (Using employee ID)
        await connection.query(
            `UPDATE employees
             SET termination_date = ?, reason_for_termination = ?, updated_by = ?
             WHERE id = ? AND organization_id = ?`,
            [date, reason, req.user.id, id, orgId]
        );

        // 3. Update Users Table (Using the mapped User ID)
        await connection.query(
            `UPDATE users
             SET is_active = FALSE, updated_by = ?
             WHERE id = ? AND organization_id = ?`,
            [req.user.id, targetUserId, orgId]
        );

        await connection.commit();
        logAction({ orgId, module: 'workforce', action: 'Terminated Employee', entityType: 'Employee', entityId: id, entityName: empName, performedBy: req.user.id, performedByRole: req.user.role, description: `Terminated ${empName} (${empCode}) effective ${date || 'today'}. Reason: ${reason || 'Not provided'}` }).catch(() => {});
        res.json({ message: "Employee terminated and system access revoked." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const toggleEmployeeAccess = async (req, res) => {
    const { id } = req.params; // This is the Employee ID
    const { is_active } = req.body;
    const orgId = req.user.orgId;

    if (!['ORG_ADMIN', 'ACCOUNTANT'].includes(req.user.role)) {
        return res.status(403).json({ message: "Access Denied." });
    }

    try {
        // 1. Get the target user_id for this employee
        const [emp] = await pool.query(`SELECT user_id, first_name, last_name, employee_code FROM employees WHERE id = ? AND organization_id = ?`, [id, orgId]);

        if (emp.length === 0) {
            return res.status(404).json({ message: "Employee not found." });
        }

        const targetUserId = emp[0].user_id;
        const empName = `${emp[0].first_name} ${emp[0].last_name}`;
        const empCode = emp[0].employee_code || id;

        if (targetUserId === req.user.id) {
            return res.status(400).json({ message: "Cannot change your own access." });
        }

        await pool.query(
            `UPDATE users SET is_active = ?, updated_by = ? WHERE id = ? AND organization_id = ?`,
            [is_active, req.user.id, targetUserId, orgId]
        );
        logAction({ orgId, module: 'workforce', action: is_active ? 'Enabled Employee Access' : 'Disabled Employee Access', entityType: 'Employee', entityId: id, entityName: empName, performedBy: req.user.id, performedByRole: req.user.role, description: `${is_active ? 'Restored' : 'Suspended'} portal access for ${empName} (${empCode})` }).catch(() => {});
        res.json({ message: `Employee access ${is_active ? 'restored' : 'suspended'} successfully.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getNextEmployeeCode = async (req, res) => {
    try {
        const orgId = req.user.orgId;
        const currentYear = new Date().getFullYear().toString().slice(-2); // e.g. "26"
        const prefix = `${currentYear}SHA256`;

        const [rows] = await pool.query(`
            SELECT employee_code 
            FROM employees 
            WHERE organization_id = ? AND employee_code LIKE ?
        `, [orgId, `${prefix}%`]);

        let maxNumber = -1; // Start at -1 so next code defaults to 000

        rows.forEach(row => {
            const seqStr = row.employee_code.slice(prefix.length); // Extract digits
            const num = parseInt(seqStr, 10);
            if (!isNaN(num) && num > maxNumber) {
                maxNumber = num;
            }
        });

        const nextNumber = maxNumber + 1;
        const nextCode = `${prefix}${String(nextNumber).padStart(3, '0')}`;

        res.json({ nextCode });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// --- DELETE IMMIGRATION RECORD ---
export const deleteImmigrationRecord = async (req, res) => {
    const { immId } = req.params;

    try {
        await pool.query(`DELETE FROM employee_immigrations WHERE id = ?`, [immId]);
        logAction({ orgId: req.user.orgId, module: 'workforce', action: 'Deleted Immigration Record', entityType: 'Immigration', entityId: immId, performedBy: req.user.id, performedByRole: req.user.role, description: `Deleted immigration record ${immId}` }).catch(() => {});
        res.json({ message: "Immigration record deleted successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// --- DOCUMENT UPLOAD ---
export const uploadEmployeeDocument = async (req, res) => {
    const { empId } = req.params;
    const uploaderId = req.user.id;
    const file = req.file;

    if (!file) return res.status(400).json({ message: "No file uploaded" });

    try {
        const fileUrl = await uploadBuffer(file.buffer, {
            folder: `documents/${empId}`,
            fileName: file.originalname,
            mimeType: file.mimetype,
        });
        const docId = uuidv4();

        await pool.query(
            `INSERT INTO employee_documents (id, employee_id, file_name, file_url, file_type, uploaded_by) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [docId, empId, file.originalname, fileUrl, file.mimetype, uploaderId]
        );
        logAction({ orgId: req.user.orgId, module: 'workforce', action: 'Uploaded Document', entityType: 'Employee', entityId: empId, performedBy: uploaderId, performedByRole: req.user.role, description: `Uploaded document "${file.originalname}" for employee ID ${empId}` }).catch(() => {});
        res.status(201).json({
            message: "Document uploaded successfully",
            document: { id: docId, file_name: file.originalname, file_url: fileUrl, file_type: file.mimetype }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- GET DOCUMENTS ---
export const getEmployeeDocuments = async (req, res) => {
    const { empId } = req.params;
    try {
        const [docs] = await pool.query(`SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY uploaded_at DESC`, [empId]);
        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- DELETE DOCUMENT ---
export const deleteEmployeeDocument = async (req, res) => {
    const { docId } = req.params;
    try {
        const [docs] = await pool.query('SELECT file_url FROM employee_documents WHERE id = ?', [docId]);
        if (docs.length > 0) {
            // Remove the stored file (Cloudinary, or local disk for older uploads)
            await deleteFileRef(docs[0].file_url).catch(err => console.error("Failed to delete stored document:", err.message));
            // Remove from DB
            await pool.query('DELETE FROM employee_documents WHERE id = ?', [docId]);
        }
        logAction({ orgId: req.user.orgId, module: 'workforce', action: 'Deleted Document', entityType: 'Employee', entityId: docId, performedBy: req.user.id, performedByRole: req.user.role, description: `Deleted employee document (ID: ${docId})` }).catch(() => {});
        res.json({ message: "Document deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
// ─── Reactivate a terminated employee ─────────────────────────────────────────
//
// The exact inverse of terminateEmployee, and it has to touch BOTH tables that
// termination wrote to, or the employee ends up half-restored:
//
//   employees.termination_date       -> NULL   (this is what marks them terminated;
//   employees.reason_for_termination -> NULL    the UI derives isTerminated from it)
//   users.is_active                  -> 1      (this is what lets them log in and
//                                               what the Workforce tabs filter on)
//
// Clearing only the employee row would leave them locked out while reading as
// Active; flipping only the user row would let them log in while still badged
// TERMINATED everywhere. Both, in one transaction, or neither.
//
// joining_date is deliberately untouched: it records the original hire, so tenure
// and work anniversaries keep counting from it across a break in service.
//
// Placements are also left alone. Termination never closed them, and a returning
// employee needs a NEW placement rather than an old completed one silently
// reopening underneath them.
export const reactivateEmployee = async (req, res) => {
    const { id } = req.params; // employee id
    const orgId = req.user.orgId;

    if (!['ORG_ADMIN', 'ACCOUNTANT'].includes(req.user.role)) {
        return res.status(403).json({ message: "Access Denied: Only Admins and Accountants can reactivate employees." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [emp] = await connection.query(
            `SELECT user_id, first_name, last_name, employee_code, termination_date, reason_for_termination
             FROM employees WHERE id = ? AND organization_id = ?`,
            [id, orgId]
        );

        if (emp.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Employee record not found." });
        }

        const { user_id: targetUserId, first_name, last_name, employee_code } = emp[0];
        const empName = `${first_name} ${last_name}`;
        const empCode = employee_code || id;

        if (!emp[0].termination_date) {
            await connection.rollback();
            return res.status(400).json({ message: "This employee is not terminated." });
        }

        // Kept for the audit entry — it is about to be cleared from the record.
        // termination_date is a DATE column, so mysql2 hands back a Date object.
        // Formatted here rather than pulled through a shared helper — this file has
        // no date utility of its own and one line does not warrant importing one.
        const priorDate   = emp[0].termination_date
            ? new Date(emp[0].termination_date).toISOString().split('T')[0]
            : null;
        const priorReason = emp[0].reason_for_termination;

        await connection.query(
            `UPDATE employees
             SET termination_date = NULL, reason_for_termination = NULL, updated_by = ?
             WHERE id = ? AND organization_id = ?`,
            [req.user.id, id, orgId]
        );

        await connection.query(
            `UPDATE users SET is_active = TRUE, updated_by = ?
             WHERE id = ? AND organization_id = ?`,
            [req.user.id, targetUserId, orgId]
        );

        await connection.commit();

        logAction({
            orgId, module: 'workforce', action: 'Reactivated Employee',
            entityType: 'Employee', entityId: id, entityName: empName,
            performedBy: req.user.id, performedByRole: req.user.role,
            description: `Reactivated ${empName} (${empCode}) — cleared termination dated ${priorDate || 'unknown'}`
                       + `${priorReason ? ` (reason was: ${priorReason})` : ''} and restored portal access`,
        }).catch(() => {});

        res.json({ message: "Employee reactivated and system access restored." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};
