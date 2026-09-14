import pool from '../config/db.js';
import { toPersonName, toCompanyName, toTitleText } from '../utils/nameCase.js';
import { v4 as uuidv4 } from 'uuid';
import { logAction } from './auditLogController.js';

export const createClient = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { client_name, website, address, fax_number, contacts } = req.body; 
        const orgId = req.user.orgId;
        const creatorId = req.user.id;

        const clientId = uuidv4();
        // Normalised once and reused, so the audit log records the name
        // exactly as it was stored rather than as it was typed.
        const clientName = toCompanyName(client_name);
        
        await connection.query(
            `INSERT INTO clients (id, organization_id, client_name, website, address, fax_number, created_by, updated_by) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [clientId, orgId, clientName, website || null, address || null, fax_number || null, creatorId, creatorId]
        );

        if (contacts && Array.isArray(contacts) && contacts.length > 0) {
            for (const contact of contacts) {
                const contactId = uuidv4();
                await connection.query(
                    `INSERT INTO client_contacts 
                    (id, client_id, contact_name, contact_title, contact_type_id, contact_email, phone_code_id, contact_phone, is_primary, created_by, updated_by) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        contactId, clientId, toPersonName(contact.contact_name), toTitleText(contact.contact_title) || null, contact.contact_type_id || null, 
                        contact.contact_email, contact.phone_code_id || null, contact.contact_phone || null, 
                        contact.is_primary || false, creatorId, creatorId
                    ]
                );
            }
        }

        await connection.commit();
        logAction({ orgId, module: 'clients', action: 'Added Client', entityType: 'Client', entityId: clientId, entityName: clientName, performedBy: creatorId, performedByRole: req.user.role, description: `Added client "${clientName}"` }).catch(() => {});
        res.status(201).json({ message: "Client and contacts registered successfully." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const getClients = async (req, res) => {
    try {
        const [clients] = await pool.query(`
            SELECT 
                c.id, c.organization_id, c.client_name, c.website, c.address, c.fax_number, c.created_at,
                COALESCE(
                    JSON_ARRAYAGG(
                        IF(cc.id IS NOT NULL,
                            JSON_OBJECT(
                                'id', cc.id,
                                'contact_name', cc.contact_name,
                                'contact_title', cc.contact_title, 
                                'contact_type_id', cc.contact_type_id,
                                'contact_type_name', ct.name,
                                'contact_email', cc.contact_email,
                                'phone_code_id', cc.phone_code_id,
                                'phone_dial_code', pc.dial_code,
                                'contact_phone', cc.contact_phone,
                                'is_primary', cc.is_primary
                            ),
                            NULL
                        )
                    ), '[]'
                ) AS contacts
            FROM clients c
            LEFT JOIN client_contacts cc ON c.id = cc.client_id
            LEFT JOIN lkp_client_contact_types ct ON cc.contact_type_id = ct.id
            LEFT JOIN lkp_phone_codes pc ON cc.phone_code_id = pc.id
            WHERE c.organization_id = ?
            GROUP BY c.id
            ORDER BY c.client_name ASC
        `, [req.user.orgId]);
        
        const formattedClients = clients.map(client => {
            let parsedContacts = client.contacts;
            if (typeof parsedContacts === 'string') {
                try { parsedContacts = JSON.parse(parsedContacts); } catch (e) { parsedContacts = []; }
            }
            if (Array.isArray(parsedContacts)) {
                parsedContacts = parsedContacts.filter(c => c !== null);
            } else {
                parsedContacts = [];
            }
            return { ...client, contacts: parsedContacts };
        });

        res.json(formattedClients);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateClient = async (req, res) => {
    const { id } = req.params;
    const { client_name, website, address, fax_number, contacts } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Snapshot old values for audit diff
        const [oldRows] = await connection.query(
            `SELECT client_name, website, address, fax_number FROM clients WHERE id = ? AND organization_id = ? LIMIT 1`,
            [id, req.user.orgId]
        );
        const old = oldRows[0] || {};
        const [oldContactRows] = await connection.query(
            `SELECT COUNT(*) AS cnt FROM client_contacts WHERE client_id = ?`, [id]
        );
        const oldContactCount = parseInt(oldContactRows[0]?.cnt || 0);
        // Normalised once and reused, so the audit log records the name
        // exactly as it was stored rather than as it was typed.
        const clientName = toCompanyName(client_name);

        await connection.query(
            `UPDATE clients SET client_name=?, website=?, address=?, fax_number=?, updated_by=?
             WHERE id = ? AND organization_id = ?`,
            [clientName, website || null, address || null, fax_number || null, req.user.id, id, req.user.orgId]
        );

        if (contacts && Array.isArray(contacts)) {
            await connection.query('DELETE FROM client_contacts WHERE client_id = ?', [id]);
            for (const contact of contacts) {
                const contactId = uuidv4();
                await connection.query(
                    `INSERT INTO client_contacts
                    (id, client_id, contact_name, contact_title, contact_type_id, contact_email, phone_code_id, contact_phone, is_primary, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        contactId, id, toPersonName(contact.contact_name), toTitleText(contact.contact_title) || null, contact.contact_type_id || null,
                        contact.contact_email, contact.phone_code_id || null, contact.contact_phone || null,
                        contact.is_primary || false, req.user.id, req.user.id
                    ]
                );
            }
        }

        await connection.commit();

        // Build diff description
        const changes = [];
        const scalarFields = [
            { key: 'client_name', label: 'Name', oldVal: old.client_name, newVal: clientName },
            { key: 'website',     label: 'Website',    oldVal: old.website    || '', newVal: website    || '' },
            { key: 'address',     label: 'Address',    oldVal: old.address    || '', newVal: address    || '' },
            { key: 'fax_number',  label: 'Fax Number', oldVal: old.fax_number || '', newVal: fax_number || '' },
        ];
        for (const f of scalarFields) {
            const ov = String(f.oldVal).trim();
            const nv = String(f.newVal).trim();
            if (ov !== nv) {
                if (!ov)      changes.push(`Set ${f.label} to "${nv}"`);
                else if (!nv) changes.push(`Cleared ${f.label} (was "${ov}")`);
                else          changes.push(`Changed ${f.label} from "${ov}" to "${nv}"`);
            }
        }
        if (contacts && Array.isArray(contacts)) {
            const newCount = contacts.length;
            if (newCount !== oldContactCount) {
                changes.push(`Updated contacts (${oldContactCount} → ${newCount})`);
            } else {
                changes.push(`Updated contacts (${newCount} contact${newCount !== 1 ? 's' : ''})`);
            }
        }
        const description = changes.length > 0
            ? `Updated client "${client_name}": ${changes.join('; ')}`
            : `Updated client "${client_name}" (no field changes)`;

        logAction({ orgId: req.user.orgId, module: 'clients', action: 'Updated Client', entityType: 'Client', entityId: id, entityName: client_name, performedBy: req.user.id, performedByRole: req.user.role, description }).catch(() => {});
        res.json({ message: "Client updated successfully" });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

export const deleteClient = async (req, res) => {
    const { id } = req.params;
    if (req.user.role !== 'ORG_ADMIN') return res.status(403).json({ message: "Unauthorized" });

    try {
        await pool.query('DELETE FROM clients WHERE id = ? AND organization_id = ?', [id, req.user.orgId]);
        logAction({ orgId: req.user.orgId, module: 'clients', action: 'Deleted Client', entityType: 'Client', entityId: id, performedBy: req.user.id, performedByRole: req.user.role, description: `Deleted client (ID: ${id})` }).catch(() => {});
        res.json({ message: "Client and associated contacts removed successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};