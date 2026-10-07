import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { newGroceryOutboxClaimToken } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';

const DELIVERY_UNKNOWN_MESSAGE = 'Delivery outcome unknown; reconcile the provider receipt before retrying';

async function assertCanManageOutbox(context: Context) {
  await requireFreshCapability(context, 'canManageOnboarding');
}

function requireSuccessfulOutboxResult<T>(result: T, operation: string): T {
  if ((result as any)?.extensions?.code === 'KS_PRISMA_ERROR') throw new Error(`Outbox ${operation} failed`);
  return result;
}

function eventResult(event: any) {
  return {
    eventId: event.id,
    eventKey: event.eventKey,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
    payloadHash: event.payloadHash,
    occurredAt: new Date(event.occurredAt).toISOString(),
    status: event.status,
    attempts: event.attempts,
    claimToken: event.claimToken || null,
  };
}

export async function groceryOutboxStatus(_root: unknown, _args: unknown, context: Context) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  const groups = requireSuccessfulOutboxResult(await context.prisma.groceryOutboxEvent.groupBy({ by: ['status'], where: { storeId: store.id }, _count: { _all: true } }), 'status query');
  const counts = Object.fromEntries(groups.map((group: any) => [group.status, group._count._all]));
  return {
    pending: counts.pending || 0,
    processing: counts.processing || 0,
    delivered: counts.delivered || 0,
    failed: counts.failed || 0,
    unknown: counts.unknown || 0,
    reconciled: counts.reconciled || 0,
  };
}

