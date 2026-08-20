import { createHash, randomUUID } from 'node:crypto';

import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { verifyPaymentWebhook } from '../utils/paymentProviderAdapter';
import { shouldApplyRefundTransition, type RefundEventOrder, type RefundStatus } from '../lib/refundState';
import { paymentEventOrderFromProviderData, shouldApplyPaymentTransition, type PaymentEventStatus } from '../lib/paymentState';
import { withSerializableRetry } from '../utils/serializableTransaction';

type HandlePaymentProviderWebhookArgs = {
  providerCode: string;
  rawBody: string;
  headers?: Record<string, string> | null;
};

function normalizePaymentId(resource: any) {
  return resource?.payment_intent || resource?.id || null;
}

function normalizePaymentStatus(eventType: string): PaymentEventStatus | null {
  if (eventType === 'payment_intent.succeeded' || eventType === 'charge.succeeded') return 'succeeded';
  if (eventType === 'payment_intent.processing' || eventType === 'charge.pending') return 'processing';
  if (eventType === 'payment_intent.payment_failed' || eventType === 'charge.failed') return 'failed';
  if (eventType === 'payment_intent.canceled' || eventType === 'payment_intent.cancelled') return 'cancelled';
  return null;
}

function normalizeRefundStatus(eventType: string, resource: any): RefundStatus | null {
  if (!['refund.created', 'refund.updated', 'refund.failed', 'refund.canceled', 'refund.cancelled', 'charge.refunded'].includes(eventType)) return null;
  const providerStatus = String(resource?.status || '').toLowerCase();
  if (providerStatus === 'canceled' || providerStatus === 'cancelled' || eventType === 'refund.canceled' || eventType === 'refund.cancelled') return 'canceled';
  if (providerStatus === 'failed' || eventType === 'refund.failed') return 'failed';
  if (providerStatus === 'succeeded' || providerStatus === 'paid' || eventType === 'charge.refunded') return 'succeeded';
  if (providerStatus === 'pending' || providerStatus === 'processing' || eventType === 'refund.created' || eventType === 'refund.updated') return 'processing';
  return null;
}

function providerEventOrder(event: any, resource: any, eventId: string): RefundEventOrder {
  const createdValue = Number(event?.created ?? resource?.created ?? 0);
  const createdAtMs = Number.isFinite(createdValue) && createdValue > 0
    ? (createdValue < 10_000_000_000 ? createdValue * 1000 : createdValue)
    : 0;
  const versionValue = Number(event?.version ?? resource?.version ?? resource?.metadata?.version ?? createdValue ?? 0);
  return { createdAtMs, version: Number.isInteger(versionValue) && versionValue >= 0 ? versionValue : 0, eventId };
}

