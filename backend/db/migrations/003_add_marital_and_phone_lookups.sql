-- 1. Create Lookup Tables
CREATE TABLE IF NOT EXISTS lkp_marital_statuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS lkp_phone_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    country_name VARCHAR(100) NOT NULL,
    dial_code VARCHAR(20) NOT NULL
);

-- 2. Alter employees table
-- Drop the old string-based marital_status
ALTER TABLE employees DROP COLUMN marital_status;

-- Add new relationship columns
ALTER TABLE employees 
ADD COLUMN marital_status_id INT DEFAULT NULL AFTER gender_id,
ADD COLUMN phone_code_id INT DEFAULT NULL AFTER personal_email;

-- Add Foreign Key Constraints
ALTER TABLE employees 
ADD CONSTRAINT fk_emp_marital FOREIGN KEY (marital_status_id) REFERENCES lkp_marital_statuses(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_emp_phone_code FOREIGN KEY (phone_code_id) REFERENCES lkp_phone_codes(id) ON DELETE SET NULL;