export async function claimGroceryOutboxEvents(
  _root: unknown,
  { workerId, limit = 20 }: { workerId: string; limit?: number },
  context: Context
) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  const normalizedWorkerId = workerId.trim();
  if (!/^[a-zA-Z0-9:_-]{3,80}$/.test(normalizedWorkerId)) throw new Error('A valid outbox worker ID is required');
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));

  return context.transaction(async (txContext) => {
    const recoveryCutoff = new Date(Date.now() - 300000);
    const staleEvents = requireSuccessfulOutboxResult(await txContext.prisma.groceryOutboxEvent.findMany({
      where: { storeId: store.id, status: 'processing', attempts: { gte: 10 }, claimedAt: { lt: recoveryCutoff } },
      orderBy: [{ claimedAt: 'asc' }, { id: 'asc' }], take: 100,
    }), 'stale-claim lookup');
    for (const stale of staleEvents) {
      requireSuccessfulOutboxResult(await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', stale.id), 'stale-claim lock');
      const event = requireSuccessfulOutboxResult(await txContext.prisma.groceryOutboxEvent.findUnique({ where: { id: stale.id } }), 'stale-claim recheck');
      if (!event || event.storeId !== store.id || event.status !== 'processing' || Number(event.attempts) < 10 || !event.claimedAt || new Date(event.claimedAt).getTime() >= recoveryCutoff.getTime()) continue;
      const message = requireSuccessfulOutboxResult(await txContext.prisma.customerMessage.findUnique({ where: { eventKey: `${event.eventKey}:email` } }), 'stale customer-message lookup');
      let eventStatus = 'failed';
      let lastError = 'Delivery claim expired at the attempt limit; manual review required';
      if (message && message.storeId === event.storeId && message.storeId === store.id && ['processing', 'unknown'].includes(message.status)) {
        requireSuccessfulOutboxResult(await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "CustomerMessage" WHERE "id" = $1 FOR UPDATE', message.id), 'stale customer-message lock');
        const currentMessage = requireSuccessfulOutboxResult(await txContext.prisma.customerMessage.findUnique({ where: { id: message.id } }), 'stale customer-message recheck');
        if (currentMessage && currentMessage.storeId === event.storeId && currentMessage.storeId === store.id && ['processing', 'unknown'].includes(currentMessage.status)) {
          const leaseActive = currentMessage.deliveryLeaseExpiresAt && new Date(currentMessage.deliveryLeaseExpiresAt).getTime() > Date.now();
          if (currentMessage.status === 'processing' && !leaseActive) requireSuccessfulOutboxResult(await txContext.prisma.customerMessage.update({ where: { id: currentMessage.id }, data: {
            status: 'unknown', deliveryToken: '', deliveryLeaseExpiresAt: null, failureMessage: DELIVERY_UNKNOWN_MESSAGE,
            providerEvidence: { ...((currentMessage.providerEvidence && typeof currentMessage.providerEvidence === 'object' && !Array.isArray(currentMessage.providerEvidence)) ? currentMessage.providerEvidence as Record<string, unknown> : {}), deliveryOutcome: { status: 'unknown', reason: 'Outbox claim expired at the attempt limit', observedAt: new Date().toISOString() } },
          } }), 'stale customer-message reconciliation');
          eventStatus = 'unknown';
          lastError = DELIVERY_UNKNOWN_MESSAGE;
        } else if (currentMessage && currentMessage.storeId !== event.storeId) {
          lastError = 'Delivery message ownership mismatch; manual review required';
        }
      } else if (message && message.storeId !== event.storeId) {
        lastError = 'Delivery message ownership mismatch; manual review required';
      }
      requireSuccessfulOutboxResult(await txContext.prisma.groceryOutboxEvent.update({ where: { id: event.id }, data: {
        status: eventStatus, claimToken: '', claimedAt: null, nextAttemptAt: null, lastError,
      } }), 'stale-claim recovery');
    }
    const rows = requireSuccessfulOutboxResult(await txContext.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "GroceryOutboxEvent"
       WHERE ("status" = 'pending' OR ("status" = 'failed' AND "nextAttemptAt" <= NOW()) OR ("status" = 'processing' AND "claimedAt" < NOW() - INTERVAL '5 minutes')) AND "store" = $2 AND "attempts" < 10
       ORDER BY "occurredAt" ASC, "id" ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      boundedLimit,
      store.id
    ), 'claim query');
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const claimToken = newGroceryOutboxClaimToken(normalizedWorkerId);
    requireSuccessfulOutboxResult(await txContext.prisma.groceryOutboxEvent.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
        claimToken,
        claimedAt: new Date(),
        lastError: '',
      },
    }), 'claim update');
    const events = requireSuccessfulOutboxResult(await txContext.prisma.groceryOutboxEvent.findMany({
      where: { id: { in: ids } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }), 'claimed-event query');
    return events.map(eventResult);
  }, { isolationLevel: 'ReadCommitted' as any });
}

export async function completeGroceryOutboxEvent(
  _root: unknown,
  { eventId, claimToken, succeeded, unknown = false, error }: { eventId: string; claimToken: string; succeeded: boolean; unknown?: boolean; error?: string | null },
  context: Context
) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  if (!claimToken.trim()) throw new Error('Outbox claim token is required');
  if (succeeded && unknown) throw new Error('An outbox completion cannot be both delivered and unknown');
  const normalizedError = unknown ? 'Delivery outcome unknown; reconcile the provider receipt before retrying' : error?.trim().slice(0, 2000) || '';
  return context.transaction(async (txContext) => {
    requireSuccessfulOutboxResult(await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', eventId), 'completion lock');
    const event = requireSuccessfulOutboxResult(await txContext.prisma.groceryOutboxEvent.findUnique({ where: { id: eventId } }), 'completion lookup');
    if (!event || event.storeId !== store.id || event.status !== 'processing' || event.claimToken !== claimToken) {
      throw new Error('Outbox event is not owned by this active claim');
    }
    if (unknown) {
      const message = requireSuccessfulOutboxResult(await txContext.prisma.customerMessage.findUnique({ where: { eventKey: `${event.eventKey}:email` } }), 'unknown message lookup');
      if (!message || message.storeId !== store.id || message.status !== 'unknown') throw new Error('Unknown completion requires a matching unknown customer message');
    }
    const updated = requireSuccessfulOutboxResult(await (txContext.prisma as any).groceryOutboxEvent.update({
      where: { id: event.id },
      data: succeeded
        ? { status: 'delivered', deliveredAt: new Date(), claimToken: '', claimedAt: null, nextAttemptAt: null, lastError: '' }
        : unknown
          ? { status: 'unknown', claimToken: '', claimedAt: null, nextAttemptAt: null, lastError: normalizedError }
          : { status: 'failed', claimToken: '', claimedAt: null, nextAttemptAt: Number(event.attempts || 0) < 10 ? new Date(Date.now()+Math.min(3600000,30000*2**Number(event.attempts || 0))) : null, lastError: normalizedError || 'Delivery failed' },
    }), 'completion update');
    return eventResult(updated);
  }, { isolationLevel: 'ReadCommitted' as any });
}

