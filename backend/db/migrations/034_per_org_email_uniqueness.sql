SET @drop_stmt = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE users DROP INDEX email', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'email');
PREPARE drop_idx FROM @drop_stmt;
EXECUTE drop_idx;
DEALLOCATE PREPARE drop_idx;
SET @add_stmt = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD UNIQUE KEY uq_org_email (organization_id, email)', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'uq_org_email');
PREPARE add_idx FROM @add_stmt;
EXECUTE add_idx;
DEALLOCATE PREPARE add_idx
