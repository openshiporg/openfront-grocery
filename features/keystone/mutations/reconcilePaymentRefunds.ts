import { randomUUID } from 'node:crypto';
import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';
import { refundPayment } from '../utils/paymentProviderAdapter';
import { withSerializableRetry } from '../utils/serializableTransaction';
import type { RefundStatus } from '../lib/refundState';

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
  provider: { id: string; code: string; isInstalled: boolean; metadata: unknown };
  owner: string;
  token: string;
  attempts: number;
};

function providerResultStatus(result: any): RefundStatus {
  const status = String(result?.status || '').toLowerCase();
  if (status === 'succeeded' || status === 'paid') return 'succeeded';
  if (status === 'pending' || status === 'processing') return 'processing';
  if (status === 'canceled' || status === 'cancelled') return 'canceled';
  return 'failed';
}

function retryDelayMs(attempts: number) {
  return Math.min(5 * 60_000, 10_000 * (2 ** Math.max(0, attempts - 1)));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Payment provider reconciliation timed out')), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function claimNextRefund(context: Context, owner: string, storeId: string): Promise<RefundWorkerClaim | null> {
  const token = randomUUID();
  const rows = await context.prisma.$queryRawUnsafe<any[]>(
    `WITH candidate AS (
       SELECT r."id"
       FROM "PaymentRefund" r
       WHERE r."status" = 'processing'
         AND r."reconciliationDeadLetterAt" IS NULL
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
         "reconciliationLastError" = NULL
     FROM candidate c, "Payment" p, "PaymentProvider" pp
     WHERE r."id" = c."id" AND p."id" = r."payment" AND pp."id" = p."paymentProvider"
     RETURNING r."id", r."payment" AS "paymentId", p."store" AS "storeId", r."providerCode",
       r."providerPaymentId", r."amountCents", r."idempotencyKey", r."reconciliationAttempts" AS "attempts",
       pp."id" AS "providerId", pp."code" AS "providerProviderCode", pp."isInstalled" AS "providerInstalled", pp."metadata" AS "providerMetadata"`,
    owner, token, REFUND_RECONCILIATION_LEASE_MS, storeId,
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
    provider: { id: row.providerId, code: row.providerProviderCode, isInstalled: row.providerInstalled, metadata: row.providerMetadata },
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
  const status = providerResultStatus(response);
  const providerRefundId = response?.data?.id || response?.id || null;
  if (response?.amount !== undefined && Number(response.amount) !== claim.amountCents) {
    return releaseForRetry(context, claim, 'Payment provider returned a mismatched refund amount');
  }
  if (response?.currency && String(response.currency).toLowerCase() !== 'usd') {
    return releaseForRetry(context, claim, 'Payment provider returned a mismatched refund currency');
  }

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', claim.id);
    const refund = await tx.paymentRefund.findUnique({ where: { id: claim.id } });
    if (!refund || refund.status !== 'processing' || refund.reconciliationOwner !== claim.owner || refund.reconciliationToken !== claim.token) return 'fenced';
    if (status === 'processing') {
      await tx.paymentRefund.update({ where: { id: claim.id }, data: { reconciliationOwner: null, reconciliationToken: null, reconciliationLeaseExpiresAt: null, reconciliationNextAttemptAt: new Date(Date.now() + retryDelayMs(claim.attempts)), reconciliationLastError: 'Provider still reports processing', providerStatus: 'processing' } });
      return 'retry';
    }

    await tx.paymentRefund.update({
      where: { id: claim.id },
      data: {
        status,
        providerRefundId,
        providerStatus: String(response?.status || status).toLowerCase(),
        providerData: response?.data || response || {},
        processedAt: new Date(),
        failureMessage: status === 'failed' ? 'Provider reported refund failure' : status === 'canceled' ? 'Provider canceled refund' : '',
        reconciliationOwner: null,
        reconciliationToken: null,
        reconciliationLeaseExpiresAt: null,
        reconciliationNextAttemptAt: null,
        reconciliationLastError: null,
      },
    });
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
    const claim = await claimNextRefund(context, owner, store.id);
    if (!claim) break;
    if (!claim.provider.isInstalled) {
      results.push({ refundId: claim.id, status: await releaseForRetry(context, claim, 'Refund provider is unavailable') });
      continue;
    }
    try {
      const providerTimeoutMs = Math.max(25, Number(process.env.REFUND_RECONCILIATION_PROVIDER_TIMEOUT_MS || DEFAULT_PROVIDER_TIMEOUT_MS));
      const response = await withTimeout(refundPayment({ provider: claim.provider as any, paymentId: claim.providerPaymentId, amount: claim.amountCents, idempotencyKey: claim.idempotencyKey }), providerTimeoutMs);
      results.push({ refundId: claim.id, status: await completeClaim(context, claim, response) });
    } catch (error) {
      results.push({ refundId: claim.id, status: await releaseForRetry(context, claim, error instanceof Error ? error.message : 'Refund provider failed') });
    }
  }
  return { scanned: results.length, results };
}

export async function reconcilePaymentRefunds(_root: unknown, { limit = 20 }: { limit?: number }, context: Context) {
  return runRefundReconciliationOnce(context, { limit, owner: `manual:${context.session?.itemId || 'unknown'}` });
}
