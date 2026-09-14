ALTER TABLE employee_transactions
ADD COLUMN placement_id CHAR(36) DEFAULT NULL AFTER employee_id,
ADD COLUMN metadata JSON DEFAULT NULL AFTER amount,
MODIFY COLUMN transaction_type VARCHAR(50) NOT NULL; 
-- transaction_type will now hold: 'C2C', 'W2_LCA', 'W2_STANDARD', 'PAYOUT', 'DEDUCTION'

ALTER TABLE employee_transactions
ADD CONSTRAINT fk_emp_trans_placement FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE SET NULL;