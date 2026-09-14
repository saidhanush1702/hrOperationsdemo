-- 1. Create the new Lookup Tables
CREATE TABLE IF NOT EXISTS lkp_cycles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS lkp_frequencies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- 2. Insert the required values
INSERT IGNORE INTO lkp_cycles (name) VALUES 
('Weekly'), ('Semi-Weekly'), ('Semi-Monthly'), ('Monthly');

INSERT IGNORE INTO lkp_frequencies (name) VALUES 
('Hourly'), ('Daily'), ('Weekly'), ('Monthly'), ('Yearly');

-- 3. Update the placements table to use these new Lookups
ALTER TABLE placements
DROP COLUMN timesheet_cycle,
DROP COLUMN invoice_frequency,
DROP COLUMN bill_frequency,
DROP COLUMN pay_frequency;

ALTER TABLE placements
ADD COLUMN timesheet_cycle_id INT DEFAULT NULL AFTER has_timesheets,
ADD COLUMN invoice_frequency_id INT DEFAULT NULL AFTER invoice_reference_no,
ADD COLUMN bill_frequency_id INT DEFAULT NULL AFTER bill_rate,
ADD COLUMN pay_frequency_id INT DEFAULT NULL AFTER pay_rate;

-- 4. Add the Foreign Key Constraints
ALTER TABLE placements ADD CONSTRAINT fk_timesheet_cycle FOREIGN KEY (timesheet_cycle_id) REFERENCES lkp_cycles(id) ON DELETE SET NULL;
ALTER TABLE placements ADD CONSTRAINT fk_invoice_frequency FOREIGN KEY (invoice_frequency_id) REFERENCES lkp_cycles(id) ON DELETE SET NULL;
ALTER TABLE placements ADD CONSTRAINT fk_bill_frequency FOREIGN KEY (bill_frequency_id) REFERENCES lkp_frequencies(id) ON DELETE SET NULL;
ALTER TABLE placements ADD CONSTRAINT fk_pay_frequency FOREIGN KEY (pay_frequency_id) REFERENCES lkp_frequencies(id) ON DELETE SET NULL;