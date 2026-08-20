import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';
import { refundPayment } from '../utils/paymentProviderAdapter';
import { withSerializableRetry } from '../utils/serializableTransaction';
import { type RefundStatus } from '../lib/refundState';

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

function providerResultStatus(result: any): RefundStatus {
  const status = String(result?.status || '').toLowerCase();
  if (status === 'succeeded' || status === 'paid') return 'succeeded';
  if (status === 'pending' || status === 'processing') return 'processing';
  if (status === 'canceled' || status === 'cancelled') return 'canceled';
  return 'failed';
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
        paymentProvider: { select: { id: true, code: true, isInstalled: true } },
      },
    });
    if (!payment || payment.storeId !== store.id) throw new Error('Payment not found in active store');
    if (!payment.providerPaymentId || !payment.paymentProvider?.isInstalled) throw new Error('Payment provider settlement is unavailable');
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
          currencyCode: 'usd',
          idempotencyKey: args.idempotencyKey,
          requestedAt: existing.requestedAt,
          status: existing.status,
          providerRefundId: existing.providerRefundId || null,
          reused: true,
          executeProvider: false,
        };
      }
      const stale = existing.status === 'processing' && Date.now() - new Date(existing.updatedAt).getTime() > 5 * 60 * 1000;
      const shouldExecuteProvider = existing.status === 'failed' || existing.status === 'canceled' || stale;
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
        currencyCode: 'usd',
        idempotencyKey: args.idempotencyKey,
        requestedAt: existing.requestedAt,
        status: 'processing',
        providerRefundId: existing.providerRefundId || null,
        reused: true,
        executeProvider: shouldExecuteProvider,
      };
    }

    const reserved = await tx.paymentRefund.aggregate({
      where: { paymentId: payment.id, status: { in: ['processing', 'succeeded'] } },
      _sum: { amountCents: true },
    });
    const reservedCents = reserved._sum.amountCents || 0;
    if (reservedCents + args.amountCents > paymentCents) {
      throw new Error('Cumulative refund amount cannot exceed the settled payment');
    }

    const created = await tx.paymentRefund.create({
      data: {
        idempotencyKey: args.idempotencyKey,
        amount: centsToDollars(args.amountCents),
        amountCents: args.amountCents,
        status: 'processing',
        providerCode: payment.paymentProvider.code,
        providerPaymentId: payment.providerPaymentId,
        requestedAt: new Date(),
        providerData: { requestReason: args.reason },
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
      currencyCode: 'usd',
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
    providerResponse = await refundPayment({
      provider: claim.provider,
      paymentId: claim.providerPaymentId,
      amount: claim.amountCents,
      idempotencyKey: claim.idempotencyKey,
    });
    if (providerResponse?.amount !== undefined && Number(providerResponse.amount) !== claim.amountCents) {
      throw new Error('Payment provider returned a refund amount different from the requested amount');
    }
    if (providerResponse?.currency && String(providerResponse.currency).toLowerCase() !== claim.currencyCode.toLowerCase()) {
      throw new Error('Payment provider returned a refund currency different from the payment');
    }
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
          data: { status: 'failed', failureMessage: message, providerStatus: 'failed', processedAt: new Date() },
        });
      }
    });
    throw new Error(message);
  }

  const providerStatus = providerResultStatus(providerResponse);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
    const refund = await tx.paymentRefund.findUnique({ where: { id: claim.refundId } });
    if (!refund) throw new Error('Refund evidence disappeared during provider processing');
    if (refund.status !== 'processing') {
      return refundResult({ ...claim, providerRefundId: refund.providerRefundId || null }, refund.status, refund.providerRefundId || null, true, 'Refund state was finalized by another provider event.');
    }

    const providerRefundId = providerResponse?.data?.id || providerResponse?.id || null;
    await tx.paymentRefund.update({
      where: { id: refund.id },
      data: {
        status: providerStatus,
        providerRefundId,
        providerStatus: String(providerResponse?.status || providerStatus).toLowerCase(),
        providerData: {
          ...((refund.providerData as Record<string, unknown> | null) || {}),
          providerResponse: providerResponse?.data || providerResponse || {},
        },
        processedAt: providerStatus === 'processing' ? null : new Date(),
        failureMessage: providerStatus === 'failed' ? 'Provider reported refund failure' : providerStatus === 'canceled' ? 'Provider canceled refund' : '',
      },
    });

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
