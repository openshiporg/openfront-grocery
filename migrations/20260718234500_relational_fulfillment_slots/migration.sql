ALTER TABLE "Order" ADD COLUMN "deliverySlot" TEXT;
ALTER TABLE "Order" ADD COLUMN "pickupSlot" TEXT;

UPDATE "Order" AS orders
SET "deliverySlot" = orders."metadata"->>'deliverySlotId'
WHERE orders."metadata"->>'deliverySlotId' IS NOT NULL
  AND EXISTS (SELECT 1 FROM "DeliverySlot" slots WHERE slots."id" = orders."metadata"->>'deliverySlotId' AND slots."store" = orders."store");
UPDATE "Order" AS orders
SET "pickupSlot" = orders."metadata"->>'pickupSlotId'
WHERE orders."metadata"->>'pickupSlotId' IS NOT NULL
  AND EXISTS (SELECT 1 FROM "PickupSlot" slots WHERE slots."id" = orders."metadata"->>'pickupSlotId' AND slots."store" = orders."store");

CREATE INDEX "Order_deliverySlot_idx" ON "Order"("deliverySlot");
CREATE INDEX "Order_pickupSlot_idx" ON "Order"("pickupSlot");
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliverySlot_fkey" FOREIGN KEY ("deliverySlot") REFERENCES "DeliverySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupSlot_fkey" FOREIGN KEY ("pickupSlot") REFERENCES "PickupSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
