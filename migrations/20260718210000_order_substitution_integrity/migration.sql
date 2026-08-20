-- Relate immutable picker substitution evidence to its order line and operator.
ALTER TABLE "OrderItemSubstitution"
  ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lineItem" TEXT,
  ADD COLUMN "recordedBy" TEXT;

-- Existing Grocery runtime rows were audited before this migration. If a legacy
-- text ID points at a live line item, preserve it as the relational owner.
UPDATE "OrderItemSubstitution" AS substitution
SET "lineItem" = substitution."orderItem"
WHERE EXISTS (
  SELECT 1 FROM "OrderLineItem" AS line_item
  WHERE line_item."id" = substitution."orderItem"
);

-- Give any retained legacy row a deterministic retry identity.
UPDATE "OrderItemSubstitution"
SET "idempotencyKey" = 'legacy-substitution:' || "id"
WHERE "idempotencyKey" = '';

CREATE UNIQUE INDEX "OrderItemSubstitution_idempotencyKey_key"
  ON "OrderItemSubstitution"("idempotencyKey");
CREATE INDEX "OrderItemSubstitution_lineItem_idx"
  ON "OrderItemSubstitution"("lineItem");
CREATE INDEX "OrderItemSubstitution_recordedBy_idx"
  ON "OrderItemSubstitution"("recordedBy");

ALTER TABLE "OrderItemSubstitution"
  ADD CONSTRAINT "OrderItemSubstitution_lineItem_fkey"
  FOREIGN KEY ("lineItem") REFERENCES "OrderLineItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItemSubstitution"
  ADD CONSTRAINT "OrderItemSubstitution_recordedBy_fkey"
  FOREIGN KEY ("recordedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
