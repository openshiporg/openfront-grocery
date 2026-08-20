-- First-class Store tenant. Existing Juniper Market data is backfilled atomically.
CREATE TABLE "Store" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  "currencyCode" TEXT NOT NULL DEFAULT 'USD',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");
INSERT INTO "Store" ("id", "code", "name") VALUES ('store_juniper', 'juniper-market', 'Juniper Market');

ALTER TABLE "User" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "Cart" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "Order" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "Product" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "Supplier" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "InventoryLot" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "DeliverySlot" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "PickupSlot" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "ParkingSpot" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "DeliveryRoute" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "PurchaseOrder" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "Payment" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';
ALTER TABLE "GroceryOutboxEvent" ADD COLUMN "store" TEXT NOT NULL DEFAULT 'store_juniper';

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['User','Cart','Order','Product','Supplier','InventoryLot','DeliverySlot','PickupSlot','ParkingSpot','DeliveryRoute','PurchaseOrder','Payment','GroceryOutboxEvent']
  LOOP
    EXECUTE format('CREATE INDEX %I ON %I ("store")', table_name || '_store_idx', table_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE', table_name, table_name || '_store_fkey');
  END LOOP;
END $$;
