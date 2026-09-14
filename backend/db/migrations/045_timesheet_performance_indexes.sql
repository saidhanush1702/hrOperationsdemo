-- Composite index for main management query (org + date ordering)
CREATE INDEX idx_ts_org_start ON timesheets(organization_id, start_date DESC);

-- Composite index for tab-based status filtering
CREATE INDEX idx_ts_org_status_start ON timesheets(organization_id, status_id, start_date DESC);

-- Index for employee filter join (FK already exists but explicit composite helps)
CREATE INDEX idx_ts_employee_start ON timesheets(employee_id, start_date DESC);

-- Index for end_date used in PAST_DUE detection
CREATE INDEX idx_ts_org_end_status ON timesheets(organization_id, end_date, status_id);

-- Timesheet entries: join by timesheet_id and ordered by work_date
CREATE INDEX idx_te_timesheet_date ON timesheet_entries(timesheet_id, work_date);

-- Placement type history: window function partition + order
CREATE INDEX idx_pth_placement_start ON placement_type_history(placement_id, start_date DESC);
