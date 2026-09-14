-- Payroll consumption ledger.
--
-- Records exactly which timesheet hours a payroll item paid for. Until now
-- payroll summed approved hours at generate time and kept no record of what it
-- consumed, so hours approved *after* a run was submitted were lost forever
-- (the run is locked and payroll_runs.uk_org_period forbids a second run for
-- the same period). This table is what makes "what is still unpaid?" answerable.
--
-- `hours` is frozen at write time — the same principle the C2C ledger uses.
-- Later edits to the timesheet therefore surface as a visible delta rather than
-- silently rewriting what was already paid.
--
-- A row belongs to EITHER a payroll_run_item (the normal path) OR a legacy
-- employee_transaction posted by the old balance-sheet "run W2 payroll" path,
-- which never created payroll_run_items. Both must be counted as consumed or
-- those hours would be re-paid as arrears.
CREATE TABLE IF NOT EXISTS payroll_item_entries (
    id CHAR(36) NOT NULL PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    placement_id CHAR(36) NOT NULL,
    payroll_run_item_id CHAR(36) NULL,
    legacy_transaction_id CHAR(36) NULL,
    timesheet_id CHAR(36) NOT NULL,
    timesheet_entry_id CHAR(36) NOT NULL,
    work_date DATE NOT NULL,
    hours DECIMAL(6,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pie_item     FOREIGN KEY (payroll_run_item_id)   REFERENCES payroll_run_items(id)    ON DELETE CASCADE,
    CONSTRAINT fk_pie_legacy   FOREIGN KEY (legacy_transaction_id) REFERENCES employee_transactions(id) ON DELETE CASCADE,
    CONSTRAINT fk_pie_ts       FOREIGN KEY (timesheet_id)          REFERENCES timesheets(id)            ON DELETE CASCADE,
    CONSTRAINT fk_pie_entry    FOREIGN KEY (timesheet_entry_id)    REFERENCES timesheet_entries(id)     ON DELETE CASCADE
)
;

CREATE UNIQUE INDEX uk_pie_item_entry ON payroll_item_entries (payroll_run_item_id, timesheet_entry_id);
CREATE INDEX idx_pie_placement_date ON payroll_item_entries (placement_id, work_date);
CREATE INDEX idx_pie_entry ON payroll_item_entries (timesheet_entry_id);
CREATE INDEX idx_pie_timesheet ON payroll_item_entries (timesheet_id);
CREATE INDEX idx_pie_legacy ON payroll_item_entries (legacy_transaction_id);
