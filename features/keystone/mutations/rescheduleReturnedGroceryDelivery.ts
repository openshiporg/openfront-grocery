import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { assertReturnedDelivery, rescheduleReturnedDeliveryInTransaction, rescheduleSlotDecision, type ReturnedDeliveryRescheduleInput } from '../lib/deliveryReschedule';
import { withSerializableRetry } from '../utils/serializableTransaction';

export async function rescheduleReturnedGroceryDelivery(_root: unknown, input: ReturnedDeliveryRescheduleInput, context: any) {
  await requireFreshCapability(context, 'canManageDelivery');
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction((tc: any) => rescheduleReturnedDeliveryInTransaction(tc.prisma, { storeId: store.id, userId: context.session.itemId }, input)));
}
export async function groceryDeliveryRescheduleSlots(_root: unknown, { orderId }: { orderId: string }, context: any) {
  await requireFreshCapability(context, 'canManageDelivery');
  const scope = await requireSessionStore(context);
  const tx = context.prisma;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  assertReturnedDelivery(order, scope.id);
  const [store, settings, slots] = await Promise.all([
    tx.store.findUnique({ where: { id: scope.id } }), tx.storeSettings.findFirst({ where: { storeId: scope.id, isActive: true } }),
    tx.deliverySlot.findMany({ where: { storeId: scope.id, isActive: true, date: { gte: new Date(Date.now() - 86400000) } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }], take: 500 }),
  ]);
  if (!store?.isActive) throw new Error('Store is unavailable');
  const eligible = slots.flatMap((slot: any) => {
    try { const result = rescheduleSlotDecision(order, slot, store, settings); return [{ id: slot.id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, available: slot.capacity - slot.currentBookings, promiseEndsAt: result.endsAt.toISOString() }]; }
    catch { return []; }
  });
  return { slots: eligible, timezone: store.timezone, message: eligible.length ? 'Choose a later window at the agreed delivery price.' : 'No eligible later window at the agreed price. Resolve payment or goods exceptions before rebooking.' };
}
