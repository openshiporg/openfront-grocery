-- Restore controlled provider configuration as a forward-only migration.
-- Existing Payment/PaymentSession foreign keys and provider identities are not changed.
ALTER TABLE "PaymentProvider"
  ADD COLUMN "publicCheckout" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "supportsIdempotentCapture" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "captureIdempotencyEvidence" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "credentials" JSONB DEFAULT '{}',
  ADD COLUMN "createPaymentFunction" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "capturePaymentFunction" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "refundPaymentFunction" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "getPaymentStatusFunction" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "getRefundStatusFunction" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "cancelPaymentFunction" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "generatePaymentLinkFunction" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "handleWebhookFunction" TEXT NOT NULL DEFAULT 'manual',
  ALTER COLUMN "isInstalled" SET DEFAULT false;

-- Reconstitute only known server-owned adapters. Credentials are intentionally
-- empty: the historical migration removed them and secrets must be re-entered
-- through the protected configuration surface or server environment.
UPDATE "PaymentProvider"
SET "publicCheckout" = true,
    "supportsIdempotentCapture" = true,
    "createPaymentFunction" = 'stripe',
    "capturePaymentFunction" = 'stripe',
    "refundPaymentFunction" = 'stripe',
    "getPaymentStatusFunction" = 'stripe',
    "getRefundStatusFunction" = 'stripe',
    "cancelPaymentFunction" = 'stripe',
    "generatePaymentLinkFunction" = 'stripe',
    "handleWebhookFunction" = 'stripe',
    "credentials" = '{}'
WHERE "code" = 'pp_stripe_default';

UPDATE "PaymentProvider"
SET "publicCheckout" = false,
    "supportsIdempotentCapture" = false,
    "createPaymentFunction" = 'test',
    "capturePaymentFunction" = 'test',
    "refundPaymentFunction" = 'test',
    "getPaymentStatusFunction" = 'test',
    "getRefundStatusFunction" = 'test',
    "cancelPaymentFunction" = 'test',
    "generatePaymentLinkFunction" = 'test',
    "handleWebhookFunction" = 'test',
    "credentials" = '{}'
WHERE "code" = 'pp_test_default';
