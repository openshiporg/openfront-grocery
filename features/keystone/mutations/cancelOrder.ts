import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';
import { withSerializableRetry } from '../utils/serializableTransaction';

export function hasOutstandingSettledPayment(statuses: string[]) {
  return statuses.some((status) => status === 'succeeded' || status === 'partially_refunded');
}

export async function cancelGroceryOrder(
  _root: unknown,
  { orderId, reason, idempotencyKey }: { orderId: string; reason: string; idempotencyKey: string },
  context: Context,
) {
  await requireFreshCapability(context, 'canManageOrders');
  const store = await requireSessionStore(context);
  const normalizedReason = reason.trim();
  const normalizedKey = idempotencyKey.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) throw new Error('Cancellation reason must be between 3 and 500 characters');
  if (normalizedKey.length < 12) throw new Error('Cancellation idempotency key is required');

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { select: { status: true } },
        lineItems: {
          select: {
            id: true,
            quantity: true,
            productId: true,
            inventoryLotId: true,
            inventoryAllocations: { select: { id: true, inventoryLotId: true, quantity: true } },
          },
        },
      },
    });
    if (!order || order.storeId !== store.id) throw new Error('Order not found in active store');
    const cancellation = (order.metadata as any)?.cancellation;
    if (order.status === 'cancelled') {
      if (cancellation?.idempotencyKey !== normalizedKey) throw new Error('Order was already cancelled by another operation');
      return { success: true, orderId, status: 'cancelled', reused: true };
    }
    if (order.deliveryRouteId || order.status === 'out_for_delivery' || order.status === 'delivered') {
      throw new Error('Dispatched or delivered orders cannot be cancelled');
    }
    if (!['pending', 'picking', 'packed'].includes(order.status)) throw new Error(`Order status ${order.status} cannot be cancelled`);
    if (hasOutstandingSettledPayment(order.payments.map((payment) => payment.status))) {
      throw new Error('Settled payments must be fully refunded through the refund workflow before cancelling the order');
    }

    const productIds = Array.from(new Set(order.lineItems.flatMap((line) => line.productId ? [line.productId] : []))).sort();
    const lotIds = Array.from(new Set(order.lineItems.flatMap((line) => {
      const allocated = line.inventoryAllocations.map((allocation) => allocation.inventoryLotId);
      return allocated.length ? allocated : line.inventoryLotId ? [line.inventoryLotId] : [];
    }))).sort();
    for (const productId of productIds) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
    for (const lotId of lotIds) await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
    if (order.deliverySlotId) await tx.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id" = $1 FOR UPDATE', order.deliverySlotId);
    if (order.pickupSlotId) await tx.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', order.pickupSlotId);
    const couponId = typeof (order.metadata as any)?.coupon?.id === 'string' ? (order.metadata as any).coupon.id : null;
    if (couponId) await tx.$queryRawUnsafe('SELECT "id" FROM "Coupon" WHERE "id" = $1 FOR UPDATE', couponId);

    for (const line of order.lineItems) {
      if (line.productId) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQuantity: { increment: line.quantity }, inStock: true },
        });
      }
      const allocations = line.inventoryAllocations.length
        ? line.inventoryAllocations
        : line.inventoryLotId ? [{ id: '', inventoryLotId: line.inventoryLotId, quantity: line.quantity }] : [];
      for (const allocation of allocations) {
        await tx.inventoryLot.update({ where: { id: allocation.inventoryLotId }, data: { quantityRemaining: { increment: allocation.quantity } } });
      }
      if (line.inventoryAllocations.length) {
        await tx.orderLineInventoryAllocation.deleteMany({ where: { lineItemId: line.id } });
      }
      if (line.inventoryLotId) await tx.orderLineItem.update({ where: { id: line.id }, data: { inventoryLotId: null } });
    }

    if (order.deliverySlotId) {
      const slot = await tx.deliverySlot.findUnique({ where: { id: order.deliverySlotId }, select: { currentBookings: true } });
      await tx.deliverySlot.update({ where: { id: order.deliverySlotId }, data: { currentBookings: Math.max(0, Number(slot?.currentBookings || 0) - 1) } });
    }
    if (order.pickupSlotId) {
      const slot = await tx.pickupSlot.findUnique({ where: { id: order.pickupSlotId }, select: { currentOrders: true, maxOrders: true, isActive: true } });
      const nextOrders = Math.max(0, Number(slot?.currentOrders || 0) - 1);
      await tx.pickupSlot.update({
        where: { id: order.pickupSlotId },
        data: { currentOrders: nextOrders, isAvailable: Boolean(slot?.isActive) && nextOrders < Number(slot?.maxOrders || 0) },
      });
    }
    const parkingSpotId = typeof (order.metadata as any)?.parkingSpotId === 'string' ? (order.metadata as any).parkingSpotId : null;
    if (parkingSpotId) {
      const spot = await tx.parkingSpot.findUnique({ where: { id: parkingSpotId }, select: { storeId: true } });
      if (spot?.storeId === store.id) await tx.parkingSpot.update({ where: { id: parkingSpotId }, data: { isAvailable: true } });
    }

    if (couponId) {
      const coupon = await tx.coupon.findUnique({ where: { id: couponId }, select: { storeId: true, currentUses: true } });
      if (coupon?.storeId === store.id) {
        await tx.coupon.update({ where: { id: couponId }, data: { currentUses: Math.max(0, Number(coupon.currentUses || 0) - 1) } });
      }
    }

    const cancelledAt = new Date();
    const metadata = {
      ...((order.metadata as Record<string, unknown> | null) || {}),
      cancellation: {
        idempotencyKey: normalizedKey,
        reason: normalizedReason,
        cancelledBy: context.session?.itemId,
        cancelledAt: cancelledAt.toISOString(),
        inventoryRestored: true,
        fulfillmentCapacityReleased: true,
        couponRedemptionReleased: Boolean(couponId),
      },
    };
    await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled', canceledAt: cancelledAt, metadata } });
    await enqueueGroceryOutboxEvent(tx, {
      storeId: store.id,
      eventKey: `order.cancelled:${orderId}:${normalizedKey}`,
      eventType: 'order.cancelled',
      aggregateType: 'Order',
      aggregateId: orderId,
      occurredAt: cancelledAt.toISOString(),
      payload: { orderId, reason: normalizedReason, idempotencyKey: normalizedKey, inventoryRestored: true, fulfillmentCapacityReleased: true, couponRedemptionReleased: Boolean(couponId) },
    });
    return { success: true, orderId, status: 'cancelled', reused: false };
  }, { isolationLevel: 'Serializable' as any }));
}
