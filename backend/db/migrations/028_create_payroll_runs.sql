-- Payroll Runs: one record per pay period per org
CREATE TABLE payroll_runs (
    id CHAR(36) PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    period_label VARCHAR(50) NOT NULL,   -- e.g. "Jan 1-15"
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    year INT NOT NULL,
    status ENUM('DRAFT', 'SUBMITTED') NOT NULL DEFAULT 'DRAFT',
    submitted_by CHAR(36) NULL,
    submitted_at TIMESTAMP NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_org_period (organization_id, period_start, period_end),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- One row per W2 employee/placement inside a payroll run
CREATE TABLE payroll_run_items (
    id CHAR(36) PRIMARY KEY,
    payroll_run_id CHAR(36) NOT NULL,
    organization_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    placement_id CHAR(36) NOT NULL,
    approved_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
    pay_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    lca_wage DECIMAL(10,2) DEFAULT NULL,
    lca_wage_per_period DECIMAL(10,2) DEFAULT NULL,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    comments TEXT DEFAULT NULL,
    item_status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE
);

CREATE INDEX idx_payroll_runs_org ON payroll_runs(organization_id, created_at DESC);
CREATE INDEX idx_payroll_items_run ON payroll_run_items(payroll_run_id);
