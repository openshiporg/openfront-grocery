-- Re-audit closure: backfill commercial minor units and durable evidence before tightening constraints.
ALTER TYPE "PaymentWebhookEventStatusType" ADD VALUE 'unmatched';

ALTER TABLE "Payment" ADD COLUMN "amountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "deliveryTipCents" INTEGER NOT NULL DEFAULT 0;
UPDATE "Payment" SET "amountCents" = ROUND(COALESCE("amount", 0) * 100)::INTEGER WHERE "amountCents" = 0;
UPDATE "Payment" SET "deliveryTipCents" = ROUND(COALESCE("deliveryTipAmount", 0) * 100)::INTEGER WHERE "deliveryTipCents" = 0;

ALTER TABLE "PaymentSession" ADD COLUMN "reservedOrderDisplayId" INTEGER;
UPDATE "PaymentSession" SET "amountCents" = ROUND(COALESCE("amount", 0) * 100)::INTEGER WHERE "amountCents" = 0;
WITH numbered AS (
  SELECT "id", (COALESCE((SELECT MAX("displayId") FROM "Order"), 1000) + ROW_NUMBER() OVER (ORDER BY "createdAt", "id"))::INTEGER AS reserved_id
  FROM "PaymentSession" WHERE "reservedOrderDisplayId" IS NULL
)
UPDATE "PaymentSession" ps SET "reservedOrderDisplayId" = numbered.reserved_id FROM numbered WHERE ps."id" = numbered."id";

UPDATE "Product" SET "priceCents" = ROUND(COALESCE("price", 0) * 100)::INTEGER WHERE "priceCents" = 0 AND COALESCE("price", 0) <> 0;
UPDATE "Product" SET "costPriceCents" = ROUND(COALESCE("costPrice", 0) * 100)::INTEGER WHERE "costPriceCents" = 0 AND COALESCE("costPrice", 0) <> 0;
UPDATE "CartItem" ci SET "subtotalCents" = ROUND(COALESCE(p."priceCents", 0) * ci."quantity") FROM "Product" p WHERE ci."product" = p."id";
UPDATE "Cart" c SET "subtotalCents" = COALESCE((SELECT SUM(ci."subtotalCents") FROM "CartItem" ci WHERE ci."cart" = c."id"), 0);
UPDATE "Coupon" SET "discountValueCents" = ROUND(COALESCE("discountValue", 0) * 100)::INTEGER WHERE "discountValueCents" = 0 AND "discountType" = 'fixed';
UPDATE "Coupon" SET "minPurchaseCents" = ROUND(COALESCE("minPurchase", 0) * 100)::INTEGER WHERE "minPurchaseCents" = 0 AND COALESCE("minPurchase", 0) <> 0;
UPDATE "OrderLineItem" SET "unitPriceCents" = ROUND(COALESCE("unitPrice", 0) * 100)::INTEGER WHERE "unitPriceCents" = 0 AND COALESCE("unitPrice", 0) <> 0;
WITH order_totals AS (
  SELECT o."id", COALESCE(SUM(li."unitPriceCents" * li."quantity"), 0)::INTEGER AS subtotal_cents
  FROM "Order" o LEFT JOIN "OrderLineItem" li ON li."order" = o."id" GROUP BY o."id"
)
UPDATE "Order" o SET "subtotalCents" = t.subtotal_cents, "taxCents" = ROUND(t.subtotal_cents * COALESCE(o."taxRate", 0))::INTEGER, "deliveryFeeCents" = COALESCE(o."deliveryFeeCents", 0), "discountCents" = COALESCE(o."discountCents", 0), "totalCents" = GREATEST(0, t.subtotal_cents + ROUND(t.subtotal_cents * COALESCE(o."taxRate", 0))::INTEGER + COALESCE(o."deliveryFeeCents", 0) - COALESCE(o."discountCents", 0)) FROM order_totals t WHERE o."id" = t."id";

ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "store" TEXT;
UPDATE "PaymentWebhookEvent" e SET "store" = COALESCE(p."store", 'store_juniper') FROM "Payment" p WHERE e."payment" = p."id";
UPDATE "PaymentWebhookEvent" SET "store" = 'store_juniper' WHERE "store" IS NULL;
ALTER TABLE "PaymentWebhookEvent" ALTER COLUMN "store" SET NOT NULL;

ALTER TABLE "OrderLineItem" DROP CONSTRAINT "OrderLineItem_order_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_order_fkey";
ALTER TABLE "Cart" ALTER COLUMN "subtotalCents" SET NOT NULL;
ALTER TABLE "CartItem" ALTER COLUMN "subtotalCents" SET NOT NULL;
ALTER TABLE "Coupon" ALTER COLUMN "discountValueCents" SET NOT NULL, ALTER COLUMN "minPurchaseCents" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "deliveryFeeCents" SET NOT NULL, ALTER COLUMN "discountCents" SET NOT NULL, ALTER COLUMN "subtotalCents" SET NOT NULL, ALTER COLUMN "taxCents" SET NOT NULL, ALTER COLUMN "totalCents" SET NOT NULL;
ALTER TABLE "OrderLineItem" ALTER COLUMN "order" SET NOT NULL, ALTER COLUMN "unitPriceCents" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "order" SET NOT NULL;
ALTER TABLE "PaymentSession" ALTER COLUMN "amountCents" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "costPriceCents" SET NOT NULL, ALTER COLUMN "priceCents" SET NOT NULL;

CREATE TABLE "OrderLineInventoryAllocation" (
    "id" TEXT NOT NULL,
    "lineItem" TEXT NOT NULL,
    "inventoryLot" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "provenance" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderLineInventoryAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderLineInventoryAllocation_lineItem_idx" ON "OrderLineInventoryAllocation"("lineItem");
CREATE INDEX "OrderLineInventoryAllocation_inventoryLot_idx" ON "OrderLineInventoryAllocation"("inventoryLot");
CREATE INDEX "OrderLineInventoryAllocation_store_idx" ON "OrderLineInventoryAllocation"("store");
CREATE UNIQUE INDEX "PaymentSession_reservedOrderDisplayId_key" ON "PaymentSession"("reservedOrderDisplayId");
CREATE INDEX "PaymentWebhookEvent_store_idx" ON "PaymentWebhookEvent"("store");

ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLineInventoryAllocation" ADD CONSTRAINT "OrderLineInventoryAllocation_lineItem_fkey" FOREIGN KEY ("lineItem") REFERENCES "OrderLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLineInventoryAllocation" ADD CONSTRAINT "OrderLineInventoryAllocation_inventoryLot_fkey" FOREIGN KEY ("inventoryLot") REFERENCES "InventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLineInventoryAllocation" ADD CONSTRAINT "OrderLineInventoryAllocation_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
