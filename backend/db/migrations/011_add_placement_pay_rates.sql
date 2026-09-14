-- Add the input method toggle to placements
ALTER TABLE placements ADD COLUMN pay_rate_type ENUM('Amount', 'Percentage') DEFAULT 'Amount';

-- Create the dynamic pay rates table
CREATE TABLE placement_pay_rates (
    id CHAR(36) PRIMARY KEY,
    placement_id CHAR(36) NOT NULL,
    pay_rate_value DECIMAL(10,2) NOT NULL,
    effective_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE
);
-- 1. Drop the foreign key constraints first
ALTER TABLE placements 
DROP FOREIGN KEY fk_bill_frequency;

-- Note: If your constraint for pay frequency has a different name, 
-- change 'fk_pay_frequency' to match your actual database schema.
ALTER TABLE placements 
DROP FOREIGN KEY fk_pay_frequency;

-- 2. Add the new completion reason column
ALTER TABLE placements 
ADD COLUMN completion_reason TEXT;

-- 3. Now safely drop the unnecessary columns
ALTER TABLE placements 
DROP COLUMN bill_frequency_id,
DROP COLUMN pay_frequency_id,
DROP COLUMN total_bill_rate;