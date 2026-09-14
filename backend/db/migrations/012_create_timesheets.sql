-- 1. Create the status lookup table
CREATE TABLE lkp_timesheet_statuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- 2. Insert the standard status values
-- ID 1 will be 'Not Submitted', which we will use as the default
INSERT INTO lkp_timesheet_statuses (name) VALUES
('Not Submitted'),
('Pending Approval'),
('Approved'),
('Rejected'),
('Past Due');

-- 3. Create the main timesheets table (Updated to use status_id)
CREATE TABLE timesheets (
    id CHAR(36) PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    placement_id CHAR(36) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_hours DECIMAL(6,2) DEFAULT 0.00,
    status_id INT NOT NULL DEFAULT 1, -- Defaults to 1 ('Not Submitted')
    attachment_url VARCHAR(255), -- For the mandatory Manager/Client Approval proof
    submitted_at TIMESTAMP NULL,
    approved_by CHAR(36) NULL,
    approved_at TIMESTAMP NULL,
    rejection_reason TEXT,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (placement_id) REFERENCES placements(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (status_id) REFERENCES lkp_timesheet_statuses(id) -- New Foreign Key
);

-- 4. Create the daily entries table for precise tracking
CREATE TABLE timesheet_entries (
    id CHAR(36) PRIMARY KEY,
    timesheet_id CHAR(36) NOT NULL,
    work_date DATE NOT NULL,
    hours DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE
);

-- 5. Add Indexes for faster querying in the dashboard views
CREATE INDEX idx_timesheets_org_status ON timesheets(organization_id, status_id);
CREATE INDEX idx_timesheets_employee ON timesheets(employee_id);