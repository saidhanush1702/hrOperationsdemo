CREATE TABLE IF NOT EXISTS invoice_adjustments (
    id CHAR(36) NOT NULL PRIMARY KEY,
    invoice_id CHAR(36) NOT NULL,
    organization_id CHAR(36) NOT NULL,
    type ENUM('addition', 'deduction') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description VARCHAR(500) NOT NULL,
    date DATE NOT NULL,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
