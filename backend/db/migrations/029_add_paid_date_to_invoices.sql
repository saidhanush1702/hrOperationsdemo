-- Store the actual payment date when an invoice is marked as Paid
ALTER TABLE invoices ADD COLUMN paid_date DATE NULL AFTER due_date;
