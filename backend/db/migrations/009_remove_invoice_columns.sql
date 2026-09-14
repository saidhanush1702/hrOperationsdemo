-- 1. Drop the foreign key constraint first
ALTER TABLE placements DROP FOREIGN KEY fk_invoice_frequency;

-- 2. Now it is safe to drop the columns
ALTER TABLE placements 
DROP COLUMN invoice_type, 
DROP COLUMN invoice_reference_no, 
DROP COLUMN invoice_frequency_id;

-- Remove redundant placement_type column
ALTER TABLE placements DROP COLUMN placement_type;