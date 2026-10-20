import { reconcileOrderLineRefundRows } from '../lib/refundAllocations';
import { createHash, randomUUID } from 'node:crypto';

import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { verifyPaymentWebhook } from '../utils/paymentProviderAdapter';
import { shouldApplyRefundTransition, type RefundEventOrder, type RefundStatus } from '../lib/refundState';
import { paymentEventOrderFromProviderData, shouldApplyPaymentTransition, type PaymentEventStatus } from '../lib/paymentState';
import { assertRefundBudget, normalizeProviderRefund, refundProviderData } from '../lib/refundRecovery';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requirePrismaSuccess, withSerializableRetry } from '../utils/serializableTransaction';
import { requireSessionStore } from '../lib/storeScope';

import { isPaymentProviderInstalled } from '../../integrations/payment/stripeEnabled';

type HandlePaymentProviderWebhookArgs = {
  providerCode: string;
  rawBody: string;
  headers?: Record<string, string> | null;
};

function providerId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  const nested = (value as { id?: unknown } | null)?.id;
  return typeof nested === 'string' && nested.trim() ? nested : null;
}

const REFUND_EVENT_TYPES = ['refund.succeeded', 'refund.processing', 'refund.created', 'refund.updated', 'refund.failed', 'refund.canceled', 'refund.cancelled'];

/**
 * The provider payment a verified resource belongs to. One typed contract for
 * Stripe and Grocery-normalized remote envelopes: a refund resource names its
 * payment by `payment_intent` (Stripe) or `paymentId` (normalized) — its own
 * `id` is the refund and is never treated as a payment. Payment and charge
 * resources use `payment_intent`, then `paymentId`, then their own id.
 */
function normalizePaymentId(resource: any, eventType?: string) {
  if (eventType && REFUND_EVENT_TYPES.includes(eventType)) return providerId(resource?.payment_intent) || providerId(resource?.paymentId);
  return providerId(resource?.payment_intent) || providerId(resource?.paymentId) || providerId(resource?.id);
}

function normalizePaymentStatus(eventType: string): PaymentEventStatus | null {
  if (['payment.succeeded', 'payment_intent.succeeded', 'charge.succeeded'].includes(eventType)) return 'succeeded';
  if (['payment.processing', 'payment_intent.processing', 'charge.pending'].includes(eventType)) return 'processing';
  if (['payment.failed', 'payment_intent.payment_failed', 'charge.failed'].includes(eventType)) return 'failed';
  if (['payment.cancelled', 'payment.canceled', 'payment_intent.canceled', 'payment_intent.cancelled'].includes(eventType)) return 'cancelled';
  return null;
}

function paymentEventMatchesFinancials(eventType: string, resource: any, payment: { amountCents: number }, currencyCode: string) {
  // Stripe's successful PaymentIntent/Charge events distinguish requested
  // amount from captured amount. Other adapters use Grocery's integer minor
  // unit contract (`amountCents`, or integer `amount`) and ISO currency.
  const amountCents = Number.isSafeInteger(resource?.amountCents)
    ? resource.amountCents
    : eventType === 'payment_intent.succeeded'
      ? resource?.amount_received
      : eventType === 'charge.succeeded'
        ? resource?.amount_captured ?? (resource?.captured === true ? resource?.amount : undefined)
        : resource?.amount;
  const currencies = [resource?.currencyCode, resource?.currency].filter((value) => value !== undefined && value !== null);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents !== payment.amountCents || currencies.length === 0) return false;
  if (currencies.some((value) => typeof value !== 'string' || !value.trim())) return false;
  const normalizedCurrencies = currencies.map((value: string) => value.trim().toLowerCase());
  return normalizedCurrencies.every((value) => value === currencyCode.trim().toLowerCase());
}

