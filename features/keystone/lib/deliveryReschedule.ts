import { evaluateFulfillmentWindow } from './rollingFulfillment';
import { evaluateDeliveryPolicy } from './deliveryPolicy';
import { zonedDateKey, zonedDateTimeForDateKey } from './storeTime';
import { assertOrderHandoffPayment } from './fulfillmentPayment';
import { assertOrderInventoryEligible } from './inventorySafety';
import { enqueueGroceryOutboxEvent, groceryOutboxPayloadHash } from './groceryOutbox';

export type ReturnedDeliveryRescheduleInput = { orderId: string; deliverySlotId: string; customerApproval: string; conditionEvidence: string; idempotencyKey: string };
export function normalizeReturnedDeliveryReschedule(input: ReturnedDeliveryRescheduleInput) {
  const result = Object.fromEntries(['orderId', 'deliverySlotId', 'customerApproval', 'conditionEvidence', 'idempotencyKey'].map(key => [key, String(input[key as keyof ReturnedDeliveryRescheduleInput] || '').trim()])) as ReturnedDeliveryRescheduleInput;
  if (!result.orderId || !result.deliverySlotId) throw new Error('Order and new delivery slot are required');
  if (result.customerApproval.length < 12 || result.customerApproval.length > 1000) throw new Error('Record the customer identity, contact channel and approval of the new window');
  if (result.conditionEvidence.length < 12 || result.conditionEvidence.length > 1000) throw new Error('Record the returned goods inspection and cold-chain condition');
  if (result.idempotencyKey.length < 12 || result.idempotencyKey.length > 200) throw new Error('A bounded reschedule request identity is required');
  return result;
}
export function assertReturnedDelivery(order: any, storeId: string) {
  if (!order || order.storeId !== storeId) throw new Error('Order not found in active store');
  if (order.status !== 'returned' || order.deliveryRouteId || order.metadata?.fulfillmentMethod !== 'delivery'
    || order.metadata?.deliveryOutcome?.status !== 'returned' || order.metadata?.deliveryOutcome?.custody !== 'store') throw new Error('Return the failed delivery to confirmed store custody before booking another window');
  if (order.metadata?.inventoryReleasedAt || order.metadata?.cancellation) throw new Error('Returned goods were already released or entered cancellation');
}
export function rescheduleSlotDecision(order: any, slot: any, store: any, settings: any, now = new Date()) {
  if (!slot || slot.storeId !== store.id || !slot.isActive) throw new Error('New delivery slot is not active in this Store');
  if (!Number.isSafeInteger(slot.currentBookings) || !Number.isSafeInteger(slot.capacity) || slot.currentBookings >= slot.capacity) throw new Error('New delivery slot is fully booked');
  const decision = evaluateFulfillmentWindow({ hours: settings?.hours, timeZone: store.timezone, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, now });
  if (!settings || !decision.allowed) throw new Error('New delivery slot is outside hours, cutoff, blackout or booking horizon');
  const dateKey = zonedDateKey(slot.date, store.timezone);
  const startsAt = zonedDateTimeForDateKey(dateKey, slot.startTime, store.timezone);
  const endsAt = zonedDateTimeForDateKey(dateKey, slot.endTime, store.timezone);
  const oldEnd = new Date(order.metadata?.promiseEndsAt).getTime();
  if (!Number.isFinite(oldEnd) || startsAt.getTime() <= oldEnd) throw new Error('Choose a later delivery window after the original promise');
  const sale = order.metadata?.finalSale;
  const service = evaluateDeliveryPolicy(settings.deliveryPolicy, 'delivery', order.metadata?.shippingAddressSnapshot?.postalCode || '', Number(sale?.subtotalCents) - Number(sale?.discountCents));
  const fee = Number(slot.deliveryFee) + service.feeCents;
  if (!Number.isSafeInteger(fee) || fee !== sale?.feeCents || service.feeTaxRateBasisPoints !== Number(order.metadata?.deliveryPolicySnapshot?.feeTaxRateBasisPoints || 0)) throw new Error('New window changes the agreed delivery price or tax; resolve payment adjustment before rescheduling');
  return { startsAt, endsAt, feeCents: fee, policy: service.policy };
}

