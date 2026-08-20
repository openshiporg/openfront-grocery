-- Scope authorization roles to one Store. Refuse ambiguous historical roles
-- instead of guessing across tenants.
ALTER TABLE "Role" ADD COLUMN "store" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "role" IS NOT NULL
    GROUP BY "role"
    HAVING COUNT(DISTINCT "store") > 1
  ) THEN
    RAISE EXCEPTION 'Role tenancy migration found a role assigned across multiple Stores';
  END IF;
END $$;

UPDATE "Role" AS role
SET "store" = owner."store"
FROM (
  SELECT "role", MIN("store") AS "store"
  FROM "User"
  WHERE "role" IS NOT NULL
  GROUP BY "role"
) AS owner
WHERE owner."role" = role."id";

-- A fresh/canonical Grocery installation has one Store. Unassigned roles can be
-- attributed only when that ownership is unambiguous; otherwise fail closed.
UPDATE "Role"
SET "store" = only_store."id"
FROM (
  SELECT MIN("id") AS "id"
  FROM "Store"
  HAVING COUNT(*) = 1
) AS only_store
WHERE "Role"."store" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Role" WHERE "store" IS NULL) THEN
    RAISE EXCEPTION 'Role tenancy migration found unassigned roles in a multi-Store database';
  END IF;
END $$;

ALTER TABLE "Role" ALTER COLUMN "store" SET NOT NULL;
CREATE INDEX "Role_store_idx" ON "Role"("store");
ALTER TABLE "Role" ADD CONSTRAINT "Role_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