function normalizeRefundStatus(eventType: string, resource: any): RefundStatus | null {
  if (!['refund.succeeded', 'refund.processing', 'refund.created', 'refund.updated', 'refund.failed', 'refund.canceled', 'refund.cancelled', 'charge.refunded'].includes(eventType)) return null;
  const providerStatus = String(resource?.status || '').toLowerCase();
  if (providerStatus === 'canceled' || providerStatus === 'cancelled' || eventType === 'refund.canceled' || eventType === 'refund.cancelled') return 'canceled';
  if (providerStatus === 'failed' || eventType === 'refund.failed') return 'failed';
  if (providerStatus === 'succeeded' || providerStatus === 'paid' || eventType === 'refund.succeeded' || eventType === 'charge.refunded') return 'succeeded';
  if (providerStatus === 'pending' || providerStatus === 'processing' || eventType === 'refund.processing' || eventType === 'refund.created' || eventType === 'refund.updated') return 'processing';
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

  // Resolve only the deployment-owned provider configuration needed to select
  // its admitted verifier. No event mutation occurs until verification passes.
  const provider = requirePrismaSuccess(await context.prisma.paymentProvider.findUnique({
    where: { code: providerCode },
    select: { id: true, code: true, isInstalled: true, publicCheckout: true, supportsIdempotentCapture: true,
      captureIdempotencyEvidence: true, credentials: true, metadata: true, createPaymentFunction: true,
      capturePaymentFunction: true, refundPaymentFunction: true, getPaymentStatusFunction: true,
      getRefundStatusFunction: true, cancelPaymentFunction: true, generatePaymentLinkFunction: true, handleWebhookFunction: true },
  }), 'payment provider configuration lookup');
  if (!provider || !isPaymentProviderInstalled(provider)) throw new Error(`Payment provider ${providerCode} not found or not installed`);
  const verified = await verifyPaymentWebhook({ provider, rawBody, headers: headers || {} });
  if (verified.isValid !== true) throw new Error('Payment webhook signature is invalid');
  // A shared Stripe account delivers other shops' events here too. Verify
  // first, then ignore foreign resources before creating any durable receipt.
  if (providerCode === 'pp_stripe_default' && (verified.resource as any)?.metadata?.source !== 'openfront-grocery') {
    const paymentId = normalizePaymentId(verified.resource, verified.type);
    const owned = paymentId && await context.prisma.payment.findFirst({
      where: { providerPaymentId: paymentId, paymentProviderId: provider.id }, select: { id: true },
    });
    if (!owned) return { success: true, ignored: true };
  }
  // The signature proved the delivery is fresh; the event's own time says when it
  // happened. A known event is acknowledged as a duplicate whatever its age; an
  // unknown old event is kept for review instead of being discarded or applied.
  const createdSeconds = Number((verified.event as any)?.created || 0);
  if (createdSeconds && createdSeconds * 1000 - Date.now() > 60 * 60 * 1000) throw new Error('Payment webhook event time is invalid');
  const historic = Boolean(createdSeconds && Date.now() - createdSeconds * 1000 > 7 * 24 * 60 * 60 * 1000);
  return processVerifiedPaymentEvent(providerCode, verified, createHash('sha256').update(rawBody).digest('hex'), context, undefined, { historic });
}

/** Event classes Grocery acts on; anything else is recorded as ignored, not left unmatched. */
function isSupportedEventType(eventType: string) {
  return normalizePaymentStatus(eventType) !== null || REFUND_EVENT_TYPES.includes(eventType) || eventType === 'charge.refunded';
}

