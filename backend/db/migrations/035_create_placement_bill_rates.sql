CREATE TABLE IF NOT EXISTS placement_bill_rates (
    id CHAR(36) PRIMARY KEY,
    placement_id CHAR(36) NOT NULL,
    bill_rate_value DECIMAL(10,2) NOT NULL,
    effective_date DATE NOT NULL,
    discount_percentage DECIMAL(5,2) DEFAULT NULL,
    discount_reason VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE
);
INSERT INTO placement_bill_rates (id, placement_id, bill_rate_value, effective_date)
SELECT UUID(), id, bill_rate, COALESCE(start_date, CURDATE())
FROM placements
WHERE bill_rate IS NOT NULL AND bill_rate > 0
