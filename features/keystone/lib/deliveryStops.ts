import { assertOrderHandoffPayment } from './fulfillmentPayment';
import { assertOrderInventoryEligible } from './inventorySafety';

export type DeliveryStopStatus = 'delivered' | 'failed' | 'refused' | 'returned' | 'rescheduled';
export type DeliveryStopInput = {
  routeId: string; orderId: string; status: DeliveryStopStatus; recipient?: string | null;
  proofReference?: string | null; reason?: string | null; custody: string; conditionEvidence: string;
  retryAt?: string | null; approvalEvidence?: string | null; idempotencyKey: string;
};

export function normalizeDeliveryStop(input: DeliveryStopInput) {
  const normalized = {
    routeId: input.routeId.trim(), orderId: input.orderId.trim(), status: input.status,
    recipient: input.recipient?.trim() || '', proofReference: input.proofReference?.trim() || '',
    reason: input.reason?.trim() || '', custody: input.custody.trim(), conditionEvidence: input.conditionEvidence.trim(),
    retryAt: input.retryAt?.trim() || '', approvalEvidence: input.approvalEvidence?.trim() || '', idempotencyKey: input.idempotencyKey.trim(),
  };
  if (!normalized.routeId || !normalized.orderId || !['delivered', 'failed', 'refused', 'returned', 'rescheduled'].includes(normalized.status)) throw new Error('Route, order and valid stop outcome are required');
  if (normalized.idempotencyKey.length < 12 || normalized.idempotencyKey.length > 200) throw new Error('A valid delivery outcome idempotency key is required');
  if (normalized.conditionEvidence.length < 8 || normalized.conditionEvidence.length > 1000) throw new Error('Record package and temperature/cold-chain condition evidence');
  if ([normalized.recipient, normalized.proofReference, normalized.reason, normalized.approvalEvidence].some(value => value.length > 1000)) throw new Error('Delivery evidence is too long');
  if (normalized.status === 'delivered') {
    if (!normalized.recipient || normalized.proofReference.length < 4 || normalized.custody !== 'recipient') throw new Error('Delivery requires recipient, handoff proof reference and recipient custody');
  } else {
    if (!normalized.reason) throw new Error('A reason is required for delivery exceptions');
    const expectedCustody = normalized.status === 'returned' ? 'store' : 'driver';
    if (normalized.custody !== expectedCustody) throw new Error(`This outcome requires recorded ${expectedCustody} custody`);
  }
  if (normalized.status === 'rescheduled' && (normalized.approvalEvidence.length < 8 || !Number.isFinite(new Date(normalized.retryAt).getTime()))) throw new Error('Record the agreed retry time and customer approval');
  return normalized;
}

export function applyDeliveryStopOutcome(stop: any, order: any, input: ReturnType<typeof normalizeDeliveryStop>, actorId: string, now = new Date()) {
  const fingerprint = JSON.stringify(input);
  const previous = (stop.events || []).find((event: any) => event.idempotencyKey === input.idempotencyKey);
  if (previous) {
    if (previous.inputFingerprint !== fingerprint) throw new Error('Delivery outcome key was reused with different evidence');
    return { stop, reused: true, previous };
  }
  if ((stop.events || []).length >= 100) throw new Error('This stop requires operator review before additional attempts');
  const allowed: Record<string, string[]> = {
    out_for_delivery: ['delivered', 'failed', 'refused', 'returned', 'rescheduled'],
    rescheduled: ['delivered', 'failed', 'refused', 'returned', 'rescheduled'],
    failed: ['rescheduled', 'returned'], refused: ['rescheduled', 'returned'],
  };
  if (!allowed[stop.status]?.includes(input.status)) throw new Error(`Cannot change a ${stop.status} stop to ${input.status}`);
  if (input.status === 'rescheduled') {
    const retry = new Date(input.retryAt).getTime(), end = new Date(order.metadata?.promiseEndsAt).getTime();
    if (!Number.isFinite(end) || retry <= now.getTime() || retry > end) throw new Error('Retry must be in the future within the existing customer delivery window');
  }
  const event = { ...input, actorId, customerEmail: order.email || null, occurredAt: now.toISOString(), inputFingerprint: fingerprint };
  return { stop: { ...stop, status: input.status, custody: input.custody, updatedAt: event.occurredAt,
    recipient: input.recipient, proofReference: input.proofReference, reason: input.reason,
    conditionEvidence: input.conditionEvidence, retryAt: input.retryAt || null,
    events: [...(stop.events || []), event] }, reused: false, previous: event };
}

