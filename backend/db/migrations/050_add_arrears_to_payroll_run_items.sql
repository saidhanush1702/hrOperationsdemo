-- Arrears (catch-up) rows.
--
-- An ARREARS item pays hours that belong to an EARLIER pay period but were not
-- approved in time to be caught by that period's run. It carries the original
-- work dates in segment_start/segment_end (so rate segmentation and the
-- consumption ledger stay correct) and the period it is catching up for in
-- source_period_*, which is what the UI labels the row with.
ALTER TABLE payroll_run_items
    ADD COLUMN item_type ENUM('REGULAR','ARREARS') NOT NULL DEFAULT 'REGULAR' AFTER item_status,
    ADD COLUMN source_period_label VARCHAR(50) NULL AFTER item_type,
    ADD COLUMN source_period_start DATE NULL AFTER source_period_label,
    ADD COLUMN source_period_end DATE NULL AFTER source_period_start;

CREATE INDEX idx_pri_placement_segment ON payroll_run_items (placement_id, segment_start, segment_end);
CREATE INDEX idx_pri_org_status ON payroll_run_items (organization_id, item_status);
