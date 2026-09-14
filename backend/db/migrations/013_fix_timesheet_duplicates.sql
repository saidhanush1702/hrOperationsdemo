-- 1. Remove existing duplicate timesheets
-- This query keeps the oldest timesheet (MIN id) for each placement period and deletes the clones.
-- Because timesheet_entries has "ON DELETE CASCADE", this will automatically clean up the duplicate daily rows too!
DELETE FROM timesheets 
WHERE id NOT IN (
    SELECT keep_id FROM (
        SELECT MIN(id) as keep_id 
        FROM timesheets 
        GROUP BY placement_id, start_date, end_date
    ) as tmp
);

-- 2. Add a UNIQUE constraint to prevent future duplicates
-- This forces the database to reject any attempt to create a second timesheet for the same placement and dates.
ALTER TABLE timesheets 
ADD CONSTRAINT uq_placement_period UNIQUE (placement_id, start_date, end_date);