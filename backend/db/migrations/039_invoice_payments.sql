-- Payment type lookup (Cash, Cheque)
CREATE TABLE IF NOT EXISTS lkp_payment_types (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);
INSERT INTO lkp_payment_types (name) VALUES ('Cash'), ('Cheque');

-- Partial / full payment records per invoice
CREATE TABLE IF NOT EXISTS invoice_payments (
    id              VARCHAR(36)    NOT NULL PRIMARY KEY,
    invoice_id      VARCHAR(36)    NOT NULL,
    organization_id VARCHAR(36)    NOT NULL,
    amount          DECIMAL(10,2)  NOT NULL,
    payment_type_id INT            NOT NULL,
    payment_date    DATE           NOT NULL,
    reason          TEXT           NULL,
    recorded_by     VARCHAR(36)    NOT NULL,
    created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ip_invoice      FOREIGN KEY (invoice_id)      REFERENCES invoices(id)           ON DELETE CASCADE,
    CONSTRAINT fk_ip_payment_type FOREIGN KEY (payment_type_id) REFERENCES lkp_payment_types(id)
);
