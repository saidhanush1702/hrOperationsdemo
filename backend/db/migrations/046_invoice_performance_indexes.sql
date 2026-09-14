-- Invoice list performance.
--
-- The invoices list filters on organization_id and sorts by period_end DESC,
-- created_at DESC. With only the single-column organization_id index MySQL
-- matched ~2.4k rows then sorted them all on every request (Using filesort).
-- A composite index carrying the sort order lets it read rows already ordered,
-- which also makes LIMIT/OFFSET pagination cheap -- the server can stop after
-- the first page instead of sorting the whole set to find 20 rows.
--
-- Both indexes are created conditionally. MySQL has no CREATE INDEX IF NOT
-- EXISTS, so each one checks information_schema first and becomes a no-op when
-- the index is already present. That makes this file safe to re-run and safe on
-- a database where the index was added by hand.

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'invoices'
               AND INDEX_NAME = 'idx_inv_org_period');
SET @ddl := IF(@idx > 0,
               'SELECT 1',
               'CREATE INDEX idx_inv_org_period ON invoices(organization_id, period_end DESC, created_at DESC)');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Past-due sweep (invoiceCron) and the dashboard past-due tile both filter
-- organization_id + status_id + due_date. Without this it resolves through the
-- single-column status_id index and re-checks the rest with a WHERE.

SET @idx2 := (SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'invoices'
                AND INDEX_NAME = 'idx_inv_org_status_due');
SET @ddl2 := IF(@idx2 > 0,
                'SELECT 1',
                'CREATE INDEX idx_inv_org_status_due ON invoices(organization_id, status_id, due_date)');
PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