/**
 * Quarantine an owned outbox claim when SMTP may have accepted the message but
 * the customer-message state cannot be read. The event's random claim token
 * fences this internal worker transition; reconciliation accepts a still-
 * processing message after its delivery lease expires, but no worker replays an
 * unknown event automatically.
 */
export async function completeUnknownGroceryOutboxEventFromWorker(
  context: Context,
  { eventId, claimToken }: { eventId: string; claimToken: string }
) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  if (!claimToken.trim()) throw new Error('Outbox claim token is required');
  return context.transaction(async (txContext) => {
    requireSuccessfulOutboxResult(await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', eventId), 'unknown completion lock');
    const event = requireSuccessfulOutboxResult(await txContext.prisma.groceryOutboxEvent.findUnique({ where: { id: eventId } }), 'unknown completion lookup');
    if (!event || event.storeId !== store.id || event.status !== 'processing' || event.claimToken !== claimToken) {
      throw new Error('Outbox event is not owned by this active claim');
    }
    const updated = requireSuccessfulOutboxResult(await (txContext.prisma as any).groceryOutboxEvent.update({
      where: { id: event.id },
      data: { status: 'unknown', claimToken: '', claimedAt: null, nextAttemptAt: null, lastError: 'Delivery outcome unknown; reconcile the provider receipt before retrying' },
    }), 'unknown completion update');
    return eventResult(updated);
  }, { isolationLevel: 'ReadCommitted' as any });
}

export async function replayGroceryOutboxEvent(
  _root: unknown,
  { eventId }: { eventId: string },
  context: Context
) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  return context.transaction(async (txContext) => {
    requireSuccessfulOutboxResult(await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', eventId), 'replay lock');
    const event = requireSuccessfulOutboxResult(await txContext.prisma.groceryOutboxEvent.findUnique({ where: { id: eventId } }), 'replay lookup');
    if (!event || event.storeId !== store.id || event.status !== 'failed') throw new Error('Only failed outbox events can be replayed');
    if (Number(event.attempts || 0) >= 10) throw new Error('Outbox attempt limit reached; manual review is required');
    const message = requireSuccessfulOutboxResult(await txContext.prisma.customerMessage.findUnique({ where: { eventKey: `${event.eventKey}:email` } }), 'replay message lookup');
    if (message && ['processing', 'unknown'].includes(message.status)) throw new Error('Unresolved customer delivery must use evidence-based reconciliation, not generic replay');
    if (message && ['pending', 'failed'].includes(message.status) && Number(message.attempts || 0) >= 10) throw new Error('Customer message attempt limit reached; manual review is required');
    const updated = requireSuccessfulOutboxResult(await (txContext.prisma as any).groceryOutboxEvent.update({
      where: { id: event.id },
      data: { status: 'pending', claimToken: '', claimedAt: null, deliveredAt: null },
    }), 'replay update');
    return eventResult(updated);
  }, { isolationLevel: 'ReadCommitted' as any });
}

