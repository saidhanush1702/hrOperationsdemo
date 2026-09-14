-- The original employee_transactions table was created with `description VARCHAR(255) NOT NULL`.
-- The new ledger system stores all contextual data in the `metadata` JSON column instead.
-- This migration removes the NOT NULL constraint so all new INSERT statements (C2C, W2_LCA,
-- W2_STANDARD) can omit the legacy description column without causing a MySQL error.
ALTER TABLE employee_transactions
MODIFY COLUMN description VARCHAR(255) DEFAULT NULL;
