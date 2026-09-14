-- ============================================================================
--  FIX: Mallika Aalla — timesheets of TWO placements loaded onto ONE (1132)
-- ============================================================================
--
--  EVIDENCE (verified against the source Access file Molina_Data.mdb)
--
--    SOURCE                                    OURS
--    EF120151256240  Sun-start  41 ts  1480h   placement 1132 (week_start_day=Sunday, C2C)
--    EF120151256223  Mon-start  41 ts  1416h   placement 1117 (week_start_day=Monday, W2)
--
--    Placement 1132 currently holds ALL 82 timesheets (1480 + 1416 = 2896 h).
--    Placement 1117 holds 0 timesheets.
--
--    Confirmed by four independent signals:
--      1. week_start_day  : 1132=Sunday, 1117=Monday  -> matches each source series
--      2. end_date        : 1132=2022-04-09, 1117=2022-04-10 -> matches each series
--      3. timesheet hours : Sunday series=1480, Monday series=1416
--      4. invoice hours   : 1132 invoices total 1480, 1117 invoices total 1416
--
--    So the Monday-start series (41 timesheets, 1416 h) belongs on 1117.
--    This is misassigned data, not duplicate data. No hours are created or
--    destroyed - they are moved to the placement they were always billed under.
--
--  WHAT THIS SCRIPT DOES
--    Re-points the 41 Monday-start timesheets from placement 1132 to 1117, and
--    re-links each one to the matching 1117 invoice for the same period.
--    timesheet_entries follow automatically (they reference timesheet_id).
--
--  Run inside a transaction. Verify the "AFTER" numbers, then COMMIT.
-- ============================================================================

START TRANSACTION;

-- ---------------------------------------------------------------- BEFORE ----
-- Expect: 1132 -> 82 timesheets / 2896.00 h     1117 -> 0 timesheets / NULL
SELECT p.placement_code,
       COUNT(t.id)                AS timesheets,
       ROUND(SUM(t.total_hours),2) AS hours
FROM placements p
LEFT JOIN timesheets t ON t.placement_id = p.id
JOIN employees e ON e.id = p.employee_id
WHERE p.placement_code IN ('1117','1132')
  AND e.first_name = 'Mallika' AND e.last_name = 'Aalla'
GROUP BY p.placement_code;

-- ---------------------------------------------------------------- THE FIX ---
UPDATE timesheets t
JOIN placements p_old
       ON p_old.id              = t.placement_id
      AND p_old.placement_code  = '1132'
JOIN employees emp
       ON emp.id                = p_old.employee_id
      AND emp.first_name        = 'Mallika'
      AND emp.last_name         = 'Aalla'
JOIN placements p_new
       ON p_new.placement_code  = '1117'
      AND p_new.organization_id = p_old.organization_id
      AND p_new.employee_id     = p_old.employee_id
-- primary link rule: the 1117 invoice whose period contains the timesheet START
LEFT JOIN invoices i_start
       ON i_start.placement_id  = p_new.id
      AND t.start_date BETWEEN i_start.period_start AND i_start.period_end
-- fallback for the single timesheet starting 2021-06-28, before 1117's first invoice
LEFT JOIN invoices i_end
       ON i_end.placement_id    = p_new.id
      AND t.end_date   BETWEEN i_end.period_start   AND i_end.period_end
SET t.placement_id = p_new.id,
    t.invoice_id   = COALESCE(i_start.id, i_end.id)
WHERE DAYOFWEEK(t.start_date) = 2;   -- 1=Sunday, 2=Monday

-- Expect: 41 rows affected.

-- ----------------------------------------------------------------- AFTER ----
-- Expect: 1132 -> 41 timesheets / 1480.00 h     1117 -> 41 timesheets / 1416.00 h
SELECT p.placement_code,
       COUNT(t.id)                 AS timesheets,
       ROUND(SUM(t.total_hours),2) AS hours,
       SUM(t.invoice_id IS NULL)   AS unlinked_timesheets
FROM placements p
LEFT JOIN timesheets t ON t.placement_id = p.id
JOIN employees e ON e.id = p.employee_id
WHERE p.placement_code IN ('1117','1132')
  AND e.first_name = 'Mallika' AND e.last_name = 'Aalla'
GROUP BY p.placement_code;

-- Timesheet hours must now equal invoice hours on BOTH placements.
-- Expect both rows to read: hours_match = 1
SELECT p.placement_code,
       ROUND(SUM(DISTINCT_TS.h),2) AS timesheet_hours,
       ROUND(inv.h,2)              AS invoice_hours,
       (ABS(SUM(DISTINCT_TS.h) - inv.h) < 0.01) AS hours_match
FROM placements p
JOIN employees e ON e.id = p.employee_id
JOIN LATERAL (SELECT SUM(t.total_hours) h FROM timesheets t
              WHERE t.placement_id = p.id) DISTINCT_TS ON TRUE
JOIN LATERAL (SELECT SUM(i.total_hours) h FROM invoices i
              WHERE i.placement_id = p.id) inv ON TRUE
WHERE p.placement_code IN ('1117','1132')
  AND e.first_name = 'Mallika' AND e.last_name = 'Aalla'
GROUP BY p.placement_code, inv.h;

-- No work_date may now be counted twice on either placement.
-- Expect: 0 rows.
SELECT p.placement_code, te.work_date, COUNT(*) AS times_counted
FROM timesheet_entries te
JOIN timesheets t  ON t.id = te.timesheet_id
JOIN placements p  ON p.id = t.placement_id
JOIN employees e   ON e.id = p.employee_id
WHERE e.first_name = 'Mallika' AND e.last_name = 'Aalla'
GROUP BY p.placement_code, te.work_date
HAVING COUNT(*) > 1;

-- ============================================================================
--  COMMIT
--  ------
--  The transaction is committed automatically below, so this file can be piped
--  straight into mysql:
--
--      mysql -h 127.0.0.1 -u root -p demo_hr_operations < fix_1132_misassigned_timesheets.sql
--
--  The verification output above is still printed - read it after the run to
--  confirm 1117 = 41 ts / 1416.00 h and 1132 = 41 ts / 1480.00 h, both with
--  hours_match = 1 and no duplicate work_date rows.
--
--  To inspect BEFORE committing instead, comment out the COMMIT below and run
--  the file interactively with `source`, then type COMMIT; or ROLLBACK; yourself.
-- ============================================================================

COMMIT;

-- Final confirmation after commit.
SELECT p.placement_code,
       COUNT(t.id)                 AS timesheets,
       ROUND(SUM(t.total_hours),2) AS hours
FROM placements p
LEFT JOIN timesheets t ON t.placement_id = p.id
JOIN employees e ON e.id = p.employee_id
WHERE p.placement_code IN ('1117','1132')
  AND e.first_name = 'Mallika' AND e.last_name = 'Aalla'
GROUP BY p.placement_code;
