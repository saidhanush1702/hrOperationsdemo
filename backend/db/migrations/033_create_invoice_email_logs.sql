CREATE TABLE IF NOT EXISTS invoice_email_logs (
    id              VARCHAR(36)  PRIMARY KEY,
    invoice_id      VARCHAR(36)  NOT NULL,
    organization_id VARCHAR(36)  NOT NULL,
    email_type      VARCHAR(50)  NOT NULL COMMENT 'INVOICE_SENT or PAST_DUE_REMINDER',
    sent_to         TEXT,
    sent_by         VARCHAR(36),
    sent_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subject         VARCHAR(500),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
