import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';

async function assertDelivery(context: Context) {
  await requireFreshCapability(context, 'canManageDelivery');
}
function key(value: string) { const result = value.trim(); if (result.length < 12) throw new Error('Idempotency key required'); return result; }

export async function configureDeliverySlot(_root: unknown, args: { slotId: string; capacity?: number; deliveryFee?: number; isActive?: boolean; idempotencyKey: string }, context: Context) {
  await assertDelivery(context); const store = await requireSessionStore(context); const eventKey = key(args.idempotencyKey);
  return context.transaction(async tx => {
    await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id" = $1 FOR UPDATE', args.slotId);
    const slot = await tx.prisma.deliverySlot.findUnique({ where: { id: args.slotId } });
    if (!slot || slot.storeId !== store.id) throw new Error('Delivery slot not found in active store');
    const capacity = args.capacity ?? slot.capacity; const fee = args.deliveryFee ?? slot.deliveryFee ?? 0; const active = args.isActive ?? slot.isActive;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity < (slot.currentBookings || 0)) throw new Error('Capacity cannot be below current bookings');
    if (!Number.isInteger(fee) || fee < 0) throw new Error('Delivery fee must be non-negative cents');
    const reused = capacity === slot.capacity && fee === (slot.deliveryFee || 0) && active === slot.isActive;
    const updated = reused ? slot : await tx.prisma.deliverySlot.update({ where: { id: slot.id }, data: { capacity, deliveryFee: fee, isActive: active } });
    await enqueueGroceryOutboxEvent(tx.prisma, { storeId: store.id, eventKey: `delivery-slot:${eventKey}:configured:v1`, eventType: 'delivery_slot.configured', aggregateType: 'delivery_slot', aggregateId: slot.id, occurredAt: new Date().toISOString(), payload: { slotId: slot.id, capacity: updated.capacity, deliveryFee: updated.deliveryFee || 0, isActive: updated.isActive, currentBookings: updated.currentBookings || 0 } });
    return { slotId: slot.id, capacity: updated.capacity, currentBookings: updated.currentBookings || 0, isAvailable: updated.isActive, fee: updated.deliveryFee || 0, reused };
  }, { isolationLevel: 'ReadCommitted' as any });
}

export async function configurePickupSlot(_root: unknown, args: { slotId: string; maxOrders?: number; isAvailable?: boolean; idempotencyKey: string }, context: Context) {
  await assertDelivery(context); const store = await requireSessionStore(context); const eventKey = key(args.idempotencyKey);
  return context.transaction(async tx => {
    await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', args.slotId);
    const slot = await tx.prisma.pickupSlot.findUnique({ where: { id: args.slotId } });
    if (!slot || slot.storeId !== store.id) throw new Error('Pickup slot not found in active store');
    const maxOrders = args.maxOrders ?? slot.maxOrders; const active = args.isAvailable ?? slot.isActive;
    if (!Number.isInteger(maxOrders) || maxOrders < 1 || maxOrders < (slot.currentOrders || 0)) throw new Error('Maximum orders cannot be below current orders');
    const derivedAvailability = active && (slot.currentOrders || 0) < maxOrders;
    const reused = maxOrders === slot.maxOrders && active === slot.isActive && derivedAvailability === slot.isAvailable;
    const updated = reused ? slot : await tx.prisma.pickupSlot.update({ where: { id: slot.id }, data: { maxOrders, isActive: active, isAvailable: derivedAvailability } });
    await enqueueGroceryOutboxEvent(tx.prisma, { storeId: store.id, eventKey: `pickup-slot:${eventKey}:configured:v1`, eventType: 'pickup_slot.configured', aggregateType: 'pickup_slot', aggregateId: slot.id, occurredAt: new Date().toISOString(), payload: { slotId: slot.id, maxOrders: updated.maxOrders, currentOrders: updated.currentOrders || 0, isAvailable: updated.isAvailable } });
    return { slotId: slot.id, capacity: updated.maxOrders, currentBookings: updated.currentOrders || 0, isAvailable: updated.isAvailable, fee: 0, reused };
  }, { isolationLevel: 'ReadCommitted' as any });
}

export async function configureParkingSpot(_root: unknown, args: { spotId: string; isAvailable: boolean; idempotencyKey: string }, context: Context) {
  await assertDelivery(context); const store = await requireSessionStore(context); const eventKey = key(args.idempotencyKey);
  return context.transaction(async tx => {
    await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "ParkingSpot" WHERE "id" = $1 FOR UPDATE', args.spotId);
    const spot = await tx.prisma.parkingSpot.findUnique({ where: { id: args.spotId } });
    if (!spot || spot.storeId !== store.id) throw new Error('Parking spot not found in active store');
    if (args.isAvailable) {
      const occupiedOrders = await tx.prisma.order.count({
        where: {
          storeId: store.id,
          status: { notIn: ['delivered', 'cancelled'] },
          metadata: { path: ['parkingSpotId'], equals: spot.id },
        },
      });
      if (occupiedOrders > 0) throw new Error('Occupied parking spots must be released through pickup handoff');
    }
    const reused = spot.isAvailable === args.isAvailable;
    const updated = reused ? spot : await tx.prisma.parkingSpot.update({ where: { id: spot.id }, data: { isAvailable: args.isAvailable } });
    await enqueueGroceryOutboxEvent(tx.prisma, { storeId: store.id, eventKey: `parking-spot:${eventKey}:configured:v1`, eventType: 'parking_spot.configured', aggregateType: 'parking_spot', aggregateId: spot.id, occurredAt: new Date().toISOString(), payload: { spotId: spot.id, spotNumber: spot.spotNumber, isAvailable: updated.isAvailable } });
    return { slotId: spot.id, capacity: 1, currentBookings: updated.isAvailable ? 0 : 1, isAvailable: updated.isAvailable, fee: 0, reused };
  }, { isolationLevel: 'ReadCommitted' as any });
}
