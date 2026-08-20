-- Keystone relationship fields are nullable by default. Grocery's Store and
-- refund ownership FKs are lifecycle identities, so retain the stricter
-- constraints explicitly after generated schema migrations.

UPDATE "Department" SET "store" = 'store_juniper' WHERE "store" IS NULL;
UPDATE "Coupon" SET "store" = 'store_juniper' WHERE "store" IS NULL;

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['User','Cart','Order','Product','Supplier','InventoryLot','DeliverySlot','PickupSlot','ParkingSpot','DeliveryRoute','PurchaseOrder','Payment','GroceryOutboxEvent','Department','Coupon']
  LOOP
    EXECUTE format('UPDATE %I SET "store" = ''store_juniper'' WHERE "store" IS NULL', table_name);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', table_name, table_name || '_store_fkey');
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "store" SET DEFAULT ''store_juniper''', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "store" SET NOT NULL', table_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE', table_name, table_name || '_store_fkey');
  END LOOP;
END $$;

ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_deliverySlot_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_pickupSlot_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliverySlot_fkey" FOREIGN KEY ("deliverySlot") REFERENCES "DeliverySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupSlot_fkey" FOREIGN KEY ("pickupSlot") REFERENCES "PickupSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "PaymentRefund" SET "payment" = NULL WHERE "payment" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Payment" WHERE "Payment"."id" = "PaymentRefund"."payment");
UPDATE "PaymentRefund" SET "requestedBy" = NULL WHERE "requestedBy" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "PaymentRefund"."requestedBy");
ALTER TABLE "PaymentRefund" DROP CONSTRAINT IF EXISTS "PaymentRefund_payment_fkey";
ALTER TABLE "PaymentRefund" DROP CONSTRAINT IF EXISTS "PaymentRefund_requestedBy_fkey";
ALTER TABLE "PaymentRefund" ALTER COLUMN "payment" SET NOT NULL;
ALTER TABLE "PaymentRefund" ALTER COLUMN "requestedBy" SET NOT NULL;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
