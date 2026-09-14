-- 1. Create the new junction table for multiple contacts
CREATE TABLE IF NOT EXISTS invoice_setting_contacts (
    placement_id CHAR(36) NOT NULL,
    contact_id CHAR(36) NOT NULL,
    PRIMARY KEY (placement_id, contact_id),
    FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES client_contacts(id) ON DELETE CASCADE
);

-- 2. Drop the old single contact column from invoice_settings
-- IMPORTANT: You must drop the foreign key constraint first. 
-- Replace 'invoice_settings_ibfk_2' with your actual constraint name if it differs.
-- You can find the exact name by running: SHOW CREATE TABLE invoice_settings;

ALTER TABLE invoice_settings DROP FOREIGN KEY invoice_settings_ibfk_2;

-- Now it is safe to drop the column
ALTER TABLE invoice_settings DROP COLUMN client_contact_id;