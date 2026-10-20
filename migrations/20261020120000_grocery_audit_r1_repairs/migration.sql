-- Audit round 1 repairs. Additive only: two defaulted columns, one new table and one index.
-- No existing row is dropped or rewritten, except that existing coupons record the department
-- meaning they were created with (legacy product departments) before new coupons default to
-- Store department handles.

-- AlterTable: saved address book entries (checkout snapshots stay unsaved).
ALTER TABLE "Address" ADD COLUMN     "isSaved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: existing coupons keep their legacy department matching; new coupons use handles.
ALTER TABLE "Coupon" ADD COLUMN     "categoryTaxonomy" TEXT NOT NULL DEFAULT 'legacy_department';
ALTER TABLE "Coupon" ALTER COLUMN "categoryTaxonomy" SET DEFAULT 'department_handle';

-- CreateTable: replay-safe results for customer batch requests (list-to-basket, reorder).
CREATE TABLE "CustomerBatchRequest" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "storeId" TEXT NOT NULL DEFAULT '',
    "ownerKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT '',
    "sourceId" TEXT NOT NULL DEFAULT '',
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBatchRequest_requestKey_key" ON "CustomerBatchRequest"("requestKey");

-- CreateIndex: bounded pruning of finished rate-limit windows.
CREATE INDEX "RateLimitBucket_windowStartedAt_idx" ON "RateLimitBucket"("windowStartedAt");
