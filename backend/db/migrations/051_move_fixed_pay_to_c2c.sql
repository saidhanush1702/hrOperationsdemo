-- Move fixed-pay from W2 to C2C.
--
-- Fixed pay was first built as a third W2 payout basis alongside HOURS and LCA,
-- on the reasoning that "pay a set figure, bank the difference" is one mechanic.
-- That was the wrong home for it. W2 and C2C reach the balance sheet by opposite
-- routes:
--
--   W2  : payroll ACCRUES the buffer (earned - paid) onto the balance sheet.
--   C2C : a PAID INVOICE accrues the full earnings onto the balance sheet, and
--         payroll DRAWS DOWN against that accrued balance.
--
-- So a fixed-pay C2C placement is not "hours minus a flat figure" at all. The
-- invoice-paid ledger keeps accruing at the pay rate exactly as it always has,
-- and each payroll period withdraws the flat figure from the running balance.
-- The remainder stays with the employee as their carried balance.
--
-- W2 therefore returns to HOURS | LCA only. The payout_basis enum keeps its
-- FIXED member, but FIXED is now valid solely on a C2C placement.

-- 1. Return the W2 placements that were put on FIXED to hourly. Their fixed
--    figure is dropped: there is no W2 fixed-pay concept for it to mean anything
--    under any more.
UPDATE placement_type_history pth
  JOIN lkp_pay_types pt ON pth.pay_type_id = pt.id
   SET pth.payout_basis = 'HOURS',
       pth.fixed_pay_per_period = NULL
 WHERE pt.name = 'W2' AND pth.payout_basis = 'FIXED';

-- 2. Same for any payroll line item generated under the old W2 flow. These rows
--    belong to DRAFT runs (a submitted run's items are never regenerated), so
--    resetting the basis simply makes them regenerate as hourly on next refresh.
UPDATE payroll_run_items SET payout_basis = 'HOURS', fixed_pay_per_period = NULL
 WHERE payout_basis = 'FIXED';

-- 3. The balance snapshot a C2C fixed-pay line item draws against.
--
--    Snapshotted for the same reason lca_wage_per_period is: a submitted run must
--    keep showing the figures that applied when it was generated, even though the
--    employee's live balance moves every time another invoice is paid.
ALTER TABLE payroll_run_items
    ADD COLUMN balance_snapshot DECIMAL(12,2) NULL AFTER fixed_pay_per_period;
