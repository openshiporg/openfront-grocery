-- Cart identity and line-item integrity for the bounded launch.
-- Fail closed on ambiguous ownership or orphan/duplicate cart lines before
-- adding uniqueness and restrictive required relationships.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Cart" WHERE "customer" IS NOT NULL
    GROUP BY "customer" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one active cart per customer: duplicate customer carts exist';
  END IF;
  IF EXISTS (SELECT 1 FROM "CartItem" WHERE "cart" IS NULL OR "product" IS NULL) THEN
    RAISE EXCEPTION 'Cannot require cart-item relationships: orphan cart items exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "CartItem" GROUP BY "cart", "product" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one product line per cart: duplicate cart products exist';
  END IF;
END $$;

-- Keystone text fields are non-null. Give authenticated and historical empty
-- carts collision-free durable identities before making session identity unique.
UPDATE "Cart"
SET "sessionId" = 'user:' || "customer"
WHERE "customer" IS NOT NULL;

UPDATE "Cart"
SET "sessionId" = 'legacy:' || "id"
WHERE "sessionId" = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Cart" GROUP BY "sessionId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce cart session identity: duplicate session carts exist';
  END IF;
END $$;

ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cart_fkey";
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_product_fkey";
DROP INDEX "Cart_sessionId_idx";

ALTER TABLE "CartItem"
  ALTER COLUMN "cart" SET NOT NULL,
  ALTER COLUMN "product" SET NOT NULL;

CREATE UNIQUE INDEX "Cart_customer_key" ON "Cart"("customer");
CREATE UNIQUE INDEX "Cart_sessionId_key" ON "Cart"("sessionId");
CREATE UNIQUE INDEX "CartItem_cart_product_key" ON "CartItem"("cart", "product");

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cart_fkey"
  FOREIGN KEY ("cart") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_product_fkey"
  FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
