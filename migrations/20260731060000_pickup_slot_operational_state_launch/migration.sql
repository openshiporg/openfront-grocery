-- Separate operator-owned pickup-slot state from capacity-derived availability.
-- Historical false availability at/above capacity means "full", not closed.
ALTER TABLE "PickupSlot"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "PickupSlot"
SET "isActive" = false
WHERE "isAvailable" = false
  AND COALESCE("currentOrders", 0) < "maxOrders";

UPDATE "PickupSlot"
SET "isAvailable" = ("isActive" AND COALESCE("currentOrders", 0) < "maxOrders");