async function processVerifiedPaymentEvent(providerCode: string, verified: any, payloadHash: string, context: Context, expectedStoreId?: string, options: { historic?: boolean } = {}) {
  const eventType = verified.type;
  const providerEventId = verified.eventId;
  if (!providerEventId) throw new Error('Payment webhook event id is required');
  const paymentId = normalizePaymentId(verified.resource, eventType);
  const status = eventType === 'charge.succeeded' && verified.resource?.captured === false ? null : normalizePaymentStatus(eventType);
  const refundStatus = normalizeRefundStatus(eventType, verified.resource);
  const replayKey = `${providerCode}:${providerEventId}`;
  const claimToken = randomUUID();
  const refundEventOrder = providerEventOrder(verified.event, verified.resource, providerEventId);

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const provider = await tx.paymentProvider.findUnique({
      where: { code: providerCode },
      select: { id: true, code: true, isInstalled: true },
    });
    if (!provider || !isPaymentProviderInstalled(provider)) {
      throw new Error(`Payment provider ${providerCode} not found or not installed`);
    }

    if (paymentId) await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "providerPaymentId" = $1 FOR UPDATE', paymentId);
    const knownPayment = paymentId ? await tx.payment.findUnique({
      where: { providerPaymentId: paymentId },
      select: { id: true, storeId: true, paymentProviderId: true, providerData: true, amountCents: true, status: true },
    }) : null;
    if (knownPayment && knownPayment.paymentProviderId !== provider.id) throw new Error('Payment provider does not match webhook provider');
    const eventStoreId = knownPayment?.storeId || process.env.PUBLIC_STORE_ID || 'store_juniper';
    if (expectedStoreId && eventStoreId !== expectedStoreId) throw new Error('Verified event payment does not belong to the replay Store');
    const store = await tx.store.findUnique({ where: { id: eventStoreId }, select: { id: true, currencyCode: true } });
    if (!store) throw new Error('Webhook event could not resolve a Store');

    // Source schema includes verifiedPayload; generated client is regenerated
    // by the authorized deployment build, not by a mutation at runtime.
    const eventRecord = await (tx.paymentWebhookEvent as any).upsert({
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
        verifiedPayload: { event: verified.event, eventId: providerEventId, type: eventType, resource: verified.resource },
        claimToken,
        status: 'processing',
        storeId: store.id,
      },
      select: { id: true, claimToken: true, status: true, paymentRecordId: true, payloadHash: true, storeId: true, deadLetterAt: true },
    });

    if (eventRecord.payloadHash !== payloadHash) throw new Error('Webhook event ID was reused with a different payload');
    if (eventRecord.storeId !== store.id) throw new Error('Verified event Store does not match its payment Store');
    if (eventRecord.deadLetterAt || (eventRecord.claimToken !== claimToken && !(eventRecord.status === 'unmatched' && knownPayment))) {
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

    if (eventRecord.claimToken === claimToken && options.historic) {
      // First sight of an old event: keep the verified envelope for operator
      // review against current provider facts rather than applying it blindly.
      await tx.paymentWebhookEvent.update({ where: { id: eventRecord.id }, data: { status: 'unmatched', deadLetterAt: new Date(), nextAttemptAt: null, lastProcessingError: 'Event is older than seven days; retained for operator review', processedAt: new Date() } });
      return { success: true, duplicate: false, retained: true, providerCode: provider.code, eventType, paymentId, updatedPaymentId: null, message: 'Historic payment webhook retained for review.' };
    }

    let updatedPaymentId: string | null = null;
    let eventProcessingStatus: 'processed' | 'ignored' | 'unmatched' = isSupportedEventType(eventType) ? 'unmatched' : 'ignored';
    if (knownPayment && status) {
      updatedPaymentId = knownPayment.id;
      if (paymentEventMatchesFinancials(eventType, verified.resource, knownPayment, store.currencyCode)) {
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
                  amountCents: verified.resource?.amountCents ?? verified.resource?.amount_received ?? verified.resource?.amount_captured ?? verified.resource?.amount,
                  currencyCode: verified.resource?.currencyCode ?? verified.resource?.currency,
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
    }
    if (knownPayment && refundStatus) {
      // charge.refunded describes a Charge, not one Refund; only its actual
      // refund objects may become ledger rows. Paginated/incomplete evidence is
      // retained unmatched for operator reconciliation rather than invented.
      const resources = eventType === 'charge.refunded'
        ? (verified.resource?.refunds?.data || []) : [verified.resource];
      let reconciled = resources.length > 0 && !verified.resource?.refunds?.has_more;
      for (const resource of resources) {
        const incoming = normalizeRefundStatus(eventType === 'charge.refunded' ? 'refund.updated' : eventType, resource);
        if (!incoming) { reconciled = false; continue; }
        const amountCents = resource?.amount;
        const refundId = resource?.id;
        let candidate: any = null;
        try {
          normalizeProviderRefund({ ...resource, paymentId: providerId(resource?.payment_intent) || providerId(resource?.paymentId) || paymentId }, {
            amountCents, currencyCode: store.currencyCode.toLowerCase(), providerPaymentId: paymentId!,
          });
          if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > knownPayment.amountCents) throw new Error('Invalid refund amount');
          candidate = await tx.paymentRefund.findFirst({ where: { providerCode, providerRefundId: refundId } });
          const requestKey = resource?.metadata?.groceryRefundKey;
          if (!candidate && typeof requestKey === 'string') candidate = await tx.paymentRefund.findUnique({ where: { idempotencyKey: requestKey } });
          if (candidate && (candidate.paymentId !== knownPayment.id || candidate.amountCents !== amountCents || candidate.providerCode !== providerCode || (candidate.providerRefundId && candidate.providerRefundId !== refundId))) throw new Error('Webhook refund does not match existing request');
          await assertRefundBudget(tx, knownPayment.id, knownPayment.amountCents, amountCents, candidate?.id, candidate?.idempotencyKey);
        } catch {
          reconciled = false;
          continue;
        }
          if (!candidate) {
            // Provider-origin requests have no impersonated human actor.
            // requestedBy is nullable in the source schema.
            candidate = await (tx.paymentRefund as any).create({ data: {
              idempotencyKey: `provider-refund:${providerCode}:${refundId}`,
              amount: (amountCents / 100).toFixed(2), amountCents, status: 'processing',
              providerCode, providerPaymentId: paymentId!, providerRefundId: refundId,
              payment: { connect: { id: knownPayment.id } }, requestedAt: new Date(),
              providerData: { origin: 'provider_webhook', requestReason: 'Refund initiated at payment provider', currencyCode: store.currencyCode.toLowerCase(), originEventId: providerEventId },
            } });
          }
          await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', candidate.id);
          const refund = await tx.paymentRefund.findUnique({ where: { id: candidate.id } });
          if (!refund) throw new Error('Refund disappeared');
          const currentOrder: RefundEventOrder | null = refund.providerEventId
            ? { createdAtMs: refund.providerEventCreatedAt?.getTime() || 0, version: refund.providerEventVersion || 0, eventId: refund.providerEventId } : null;
          if (shouldApplyRefundTransition(refund.status as RefundStatus, incoming, currentOrder, refundEventOrder)) {
            await tx.paymentRefund.update({ where: { id: refund.id }, data: {
              status: incoming, providerRefundId: refundId,
              providerStatus: String(resource.status || eventType).toLowerCase(),
              providerEventId, providerEventCreatedAt: refundEventOrder.createdAtMs ? new Date(refundEventOrder.createdAtMs) : null,
              providerEventVersion: refundEventOrder.version,
              processedAt: incoming === 'processing' ? null : new Date(),
              failureMessage: incoming === 'failed' ? 'Provider reported refund failure' : incoming === 'canceled' ? 'Provider canceled refund' : '',
              providerData: refundProviderData(refund.providerData, resource),
              reconciliationOwner: null, reconciliationToken: null, reconciliationLeaseExpiresAt: null,
              reconciliationDeadLetterAt: null, reconciliationNextAttemptAt: incoming === 'processing' ? new Date(Date.now() + 10_000) : null,
            } });
            await reconcileOrderLineRefundRows(tx, await tx.paymentRefund.findUnique({ where: { id: refund.id } }));
            if (incoming === 'succeeded') {
              const aggregate = await tx.paymentRefund.aggregate({ where: { paymentId: knownPayment.id, status: 'succeeded' }, _sum: { amountCents: true } });
              const refundedCents = Number(aggregate._sum.amountCents || 0);
              await tx.payment.update({ where: { id: knownPayment.id }, data: { status: refundedCents >= knownPayment.amountCents ? 'refunded' : 'partially_refunded', providerData: { ...((knownPayment.providerData as any) || {}), refundedAmountCents: refundedCents } } });
              await enqueueGroceryOutboxEvent(tx, { storeId: store.id, eventKey: `payment-refund:${refund.id}:completed:v1`, eventType: 'payment.refunded', aggregateType: 'payment', aggregateId: knownPayment.id, occurredAt: new Date().toISOString(), payload: { paymentId: knownPayment.id, refundId: refund.id, amountCents, cumulativeRefundedCents: refundedCents, providerCode, providerPaymentId: paymentId, providerRefundId: refundId } });
            }
          }
          updatedPaymentId = knownPayment.id;
      }
      eventProcessingStatus = reconciled ? 'processed' : 'unmatched';
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
      message: eventProcessingStatus === 'processed'
        ? 'Payment webhook processed.'
        : eventProcessingStatus === 'ignored'
          ? 'Payment webhook was older than the current provider state and was ignored.'
          : updatedPaymentId
            ? 'Payment webhook retained for reconciliation; amount or currency did not match the local payment.'
            : 'Payment webhook accepted; no matching payment was updated.',
    };
  }, { isolationLevel: 'Serializable' as any }));
}

