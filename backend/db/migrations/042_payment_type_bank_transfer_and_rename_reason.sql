-- Add Bank Transfer payment type
INSERT INTO lkp_payment_types (name)
SELECT 'Bank Transfer'
WHERE NOT EXISTS (SELECT 1 FROM lkp_payment_types WHERE name = 'Bank Transfer');

-- Rename reason column to comment in invoice_payments
ALTER TABLE invoice_payments
    CHANGE COLUMN reason comment TEXT NULL;
