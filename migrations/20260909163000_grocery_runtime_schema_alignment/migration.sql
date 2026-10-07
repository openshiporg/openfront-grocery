-- Expand the replayed migration schema to the deployed Grocery models.
-- Generated with Prisma 6.5.0 against disposable PostgreSQL, then reviewed.
-- No tables, columns, records, or existing evidence constraints are dropped.
-- Legacy ownership/unique identities are backfilled before enforcing new keys.
-- Retain PaymentRefund.requestedBy NOT NULL + RESTRICT: loosening refund evidence
-- ownership is unrelated to this repair, despite the generated model difference.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- PostgreSQL 12+ supports these additions in a transaction; no new value is
-- consumed by this migration before commit.

ALTER TYPE "OrderStatusType" ADD VALUE 'delivery_failed';
ALTER TYPE "OrderStatusType" ADD VALUE 'delivery_refused';
ALTER TYPE "OrderStatusType" ADD VALUE 'returned';

-- AlterTable
ALTER TABLE "GroceryOutboxEvent" ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InventoryAdjustment" ALTER COLUMN "quantityBefore" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "quantityAfter" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "quantityDelta" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "productStockBefore" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "productStockAfter" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "InventoryLot" ADD COLUMN     "conditionStatus" TEXT NOT NULL DEFAULT 'accepted',
ADD COLUMN     "safetyReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "safetyStatus" TEXT NOT NULL DEFAULT 'available',
ADD COLUMN     "supplierLotNumber" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "quantityRemaining" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "LoyaltyProgram" ADD COLUMN     "earnPointsPer100Cents" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "minimumRedemptionPoints" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "redeemPointsPer100Cents" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "refundDebtPolicy" TEXT NOT NULL DEFAULT 'offset_future_earnings';

-- AlterTable
ALTER TABLE "LoyaltyTransaction" ADD COLUMN     "actorId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "balanceBefore" INTEGER,
ADD COLUMN     "idempotencyKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "program" TEXT,
ADD COLUMN     "sourceId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "store" TEXT;

-- AlterTable
ALTER TABLE "OrderLineInventoryAllocation" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "POItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "quantityReceived" SET DEFAULT 0,
ALTER COLUMN "quantityReceived" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN     "deadLetterAt" TIMESTAMP(3),
ADD COLUMN     "lastProcessingError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "processingAttempts" INTEGER DEFAULT 0,
ADD COLUMN     "replayAudit" JSONB DEFAULT '[]',
ADD COLUMN     "verifiedPayload" JSONB DEFAULT '{}';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "informationSource" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "initialInformation" JSONB DEFAULT '{}',
ADD COLUMN     "nutrition" JSONB DEFAULT '{}',
ADD COLUMN     "packBaseUnitsMilli" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "skuIdentity" TEXT,
ADD COLUMN     "taxRateBasisPoints" INTEGER,
ADD COLUMN     "variantLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "variantOf" TEXT,
ALTER COLUMN "stockQuantity" SET DEFAULT 0,
ALTER COLUMN "stockQuantity" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "deliveryPolicy" JSONB DEFAULT '{"version":1,"postalPrefixes":[],"pickupMinimumCents":0,"deliveryMinimumCents":0,"deliveryFeeCents":0,"feeTaxRateBasisPoints":0}';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "anchorDay" INTEGER,
ADD COLUMN     "consent" JSONB,
ADD COLUMN     "events" JSONB,
ADD COLUMN     "idempotencyKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastProcessedAt" TIMESTAMP(3),
ADD COLUMN     "scheduleTimezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "store" TEXT;

-- Derive the new required tenant from the existing account, never from a
-- global default. Reject inconsistent historical relationships without writes
-- committing, rather than moving a subscription across tenants.
UPDATE "Subscription" s
SET "store" = u."store",
    "scheduleTimezone" = st."timezone",
    "idempotencyKey" = 'legacy-subscription:' || s."id",
    "status" = CASE WHEN s."isActive" THEN 'active' ELSE 'paused' END