export async function reconcileGroceryCustomerDelivery(
  _root: unknown,
  { eventId, action, reason, confirmDuplicateRisk = false }: { eventId: string; action: string; reason: string; confirmDuplicateRisk?: boolean },
  context: Context
) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  const normalizedReason = reason?.trim() || '';
  if (!['acknowledge', 'retry'].includes(action)) throw new Error('Choose acknowledge or retry');
  if (normalizedReason.length < 10 || normalizedReason.length > 500) throw new Error('Reconciliation evidence must be 10–500 characters');
  if (action === 'retry' && !confirmDuplicateRisk) throw new Error('Confirm the possible duplicate before retrying an unknown message');

  return context.transaction(async (txContext) => {
    const tx = txContext.prisma as any;
    requireSuccessfulOutboxResult(await tx.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', eventId), 'reconciliation lock');
    const event = requireSuccessfulOutboxResult(await tx.groceryOutboxEvent.findUnique({ where: { id: eventId } }), 'reconciliation lookup');
    if (!event || event.storeId !== store.id || event.status !== 'unknown') throw new Error('Only an unknown communication event in the active Store can be reconciled');
    const message = requireSuccessfulOutboxResult(await tx.customerMessage.findUnique({ where: { eventKey: `${event.eventKey}:email` } }), 'message lookup');
    if (!message || message.storeId !== store.id || !['unknown', 'processing', 'sent'].includes(message.status)) throw new Error('Unknown event has no matching unresolved customer message');
    requireSuccessfulOutboxResult(await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerMessage" WHERE "id" = $1 FOR UPDATE', message.id), 'message lock');
    const currentMessage = requireSuccessfulOutboxResult(await tx.customerMessage.findUnique({ where: { id: message.id } }), 'message reconciliation lookup');
    if (!currentMessage || currentMessage.storeId !== store.id || currentMessage.status === 'suppressed') throw new Error('Customer message is no longer eligible for reconciliation');
    if (currentMessage.deliveryLeaseExpiresAt && new Date(currentMessage.deliveryLeaseExpiresAt).getTime() > Date.now()) throw new Error('Message delivery is still in flight');
    if (!['unknown', 'processing', 'sent'].includes(currentMessage.status)) throw new Error('Customer message is no longer unresolved');
    if (action === 'retry' && (Number(event.attempts || 0) >= 10 || Number(currentMessage.attempts || 0) >= 10)) throw new Error('Delivery attempt limit reached; contact the customer manually');

    const prior = currentMessage.providerEvidence && typeof currentMessage.providerEvidence === 'object' && !Array.isArray(currentMessage.providerEvidence) ? currentMessage.providerEvidence : {};
    const history = Array.isArray((prior as any).deliveryReconciliations) ? (prior as any).deliveryReconciliations : [];
    const evidence = {
      ...(prior as any),
      deliveryReconciliations: [...history.slice(-49), {
        action: action === 'retry' ? 'duplicate_risk_retry_authorized' : 'outcome_acknowledged_without_resend',
        reason: normalizedReason,
        actorId: context.session?.itemId,
        at: new Date().toISOString(),
        duplicateRiskAcknowledged: action === 'retry' && confirmDuplicateRisk,
      }],
    };
    requireSuccessfulOutboxResult(await tx.customerMessage.update({ where: { id: currentMessage.id }, data: {
      status: action === 'retry' ? 'pending' : currentMessage.status === 'sent' ? 'sent' : 'acknowledged',
      deliveryToken: '', deliveryLeaseExpiresAt: null, failureMessage: action === 'retry' ? '' : 'Outcome reviewed; no automatic resend',
      providerEvidence: evidence,
    } }), 'message reconciliation update');
    const updated = requireSuccessfulOutboxResult(await tx.groceryOutboxEvent.update({ where: { id: event.id }, data: action === 'retry'
      ? { status: 'pending', claimToken: '', claimedAt: null, nextAttemptAt: null, lastError: '' }
      : { status: 'reconciled', claimToken: '', claimedAt: null, nextAttemptAt: null, lastError: 'Outcome reviewed; no automatic resend' },
    }), 'event reconciliation update');
    return eventResult(updated);
  }, { isolationLevel: 'ReadCommitted' as any });
}
