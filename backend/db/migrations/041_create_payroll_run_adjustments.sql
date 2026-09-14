CREATE TABLE IF NOT EXISTS payroll_run_adjustments (
    id CHAR(36) NOT NULL PRIMARY KEY,
    payroll_run_id CHAR(36) NOT NULL,
    organization_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    type ENUM('addition', 'deduction') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description VARCHAR(500) NOT NULL,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
);