FROM "User" u JOIN "Store" st ON st."id" = u."store"
WHERE s."user" = u."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Subscription" s
    LEFT JOIN "Product" p ON p."id" = s."productRef"
    WHERE s."store" IS NULL OR p."store" IS DISTINCT FROM s."store"
  ) THEN
    RAISE EXCEPTION 'Subscription tenant backfill requires owner review';
  END IF;
END $$;
ALTER TABLE "Subscription" ALTER COLUMN "store" SET NOT NULL;

-- Old ledger entries did not have idempotency keys. Give each its own stable
-- migration identity; preserve points, balances, timestamps and optional owners.
UPDATE "LoyaltyTransaction" SET "idempotencyKey" = 'legacy-loyalty:' || "id";
UPDATE "LoyaltyTransaction" t SET "store" = u."store"
FROM "User" u WHERE t."user" = u."id";

-- Match deriveProductSkuIdentity: case-sensitive, JS-trimmed Store/SKU tuple.
-- Preserve the original SKU field and let the unique index reject duplicates
-- rather than silently renaming, merging, or dropping catalog records.
WITH normalized AS (
  SELECT "id", "store", btrim("sku", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) ||
    chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) ||
    chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) ||
    chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) ||
    chr(8239) || chr(8287) || chr(12288) || chr(65279)) AS sku
  FROM "Product"
)
UPDATE "Product" p SET "skuIdentity" = CASE WHEN n.sku = '' THEN NULL
  ELSE '[' || to_json(n."store")::text || ',' || to_json(n.sku)::text || ']' END
FROM normalized n WHERE p."id" = n."id";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "privacyErasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserCoupon" ADD COLUMN     "usedByOrder" TEXT;

