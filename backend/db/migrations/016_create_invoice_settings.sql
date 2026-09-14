-- Create dedicated table for Invoice Settings
CREATE TABLE IF NOT EXISTS invoice_settings (
    id CHAR(36) PRIMARY KEY,
    placement_id CHAR(36) NOT NULL UNIQUE,
    client_contact_id CHAR(36) NULL,
    net_terms INT DEFAULT 30, -- e.g., 30, 45, 60
    invoice_cycle_id INT DEFAULT 1, -- 1=Weekly, 2=Semi-Monthly, 3=Monthly
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE,
    FOREIGN KEY (client_contact_id) REFERENCES client_contacts(id) ON DELETE SET NULL
);

-- Optional: Migrate existing invoice settings from placements/clients if needed
-- INSERT INTO invoice_settings (id, placement_id, invoice_cycle_id, net_terms)
-- SELECT UUID(), p.id, p.invoice_cycle_id, c.net_terms FROM placements p JOIN clients c ON p.client_id = c.id WHERE p.invoice_cycle_id IS NOT NULL;