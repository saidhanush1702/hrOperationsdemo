-- Each payroll_run_item row now represents a single rate segment within the payroll period.
-- segment_start / segment_end define which slice of the period the row covers.
-- NULL means the item was created before segmentation was introduced (legacy single-rate row).
ALTER TABLE payroll_run_items
    ADD COLUMN segment_start DATE NULL AFTER total_amount,
    ADD COLUMN segment_end   DATE NULL AFTER segment_start;