-- CreateTable
CREATE TABLE "InventoryConversion" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "inputFingerprint" TEXT NOT NULL DEFAULT '',
    "reviewHash" TEXT NOT NULL DEFAULT '',
    "quantityCases" INTEGER NOT NULL,
    "unitsPerCase" INTEGER NOT NULL,
    "destinationQuantity" INTEGER NOT NULL,
    "totalCostCents" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "conditionNote" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL DEFAULT '',
    "committedAt" TIMESTAMP(3),
    "sourceSnapshot" JSONB,
    "destinations" JSONB,
    "sourceInventoryLot" TEXT,
    "sourceProduct" TEXT,
    "destinationProduct" TEXT,
    "store" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImport" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "sourceSystem" TEXT NOT NULL DEFAULT '',
    "sourceBatchId" TEXT NOT NULL DEFAULT '',
    "schemaVersion" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "reviewHash" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "rowCount" INTEGER NOT NULL,
    "rows" JSONB,
    "result" JSONB,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL DEFAULT '',
    "store" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPrivacyRequest" (
    "id" TEXT NOT NULL,
    "store" TEXT,
    "user" TEXT,
    "kind" TEXT,
    "status" TEXT DEFAULT 'requested',
    "policyVersion" TEXT NOT NULL DEFAULT '',
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "eligibleAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resultSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAccessEvent" (
    "id" TEXT NOT NULL,
    "store" TEXT,
    "actor" TEXT,
    "subject" TEXT,
    "invitation" TEXT,
    "action" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvitation" (
    "id" TEXT NOT NULL,
    "store" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "tokenHash" TEXT NOT NULL DEFAULT '',
    "capabilities" JSONB,
    "status" TEXT DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "acceptedUser" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineRefund" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "requestKey" TEXT NOT NULL DEFAULT '',
    "providerRefundKey" TEXT NOT NULL DEFAULT '',
    "inputFingerprint" TEXT NOT NULL DEFAULT '',
    "store" TEXT NOT NULL,
    "order" TEXT,
    "payment" TEXT,
    "paymentRefund" TEXT,
    "lineItem" TEXT,
    "finalSettlementId" TEXT NOT NULL DEFAULT '',
    "finalFulfillmentId" TEXT NOT NULL DEFAULT '',
    "productId" TEXT NOT NULL DEFAULT '',
    "productTitle" TEXT NOT NULL DEFAULT '',
    "unitOfMeasure" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "quantityMilli" INTEGER NOT NULL,
    "quantityBefore" INTEGER,
    "quantityAfter" INTEGER,
    "fulfilledQuantityMilli" INTEGER,
    "subtotalCents" INTEGER,
    "discountCents" INTEGER,
    "netGoodsCents" INTEGER,
    "taxCents" INTEGER,
    "totalCents" INTEGER,
    "taxRateBasisPoints" INTEGER,
    "disposition" TEXT NOT NULL,
    "conditionNote" TEXT NOT NULL DEFAULT '',
    "returnedLots" JSONB,
    "reason" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'reserved',
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3),
    "events" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLineRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyRedemption" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "points" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "status" TEXT DEFAULT 'issued',
    "store" TEXT,
    "user" TEXT,
    "program" TEXT,
    "coupon" TEXT,
    "order" TEXT,
    "usedAt" TIMESTAMP(3),
    "events" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionRun" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "subscription" TEXT,
    "store" TEXT NOT NULL,
    "user" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "product" TEXT,
    "productTitle" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER,
    "priceCents" INTEGER,
    "cart" TEXT,
    "cartItemId" TEXT NOT NULL DEFAULT '',
    "order" TEXT,
    "failureReason" TEXT NOT NULL DEFAULT '',
    "events" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementMatch" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    "store" TEXT,
    "recordedBy" TEXT,
    "payment" TEXT,
    "providerCode" TEXT NOT NULL DEFAULT '',
    "statementReference" TEXT NOT NULL DEFAULT '',
    "entryReference" TEXT NOT NULL DEFAULT '',
    "paymentReference" TEXT NOT NULL DEFAULT '',
    "refundReference" TEXT NOT NULL DEFAULT '',
    "payoutReference" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "entryType" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT DEFAULT 'unresolved',
    "reason" TEXT NOT NULL DEFAULT '',
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialClose" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "store" TEXT,
    "recordedBy" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT '',
    "cutoff" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCredit" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL DEFAULT '',
    "responseIdentityKey" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT DEFAULT 'claim',
    "status" TEXT DEFAULT 'open',
    "reference" TEXT NOT NULL DEFAULT '',
    "amountCents" INTEGER,
    "claimedAmountCents" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "evidence" TEXT NOT NULL DEFAULT '',
    "openedBy" TEXT NOT NULL DEFAULT '',
    "resolvedBy" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "events" JSONB,
    "supplier" TEXT,
    "invoice" TEXT,
    "receipt" TEXT,
    "store" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "supplierName" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "documentReference" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'captured',
    "lines" JSONB,
    "subtotalCents" INTEGER,
    "taxCents" INTEGER,
    "freightCents" INTEGER,
    "grossCents" INTEGER,
    "expectedCents" INTEGER,
    "varianceCents" INTEGER,
    "capturedBy" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "approvedAt" TIMESTAMP(3),
    "settledBy" TEXT NOT NULL DEFAULT '',
    "settledAt" TIMESTAMP(3),
    "settlement" JSONB,
    "events" JSONB,
    "inputFingerprint" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT,
    "store" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInformationVersion" (
    "id" TEXT NOT NULL,
    "store" TEXT,
    "product" TEXT,
    "actor" TEXT,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "sourceReference" TEXT NOT NULL DEFAULT '',
    "effectiveAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductInformationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMessage" (
    "id" TEXT NOT NULL,
    "store" TEXT,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "order" TEXT,
    "user" TEXT,
    "recipient" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER DEFAULT 0,
    "providerEvidence" JSONB,
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "deliveryToken" TEXT NOT NULL DEFAULT '',
    "deliveryLeaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "purchaseOrder" TEXT,
    "poItem" TEXT,
    "inventoryLot" TEXT,
    "supplier" TEXT,
    "product" TEXT,
    "supplierLotNumber" TEXT NOT NULL DEFAULT '',
    "deliveryReference" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,3),
    "targetQuantityReceived" DECIMAL(18,3),
    "unitCostCents" INTEGER,
    "conditionStatus" TEXT NOT NULL,
    "inspectionNote" TEXT NOT NULL DEFAULT '',
    "receivedBy" TEXT NOT NULL DEFAULT '',
    "expirationDate" TIMESTAMP(3),
    "store" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'observed',
    "inventoryLot" TEXT,
    "product" TEXT,
    "expectedQuantity" DECIMAL(18,3),
    "observedQuantity" DECIMAL(18,3),
    "recountQuantity" DECIMAL(18,3),
    "observedBy" TEXT NOT NULL DEFAULT '',
    "recountedBy" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "events" JSONB,
    "approvedAt" TIMESTAMP(3),
    "store" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryRecall" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'open',
    "scope" JSONB,
    "affectedOrders" JSONB,
    "events" JSONB,
    "closure" JSONB,
    "openedBy" TEXT NOT NULL DEFAULT '',
    "closedBy" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "store" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryRecall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT '',
    "sourceId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL DEFAULT '',
    "quantityBefore" DECIMAL(18,3),
    "quantityAfter" DECIMAL(18,3),
    "quantityDelta" DECIMAL(18,3),
    "productStockBefore" DECIMAL(18,3),
    "productStockAfter" DECIMAL(18,3),
    "metadata" JSONB,
    "product" TEXT,
    "inventoryLot" TEXT,
    "order" TEXT,
    "store" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSettlement" (
    "id" TEXT NOT NULL,
    "order" TEXT,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "actualsHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'processing',
    "totalCents" INTEGER NOT NULL,
    "snapshot" JSONB,
    "providerEvidence" JSONB,
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "finalizedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineFulfillment" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "lineItemIdSnapshot" TEXT NOT NULL DEFAULT '',
    "lineItem" TEXT,
    "product" TEXT,
    "recordedBy" TEXT,
    "resolution" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL DEFAULT '',
    "productSku" TEXT NOT NULL DEFAULT '',
    "unitOfMeasure" TEXT NOT NULL DEFAULT '',
    "quantityMilli" INTEGER NOT NULL,
    "grossMilli" INTEGER NOT NULL,
    "tareMilli" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL,
    "allocations" JSONB,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLineFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryConversion_idempotencyKey_key" ON "InventoryConversion"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryConversion_sourceInventoryLot_idx" ON "InventoryConversion"("sourceInventoryLot");

