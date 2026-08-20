-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "supplierEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "supplierName" TEXT NOT NULL DEFAULT '';

-- Preserve supplier identity for existing procurement evidence before supplier records change.
UPDATE "PurchaseOrder" AS purchase_order
SET
  "supplierName" = supplier."name",
  "supplierEmail" = supplier."email"
FROM "Supplier" AS supplier
WHERE purchase_order."supplier" = supplier."id";
