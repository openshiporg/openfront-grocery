import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { isSlotWithinDays, zonedDateKey } from '../lib/storeTime';

interface PickupSlotResult {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  availableCapacity: number;
  maxOrders: number;
  currentOrders: number;
  isAvailable: boolean;
}

interface GetAvailablePickupSlotsInput {
  days?: number;
  minCapacity?: number;
}

async function deliveryStore(context: Context) {
  return requireFreshCapability(context, 'canManageDelivery');
}

function slotResult(slot: {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  maxOrders: number;
  currentOrders: number | null;
  isAvailable: boolean | null;
}): PickupSlotResult {
  const currentOrders = slot.currentOrders || 0;
  return {
    id: slot.id,
    date: slot.date.toISOString(),
    startTime: slot.startTime,
    endTime: slot.endTime,
    availableCapacity: Math.max(0, slot.maxOrders - currentOrders),
    maxOrders: slot.maxOrders,
    currentOrders,
    isAvailable: Boolean(slot.isAvailable),
  };
}

// Staff-only operational query. Public checkout uses publicGroceryAvailability.
export async function getAvailablePickupSlots(
  _root: unknown,
  { days = 7, minCapacity = 1 }: GetAvailablePickupSlotsInput,
  context: Context,
): Promise<PickupSlotResult[]> {
  const { storeId } = await deliveryStore(context);
  const store = await context.prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } });
  if (!store) throw new Error('Active store was not found');
  const boundedDays = Math.min(14, Math.max(1, Math.trunc(days)));
  const boundedCapacity = Math.max(1, Math.trunc(minCapacity));
  const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + (boundedDays + 2) * 24 * 60 * 60 * 1000);

  const slots = await context.prisma.pickupSlot.findMany({
    where: {
      storeId,
      date: { gte: startDate, lt: endDate },
      isActive: true,
      isAvailable: true,
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: 200,
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      maxOrders: true,
      currentOrders: true,
      isActive: true,
      isAvailable: true,
    },
  });

  return slots
    .filter((slot) => isSlotWithinDays(slot, store.timezone, boundedDays))
    .map(slotResult)
    .filter((slot) => slot.availableCapacity >= boundedCapacity);
}

export async function getPickupSlotsByDate(
  root: unknown,
  args: GetAvailablePickupSlotsInput,
  context: Context,
) {
  const slots = await getAvailablePickupSlots(root, args, context);
  const storeId = context.session?.data.store?.id;
  const store = storeId ? await context.prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } }) : null;
  if (!store) throw new Error('Active store was not found');
  const grouped = new Map<string, PickupSlotResult[]>();
  for (const slot of slots) {
    const date = zonedDateKey(slot.date, store.timezone);
    grouped.set(date, [...(grouped.get(date) || []), slot]);
  }
  return Array.from(grouped, ([date, daySlots]) => ({
    date,
    slots: daySlots,
    totalSlots: daySlots.length,
    totalAvailableCapacity: daySlots.reduce((sum, slot) => sum + slot.availableCapacity, 0),
  }));
}

// Retained for compatibility with staff clients. Checkout owns normal booking.
export async function reservePickupSlot(
  _root: unknown,
  { slotId, orderId }: { slotId: string; orderId: string },
  context: Context,
) {
  const { storeId } = await deliveryStore(context);
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', slotId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const [slot, order] = await Promise.all([
      tx.pickupSlot.findUnique({ where: { id: slotId } }),
      tx.order.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, pickupSlotId: true, metadata: true } }),
    ]);
    if (!slot || slot.storeId !== storeId) throw new Error('Pickup slot not found');
    if (!order || order.storeId !== storeId) throw new Error('Order not found');
    if ((order.metadata as any)?.fulfillmentMethod !== 'pickup') throw new Error('Only pickup orders can reserve pickup slots');

    const currentOrders = slot.currentOrders || 0;
    if (order.pickupSlotId === slot.id) {
      return {
        success: true,
        slotId,
        orderId,
        pickupDate: slot.date.toISOString(),
        pickupStartTime: slot.startTime,
        pickupEndTime: slot.endTime,
        remainingCapacity: Math.max(0, slot.maxOrders - currentOrders),
      };
    }
    if (order.pickupSlotId) throw new Error('Order already has a different pickup slot reservation');
    if (!slot.isActive || !slot.isAvailable || currentOrders >= slot.maxOrders) throw new Error('Pickup slot is fully booked');

    const nextOrders = currentOrders + 1;
    const metadata = {
      ...((order.metadata as Record<string, unknown> | null) || {}),
      pickupSlotId: slot.id,
      pickupDate: slot.date.toISOString(),
      pickupStartTime: slot.startTime,
      pickupEndTime: slot.endTime,
    };
    await tx.pickupSlot.update({
      where: { id: slot.id },
      data: { currentOrders: nextOrders, isAvailable: slot.isActive && nextOrders < slot.maxOrders },
    });
    await tx.order.update({ where: { id: order.id }, data: { pickupSlotId: slot.id, metadata } });

    return {
      success: true,
      slotId,
      orderId,
      pickupDate: slot.date.toISOString(),
      pickupStartTime: slot.startTime,
      pickupEndTime: slot.endTime,
      remainingCapacity: slot.maxOrders - nextOrders,
    };
  }, { isolationLevel: 'ReadCommitted' as any });
}

export async function releasePickupSlot(
  _root: unknown,
  { slotId, orderId }: { slotId: string; orderId: string },
  context: Context,
) {
  const { storeId } = await deliveryStore(context);
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', slotId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const [slot, order] = await Promise.all([
      tx.pickupSlot.findUnique({ where: { id: slotId } }),
      tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true, storeId: true, status: true, pickupSlotId: true, metadata: true,
          payments: { select: { amountCents: true, status: true, refunds: { select: { amountCents: true, status: true } } } },
        },
      }),
    ]);
    if (!slot || slot.storeId !== storeId) throw new Error('Pickup slot not found');
    if (!order || order.storeId !== storeId) throw new Error('Order not found');
    const currentOrders = slot.currentOrders || 0;
    if (order.pickupSlotId !== slot.id) {
      return { success: true, slotId, remainingCapacity: Math.max(0, slot.maxOrders - currentOrders) };
    }

    const outstandingSettledCents = order.payments.reduce((sum, payment) => {
      if (!['succeeded', 'captured', 'partially_refunded', 'refunded'].includes(payment.status || '')) return sum;
      const refunded = payment.refunds.filter((refund) => refund.status === 'succeeded').reduce((total, refund) => total + refund.amountCents, 0);
      return sum + Math.max(0, payment.amountCents - refunded);
    }, 0);
    if (order.status !== 'cancelled' || outstandingSettledCents > 0) {
      throw new Error('Active or paid pickup orders cannot release their reserved slot');
    }
    const nextOrders = Math.max(0, currentOrders - 1);
    const metadata = { ...((order.metadata as Record<string, unknown> | null) || {}) } as Record<string, unknown>;
    delete metadata.pickupSlotId;
    delete metadata.pickupDate;
    delete metadata.pickupStartTime;
    delete metadata.pickupEndTime;
    await tx.pickupSlot.update({ where: { id: slot.id }, data: { currentOrders: nextOrders, isAvailable: slot.isActive && nextOrders < slot.maxOrders } });
    await tx.order.update({ where: { id: order.id }, data: { pickupSlotId: null, metadata: metadata as any } });
    return { success: true, slotId, remainingCapacity: slot.maxOrders - nextOrders };
  }, { isolationLevel: 'ReadCommitted' as any });
}
