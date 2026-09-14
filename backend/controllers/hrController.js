import pool from '../config/db.js';
import { toPersonName } from '../utils/nameCase.js';
import { v4 as uuidv4 } from 'uuid';
import { encryptPassword, decryptPassword } from '../utils/crypto.js';
import { sendWelcomeEmail } from '../utils/mailer.js';
import { logAction } from './auditLogController.js';

// --- UNIFIED TEAM MANAGEMENT (HR & ORG_ADMIN) ---

// 1. Get both HR and ORG_ADMIN users
export const getOrganizationTeam = async (req, res) => {
    try {
        // UPDATED: Concatenate first_name and last_name from the users table
        const [team] = await pool.query(`
            SELECT id, CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) as name, email, role, is_active, password_hash
            FROM users
            WHERE organization_id = ? AND role IN ('HR', 'ORG_ADMIN', 'ACCOUNTANT')
            ORDER BY created_at DESC
        `, [req.user.orgId]);

        const result = team.map(({ password_hash, ...rest }) => ({
            ...rest,
            password: decryptPassword(password_hash) || ''
        }));

        res.json(result);
    } catch (error) {
        console.error("GET TEAM ERROR:", error);
        res.status(500).json({ error: "Failed to load team members." });
    }
};

// 2. Create either HR or ORG_ADMIN
export const createTeamMember = async (req, res) => {
    // UPDATED: Extract first_name and last_name instead of a single 'name'
    const { first_name, last_name, email, password, role } = req.body;
    const creatorId = req.user.id;

    // Security check: Only ORG_ADMIN or ACCOUNTANT can create team members
    if (!['ORG_ADMIN', 'ACCOUNTANT'].includes(req.user.role)) {
        return res.status(403).json({ error: "Access Denied: Only Organization Admins or Accountants can add team members." });
    }

    // Validate role
    if (!['HR', 'ORG_ADMIN', 'ACCOUNTANT'].includes(role)) {
        return res.status(400).json({ error: "Invalid role assignment." });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const encryptedPw = encryptPassword(password);
        const userId = uuidv4();

        // Stored display-ready, and reused below so the audit log and the
        // welcome email agree with the row.
        const firstName = toPersonName(first_name);
        const lastName  = toPersonName(last_name);
        
        // UPDATED: Insert first_name and last_name into the users table
        await connection.query(`
            INSERT INTO users (id, organization_id, first_name, last_name, email, password_hash, role, is_active, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `, [userId, req.user.orgId, firstName, lastName, email, encryptedPw, role, creatorId]);
        
        // Optionally send a welcome email containing the initial password
        try {
             await sendWelcomeEmail(email, password, `${role.replace('_', ' ')} Portal`);
        } catch (mailError) {
             console.error("Failed to send welcome email, but user was created.", mailError);
        }

        await connection.commit();
        logAction({ orgId: req.user.orgId, module: 'organisation', action: 'Added Team Member', entityType: 'User', entityName: `${firstName} ${lastName}`, performedBy: req.user.id, performedByRole: req.user.role, description: `Added ${role} "${firstName} ${lastName}" (${email})` }).catch(() => {});
        res.status(201).json({ message: `${role.replace('_', ' ')} created successfully.` });
    } catch (error) {
        await connection.rollback();
        console.error("CREATE TEAM MEMBER ERROR:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: "This email is already registered." });
        }
        res.status(500).json({ error: "Failed to create team member." });
    } finally {
        connection.release();
    }
};

// 3. Toggle Access (Suspend / Restore)
export const toggleTeamAccess = async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;

    if (!['ORG_ADMIN', 'ACCOUNTANT'].includes(req.user.role)) {
        return res.status(403).json({ error: "Access Denied: Only Organization Admins or Accountants can suspend/restore accounts." });
    }

    // Prevent self-suspension
    if (req.user.id === id) {
        return res.status(400).json({ error: "You cannot suspend your own account." });
    }

    try {
        const [memberRow] = await pool.query(`SELECT CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')) as name, role, email FROM users WHERE id = ? AND organization_id = ? LIMIT 1`, [id, req.user.orgId]);
        const memberInfo = memberRow[0];
        await pool.query(`
            UPDATE users SET is_active = ?, updated_by = ?
            WHERE id = ? AND organization_id = ? AND role IN ('HR', 'ORG_ADMIN', 'ACCOUNTANT')
        `, [is_active, req.user.id, id, req.user.orgId]);
        logAction({ orgId: req.user.orgId, module: 'organisation', action: is_active ? 'Enabled Team Member Access' : 'Disabled Team Member Access', entityType: 'User', entityId: id, entityName: memberInfo?.name?.trim() || id, performedBy: req.user.id, performedByRole: req.user.role, description: `${is_active ? 'Restored' : 'Suspended'} access for ${memberInfo?.role || 'user'} "${memberInfo?.name?.trim() || id}" (${memberInfo?.email || ''})` }).catch(() => {});
        res.json({ message: `Account access ${is_active ? 'restored' : 'suspended'} successfully.` });
    } catch (error) {
        console.error("TOGGLE TEAM ACCESS ERROR:", error);
        res.status(500).json({ error: "Failed to update access." });
    }
};

// 4. Delete Member
export const deleteTeamMember = async (req, res) => {
    const { id } = req.params;

    if (req.user.role !== 'ORG_ADMIN') {
        return res.status(403).json({ error: "Access Denied: Only Organization Admins can delete accounts." });
    }

    // Prevent self-deletion
    if (req.user.id === id) {
        return res.status(400).json({ error: "You cannot delete your own account." });
    }

    try {
        const [delMemberRow] = await pool.query(`SELECT CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')) as name, role, email FROM users WHERE id = ? AND organization_id = ? LIMIT 1`, [id, req.user.orgId]);
        const delMember = delMemberRow[0];

        const [result] = await pool.query(`
            DELETE FROM users
            WHERE id = ? AND organization_id = ? AND role IN ('HR', 'ORG_ADMIN', 'ACCOUNTANT')
        `, [id, req.user.orgId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Account not found or you do not have permission." });
        }
        logAction({ orgId: req.user.orgId, module: 'organisation', action: 'Removed Team Member', entityType: 'User', entityId: id, entityName: delMember?.name?.trim() || id, performedBy: req.user.id, performedByRole: req.user.role, description: `Permanently removed ${delMember?.role || 'user'} "${delMember?.name?.trim() || id}" (${delMember?.email || ''}) from the team` }).catch(() => {});
        res.json({ message: "Team member removed successfully." });
    } catch (error) {
        console.error("DELETE TEAM MEMBER ERROR:", error);
        res.status(500).json({ error: "Failed to remove member." });
    }
};