// Every event class Grocery processes can be replayed from its verified envelope:
// payment events that arrived before their local Payment (or before its amount
// reconciled) as well as every admitted refund type.
const VERIFIED_REFUND_TYPES = [...REFUND_EVENT_TYPES, 'charge.refunded',
  'payment.succeeded', 'payment_intent.succeeded', 'charge.succeeded',
  'payment.processing', 'payment_intent.processing', 'charge.pending',
  'payment.failed', 'payment_intent.payment_failed', 'charge.failed',
  'payment.cancelled', 'payment.canceled', 'payment_intent.canceled', 'payment_intent.cancelled'];
const VERIFIED_EVENT_MAX_ATTEMPTS = 5;

async function reconcileOneVerifiedEvent(context: Context, storeId: string, eventId: string) {
  const token = randomUUID();
  // A short event claim is committed before the Payment-lock transaction; never
  // hold an event lock while acquiring a Payment lock in the opposite order.
  const claim = await context.transaction(async tc => {
    const tx = tc.prisma as any;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentWebhookEvent" WHERE "id"=$1 FOR UPDATE', eventId);
    const event = await tx.paymentWebhookEvent.findUnique({ where: { id: eventId } });
    if (!event || event.storeId !== storeId || event.status !== 'unmatched' || event.deadLetterAt || Number(event.processingAttempts || 0) >= VERIFIED_EVENT_MAX_ATTEMPTS || (event.nextAttemptAt && new Date(event.nextAttemptAt).getTime() > Date.now())) return null;
    return tx.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingAttempts: Number(event.processingAttempts || 0) + 1, claimToken: token, nextAttemptAt: new Date(Date.now() + 30_000) } });
  });
  if (!claim) return false;
  let error = '';
  try {
    const verified = claim.verifiedPayload;
    if (!verified?.eventId || verified.eventId !== claim.providerEventId || verified.event?.id !== claim.providerEventId || verified.type !== claim.eventType || !VERIFIED_REFUND_TYPES.includes(claim.eventType)) throw new Error('Persisted verified envelope identity is invalid');
    await processVerifiedPaymentEvent(claim.providerCode, verified, claim.payloadHash, context, storeId);
  } catch { error = 'Verified event reconciliation failed; raw diagnostic details are withheld.'; }
  return context.transaction(async tc => {
    const tx = tc.prisma as any;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentWebhookEvent" WHERE "id"=$1 FOR UPDATE', eventId);
    const current = await tx.paymentWebhookEvent.findUnique({ where: { id: eventId } });
    if (!current || current.storeId !== storeId || current.claimToken !== token) return false;
    const reconciled = current.status === 'processed' || current.status === 'ignored';
    const exhausted = !reconciled && Number(current.processingAttempts) >= VERIFIED_EVENT_MAX_ATTEMPTS;
    await tx.paymentWebhookEvent.update({ where: { id: eventId }, data: { nextAttemptAt: reconciled || exhausted ? null : new Date(Date.now() + Math.min(300_000, 10_000 * 2 ** (Number(current.processingAttempts) - 1))), deadLetterAt: exhausted ? new Date() : null, lastProcessingError: reconciled ? '' : (error || 'Verified refund still lacks matching amount, currency, identity, or complete local payment evidence').slice(0, 2000) } });
    return reconciled;
  });
}

