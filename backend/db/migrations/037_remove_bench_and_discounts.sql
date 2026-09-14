-- Drop placement_discounts — orphaned table, fully superseded by placement_bill_rates.discount_percentage
DROP TABLE IF EXISTS placement_discounts;

-- Remove Bench pay type.
-- The placements FK (pay_type_id → lkp_pay_types.id ON DELETE SET NULL) will automatically
-- set pay_type_id = NULL on any placement that was using Bench.
DELETE FROM lkp_pay_types WHERE name = 'Bench';
