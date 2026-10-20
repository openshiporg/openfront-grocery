import { commercialAdjustmentsForRefund, reconcileOrderLineRefundRows } from '../lib/refundAllocations';
import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';
import { refundPayment, getRefundStatus } from '../utils/paymentProviderAdapter';
import { withSerializableRetry } from '../utils/serializableTransaction';
import { assertRefundBudget, assertRefundCreationWindow, normalizeProviderRefund, refundProviderData } from '../lib/refundRecovery';

import { isPaymentProviderInstalled } from '../../integrations/payment/stripeEnabled';

export type RefundArgs = {
  paymentId: string;
  amountCents: number;
  reason: string;
  idempotencyKey: string;
};

type RefundClaim = {
  refundId: string;
  paymentId: string;
  storeId: string;
  provider: { id: string; code: string; isInstalled: boolean };
  providerPaymentId: string;
  amountCents: number;
  currencyCode: string;
  idempotencyKey: string;
  requestedAt: Date;
  providerRefundId?: string | null;
  executeProvider: boolean;
};

export function normalizeRefundRequest(args: RefundArgs) {
  const paymentId = args.paymentId.trim();
  const idempotencyKey = args.idempotencyKey.trim();
  const amountCents = Number(args.amountCents);
  const reason = args.reason.trim();
  if (!paymentId) throw new Error('Payment is required');
  if (!Number.isInteger(amountCents) || amountCents < 1) throw new Error('Refund amount must be a positive integer number of cents');
  if (reason.length < 3 || reason.length > 500) throw new Error('A refund reason between 3 and 500 characters is required');
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new Error('A valid refund idempotency key is required');
  return { paymentId, amountCents, reason, idempotencyKey };
}

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function refundResult(claim: RefundClaim, status: string, providerRefundId: string | null, reused: boolean, message: string) {
  return {
    success: status === 'succeeded',
    refundId: claim.refundId,
    paymentId: claim.paymentId,
    amountCents: claim.amountCents,
    status,
    providerRefundId,
    reused,
    message,
  };
}

