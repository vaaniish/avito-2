-- Enforce marketplace invariant: one listing entry in order equals one physical unit.
ALTER TABLE "MarketOrderItem"
ADD CONSTRAINT "MarketOrderItem_quantity_one_check"
CHECK ("quantity" = 1);