-- CreateIndex
CREATE INDEX "InventoryConversion_sourceProduct_idx" ON "InventoryConversion"("sourceProduct");

-- CreateIndex
CREATE INDEX "InventoryConversion_destinationProduct_idx" ON "InventoryConversion"("destinationProduct");

-- CreateIndex
CREATE INDEX "InventoryConversion_store_idx" ON "InventoryConversion"("store");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogImport_identityKey_key" ON "CatalogImport"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogImport_idempotencyKey_key" ON "CatalogImport"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CatalogImport_store_idx" ON "CatalogImport"("store");

-- CreateIndex
CREATE INDEX "CustomerPrivacyRequest_store_idx" ON "CustomerPrivacyRequest"("store");

-- CreateIndex
CREATE INDEX "CustomerPrivacyRequest_user_idx" ON "CustomerPrivacyRequest"("user");

-- CreateIndex
CREATE INDEX "CustomerPrivacyRequest_reviewedBy_idx" ON "CustomerPrivacyRequest"("reviewedBy");

-- CreateIndex
CREATE INDEX "StaffAccessEvent_store_idx" ON "StaffAccessEvent"("store");

-- CreateIndex
CREATE INDEX "StaffAccessEvent_actor_idx" ON "StaffAccessEvent"("actor");

-- CreateIndex
CREATE INDEX "StaffAccessEvent_subject_idx" ON "StaffAccessEvent"("subject");

-- CreateIndex
CREATE INDEX "StaffAccessEvent_invitation_idx" ON "StaffAccessEvent"("invitation");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvitation_store_idx" ON "StaffInvitation"("store");

-- CreateIndex
CREATE INDEX "StaffInvitation_invitedBy_idx" ON "StaffInvitation"("invitedBy");

-- CreateIndex
CREATE INDEX "StaffInvitation_acceptedUser_idx" ON "StaffInvitation"("acceptedUser");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineRefund_idempotencyKey_key" ON "OrderLineRefund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderLineRefund_requestKey_idx" ON "OrderLineRefund"("requestKey");

