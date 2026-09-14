ALTER TABLE placements
ADD COLUMN is_completed BOOLEAN DEFAULT FALSE AFTER status,
ADD COLUMN has_discount BOOLEAN DEFAULT FALSE AFTER bill_rate,
ADD COLUMN discount_percentage DECIMAL(5,2) DEFAULT 0.00 AFTER has_discount,
ADD COLUMN discount_reason VARCHAR(255) DEFAULT NULL AFTER discount_percentage,
ADD COLUMN total_bill_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER discount_reason;
