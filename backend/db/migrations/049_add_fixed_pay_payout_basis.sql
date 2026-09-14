-- Fixed-pay placements.
--
-- Some placements are paid a flat amount each period regardless of hours worked,
-- with the difference between hours-earned and the flat amount carried on the
-- balance sheet. That is the same mechanic as "run as per LCA wage" -- pay a fixed
-- figure, bank the difference -- so rather than add a parallel concept this
-- generalises how the payout is decided.
--
--   HOURS : payout = approved hours x pay rate      (the default, unchanged)
--   LCA   : payout = lca_wage_per_period            (what run_as_per_lca_wage did)
--   FIXED : payout = fixed_pay_per_period           (new)
--
-- run_as_per_lca_wage is deliberately left in place and kept in sync below. Several
-- queries still read it, so removing it belongs in its own migration once they have
-- all moved over to payout_basis.
--
-- Sitting on placement_type_history means the basis is effective-dated for free: a
-- placement can be HOURS until June and FIXED from July, and each payroll period
-- resolves whichever row was active for it.

ALTER TABLE placement_type_history
    ADD COLUMN payout_basis ENUM('HOURS','LCA','FIXED') NOT NULL DEFAULT 'HOURS' AFTER run_as_per_lca_wage,
    ADD COLUMN fixed_pay_per_period DECIMAL(10,2) NULL AFTER payout_basis;

-- Backfill: every existing row with the LCA flag set becomes basis LCA. Everything
-- else is HOURS, which the column default already gave them.
UPDATE placement_type_history SET payout_basis = 'LCA' WHERE run_as_per_lca_wage = 1;

-- Carry the resolved figures onto the payroll line items, mirroring how
-- lca_wage_per_period is already snapshotted at generation time. Snapshotting
-- matters: a payroll run must keep showing the amount that applied when it was
-- generated, even if the placement is edited afterwards.
ALTER TABLE payroll_run_items
    ADD COLUMN payout_basis ENUM('HOURS','LCA','FIXED') NOT NULL DEFAULT 'HOURS' AFTER lca_wage_per_period,
    ADD COLUMN fixed_pay_per_period DECIMAL(10,2) NULL AFTER payout_basis;

UPDATE payroll_run_items SET payout_basis = 'LCA'
 WHERE lca_wage IS NOT NULL AND lca_wage_per_period IS NOT NULL AND lca_wage_per_period > 0;
