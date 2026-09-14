-- Add pay_when_paid column to invoice_settings
ALTER TABLE invoice_settings 
ADD COLUMN pay_when_paid BOOLEAN DEFAULT FALSE;