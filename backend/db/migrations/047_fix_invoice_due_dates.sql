-- Re-anchor due dates that were written with the old formula.
--
-- Due date used to be calculated as period_end + net_terms. It is now
-- issue_date + net_terms, matching the legacy system and set once, at the moment
-- the invoice is issued (Ready to Send to Open). This migration repairs the rows
-- written before that change.
--
-- Scope: app-generated invoices only (invoice_number LIKE 'INV-%').
-- Invoices imported from the old portal keep their original due dates: those were
-- calculated correctly against the net terms in force at the time, and recomputing
-- them with today's terms would corrupt dates that are already right.
--
-- Three changes are applied per matching row, in a single statement so the WHERE
-- still matches while they are made:
--
--   1. due_date      re-anchored to issue_date + net_terms (plain calendar days)
--   2. status_id     a Past Due invoice (5) whose corrected due date has not yet
--                    passed goes back to Open (4). It was only flagged overdue
--                    because the wrong formula backdated it. Nothing else moves an
--                    invoice from 5 back to 4 -- the nightly sweep only goes 4 to 5
--                    -- so without this those rows would stay wrongly Past Due.
--   3. invoice_file_path set to NULL, so the stored PDF is rebuilt on next open
--                    and prints the corrected due date. The old file is left on
--                    disk, orphaned but harmless.
--
-- net_terms falls back to 30 when a placement has no invoice_settings row, which
-- is the same default the application uses at runtime.
--
-- Idempotent: rows already satisfying due_date = issue_date + net_terms are
-- excluded by the WHERE, so a re-run matches nothing.
--
-- Expected volume on the dev database at the time of writing: 32 rows
-- (19 Open, 8 Past Due, 5 Paid), of which 8 return from Past Due to Open.
-- Production counts will differ.

UPDATE invoices i
LEFT JOIN invoice_settings ise ON ise.placement_id = i.placement_id
SET i.due_date = DATE_ADD(i.issue_date, INTERVAL COALESCE(ise.net_terms, 30) DAY),
    i.status_id = CASE
        WHEN i.status_id = 5
         AND DATE_ADD(i.issue_date, INTERVAL COALESCE(ise.net_terms, 30) DAY) >= CURDATE()
        THEN 4
        ELSE i.status_id
    END,
    i.invoice_file_path = NULL
WHERE i.invoice_number LIKE 'INV-%'
  AND i.issue_date IS NOT NULL
  AND i.due_date   IS NOT NULL
  AND DATEDIFF(i.due_date, i.issue_date) <> COALESCE(ise.net_terms, 30);
