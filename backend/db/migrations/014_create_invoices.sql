-- Lookup table for Invoice Statuses
CREATE TABLE IF NOT EXISTS lkp_invoice_statuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

INSERT IGNORE INTO lkp_invoice_statuses (id, name) VALUES 
(1, 'Not Ready'),
(2, 'Ready to Approve'),
(3, 'Ready to Invoice'),
(4, 'Open Invoice'),
(5, 'Past Due'),
(6, 'Paid');

-- Add net_terms for due date calculation (Default Net 30)
ALTER TABLE clients ADD COLUMN net_terms INT DEFAULT 30;

-- Add invoice frequency (defaults to 1 = Weekly)
ALTER TABLE placements ADD COLUMN invoice_cycle_id INT DEFAULT 1;

-- Create the Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
    id CHAR(36) PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    client_id CHAR(36) NOT NULL,
    placement_id CHAR(36) NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    issue_date DATE NULL,
    due_date DATE NULL,
    total_hours DECIMAL(10,2) DEFAULT 0,
    bill_rate DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    status_id INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by CHAR(36),
    updated_by CHAR(36),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (placement_id) REFERENCES placements(id),
    FOREIGN KEY (status_id) REFERENCES lkp_invoice_statuses(id)
);

-- Link Timesheets to Invoices
ALTER TABLE timesheets ADD COLUMN invoice_id CHAR(36) NULL;
ALTER TABLE timesheets ADD FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;