export async function refundPaymentForOrder(
  _root: unknown,
  rawArgs: RefundArgs,
  context: Context,
) {
  await requireFreshCapability(context, 'canManagePayments');
  const args = normalizeRefundRequest(rawArgs);
  const store = await requireSessionStore(context);

  const claim = await withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);

    const payment = await tx.payment.findUnique({
      where: { id: args.paymentId },
      select: {
        id: true,
        amount: true,
        amountCents: true,
        status: true,
        storeId: true,
        providerPaymentId: true,
        providerData: true,
        paymentProvider: { select: { id: true, code: true, isInstalled: true, publicCheckout: true, supportsIdempotentCapture: true,
          captureIdempotencyEvidence: true, credentials: true, metadata: true, createPaymentFunction: true, capturePaymentFunction: true,
          refundPaymentFunction: true, getPaymentStatusFunction: true, getRefundStatusFunction: true, cancelPaymentFunction: true,
          generatePaymentLinkFunction: true, handleWebhookFunction: true } },
      },
    });
    if (!payment || payment.storeId !== store.id) throw new Error('Payment not found in active store');
    const authorizationVoid = (payment.providerData as any)?.authorizationVoid;
    if (authorizationVoid && ['processing', 'unknown'].includes(authorizationVoid.status) && args.idempotencyKey !== `${authorizationVoid.key}:original-refund`) throw new Error('An authorization abandonment is unresolved; finish it before another refund');
    if (!payment.providerPaymentId || !payment.paymentProvider || !isPaymentProviderInstalled(payment.paymentProvider)) throw new Error('Payment provider settlement is unavailable');
    if (!['succeeded', 'partially_refunded', 'refunded'].includes(payment.status)) {
      throw new Error(`Only settled payments can be refunded: ${payment.status}`);
    }

    const paymentCents = Number(payment.amountCents || Math.round(Number(payment.amount) * 100));
    let existing = await tx.paymentRefund.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (existing) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', existing.id);
      existing = await tx.paymentRefund.findUnique({ where: { id: existing.id } });
      if (!existing) throw new Error('Refund evidence disappeared during claim');
      if (
        existing.paymentId !== payment.id ||
        existing.amountCents !== args.amountCents ||
        (existing.providerData as any)?.requestReason !== args.reason
      ) {
        throw new Error('Refund idempotency key was reused with different payment, amount, or reason');
      }
      if (existing.status === 'succeeded') {
        return {
          refundId: existing.id,
          paymentId: payment.id,
          storeId: store.id,
          provider: payment.paymentProvider,
          providerPaymentId: payment.providerPaymentId,
          amountCents: existing.amountCents,
          currencyCode: store.currencyCode.toLowerCase(),
          idempotencyKey: args.idempotencyKey,
          requestedAt: existing.requestedAt,
          status: existing.status,
          providerRefundId: existing.providerRefundId || null,
          reused: true,
          executeProvider: false,
        };
      }
      await assertRefundBudget(tx, payment.id, paymentCents, args.amountCents, existing.id, args.idempotencyKey);
      const leaseActive = existing.reconciliationLeaseExpiresAt && new Date(existing.reconciliationLeaseExpiresAt).getTime() > Date.now();
      const stale = existing.status === 'processing' && Date.now() - new Date(existing.updatedAt).getTime() > 5 * 60 * 1000;
      const shouldExecuteProvider = !leaseActive && (existing.status === 'failed' || existing.status === 'canceled' || stale);
      if (shouldExecuteProvider) assertRefundCreationWindow(existing.requestedAt, existing.providerRefundId);
      if (shouldExecuteProvider) {
        await tx.paymentRefund.update({
          where: { id: existing.id },
          data: {
            status: 'processing',
            failureMessage: '',
            reconciliationOwner: null,
            reconciliationToken: null,
            reconciliationLeaseExpiresAt: null,
            reconciliationDeadLetterAt: null,
            reconciliationLastError: null,
            reconciliationNextAttemptAt: new Date(Date.now() + 30_000),
          },
        });
      }
      return {
        refundId: existing.id,
        paymentId: payment.id,
        storeId: store.id,
        provider: payment.paymentProvider,
        providerPaymentId: payment.providerPaymentId,
        amountCents: existing.amountCents,
        currencyCode: store.currencyCode.toLowerCase(),
        idempotencyKey: args.idempotencyKey,
        requestedAt: existing.requestedAt,
        status: 'processing',
        providerRefundId: existing.providerRefundId || null,
        reused: true,
        executeProvider: shouldExecuteProvider,
      };
    }

    await assertRefundBudget(tx, payment.id, paymentCents, args.amountCents, undefined, args.idempotencyKey);

    const created = await tx.paymentRefund.create({
      data: {
        idempotencyKey: args.idempotencyKey,
        amount: centsToDollars(args.amountCents),
        amountCents: args.amountCents,
        status: 'processing',
        providerCode: payment.paymentProvider.code,
        providerPaymentId: payment.providerPaymentId,
        requestedAt: new Date(),
        providerData: { requestReason: args.reason, currencyCode: store.currencyCode.toLowerCase(), commercialAdjustments: await commercialAdjustmentsForRefund(tx, args.idempotencyKey) },
        reconciliationNextAttemptAt: new Date(Date.now() + 30_000),
        payment: { connect: { id: payment.id } },
        requestedBy: { connect: { id: context.session!.itemId } },
      },
    });
    return {
      refundId: created.id,
      paymentId: payment.id,
      storeId: store.id,
      provider: payment.paymentProvider,
      providerPaymentId: payment.providerPaymentId,
      amountCents: args.amountCents,
      currencyCode: store.currencyCode.toLowerCase(),
      idempotencyKey: args.idempotencyKey,
      requestedAt: created.requestedAt,
      status: created.status,
      providerRefundId: null,
      reused: false,
      executeProvider: true,
    };
  }, { isolationLevel: 'ReadCommitted' as any })) as RefundClaim & { status: string; providerRefundId: string | null; reused: boolean };

  if (claim.status === 'succeeded') {
    return refundResult(claim, claim.status, claim.providerRefundId, true, 'Refund already recorded.');
  }
  if (!claim.executeProvider) {
    return refundResult(claim, claim.status, claim.providerRefundId, true, 'Refund is already being processed.');
  }

  let providerResponse: any;
  try {
    assertRefundCreationWindow(claim.requestedAt, claim.providerRefundId);
    providerResponse = claim.providerRefundId
      ? await getRefundStatus({ provider: claim.provider, refundId: claim.providerRefundId })
      : await refundPayment({ provider: claim.provider, paymentId: claim.providerPaymentId, amount: claim.amountCents, idempotencyKey: claim.idempotencyKey });
    normalizeProviderRefund(providerResponse, claim);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment provider refund failed';
    await context.transaction(async (transactionContext) => {
      const tx = transactionContext.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', claim.refundId);
      const current = await tx.paymentRefund.findUnique({ where: { id: claim.refundId }, select: { status: true } });
      if (current?.status === 'processing') {
        await tx.paymentRefund.update({
          where: { id: claim.refundId },
          data: { status: 'processing', failureMessage: message, providerStatus: 'unknown', processedAt: null, reconciliationLastError: message, reconciliationNextAttemptAt: new Date(Date.now() + 10_000) },
        });
      }
    });
    throw new Error(message);
  }

  const normalized = normalizeProviderRefund(providerResponse, claim);
  const providerStatus = normalized.status;
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
    const refund = await tx.paymentRefund.findUnique({ where: { id: claim.refundId } });
    if (!refund) throw new Error('Refund evidence disappeared during provider processing');
    if (refund.status !== 'processing') {
      return refundResult({ ...claim, providerRefundId: refund.providerRefundId || null }, refund.status, refund.providerRefundId || null, true, 'Refund state was finalized by another provider event.');
    }

    const providerRefundId = normalized.id;
    await tx.paymentRefund.update({
      where: { id: refund.id },
      data: {
        status: providerStatus,
        providerRefundId,
        providerStatus: String(providerResponse?.status || providerStatus).toLowerCase(),
        providerData: refundProviderData(refund.providerData, normalized.resource),
        processedAt: providerStatus === 'processing' ? null : new Date(),
        failureMessage: providerStatus === 'failed' ? 'Provider reported refund failure' : providerStatus === 'canceled' ? 'Provider canceled refund' : '',
      },
    });

    await reconcileOrderLineRefundRows(tx, await tx.paymentRefund.findUnique({ where: { id: refund.id } }));
    if (providerStatus !== 'succeeded') {
      return refundResult({ ...claim, providerRefundId }, providerStatus, providerRefundId, claim.reused, 'Payment provider has not completed the refund.');
    }

    const successful = await tx.paymentRefund.aggregate({
      where: { paymentId: claim.paymentId, status: 'succeeded' },
      _sum: { amountCents: true },
    });
    const refundedCents = successful._sum.amountCents || 0;
    const payment = await tx.payment.findUnique({
      where: { id: claim.paymentId },
      select: { amount: true, amountCents: true, providerData: true },
    });
    const paymentCents = Number(payment?.amountCents || Math.round(Number(payment?.amount || 0) * 100));
    await tx.payment.update({
      where: { id: claim.paymentId },
      data: {
        status: refundedCents >= paymentCents ? 'refunded' : 'partially_refunded',
        providerRefundId: providerRefundId || undefined,
        providerData: {
          ...((payment?.providerData as Record<string, unknown> | null) || {}),
          lastRefundId: providerRefundId,
          refundedAmountCents: refundedCents,
        },
      },
    });

    await enqueueGroceryOutboxEvent(tx, {
      storeId: claim.storeId,
      eventKey: `payment-refund:${refund.id}:completed:v1`,
      eventType: 'payment.refunded',
      aggregateType: 'payment',
      aggregateId: claim.paymentId,
      occurredAt: new Date(refund.processedAt || new Date()).toISOString(),
      payload: {
        paymentId: claim.paymentId,
        refundId: refund.id,
        amountCents: refund.amountCents,
        cumulativeRefundedCents: refundedCents,
        providerCode: claim.provider.code,
        providerPaymentId: claim.providerPaymentId,
        providerRefundId,
      },
    });

    return refundResult({ ...claim, providerRefundId }, 'succeeded', providerRefundId, claim.reused, 'Refund recorded.');
  }, { isolationLevel: 'Serializable' as any }));
}
