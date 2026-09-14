-- Create the dynamic discounts table
CREATE TABLE placement_discounts (
    id CHAR(36) PRIMARY KEY,
    placement_id CHAR(36) NOT NULL,
    discount_type ENUM('Percentage', 'Amount') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255),
    effective_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE
);

-- Remove static discount columns from placements
ALTER TABLE placements
DROP COLUMN has_discount,
DROP COLUMN discount_percentage,
DROP COLUMN discount_reason;