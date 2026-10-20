import { reconcileOrderLineRefundRows } from '../lib/refundAllocations';
import { reconcileVerifiedRefundEvents } from './handlePaymentProviderWebhook';
import { randomUUID } from 'node:crypto';
import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';
import { refundPayment, getRefundStatus } from '../utils/paymentProviderAdapter';
import { withSerializableRetry } from '../utils/serializableTransaction';
import { assertRefundBudget, assertRefundCreationWindow, normalizeProviderRefund, refundProviderData } from '../lib/refundRecovery';

import { isPaymentProviderInstalled } from '../../integrations/payment/stripeEnabled';

export const REFUND_RECONCILIATION_LEASE_MS = 30_000;
export const REFUND_RECONCILIATION_MAX_ATTEMPTS = 5;
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

type RefundWorkerClaim = {
  id: string;
  paymentId: string;
  storeId: string;
  providerCode: string;
  providerPaymentId: string;
  amountCents: number;
  idempotencyKey: string;
  providerRefundId: string | null;
  requestedAt: Date;
  currencyCode: string;
  provider: { id: string; code: string; isInstalled: boolean; publicCheckout: boolean; supportsIdempotentCapture: boolean; captureIdempotencyEvidence: string; credentials: unknown; metadata: unknown;
    createPaymentFunction: string; capturePaymentFunction: string; refundPaymentFunction: string; getPaymentStatusFunction: string;
    getRefundStatusFunction: string; cancelPaymentFunction: string; generatePaymentLinkFunction: string; handleWebhookFunction: string };
  owner: string;
  token: string;
  attempts: number;
};

function retryDelayMs(attempts: number) {
  return Math.min(5 * 60_000, 10_000 * (2 ** Math.max(0, attempts - 1)));
}

// The provider request deadline stays well inside the claim lease, so a claim
// can never expire (and be re-claimed) while its own request is still running.
function providerDeadlineMs() {
  const configured = Math.max(25, Number(process.env.REFUND_RECONCILIATION_PROVIDER_TIMEOUT_MS || DEFAULT_PROVIDER_TIMEOUT_MS));
  return Math.min(configured, REFUND_RECONCILIATION_LEASE_MS - 5_000);
}

async function claimNextRefund(context: Context, owner: string, storeId: string, currencyCode: string): Promise<RefundWorkerClaim | null> {
  const token = randomUUID();
  // A refund whose worker kept dying after claiming it has used its attempts:
  // quarantine it for operator review before any further provider call.
  await context.prisma.$executeRawUnsafe(
    `UPDATE "PaymentRefund" r
        SET "reconciliationDeadLetterAt" = NOW(), "reconciliationOwner" = NULL, "reconciliationToken" = NULL,
            "reconciliationLeaseExpiresAt" = NULL, "reconciliationNextAttemptAt" = NULL, "updatedAt" = NOW(),
            "reconciliationLastError" = 'Refund reconciliation attempts exhausted after interrupted workers; operator review required'
      WHERE r."status" = 'processing' AND r."reconciliationDeadLetterAt" IS NULL AND r."reconciliationAttempts" >= $2
        AND (r."reconciliationLeaseExpiresAt" IS NULL OR r."reconciliationLeaseExpiresAt" <= NOW())
        AND EXISTS (SELECT 1 FROM "Payment" scoped_payment WHERE scoped_payment."id" = r."payment" AND scoped_payment."store" = $1)`,
    storeId, REFUND_RECONCILIATION_MAX_ATTEMPTS,
  );
  const rows = await context.prisma.$queryRawUnsafe<any[]>(
    `WITH candidate AS (
       SELECT r."id"
       FROM "PaymentRefund" r
       WHERE r."status" = 'processing'
         AND r."reconciliationDeadLetterAt" IS NULL
         AND r."reconciliationAttempts" < $5
         AND (r."reconciliationNextAttemptAt" IS NULL OR r."reconciliationNextAttemptAt" <= NOW())
         AND (r."reconciliationLeaseExpiresAt" IS NULL OR r."reconciliationLeaseExpiresAt" <= NOW())
         AND EXISTS (SELECT 1 FROM "Payment" scoped_payment WHERE scoped_payment."id" = r."payment" AND scoped_payment."store" = $4)
       ORDER BY r."updatedAt", r."id"
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE "PaymentRefund" r
     SET "reconciliationOwner" = $1,
         "reconciliationToken" = $2,
         "reconciliationLeaseExpiresAt" = NOW() + ($3 * INTERVAL '1 millisecond'),
         "reconciliationAttempts" = r."reconciliationAttempts" + 1,
         "reconciliationLastError" = NULL,
         "updatedAt" = NOW()
     FROM candidate c, "Payment" p, "PaymentProvider" pp
     WHERE r."id" = c."id" AND p."id" = r."payment" AND pp."id" = p."paymentProvider"
     RETURNING r."id", r."payment" AS "paymentId", p."store" AS "storeId", r."providerCode",
       r."providerPaymentId", r."providerRefundId", r."requestedAt", r."amountCents", r."idempotencyKey", r."reconciliationAttempts" AS "attempts",
       pp."id" AS "providerId", pp."code" AS "providerProviderCode", pp."isInstalled" AS "providerInstalled",
       pp."publicCheckout" AS "providerPublicCheckout", pp."supportsIdempotentCapture" AS "providerSupportsIdempotentCapture",
       pp."captureIdempotencyEvidence" AS "providerCaptureIdempotencyEvidence", pp."credentials" AS "providerCredentials", pp."metadata" AS "providerMetadata",
       pp."createPaymentFunction" AS "providerCreatePaymentFunction", pp."capturePaymentFunction" AS "providerCapturePaymentFunction",
       pp."refundPaymentFunction" AS "providerRefundPaymentFunction", pp."getPaymentStatusFunction" AS "providerGetPaymentStatusFunction",
       pp."getRefundStatusFunction" AS "providerGetRefundStatusFunction", pp."cancelPaymentFunction" AS "providerCancelPaymentFunction",
       pp."generatePaymentLinkFunction" AS "providerGeneratePaymentLinkFunction", pp."handleWebhookFunction" AS "providerHandleWebhookFunction"`,
    owner, token, REFUND_RECONCILIATION_LEASE_MS, storeId, REFUND_RECONCILIATION_MAX_ATTEMPTS,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    paymentId: row.paymentId,
    storeId: row.storeId,
    providerCode: row.providerCode,
    providerPaymentId: row.providerPaymentId,
    amountCents: Number(row.amountCents),
    idempotencyKey: row.idempotencyKey,
    providerRefundId: row.providerRefundId || null,
    requestedAt: row.requestedAt,
    currencyCode,
    provider: { id: row.providerId, code: row.providerProviderCode, isInstalled: row.providerInstalled, publicCheckout: row.providerPublicCheckout,
      supportsIdempotentCapture: row.providerSupportsIdempotentCapture, captureIdempotencyEvidence: row.providerCaptureIdempotencyEvidence,
      credentials: row.providerCredentials, metadata: row.providerMetadata, createPaymentFunction: row.providerCreatePaymentFunction,
      capturePaymentFunction: row.providerCapturePaymentFunction, refundPaymentFunction: row.providerRefundPaymentFunction,
      getPaymentStatusFunction: row.providerGetPaymentStatusFunction, getRefundStatusFunction: row.providerGetRefundStatusFunction,
      cancelPaymentFunction: row.providerCancelPaymentFunction, generatePaymentLinkFunction: row.providerGeneratePaymentLinkFunction,
      handleWebhookFunction: row.providerHandleWebhookFunction },
    owner,
    token,
    attempts: Number(row.attempts),
  };
}

