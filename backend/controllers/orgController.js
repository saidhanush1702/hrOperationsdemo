import pool from '../config/db.js';
import { toPersonName } from '../utils/nameCase.js';
import { v4 as uuidv4 } from 'uuid';
import { sendWelcomeEmail } from '../utils/mailer.js';
import { uploadBuffer } from '../utils/cloudinary.js';
import { orgSchema } from '../utils/validators.js';
import { encryptPassword, decryptPassword } from '../utils/crypto.js';
import { logAction } from './auditLogController.js';

export const createOrganization = async (req, res) => {
    
    const { error, value } = orgSchema.validate(req.body);
    
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    const { name, admin_email, admin_first_name, admin_last_name, admin_password, domain, address, send_welcome_email } = value;
    const superAdminId = req.user.id;

    const connection = await pool.getConnection();

    try {
        console.log(` Starting onboarding for: ${name}`);

        await connection.beginTransaction();

        const orgId = uuidv4();
        const userId = uuidv4();
        const encryptedPw = encryptPassword(admin_password);

        console.log(" Step 1: Creating Organization record...");
        await connection.query(
            `INSERT INTO organizations (id, name, admin_email, domain, address, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [orgId, name, admin_email, domain, address, superAdminId, superAdminId]
        );

        console.log(" Step 2: Creating Admin User record...");
        await connection.query(
            `INSERT INTO users (id, organization_id, email, first_name, last_name, password_hash, role, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, 'ORG_ADMIN', ?, ?)`,
            // The org's own `name` above is stored verbatim on purpose; only the
            // admin's personal name is normalised.
            [userId, orgId, admin_email, toPersonName(admin_first_name), toPersonName(admin_last_name), encryptedPw, superAdminId, superAdminId]
        );

        await connection.commit();
        console.log(" Success: Organization and admin committed.");

        // Emailing the login details is optional — the platform owner set the
        // password and can share it directly. When requested it is best-effort:
        // the workspace already exists, so a mail outage cannot undo onboarding.
        let emailSent = null;
        if (send_welcome_email) {
            try {
                console.log(" Step 3: Sending welcome email...");
                await sendWelcomeEmail(admin_email, admin_password, name);
                emailSent = true;
            } catch (mailError) {
                emailSent = false;
                console.error(" Welcome email failed (organization kept):", mailError.message);
            }
        }

        res.status(201).json({
            emailSent,
            message: emailSent === true
                ? "Organization created successfully and credentials have been emailed."
                : emailSent === false
                    ? "Organization created, but the welcome email could not be sent. Share the admin's login details with them directly."
                    : "Organization created successfully.",
        });

    } catch (error) {
        if (connection) await connection.rollback();
        
        console.error(" ONBOARDING FAILED:");
        console.error(`Error Message: ${error.message}`);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Organization or Admin Email already exists." });
        }

        res.status(500).json({ 
            message: "Internal Server Error during organization creation.",
            error: error.message 
        });

    } finally {
        if (connection) connection.release();
    }
};

export const toggleOrgStatus = async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    try {
        await pool.query('UPDATE organizations SET is_active = ? WHERE id = ?', [is_active, id]);
        res.json({ message: `Organization ${is_active ? 'activated' : 'deactivated'} successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getAllOrganizations = async (req, res) => {
    try {
        const [orgs] = await pool.query(`
            SELECT o.*, COUNT(u.id) as admin_count
            FROM organizations o
            LEFT JOIN users u ON o.id = u.organization_id AND u.role = 'ORG_ADMIN'
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `);
        res.json(orgs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getOrgAdmins = async (req, res) => {
    const { id } = req.params;
    try {
        const [admins] = await pool.query(`
            SELECT id, first_name, last_name, email, password_hash, is_active, created_at
            FROM users
            WHERE organization_id = ? AND role = 'ORG_ADMIN'
            ORDER BY created_at ASC
        `, [id]);
        const result = admins.map(a => ({
            id: a.id,
            first_name: a.first_name,
            last_name: a.last_name,
            email: a.email,
            password: decryptPassword(a.password_hash) || '(unable to decrypt)',
            is_active: a.is_active,
            created_at: a.created_at,
        }));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getSuperAdminStats = async (req, res) => {
    try {
        const [[{ totalOrgs }]] = await pool.query(`SELECT COUNT(*) as totalOrgs FROM organizations`);
        const [[{ totalUsers }]] = await pool.query(`SELECT COUNT(*) as totalUsers FROM users WHERE role != 'SUPER_ADMIN'`);
        res.json({ totalOrgs, totalUsers, systemHealth: 'Healthy' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getOrganizationDetails = async (req, res) => {
    try {
        const [orgs] = await pool.query(`
            SELECT id, name, admin_email, domain, address, accounts_email, logo_url 
            FROM organizations 
            WHERE id = ?
        `, [req.user.orgId]);
        
        if (orgs.length === 0) return res.status(404).json({ error: "Organization not found" });
        
        res.json(orgs[0]);
    } catch (err) {
        console.error("GET ORG DETAILS ERROR:", err);
        res.status(500).json({ error: "Failed to fetch organization details." });
    }
};

// Update organization details (including logo upload)
export const updateOrganizationDetails = async (req, res) => {
    try {
        const { accounts_email } = req.body;
        let logo_url = null;

        let query = 'UPDATE organizations SET accounts_email = ?';
        let params = [accounts_email || null];

        // If a logo file was uploaded, store it in Cloudinary and save its URL
        if (req.file) {
            logo_url = await uploadBuffer(req.file.buffer, {
                folder: 'logos',
                fileName: `org_${req.user.orgId}_${req.file.originalname}`,
                mimeType: req.file.mimetype,
            });
            query += ', logo_url = ?';
            params.push(logo_url);
        }

        query += ' WHERE id = ?';
        params.push(req.user.orgId);

        await pool.query(query, params);
        logAction({ orgId: req.user.orgId, module: 'organisation', action: 'Updated Organisation Details', entityType: 'Organisation', performedBy: req.user.id, performedByRole: req.user.role, description: `Updated organisation details${req.file ? ' (logo changed)' : ''}${accounts_email ? `, accounts email: ${accounts_email}` : ''}` }).catch(() => {});
        res.json({
            message: "Organization updated successfully.", 
            logo_url 
        });
    } catch (err) {
        console.error("UPDATE ORG DETAILS ERROR:", err);
        res.status(500).json({ error: "Failed to update organization details." });
    }
};