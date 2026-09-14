-- Step 1: Add a plain index on organization_id so the FK (users_ibfk_1) still has
-- a backing index after the composite uq_org_email is dropped.
SET @add_org_idx = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD INDEX idx_org_id (organization_id)', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'idx_org_id');
PREPARE add_org_idx FROM @add_org_idx;
EXECUTE add_org_idx;
DEALLOCATE PREPARE add_org_idx;

-- Step 2: Drop the per-org composite unique index now that the FK has a replacement backing index.
SET @drop_org_idx = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE users DROP INDEX uq_org_email', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'uq_org_email');
PREPARE drop_org_idx FROM @drop_org_idx;
EXECUTE drop_org_idx;
DEALLOCATE PREPARE drop_org_idx;

-- Step 3: Remove duplicate emails — keep the oldest record per email (case-insensitive),
-- delete any newer duplicates that were created during the per-org period.
DELETE u FROM users u
INNER JOIN (
    SELECT LOWER(email) AS lower_email, MIN(created_at) AS oldest
    FROM users
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
) dupes ON LOWER(u.email) = dupes.lower_email AND u.created_at > dupes.oldest;

-- Step 4: Restore the global unique index on email.
SET @add_email_idx = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD UNIQUE INDEX email (email)', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'email');
PREPARE add_email_idx FROM @add_email_idx;
EXECUTE add_email_idx;
DEALLOCATE PREPARE add_email_idx;