async function releaseForRetry(context: Context, claim: RefundWorkerClaim, message: string) {
  const deadLetter = claim.attempts >= REFUND_RECONCILIATION_MAX_ATTEMPTS;
  await context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', claim.id);
    const current = await tx.paymentRefund.findUnique({ where: { id: claim.id }, select: { reconciliationOwner: true, reconciliationToken: true, status: true } });
    if (current?.status !== 'processing' || current.reconciliationOwner !== claim.owner || current.reconciliationToken !== claim.token) return;
    await tx.paymentRefund.update({
      where: { id: claim.id },
      data: {
        reconciliationOwner: null,
        reconciliationToken: null,
        reconciliationLeaseExpiresAt: null,
        reconciliationNextAttemptAt: deadLetter ? null : new Date(Date.now() + retryDelayMs(claim.attempts)),
        reconciliationDeadLetterAt: deadLetter ? new Date() : null,
        reconciliationLastError: message,
        failureMessage: deadLetter ? `Refund reconciliation dead-lettered after ${claim.attempts} attempts` : undefined,
      },
    });
  });
  return deadLetter ? 'dead_letter' : 'retry';
}

async function completeClaim(context: Context, claim: RefundWorkerClaim, response: any) {
  const normalized = normalizeProviderRefund(response, claim);
  const status = normalized.status;
  const providerRefundId = normalized.id;

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', claim.id);
    const refund = await tx.paymentRefund.findUnique({ where: { id: claim.id } });
    if (!refund || refund.status !== 'processing' || refund.reconciliationOwner !== claim.owner || refund.reconciliationToken !== claim.token) return 'fenced';
    if (status === 'processing') {
      const deadLetter = claim.attempts >= REFUND_RECONCILIATION_MAX_ATTEMPTS;
      await tx.paymentRefund.update({ where: { id: claim.id }, data: { providerRefundId, providerData: refundProviderData(refund.providerData, normalized.resource), reconciliationOwner: null, reconciliationToken: null, reconciliationLeaseExpiresAt: null, reconciliationNextAttemptAt: deadLetter ? null : new Date(Date.now() + retryDelayMs(claim.attempts)), reconciliationDeadLetterAt: deadLetter ? new Date() : null, reconciliationLastError: 'Provider still reports processing', providerStatus: normalized.rawStatus, failureMessage: deadLetter ? 'Refund processing requires operator reconciliation after retry limit' : '' } });
      await reconcileOrderLineRefundRows(tx, await tx.paymentRefund.findUnique({ where: { id: claim.id } }));
      return deadLetter ? 'dead_letter' : 'retry';
    }

    await tx.paymentRefund.update({
      where: { id: claim.id },
      data: {
        status,
        providerRefundId,
        providerStatus: String(response?.status || status).toLowerCase(),
        providerData: refundProviderData(refund.providerData, normalized.resource),
        processedAt: new Date(),
        failureMessage: status === 'failed' ? 'Provider reported refund failure' : status === 'canceled' ? 'Provider canceled refund' : '',
        reconciliationOwner: null,
        reconciliationToken: null,
        reconciliationLeaseExpiresAt: null,
        reconciliationNextAttemptAt: null,
        reconciliationLastError: null,
      },
    });
    await reconcileOrderLineRefundRows(tx, await tx.paymentRefund.findUnique({ where: { id: claim.id } }));
    if (status === 'succeeded') {
      const aggregate = await tx.paymentRefund.aggregate({ where: { paymentId: claim.paymentId, status: 'succeeded' }, _sum: { amountCents: true } });
      const refundedCents = Number(aggregate._sum.amountCents || 0);
      const payment = await tx.payment.findUnique({ where: { id: claim.paymentId }, select: { amountCents: true, status: true, providerData: true } });
      const paymentCents = Number(payment?.amountCents || 0);
      await tx.payment.update({ where: { id: claim.paymentId }, data: { status: refundedCents >= paymentCents ? 'refunded' : 'partially_refunded', providerRefundId: providerRefundId || undefined, providerData: { ...((payment?.providerData as Record<string, unknown> | null) || {}), lastRefundId: providerRefundId, refundedAmountCents: refundedCents } } });
      await enqueueGroceryOutboxEvent(tx, { storeId: claim.storeId, eventKey: `payment-refund:${claim.id}:completed:v1`, eventType: 'payment.refunded', aggregateType: 'payment', aggregateId: claim.paymentId, occurredAt: new Date().toISOString(), payload: { paymentId: claim.paymentId, refundId: claim.id, amountCents: claim.amountCents, cumulativeRefundedCents: refundedCents, providerCode: claim.providerCode, providerPaymentId: claim.providerPaymentId, providerRefundId } });
    }
    return status;
  }, { isolationLevel: 'Serializable' as any }));
}

