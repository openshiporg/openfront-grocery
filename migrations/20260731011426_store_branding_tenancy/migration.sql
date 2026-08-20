-- Attribute persisted branding and loyalty configuration to one Store. Existing
-- rows can only be backfilled when the historical installation has exactly one
-- Store; ambiguous multi-Store data fails closed for operator remediation.
ALTER TABLE "LoyaltyProgram" ADD COLUMN "store" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "store" TEXT;

UPDATE "LoyaltyProgram"
SET "store" = only_store."id"
FROM (SELECT MIN("id") AS "id" FROM "Store" HAVING COUNT(*) = 1) AS only_store
WHERE "LoyaltyProgram"."store" IS NULL;

UPDATE "StoreSettings"
SET "store" = only_store."id"
FROM (SELECT MIN("id") AS "id" FROM "Store" HAVING COUNT(*) = 1) AS only_store
WHERE "StoreSettings"."store" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "LoyaltyProgram" WHERE "store" IS NULL) THEN
    RAISE EXCEPTION 'Store branding migration found LoyaltyProgram rows in an ambiguous multi-Store database';
  END IF;
  IF EXISTS (SELECT 1 FROM "StoreSettings" WHERE "store" IS NULL) THEN
    RAISE EXCEPTION 'Store branding migration found StoreSettings rows in an ambiguous multi-Store database';
  END IF;
END $$;

ALTER TABLE "LoyaltyProgram" ALTER COLUMN "store" SET NOT NULL;
ALTER TABLE "StoreSettings" ALTER COLUMN "store" SET NOT NULL;

-- The former singleton used integer id=1 without an allocator. Preserve that
-- key and add a sequence for additional Store-owned settings rows.
CREATE SEQUENCE storesettings_id_seq;
SELECT setval('storesettings_id_seq', COALESCE((SELECT MAX("id") FROM "StoreSettings"), 0) + 1, false);
ALTER TABLE "StoreSettings" ALTER COLUMN "id" SET DEFAULT nextval('storesettings_id_seq');
ALTER SEQUENCE storesettings_id_seq OWNED BY "StoreSettings"."id";

CREATE INDEX "LoyaltyProgram_store_idx" ON "LoyaltyProgram"("store");
CREATE UNIQUE INDEX "StoreSettings_store_key" ON "StoreSettings"("store");
CREATE INDEX "StoreSettings_store_idx" ON "StoreSettings"("store");
ALTER TABLE "LoyaltyProgram" ADD CONSTRAINT "LoyaltyProgram_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
