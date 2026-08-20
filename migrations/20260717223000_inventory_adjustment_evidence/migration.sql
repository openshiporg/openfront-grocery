-- CreateEnum
CREATE TYPE "InventoryAdjustmentReasonType" AS ENUM ('cycle_count', 'damage', 'spoilage', 'correction');

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "inStock" SET DEFAULT false;

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "reason" "InventoryAdjustmentReasonType" NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "productStockBefore" INTEGER NOT NULL,
    "productStockAfter" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "product" TEXT,
    "inventoryLot" TEXT,
    "adjustedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAdjustment_idempotencyKey_key" ON "InventoryAdjustment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_product_idx" ON "InventoryAdjustment"("product");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_inventoryLot_idx" ON "InventoryAdjustment"("inventoryLot");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_adjustedBy_idx" ON "InventoryAdjustment"("adjustedBy");

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_inventoryLot_fkey" FOREIGN KEY ("inventoryLot") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_adjustedBy_fkey" FOREIGN KEY ("adjustedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