/** Replays only immutable envelopes persisted after cryptographic verification. */
export async function reconcileVerifiedRefundEvents(context: Context, storeId: string, limit = 20) {
  await requireFreshCapability(context, 'canManagePayments');
  const store = await requireSessionStore(context);
  if (store.id !== storeId) throw new Error('Verified event worker Store does not match the active Store');
  await (context.prisma as any).paymentWebhookEvent.updateMany({ where: { storeId, status: 'unmatched', deadLetterAt: null, processingAttempts: { gte: VERIFIED_EVENT_MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } }, data: { deadLetterAt: new Date(), nextAttemptAt: null, lastProcessingError: 'Final verification claim expired; operator replay review required' } });
  const events = await (context.prisma as any).paymentWebhookEvent.findMany({ where: { storeId, status: 'unmatched', deadLetterAt: null, processingAttempts: { lt: VERIFIED_EVENT_MAX_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }], eventType: { in: VERIFIED_REFUND_TYPES } }, orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: Math.max(1, Math.min(50, limit)) });
  let reconciled = 0;
  for (const event of events) if (await reconcileOneVerifiedEvent(context, storeId, event.id)) reconciled++;
  return { scanned: events.length, reconciled };
}

export async function replayPaymentWebhookEvent(_root: unknown, args: { eventId: string; reason: string }, context: Context) {
  await requireFreshCapability(context, 'canManagePayments');
  const store = await requireSessionStore(context);
  const reason = args.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new Error('A replay review reason of 3–500 characters is required');
  await context.transaction(async tc => {
    const tx = tc.prisma as any;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentWebhookEvent" WHERE "id"=$1 FOR UPDATE', args.eventId);
    const event = await tx.paymentWebhookEvent.findUnique({ where: { id: args.eventId } });
    if (!event || event.storeId !== store.id || event.status !== 'unmatched' || !event.deadLetterAt || !VERIFIED_REFUND_TYPES.includes(event.eventType)) throw new Error('Only dead-lettered unmatched payment events in the active Store can be replayed');
    await tx.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingAttempts: 0, nextAttemptAt: null, deadLetterAt: null, lastProcessingError: '', replayAudit: [...(Array.isArray(event.replayAudit) ? event.replayAudit : []), { actorId: context.session!.itemId, reason, replayedAt: new Date().toISOString(), previousAttempts: event.processingAttempts, previousError: event.lastProcessingError ? 'Previous reconciliation details are withheld.' : '' }] } });
  });
  const reconciled = await reconcileOneVerifiedEvent(context, store.id, args.eventId);
  const event = await (context.prisma as any).paymentWebhookEvent.findUnique({ where: { id: args.eventId }, select: { status: true, processingAttempts: true, nextAttemptAt: true, deadLetterAt: true, lastProcessingError: true } });
  return { success: reconciled, eventId: args.eventId, ...event };
}

export async function handlePaymentProviderWebhook(
  _root: unknown,
  args: HandlePaymentProviderWebhookArgs,
  context: Context
) {
  await requireFreshCapability(context, 'canManagePayments');
  return processPaymentProviderWebhook(args, context);
}
