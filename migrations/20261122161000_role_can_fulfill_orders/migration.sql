-- Floor staff: pick, pack and hand off orders without the order desk, refunds or settings.
ALTER TABLE "Role" ADD COLUMN "canFulfillOrders" BOOLEAN NOT NULL DEFAULT false;
-- Everyone who already runs orders can already do this work; keep their access the same.
UPDATE "Role" SET "canFulfillOrders" = true WHERE "canManageOrders" = true;