export async function runRefundReconciliationOnce(context: Context, { limit = 20, owner }: { limit?: number; owner: string }) {
  await requireFreshCapability(context, 'canManagePayments');
  const store = await requireSessionStore(context);
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit))));
  const results: unknown[] = [];
  for (let index = 0; index < boundedLimit; index += 1) {
    const claim = await claimNextRefund(context, owner, store.id, store.currencyCode.toLowerCase());
    if (!claim) break;
    if (!isPaymentProviderInstalled(claim.provider)) {
      results.push({ refundId: claim.id, status: await releaseForRetry(context, claim, 'Refund provider is unavailable') });
      continue;
    }
    try {
      await context.transaction(async (transactionContext) => {
        const tx = transactionContext.prisma;
        await tx.$queryRawUnsafe('SELECT \"id\" FROM \"Payment\" WHERE \"id\" = $1 FOR UPDATE', claim.paymentId);
        const current = await tx.paymentRefund.findUnique({ where: { id: claim.id } });
        if (!current || current.status !== 'processing' || current.reconciliationToken !== claim.token) throw new Error('Refund worker claim was fenced');
        const payment = await tx.payment.findUnique({ where: { id: claim.paymentId }, select: { amountCents: true } });
        await assertRefundBudget(tx, claim.paymentId, Number(payment?.amountCents), claim.amountCents, claim.id, claim.idempotencyKey);
        claim.providerRefundId = current.providerRefundId || null;
      });
      assertRefundCreationWindow(claim.requestedAt, claim.providerRefundId);
      // A timed-out request is an unknown outcome: the claim is released for retry
      // with the same idempotency key / provider ID, never treated as "no refund".
      const timeoutMs = providerDeadlineMs();
      const response = claim.providerRefundId
        ? await getRefundStatus({ provider: claim.provider, refundId: claim.providerRefundId, timeoutMs })
        : await refundPayment({ provider: claim.provider, paymentId: claim.providerPaymentId, amount: claim.amountCents, idempotencyKey: claim.idempotencyKey, timeoutMs });
      results.push({ refundId: claim.id, status: await completeClaim(context, claim, response) });
    } catch (error) {
      results.push({ refundId: claim.id, status: await releaseForRetry(context, claim, error instanceof Error ? error.message : 'Refund provider failed') });
    }
  }
  const webhookRecovery = await reconcileVerifiedRefundEvents(context, store.id, boundedLimit);
  return { scanned: results.length, results, webhookRecovery };
}

export async function reconcilePaymentRefunds(_root: unknown, { limit = 20 }: { limit?: number }, context: Context) {
  return runRefundReconciliationOnce(context, { limit, owner: `manual:${context.session?.itemId || 'unknown'}` });
}
