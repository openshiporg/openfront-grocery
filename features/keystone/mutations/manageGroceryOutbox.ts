import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { newGroceryOutboxClaimToken } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';

async function assertCanManageOutbox(context: Context) {
  await requireFreshCapability(context, 'canManageOnboarding');
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
  const groups = await context.prisma.groceryOutboxEvent.groupBy({ by: ['status'], where: { storeId: store.id }, _count: { _all: true } });
  const counts = Object.fromEntries(groups.map((group: any) => [group.status, group._count._all]));
  return {
    pending: counts.pending || 0,
    processing: counts.processing || 0,
    delivered: counts.delivered || 0,
    failed: counts.failed || 0,
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
    const rows = await txContext.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "GroceryOutboxEvent"
       WHERE "status" = 'pending' AND "store" = $2
       ORDER BY "occurredAt" ASC, "id" ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      boundedLimit,
      store.id
    );
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const claimToken = newGroceryOutboxClaimToken(normalizedWorkerId);
    await txContext.prisma.groceryOutboxEvent.updateMany({
      where: { id: { in: ids }, status: 'pending' },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
        claimToken,
        claimedAt: new Date(),
        lastError: '',
      },
    });
    const events = await txContext.prisma.groceryOutboxEvent.findMany({
      where: { id: { in: ids } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    return events.map(eventResult);
  }, { isolationLevel: 'ReadCommitted' as any });
}

export async function completeGroceryOutboxEvent(
  _root: unknown,
  { eventId, claimToken, succeeded, error }: { eventId: string; claimToken: string; succeeded: boolean; error?: string | null },
  context: Context
) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  if (!claimToken.trim()) throw new Error('Outbox claim token is required');
  const normalizedError = error?.trim().slice(0, 2000) || '';
  return context.transaction(async (txContext) => {
    await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', eventId);
    const event = await txContext.prisma.groceryOutboxEvent.findUnique({ where: { id: eventId } });
    if (!event || event.storeId !== store.id || event.status !== 'processing' || event.claimToken !== claimToken) {
      throw new Error('Outbox event is not owned by this active claim');
    }
    const updated = await txContext.prisma.groceryOutboxEvent.update({
      where: { id: event.id },
      data: succeeded
        ? { status: 'delivered', deliveredAt: new Date(), claimToken: '', claimedAt: null, lastError: '' }
        : { status: 'failed', claimToken: '', claimedAt: null, lastError: normalizedError || 'Delivery failed' },
    });
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
    await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', eventId);
    const event = await txContext.prisma.groceryOutboxEvent.findUnique({ where: { id: eventId } });
    if (!event || event.storeId !== store.id || event.status !== 'failed') throw new Error('Only failed outbox events can be replayed');
    const updated = await txContext.prisma.groceryOutboxEvent.update({
      where: { id: event.id },
      data: { status: 'pending', claimToken: '', claimedAt: null, deliveredAt: null },
    });
    return eventResult(updated);
  }, { isolationLevel: 'ReadCommitted' as any });
}