-- CreateIndex
CREATE INDEX "OrderLineRefund_providerRefundKey_idx" ON "OrderLineRefund"("providerRefundKey");

-- CreateIndex
CREATE INDEX "OrderLineRefund_store_idx" ON "OrderLineRefund"("store");

-- CreateIndex
CREATE INDEX "OrderLineRefund_order_idx" ON "OrderLineRefund"("order");

-- CreateIndex
CREATE INDEX "OrderLineRefund_payment_idx" ON "OrderLineRefund"("payment");

-- CreateIndex
CREATE INDEX "OrderLineRefund_paymentRefund_idx" ON "OrderLineRefund"("paymentRefund");

-- CreateIndex
CREATE INDEX "OrderLineRefund_lineItem_idx" ON "OrderLineRefund"("lineItem");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyRedemption_idempotencyKey_key" ON "LoyaltyRedemption"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_store_idx" ON "LoyaltyRedemption"("store");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_user_idx" ON "LoyaltyRedemption"("user");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_program_idx" ON "LoyaltyRedemption"("program");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_coupon_idx" ON "LoyaltyRedemption"("coupon");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_order_idx" ON "LoyaltyRedemption"("order");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionRun_idempotencyKey_key" ON "SubscriptionRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SubscriptionRun_subscription_idx" ON "SubscriptionRun"("subscription");

-- CreateIndex
CREATE INDEX "SubscriptionRun_store_idx" ON "SubscriptionRun"("store");

-- CreateIndex
CREATE INDEX "SubscriptionRun_user_idx" ON "SubscriptionRun"("user");

-- CreateIndex
CREATE INDEX "SubscriptionRun_product_idx" ON "SubscriptionRun"("product");

-- CreateIndex
CREATE INDEX "SubscriptionRun_cart_idx" ON "SubscriptionRun"("cart");

-- CreateIndex
CREATE INDEX "SubscriptionRun_order_idx" ON "SubscriptionRun"("order");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementMatch_sourceKey_key" ON "SettlementMatch"("sourceKey");

-- CreateIndex
CREATE INDEX "SettlementMatch_store_idx" ON "SettlementMatch"("store");

-- CreateIndex
CREATE INDEX "SettlementMatch_recordedBy_idx" ON "SettlementMatch"("recordedBy");

-- CreateIndex
CREATE INDEX "SettlementMatch_payment_idx" ON "SettlementMatch"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialClose_idempotencyKey_key" ON "FinancialClose"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FinancialClose_store_idx" ON "FinancialClose"("store");

