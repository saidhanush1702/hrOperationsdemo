import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

// ─────────────────────────────────────────────────────────────────────────────
// logAction  — fire-and-forget helper imported by all other controllers
//
// Usage (never throws):
//   import { logAction } from './auditLogController.js';
//   logAction({ orgId, module: 'workforce', action: 'Added Employee',
//               entityType: 'Employee', entityId, entityName,
//               performedBy: req.user.id, performedByRole: req.user.role,
//               description: '...' }).catch(()=>{});
// ─────────────────────────────────────────────────────────────────────────────
export const logAction = async ({
    orgId,
    module,
    action,
    entityType,
    entityId    = null,
    entityName  = null,
    performedBy,
    performedByRole = null,
    description = null,
}) => {
    try {
        // Resolve the actor's display name from users table
        let performedByName = 'Unknown';
        const [[user]] = await pool.query(
            `SELECT CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')), email FROM users WHERE id = ? LIMIT 1`,
            [performedBy]
        );
        if (user) {
            const fullName = user[`CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))`]?.trim();
            performedByName = fullName || user.email || 'Unknown';
        }

        await pool.query(
            `INSERT INTO audit_logs
                (id, organization_id, module, action, entity_type, entity_id, entity_name,
                 performed_by, performed_by_name, performed_by_role, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                uuidv4(), orgId, module, action, entityType,
                entityId   || null,
                entityName || null,
                performedBy,
                performedByName,
                performedByRole || null,
                description || null,
            ]
        );
    } catch (err) {
        console.error('[AuditLog] Failed to write audit entry:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/management/audit-logs/:module
// Only accessible by ORG_ADMIN (enforced here + route guard)
// ─────────────────────────────────────────────────────────────────────────────
export const getModuleAuditLogs = async (req, res) => {
    try {
        if (req.user.role !== 'ORG_ADMIN') {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { module } = req.params;
        const orgId  = req.user.orgId;
        const limit  = parseInt(req.query.limit  || '50', 10);
        const offset = parseInt(req.query.offset || '0',  10);

        const [logs] = await pool.query(
            `SELECT id, module, action, entity_type, entity_id, entity_name,
                    performed_by_name, performed_by_role, description, created_at
             FROM audit_logs
             WHERE organization_id = ? AND module = ?
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [orgId, module, limit, offset]
        );

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM audit_logs WHERE organization_id = ? AND module = ?`,
            [orgId, module]
        );

        res.json({ logs, total, limit, offset });
    } catch (err) {
        console.error('GET AUDIT LOGS ERROR:', err);
        res.status(500).json({ error: 'Failed to load audit logs.' });
    }
};
