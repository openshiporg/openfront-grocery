-- Serialize checkout recovery workers with a lease and monotonic fencing token.
ALTER TYPE "CheckoutAttemptStatusType" ADD VALUE IF NOT EXISTS 'finalizing';
ALTER TYPE "CheckoutAttemptStatusType" ADD VALUE IF NOT EXISTS 'compensation_processing';

ALTER TABLE "CheckoutAttempt"
  ADD COLUMN "fencingToken" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "CheckoutAttempt_reconciliation_lease_idx"
  ON "CheckoutAttempt"("status", "leaseExpiresAt", "updatedAt");