-- CreateIndex
CREATE INDEX "FinancialClose_recordedBy_idx" ON "FinancialClose"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCredit_identityKey_key" ON "SupplierCredit"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCredit_responseIdentityKey_key" ON "SupplierCredit"("responseIdentityKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCredit_idempotencyKey_key" ON "SupplierCredit"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SupplierCredit_supplier_idx" ON "SupplierCredit"("supplier");

-- CreateIndex
CREATE INDEX "SupplierCredit_invoice_idx" ON "SupplierCredit"("invoice");

-- CreateIndex
CREATE INDEX "SupplierCredit_receipt_idx" ON "SupplierCredit"("receipt");

-- CreateIndex
CREATE INDEX "SupplierCredit_store_idx" ON "SupplierCredit"("store");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_identityKey_key" ON "SupplierInvoice"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_idempotencyKey_key" ON "SupplierInvoice"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SupplierInvoice_supplier_idx" ON "SupplierInvoice"("supplier");

-- CreateIndex
CREATE INDEX "SupplierInvoice_store_idx" ON "SupplierInvoice"("store");

-- CreateIndex
CREATE UNIQUE INDEX "ProductInformationVersion_idempotencyKey_key" ON "ProductInformationVersion"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductInformationVersion_store_idx" ON "ProductInformationVersion"("store");

-- CreateIndex
CREATE INDEX "ProductInformationVersion_product_idx" ON "ProductInformationVersion"("product");

-- CreateIndex
CREATE INDEX "ProductInformationVersion_actor_idx" ON "ProductInformationVersion"("actor");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMessage_eventKey_key" ON "CustomerMessage"("eventKey");

-- CreateIndex
CREATE INDEX "CustomerMessage_store_idx" ON "CustomerMessage"("store");

-- CreateIndex
CREATE INDEX "CustomerMessage_order_idx" ON "CustomerMessage"("order");

-- CreateIndex
CREATE INDEX "CustomerMessage_user_idx" ON "CustomerMessage"("user");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_idempotencyKey_key" ON "PurchaseReceipt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseOrder_idx" ON "PurchaseReceipt"("purchaseOrder");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_poItem_idx" ON "PurchaseReceipt"("poItem");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_inventoryLot_idx" ON "PurchaseReceipt"("inventoryLot");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_supplier_idx" ON "PurchaseReceipt"("supplier");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_product_idx" ON "PurchaseReceipt"("product");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_supplierLotNumber_idx" ON "PurchaseReceipt"("supplierLotNumber");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_store_idx" ON "PurchaseReceipt"("store");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_idempotencyKey_key" ON "InventoryCount"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryCount_inventoryLot_idx" ON "InventoryCount"("inventoryLot");

-- CreateIndex
CREATE INDEX "InventoryCount_product_idx" ON "InventoryCount"("product");

-- CreateIndex
CREATE INDEX "InventoryCount_store_idx" ON "InventoryCount"("store");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryRecall_idempotencyKey_key" ON "InventoryRecall"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryRecall_store_idx" ON "InventoryRecall"("store");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key" ON "InventoryMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryMovement_sequence_idx" ON "InventoryMovement"("sequence");

-- CreateIndex
CREATE INDEX "InventoryMovement_product_idx" ON "InventoryMovement"("product");

-- CreateIndex
CREATE INDEX "InventoryMovement_inventoryLot_idx" ON "InventoryMovement"("inventoryLot");

-- CreateIndex
CREATE INDEX "InventoryMovement_order_idx" ON "InventoryMovement"("order");

-- CreateIndex
CREATE INDEX "InventoryMovement_store_idx" ON "InventoryMovement"("store");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSettlement_idempotencyKey_key" ON "OrderSettlement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderSettlement_order_idx" ON "OrderSettlement"("order");

-- CreateIndex
CREATE INDEX "OrderSettlement_finalizedBy_idx" ON "OrderSettlement"("finalizedBy");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineFulfillment_idempotencyKey_key" ON "OrderLineFulfillment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineFulfillment_lineItemIdSnapshot_key" ON "OrderLineFulfillment"("lineItemIdSnapshot");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineFulfillment_lineItem_key" ON "OrderLineFulfillment"("lineItem");

-- CreateIndex
CREATE INDEX "OrderLineFulfillment_product_idx" ON "OrderLineFulfillment"("product");

-- CreateIndex
CREATE INDEX "OrderLineFulfillment_recordedBy_idx" ON "OrderLineFulfillment"("recordedBy");

-- CreateIndex
CREATE INDEX "InventoryLot_supplierLotNumber_idx" ON "InventoryLot"("supplierLotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyTransaction_idempotencyKey_key" ON "LoyaltyTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_store_idx" ON "LoyaltyTransaction"("store");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_program_idx" ON "LoyaltyTransaction"("program");

-- CreateIndex
CREATE UNIQUE INDEX "Product_skuIdentity_key" ON "Product"("skuIdentity");

-- CreateIndex
CREATE INDEX "Product_variantOf_idx" ON "Product"("variantOf");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_idempotencyKey_key" ON "Subscription"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Subscription_store_idx" ON "Subscription"("store");

-- CreateIndex
CREATE INDEX "UserCoupon_usedByOrder_idx" ON "UserCoupon"("usedByOrder");

-- AddForeignKey
ALTER TABLE "InventoryConversion" ADD CONSTRAINT "InventoryConversion_sourceInventoryLot_fkey" FOREIGN KEY ("sourceInventoryLot") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryConversion" ADD CONSTRAINT "InventoryConversion_sourceProduct_fkey" FOREIGN KEY ("sourceProduct") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryConversion" ADD CONSTRAINT "InventoryConversion_destinationProduct_fkey" FOREIGN KEY ("destinationProduct") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryConversion" ADD CONSTRAINT "InventoryConversion_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImport" ADD CONSTRAINT "CatalogImport_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPrivacyRequest" ADD CONSTRAINT "CustomerPrivacyRequest_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPrivacyRequest" ADD CONSTRAINT "CustomerPrivacyRequest_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPrivacyRequest" ADD CONSTRAINT "CustomerPrivacyRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccessEvent" ADD CONSTRAINT "StaffAccessEvent_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccessEvent" ADD CONSTRAINT "StaffAccessEvent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccessEvent" ADD CONSTRAINT "StaffAccessEvent_subject_fkey" FOREIGN KEY ("subject") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccessEvent" ADD CONSTRAINT "StaffAccessEvent_invitation_fkey" FOREIGN KEY ("invitation") REFERENCES "StaffInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_acceptedUser_fkey" FOREIGN KEY ("acceptedUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineRefund" ADD CONSTRAINT "OrderLineRefund_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineRefund" ADD CONSTRAINT "OrderLineRefund_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineRefund" ADD CONSTRAINT "OrderLineRefund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineRefund" ADD CONSTRAINT "OrderLineRefund_paymentRefund_fkey" FOREIGN KEY ("paymentRefund") REFERENCES "PaymentRefund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineRefund" ADD CONSTRAINT "OrderLineRefund_lineItem_fkey" FOREIGN KEY ("lineItem") REFERENCES "OrderLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_program_fkey" FOREIGN KEY ("program") REFERENCES "LoyaltyProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_coupon_fkey" FOREIGN KEY ("coupon") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRun" ADD CONSTRAINT "SubscriptionRun_subscription_fkey" FOREIGN KEY ("subscription") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRun" ADD CONSTRAINT "SubscriptionRun_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRun" ADD CONSTRAINT "SubscriptionRun_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRun" ADD CONSTRAINT "SubscriptionRun_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRun" ADD CONSTRAINT "SubscriptionRun_cart_fkey" FOREIGN KEY ("cart") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRun" ADD CONSTRAINT "SubscriptionRun_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementMatch" ADD CONSTRAINT "SettlementMatch_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementMatch" ADD CONSTRAINT "SettlementMatch_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementMatch" ADD CONSTRAINT "SettlementMatch_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialClose" ADD CONSTRAINT "FinancialClose_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialClose" ADD CONSTRAINT "FinancialClose_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "SupplierInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_receipt_fkey" FOREIGN KEY ("receipt") REFERENCES "PurchaseReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInformationVersion" ADD CONSTRAINT "ProductInformationVersion_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInformationVersion" ADD CONSTRAINT "ProductInformationVersion_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInformationVersion" ADD CONSTRAINT "ProductInformationVersion_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMessage" ADD CONSTRAINT "CustomerMessage_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMessage" ADD CONSTRAINT "CustomerMessage_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMessage" ADD CONSTRAINT "CustomerMessage_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrder_fkey" FOREIGN KEY ("purchaseOrder") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_poItem_fkey" FOREIGN KEY ("poItem") REFERENCES "POItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_inventoryLot_fkey" FOREIGN KEY ("inventoryLot") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_inventoryLot_fkey" FOREIGN KEY ("inventoryLot") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryRecall" ADD CONSTRAINT "InventoryRecall_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryLot_fkey" FOREIGN KEY ("inventoryLot") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSettlement" ADD CONSTRAINT "OrderSettlement_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSettlement" ADD CONSTRAINT "OrderSettlement_finalizedBy_fkey" FOREIGN KEY ("finalizedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineFulfillment" ADD CONSTRAINT "OrderLineFulfillment_lineItem_fkey" FOREIGN KEY ("lineItem") REFERENCES "OrderLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineFulfillment" ADD CONSTRAINT "OrderLineFulfillment_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineFulfillment" ADD CONSTRAINT "OrderLineFulfillment_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_program_fkey" FOREIGN KEY ("program") REFERENCES "LoyaltyProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_variantOf_fkey" FOREIGN KEY ("variantOf") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_store_fkey" FOREIGN KEY ("store") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_usedByOrder_fkey" FOREIGN KEY ("usedByOrder") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
