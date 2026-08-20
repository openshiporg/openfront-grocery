-- Additive authoritative minor-unit facts for procurement and supplier data.
ALTER TABLE "Supplier" ADD COLUMN "minimumOrderCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryLot" ADD COLUMN "costPerUnitCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN "totalAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "POItem" ADD COLUMN "unitCostCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "discountBps" INTEGER NOT NULL DEFAULT 0;

UPDATE "Supplier" SET "minimumOrderCents" = ROUND(COALESCE("minimumOrder", 0) * 100)::INTEGER;
UPDATE "InventoryLot" SET "costPerUnitCents" = ROUND(COALESCE("costPerUnit", 0) * 100)::INTEGER;
UPDATE "PurchaseOrder" SET "totalAmountCents" = ROUND(COALESCE("totalAmount", 0) * 100)::INTEGER;
UPDATE "POItem" SET "unitCostCents" = ROUND(COALESCE("unitCost", 0) * 100)::INTEGER;
UPDATE "Subscription" SET "discountBps" = ROUND(COALESCE("discount", 0) * 100)::INTEGER;

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_minimumOrderCents_nonnegative" CHECK ("minimumOrderCents" >= 0);
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_costPerUnitCents_nonnegative" CHECK ("costPerUnitCents" >= 0);
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_totalAmountCents_nonnegative" CHECK ("totalAmountCents" >= 0);
ALTER TABLE "POItem" ADD CONSTRAINT "POItem_unitCostCents_nonnegative" CHECK ("unitCostCents" >= 0);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_discountBps_range" CHECK ("discountBps" BETWEEN 0 AND 10000);