/** Reserved actual goods remain allocated; this moves only the customer promise and slot capacity. */
export async function rescheduleReturnedDeliveryInTransaction(tx: any, actor: { storeId: string; userId: string }, rawInput: ReturnedDeliveryRescheduleInput, now = new Date()) {
  const input = normalizeReturnedDeliveryReschedule(rawInput);
  const fingerprint = groceryOutboxPayloadHash(input);
  await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', input.orderId);
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.storeId !== actor.storeId) throw new Error('Order not found in active store');
  const history = Array.isArray(order.metadata?.deliveryReschedules) ? order.metadata.deliveryReschedules : [];
  const prior = history.find((event: any) => event.idempotencyKey === input.idempotencyKey);
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new Error('Reschedule request key was reused with different evidence');
    return { success: true, orderId: order.id, deliverySlotId: prior.after.deliverySlotId, promiseEndsAt: prior.after.promiseEndsAt, reused: true };
  }
  assertReturnedDelivery(order, actor.storeId);
  const oldSlotId = order.deliverySlotId;
  if (!oldSlotId || oldSlotId === input.deliverySlotId) throw new Error('Select a different delivery booking');
  for (const id of [oldSlotId, input.deliverySlotId].sort()) await tx.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id"=$1 FOR UPDATE', id);
  const [oldSlot, newSlot, store, settings] = await Promise.all([
    tx.deliverySlot.findUnique({ where: { id: oldSlotId } }), tx.deliverySlot.findUnique({ where: { id: input.deliverySlotId } }),
    tx.store.findUnique({ where: { id: actor.storeId } }), tx.storeSettings.findFirst({ where: { storeId: actor.storeId, isActive: true } }),
  ]);
  if (!store?.isActive || !oldSlot || oldSlot.storeId !== actor.storeId || !Number.isSafeInteger(oldSlot.currentBookings) || oldSlot.currentBookings < 1) throw new Error('Original delivery booking requires reconciliation');
  const decision = rescheduleSlotDecision(order, newSlot, store, settings, now);
  await assertOrderHandoffPayment(tx, order);
  await assertOrderInventoryEligible(tx, order.id, actor.storeId, decision.endsAt);
  const hour = Number(newSlot.startTime.slice(0, 2));
  const deliveryTimeWindow = hour < 10 ? 'time_8_10' : hour < 12 ? 'time_10_12' : hour < 14 ? 'time_12_14' : hour < 16 ? 'time_14_16' : hour < 18 ? 'time_16_18' : 'time_18_20';
  const before = { deliverySlotId: oldSlotId, deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString() : null, deliveryTimeWindow: order.deliveryTimeWindow,
    promiseEndsAt: order.metadata.promiseEndsAt, selectedFulfillmentSlot: order.metadata.selectedFulfillmentSlot, deliveryPolicySnapshot: order.metadata.deliveryPolicySnapshot, outcome: order.metadata.deliveryOutcome };
  const after = { deliverySlotId: newSlot.id, deliveryDate: new Date(newSlot.date).toISOString(), deliveryTimeWindow, promiseEndsAt: decision.endsAt.toISOString(),
    selectedFulfillmentSlot: { date: new Date(newSlot.date).toISOString(), startTime: newSlot.startTime, endTime: newSlot.endTime } };
  const event = { ...input, actorId: actor.userId, customerId: order.userId || null, occurredAt: now.toISOString(), fingerprint, before, after };
  await tx.deliverySlot.update({ where: { id: oldSlotId }, data: { currentBookings: oldSlot.currentBookings - 1 } });
  await tx.deliverySlot.update({ where: { id: newSlot.id }, data: { currentBookings: newSlot.currentBookings + 1 } });
  await tx.order.update({ where: { id: order.id }, data: { status: 'packed', deliverySlotId: newSlot.id, deliveryDate: new Date(newSlot.date), deliveryTimeWindow,
    metadata: { ...order.metadata, ...after, deliveryPolicySnapshot: decision.policy, deliveryReschedules: [...history, event],
      deliveryOutcome: { status: 'rescheduled', custody: 'store', occurredAt: event.occurredAt, reason: 'Customer-approved later delivery window', retryAt: decision.startsAt.toISOString() } } } });
  await enqueueGroceryOutboxEvent(tx, { storeId: actor.storeId, eventKey: `order.rescheduled:${groceryOutboxPayloadHash({ orderId: order.id, key: input.idempotencyKey })}`,
    eventType: 'order.rescheduled', aggregateType: 'Order', aggregateId: order.id, occurredAt: now.toISOString(), payload: { orderId: order.id, before, after } });
  return { success: true, orderId: order.id, deliverySlotId: newSlot.id, promiseEndsAt: after.promiseEndsAt, reused: false };
}
