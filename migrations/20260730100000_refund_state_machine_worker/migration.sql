-- Exhaustive refund states, provider ordering evidence, and durable worker lease/retry fields.
ALTER TYPE "PaymentRefundStatusType" ADD VALUE IF NOT EXISTS 'canceled';

ALTER TABLE "PaymentRefund"
  ADD COLUMN "providerEventId" TEXT,
  ADD COLUMN "providerEventCreatedAt" TIMESTAMP(3),
  ADD COLUMN "providerEventVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reconciliationOwner" TEXT,
  ADD COLUMN "reconciliationToken" TEXT,
  ADD COLUMN "reconciliationLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationDeadLetterAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationLastError" TEXT;

ALTER TABLE "PaymentWebhookEvent"
  ADD COLUMN "providerCreatedAt" TIMESTAMP(3),
  ADD COLUMN "providerVersion" INTEGER NOT NULL DEFAULT 0;
