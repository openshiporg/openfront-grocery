-- Add a nullable key so historical purchase orders remain valid while all
-- workflow-created drafts receive a durable unique idempotency identity.
ALTER TABLE "PurchaseOrder" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "PurchaseOrder_idempotencyKey_key"
ON "PurchaseOrder"("idempotencyKey");