export async function processPaymentProviderWebhook(
  { providerCode, rawBody, headers }: HandlePaymentProviderWebhookArgs,
  context: Context
) {
  if (!rawBody) throw new Error('Payment webhook raw body is required');

  // Static adapter selection and cryptographic verification happen before any
  // privileged database access.
  const verified = await verifyPaymentWebhook({
    providerCode,
    rawBody,
    headers: headers || {},
  });
  const eventType = verified.type;
  const providerEventId = verified.eventId;
  const createdSeconds = Number((verified.event as any)?.created || 0);
  if (createdSeconds && Math.abs(Date.now() - createdSeconds * 1000) > 7 * 24 * 60 * 60 * 1000) throw new Error('Payment webhook event is outside the replay window');
  if (!providerEventId) throw new Error('Payment webhook event id is required');

  const paymentId = normalizePaymentId(verified.resource);
  const status = normalizePaymentStatus(eventType);
  const refundStatus = normalizeRefundStatus(eventType, verified.resource);
  const replayKey = `${providerCode}:${providerEventId}`;
  const claimToken = randomUUID();
  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const refundEventOrder = providerEventOrder(verified.event, verified.resource, providerEventId);

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const provider = await tx.paymentProvider.findUnique({
      where: { code: providerCode },
      select: { id: true, code: true, isInstalled: true },
    });
    if (!provider?.isInstalled) {
      throw new Error(`Payment provider ${providerCode} not found or not installed`);
    }

    if (paymentId) await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "providerPaymentId" = $1 FOR UPDATE', paymentId);
    const knownPayment = paymentId ? await tx.payment.findUnique({
      where: { providerPaymentId: paymentId },
      select: { id: true, storeId: true, paymentProviderId: true, providerData: true, amountCents: true, status: true },
    }) : null;
    if (knownPayment && knownPayment.paymentProviderId !== provider.id) throw new Error('Payment provider does not match webhook provider');
    const eventStoreId = knownPayment?.storeId || process.env.PUBLIC_STORE_ID || 'store_juniper';
    const store = await tx.store.findUnique({ where: { id: eventStoreId }, select: { id: true } });
    if (!store) throw new Error('Webhook event could not resolve a Store');

    const eventRecord = await tx.paymentWebhookEvent.upsert({
      where: { replayKey },
      update: {},
      create: {
        replayKey,
        providerCode,
        providerEventId,
        providerCreatedAt: refundEventOrder.createdAtMs ? new Date(refundEventOrder.createdAtMs) : null,
        providerVersion: refundEventOrder.version,
        eventType,
        payloadHash,
        claimToken,
        status: 'processing',
        storeId: store.id,
      },
      select: { id: true, claimToken: true, status: true, paymentRecordId: true },
    });

    if (eventRecord.claimToken !== claimToken) {
      return {
        success: true,
        duplicate: true,
        providerCode,
        eventType,
        paymentId,
        updatedPaymentId: eventRecord.paymentRecordId || null,
        message: 'Payment webhook event was already claimed.',
      };
    }

    let updatedPaymentId: string | null = null;
    let eventProcessingStatus: 'processed' | 'ignored' | 'unmatched' = 'unmatched';
    if (knownPayment && status) {
      updatedPaymentId = knownPayment.id;
      const currentPaymentOrder = paymentEventOrderFromProviderData(knownPayment.providerData);
      const apply = shouldApplyPaymentTransition(
        knownPayment.status as any,
        status,
        currentPaymentOrder,
        refundEventOrder,
      );
      if (apply) {
        await tx.payment.update({
          where: { id: knownPayment.id },
          data: {
            status,
            providerData: {
              ...((knownPayment.providerData as Record<string, unknown> | null) || {}),
              paymentWebhook: {
                eventId: providerEventId,
                eventType,
                status,
                createdAtMs: refundEventOrder.createdAtMs,
                version: refundEventOrder.version,
                payloadHash,
                receivedAt: new Date().toISOString(),
              },
            },
          },
        });
        eventProcessingStatus = 'processed';
      } else {
        eventProcessingStatus = 'ignored';
      }
    }
    if (knownPayment && refundStatus) {
      const resource = verified.resource || {};
      const refundId = resource.id || null;
      const resourceAmountCents = Number(resource.amount);
      const resourceCurrency = String(resource.currency || 'usd').toLowerCase();
      const candidate = refundId ? await tx.paymentRefund.findFirst({ where: { paymentId: knownPayment.id, providerRefundId: refundId } }) : null;
      const evidenceMatches = Boolean(candidate && Number.isInteger(resourceAmountCents) && resourceAmountCents === candidate.amountCents && resourceCurrency === 'usd');
      if (candidate && evidenceMatches) {
        await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', candidate.id);
        const refund = await tx.paymentRefund.findUnique({ where: { id: candidate.id } });
        if (refund) {
          const currentOrder: RefundEventOrder | null = refund.providerEventId
            ? { createdAtMs: refund.providerEventCreatedAt?.getTime() || 0, version: refund.providerEventVersion || 0, eventId: refund.providerEventId }
            : null;
          const apply = shouldApplyRefundTransition(refund.status as RefundStatus, refundStatus, currentOrder, refundEventOrder);
          if (apply) {
            await tx.paymentRefund.update({
              where: { id: refund.id },
              data: {
                status: refundStatus,
                providerStatus: String(resource.status || eventType).toLowerCase(),
                providerEventId: providerEventId,
                providerEventCreatedAt: refundEventOrder.createdAtMs ? new Date(refundEventOrder.createdAtMs) : null,
                providerEventVersion: refundEventOrder.version,
                processedAt: refundStatus === 'processing' ? null : new Date(),
                failureMessage: refundStatus === 'failed'
                  ? 'Provider reported refund failure'
                  : refundStatus === 'canceled' ? 'Provider canceled refund' : '',
                providerData: {
                  ...((refund.providerData as Record<string, unknown> | null) || {}),
                  providerResponse: resource,
                },
              },
            });
            if (refundStatus === 'succeeded') {
              const aggregate = await tx.paymentRefund.aggregate({ where: { paymentId: knownPayment.id, status: 'succeeded' }, _sum: { amountCents: true } });
              const refundedCents = Number(aggregate._sum.amountCents || 0);
              await tx.payment.update({ where: { id: knownPayment.id }, data: { status: refundedCents >= knownPayment.amountCents ? 'refunded' : refundedCents > 0 ? 'partially_refunded' : knownPayment.status } });
            }
          }
          // A matched but stale event is still an accepted, processed webhook.
          updatedPaymentId = knownPayment.id;
          eventProcessingStatus = 'processed';
        }
      }
    }

    await tx.paymentWebhookEvent.update({
      where: { id: eventRecord.id },
      data: {
        status: eventProcessingStatus,
        paymentRecordId: updatedPaymentId || '',
        payment: updatedPaymentId ? { connect: { id: updatedPaymentId } } : undefined,
        processedAt: new Date(),
      },
    });

    return {
      success: true,
      duplicate: false,
      providerCode: provider.code,
      eventType,
      paymentId,
      updatedPaymentId,
      message: updatedPaymentId
        ? 'Payment webhook processed.'
        : 'Payment webhook accepted; no matching payment was updated.',
    };
  }, { isolationLevel: 'Serializable' as any }));
}

export async function handlePaymentProviderWebhook(
  _root: unknown,
  args: HandlePaymentProviderWebhookArgs,
  context: Context
) {
  await requireFreshCapability(context, 'canManagePayments');
  return processPaymentProviderWebhook(args, context);
}
