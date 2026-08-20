-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "subtotalCents" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "subtotalCents" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "discountValueCents" INTEGER DEFAULT 0,
ADD COLUMN     "minPurchaseCents" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "deliveryFeeCents" INTEGER DEFAULT 0,
ADD COLUMN     "discountCents" INTEGER DEFAULT 0,
ADD COLUMN     "subtotalCents" INTEGER DEFAULT 0,
ADD COLUMN     "taxCents" INTEGER DEFAULT 0,
ADD COLUMN     "totalCents" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderLineItem" ADD COLUMN     "unitPriceCents" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentSession" ADD COLUMN     "amountCents" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costPriceCents" INTEGER DEFAULT 0,
ADD COLUMN     "priceCents" INTEGER DEFAULT 0;

-- Backfill authoritative minor-unit facts from the legacy display values.
UPDATE "Product" SET "priceCents" = GREATEST(0, ROUND(COALESCE("price", 0) * 100)::int), "costPriceCents" = GREATEST(0, ROUND(COALESCE("costPrice", 0) * 100)::int);
UPDATE "CartItem" SET "subtotalCents" = GREATEST(0, ROUND(COALESCE("subtotal", 0) * 100)::int);
UPDATE "Cart" SET "subtotalCents" = GREATEST(0, ROUND(COALESCE("subtotal", 0) * 100)::int);
UPDATE "Coupon" SET "discountValueCents" = GREATEST(0, ROUND(COALESCE("discountValue", 0) * 100)::int), "minPurchaseCents" = GREATEST(0, ROUND(COALESCE("minPurchase", 0) * 100)::int);
UPDATE "OrderLineItem" SET "unitPriceCents" = GREATEST(0, ROUND(COALESCE("unitPrice", 0) * 100)::int);
UPDATE "PaymentSession" SET "amountCents" = GREATEST(0, ROUND(COALESCE("amount", 0) * 100)::int);
UPDATE "Order" SET
  "subtotalCents" = GREATEST(0, ROUND(COALESCE(NULLIF("metadata"->>'subtotal', '')::numeric, 0) * 100)::int),
  "taxCents" = GREATEST(0, ROUND(COALESCE(NULLIF("metadata"->>'taxAmount', '')::numeric, 0) * 100)::int),
  "deliveryFeeCents" = GREATEST(0, ROUND(COALESCE(NULLIF("metadata"->>'deliveryFee', '')::numeric, 0) * 100)::int),
  "discountCents" = GREATEST(0, ROUND(COALESCE(NULLIF("metadata"->>'discount', '')::numeric, 0) * 100)::int),
  "totalCents" = GREATEST(0, ROUND(COALESCE(NULLIF("metadata"->>'orderTotal', '')::numeric, 0) * 100)::int);
