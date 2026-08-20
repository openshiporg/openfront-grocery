-- AlterTable
ALTER TABLE "POItem" ADD COLUMN     "productSku" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "productTitle" TEXT NOT NULL DEFAULT '';

-- Preserve product identity for existing procurement evidence before catalog records change.
UPDATE "POItem" AS item
SET
  "productTitle" = product."title",
  "productSku" = product."sku"
FROM "Product" AS product
WHERE item."product" = product."id";