export function assertDeliveryRouteComplete(stops: any[], orders: any[]) {
  if (!stops.length || new Set(stops.map(stop => stop.orderId)).size !== stops.length) throw new Error('Route must retain unique stop evidence');
  if (stops.some(stop => !['delivered', 'returned'].includes(stop.status))) throw new Error('Resolve every stop by delivery or confirmed return before completing the route');
  for (const order of orders) {
    const stop = stops.find(stop => stop.orderId === order.id);
    if (!stop || (stop.status === 'delivered' ? order.status !== 'delivered' : order.status !== 'returned')) throw new Error('Order status must match its individual delivery outcome');
  }
}

/** Current staff authorization precedes this transaction; locks serialize with refunds and lot holds. */
export async function resolveDeliveryStopInTransaction(tx: any, actor: { storeId: string; userId: string }, rawInput: DeliveryStopInput, now = new Date()) {
  const input = normalizeDeliveryStop(rawInput);
  await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "DeliveryRoute" WHERE "id" = $1 FOR UPDATE', input.routeId);
  const sudo = tx.sudo();
  const route = await sudo.query.DeliveryRoute.findOne({ where: { id: input.routeId }, query: 'id status stops store { id } driver { id }' });
  if (!route || route.store?.id !== actor.storeId) throw new Error('Delivery route not found in active store');
  const stops = Array.isArray(route.stops) ? route.stops : [];
  const index = stops.findIndex((stop: any) => stop.orderId === input.orderId);
  if (index < 0) throw new Error('Order is not a stop on this route');
  await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', input.orderId);
  const order = await sudo.query.Order.findOne({ where: { id: input.orderId }, query: 'id email status metadata store { id } deliveryRoute { id }' });
  if (!order || order.store?.id !== actor.storeId) throw new Error('Order not found in active store');
  const result = applyDeliveryStopOutcome(stops[index], order, input, actor.userId, now);
  if (result.reused) return { success: true, routeId: route.id, orderId: order.id, status: result.previous.status, reused: true };
  if (route.status !== 'in_progress' || order.deliveryRoute?.id !== route.id) throw new Error('Delivery outcomes require an active assigned route');
  if (input.status === 'delivered') {
    await assertOrderHandoffPayment(tx.prisma, order);
    await assertOrderInventoryEligible(tx.prisma, order.id, actor.storeId, now);
  }
  if (input.status === 'rescheduled') {
    await assertOrderHandoffPayment(tx.prisma, order);
    await assertOrderInventoryEligible(tx.prisma, order.id, actor.storeId, new Date(input.retryAt));
  }
  stops[index] = result.stop;
  await sudo.db.DeliveryRoute.updateOne({ where: { id: route.id }, data: { stops } });
  const nextStatus = input.status === 'failed' ? 'delivery_failed' : input.status === 'refused' ? 'delivery_refused' : input.status === 'rescheduled' ? 'out_for_delivery' : input.status;
  const previousMetadata = order.metadata || {};
  await sudo.db.Order.updateOne({ where: { id: order.id }, data: {
    status: nextStatus,
    ...(input.status === 'returned' ? { deliveryRoute: { disconnect: true } } : {}),
    metadata: { ...previousMetadata,
      deliveryOutcome: { status: input.status, routeId: route.id, custody: input.custody, occurredAt: now.toISOString(),
        recipient: input.recipient, proofReference: input.proofReference, reason: input.reason, conditionEvidence: input.conditionEvidence, retryAt: input.retryAt || null },
      ...(input.status === 'delivered' ? { deliveredAt: previousMetadata.deliveredAt || now.toISOString() } : {}),
      ...(input.status === 'returned' ? { deliveryRouteId: null, returnedAt: now.toISOString(),
        deliveryHistory: [...(previousMetadata.deliveryHistory || []), { routeId: route.id, status: 'returned', returnedAt: now.toISOString(), stop: result.stop }] } : {}),
    },
  } });
  return { success: true, routeId: route.id, orderId: order.id, status: input.status, reused: false };
}
