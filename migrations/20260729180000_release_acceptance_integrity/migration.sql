-- Release acceptance integrity: durable checkout recovery, Store ownership, commercial minor-unit authority, and cart clearing.
CREATE TYPE "CheckoutAttemptStatusType" AS ENUM ('pending', 'settled_pending_finalize', 'finalized', 'compensation_required', 'compensated', 'failed');
CREATE TABLE "CheckoutAttempt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL DEFAULT '',
  "providerCode" TEXT NOT NULL DEFAULT '',
  "providerPaymentId" TEXT NOT NULL DEFAULT '',
  "amountCents" INTEGER NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT '',
  "status" "CheckoutAttemptStatusType" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT NOT NULL DEFAULT '',
  "requestData" JSONB DEFAULT '{}',
  "settledAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "compensationAt" TIMESTAMP(3),
  "store" TEXT NOT NULL,
  "cart" TEXT NOT NULL,
  "paymentSession" TEXT NOT NULL,
  "order" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CheckoutAttempt_idempotencyKey_key" ON "CheckoutAttempt"("idempotencyKey");
CREATE INDEX "CheckoutAttempt_store_idx" ON "CheckoutAttempt"("store");
CREATE INDEX "CheckoutAttempt_cart_idx" ON "CheckoutAttempt"("cart");
CREATE INDEX "CheckoutAttempt_paymentSession_idx" ON "CheckoutAttempt"("paymentSession");
CREATE INDEX "CheckoutAttempt_order_idx" ON "CheckoutAttempt"("order");
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_cart_fkey" FOREIGN KEY ("cart") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_paymentSession_fkey" FOREIGN KEY ("paymentSession") REFERENCES "PaymentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustment" ADD COLUMN "store" TEXT;
UPDATE "InventoryAdjustment" ia
SET "store" = il."store"
FROM "InventoryLot" il
WHERE ia."inventoryLot" = il."id";
UPDATE "InventoryAdjustment" ia
SET "store" = p."store"
FROM "Product" p
WHERE ia."store" IS NULL AND ia."product" = p."id";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "InventoryAdjustment" WHERE "store" IS NULL) THEN
    RAISE EXCEPTION 'InventoryAdjustment rows without resolvable Store ownership';
  END IF;
END $$;
ALTER TABLE "InventoryAdjustment" ALTER COLUMN "store" SET NOT NULL;
CREATE INDEX "InventoryAdjustment_store_idx" ON "InventoryAdjustment"("store");
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "Cart" SET "subtotalCents" = ROUND(COALESCE("subtotal", 0)::numeric * 100)::INTEGER WHERE "subtotalCents" <> ROUND(COALESCE("subtotal", 0)::numeric * 100)::INTEGER;
UPDATE "Supplier" SET "minimumOrderCents" = ROUND(COALESCE("minimumOrder", 0)::numeric * 100)::INTEGER WHERE "minimumOrderCents" <> ROUND(COALESCE("minimumOrder", 0)::numeric * 100)::INTEGER;
UPDATE "InventoryLot" SET "costPerUnitCents" = ROUND(COALESCE("costPerUnit", 0)::numeric * 100)::INTEGER WHERE "costPerUnitCents" <> ROUND(COALESCE("costPerUnit", 0)::numeric * 100)::INTEGER;
UPDATE "PurchaseOrder" SET "totalAmountCents" = ROUND(COALESCE("totalAmount", 0)::numeric * 100)::INTEGER WHERE "totalAmountCents" <> ROUND(COALESCE("totalAmount", 0)::numeric * 100)::INTEGER;
UPDATE "POItem" SET "unitCostCents" = ROUND(COALESCE("unitCost", 0)::numeric * 100)::INTEGER WHERE "unitCostCents" <> ROUND(COALESCE("unitCost", 0)::numeric * 100)::INTEGER;
UPDATE "Subscription" SET "discountBps" = ROUND(COALESCE("discount", 0)::numeric * 100)::INTEGER WHERE "discountBps" <> ROUND(COALESCE("discount", 0)::numeric * 100)::INTEGER;

ALTER TABLE "Cart" ADD CONSTRAINT "Cart_subtotalCents_matches_subtotal" CHECK ("subtotalCents" = ROUND("subtotal"::numeric * 100)::INTEGER);
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_minimumOrderCents_matches_minimumOrder" CHECK ("minimumOrderCents" = ROUND("minimumOrder"::numeric * 100)::INTEGER);
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_costPerUnitCents_matches_costPerUnit" CHECK ("costPerUnitCents" = ROUND("costPerUnit"::numeric * 100)::INTEGER);
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_totalAmountCents_matches_totalAmount" CHECK ("totalAmountCents" = ROUND("totalAmount"::numeric * 100)::INTEGER);
ALTER TABLE "POItem" ADD CONSTRAINT "POItem_unitCostCents_matches_unitCost" CHECK ("unitCostCents" = ROUND("unitCost"::numeric * 100)::INTEGER);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_discountBps_matches_discount" CHECK ("discountBps" = ROUND("discount"::numeric * 100)::INTEGER);
