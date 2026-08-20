-- Durable, append-only Grocery lifecycle event snapshots with mutable delivery state.
CREATE TABLE "GroceryOutboxEvent" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL DEFAULT '',
  "eventType" TEXT NOT NULL DEFAULT '',
  "aggregateType" TEXT NOT NULL DEFAULT '',
  "aggregateId" TEXT NOT NULL DEFAULT '',
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB,
  "payloadHash" TEXT NOT NULL DEFAULT '',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER DEFAULT 0,
  "claimToken" TEXT NOT NULL DEFAULT '',
  "claimedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroceryOutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GroceryOutboxEvent_status_check" CHECK ("status" IN ('pending', 'processing', 'delivered', 'failed')),
  CONSTRAINT "GroceryOutboxEvent_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "GroceryOutboxEvent_identity_check" CHECK (
    "eventKey" <> '' AND "eventType" <> '' AND "aggregateType" <> '' AND
    "aggregateId" <> '' AND "payloadHash" <> '' AND "schemaVersion" >= 1
  )
);

CREATE UNIQUE INDEX "GroceryOutboxEvent_eventKey_key" ON "GroceryOutboxEvent"("eventKey");
CREATE INDEX "GroceryOutboxEvent_aggregateId_idx" ON "GroceryOutboxEvent"("aggregateId");
CREATE INDEX "GroceryOutboxEvent_occurredAt_idx" ON "GroceryOutboxEvent"("occurredAt");
CREATE INDEX "GroceryOutboxEvent_status_idx" ON "GroceryOutboxEvent"("status");
CREATE INDEX "GroceryOutboxEvent_pending_claim_idx"
  ON "GroceryOutboxEvent"("occurredAt", "id") WHERE "status" = 'pending';

CREATE OR REPLACE FUNCTION grocery_outbox_event_immutable()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Grocery outbox event evidence cannot be deleted';
  END IF;
  IF OLD."eventKey" IS DISTINCT FROM NEW."eventKey"
    OR OLD."eventType" IS DISTINCT FROM NEW."eventType"
    OR OLD."aggregateType" IS DISTINCT FROM NEW."aggregateType"
    OR OLD."aggregateId" IS DISTINCT FROM NEW."aggregateId"
    OR OLD."schemaVersion" IS DISTINCT FROM NEW."schemaVersion"
    OR OLD."payload" IS DISTINCT FROM NEW."payload"
    OR OLD."payloadHash" IS DISTINCT FROM NEW."payloadHash"
    OR OLD."occurredAt" IS DISTINCT FROM NEW."occurredAt"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Grocery outbox event identity and payload are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GroceryOutboxEvent_immutable"
BEFORE UPDATE OR DELETE ON "GroceryOutboxEvent"
FOR EACH ROW EXECUTE FUNCTION grocery_outbox_event_immutable();
