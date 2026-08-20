import type { Context } from '.keystone/types';
import { ensureRollingFulfillmentAvailability, evaluateFulfillmentWindow } from '../lib/rollingFulfillment';
import { publicStore } from '../lib/storeScope';
import { zonedDateKey, zonedDateKeyOffset, zonedStartOfDateKey } from '../lib/storeTime';

const MAX_DAYS = 14;

function boundedDays(days?: number) {
  if (!Number.isInteger(days)) return 7;
  return Math.min(MAX_DAYS, Math.max(1, days as number));
}

export async function resolvePublicGroceryAvailability(
  _root: unknown,
  { days }: { days?: number },
  context: Context,
  now: Date,
) {
  const store = await publicStore(context);
  const sudoContext = context.sudo();
  const requestedDays = boundedDays(days);
  const rolling = await ensureRollingFulfillmentAvailability(context, store, requestedDays, now);
  const today = zonedDateKey(now, store.timezone);
  const startDate = zonedStartOfDateKey(today, store.timezone);
  const endDate = zonedStartOfDateKey(zonedDateKeyOffset(now, store.timezone, requestedDays), store.timezone);

  const [deliverySlots, pickupSlots, parkingSpots] = await Promise.all([
    sudoContext.query.DeliverySlot.findMany({
      where: {
        AND: [
          { date: { gte: startDate.toISOString() } },
          { date: { lt: endDate.toISOString() } },
          { isActive: { equals: true } },
          { store: { id: { equals: store.id } } },
        ],
      },
      query: 'id date startTime endTime capacity currentBookings deliveryFee',
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    }),
    sudoContext.query.PickupSlot.findMany({
      where: {
        AND: [
          { date: { gte: startDate.toISOString() } },
          { date: { lt: endDate.toISOString() } },
          { isActive: { equals: true } },
          { isAvailable: { equals: true } },
          { store: { id: { equals: store.id } } },
        ],
      },
      query: 'id date startTime endTime maxOrders currentOrders',
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    }),
    sudoContext.query.ParkingSpot.findMany({
      where: { AND: [{ isAvailable: { equals: true } }, { store: { id: { equals: store.id } } }] },
      query: 'id spotNumber description isAccessible',
      orderBy: [{ spotNumber: 'asc' }],
    }),
  ]);

  return {
    deliveryWindows: deliverySlots.flatMap((slot: any) => {
      const remainingCapacity = Math.max(0, slot.capacity - (slot.currentBookings || 0));
      const decision = evaluateFulfillmentWindow({
        hours: rolling.hours,
        timeZone: store.timezone,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        now,
      });
      return remainingCapacity > 0 && decision.allowed
        ? [{
            id: slot.id,
            date: zonedDateKey(slot.date, store.timezone),
            startTime: slot.startTime,
            endTime: slot.endTime,
            feeCents: slot.deliveryFee || 0,
            remainingCapacity,
          }]
        : [];
    }),
    pickupWindows: pickupSlots.flatMap((slot: any) => {
      const remainingCapacity = Math.max(0, slot.maxOrders - (slot.currentOrders || 0));
      const decision = evaluateFulfillmentWindow({
        hours: rolling.hours,
        timeZone: store.timezone,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        now,
      });
      return remainingCapacity > 0 && decision.allowed
        ? [{
            id: slot.id,
            date: zonedDateKey(slot.date, store.timezone),
            startTime: slot.startTime,
            endTime: slot.endTime,
            remainingCapacity,
          }]
        : [];
    }),
    parkingSpots: parkingSpots.map((spot: any) => ({
      id: spot.id,
      spotNumber: spot.spotNumber,
      description: spot.description,
      isAccessible: spot.isAccessible,
    })),
  };
}

export async function getPublicGroceryAvailability(
  root: unknown,
  args: { days?: number },
  context: Context,
) {
  return resolvePublicGroceryAvailability(root, args, context, new Date());
}
