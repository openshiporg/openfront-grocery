import type { DeliveryWindow } from '../../types';
import { storefrontGraphQL } from './graphql';

function toISODate(dateString: string) {
  return new Date(dateString).toISOString().split('T')[0];
}

function mapDeliverySlot(slot: any): DeliveryWindow {
  return {
    id: slot.id,
    date: toISODate(slot.date),
    startTime: slot.startTime,
    endTime: slot.endTime,
    available: (slot.capacity - slot.currentBookings) > 0,
    fee: (slot.deliveryFee ?? 0) / 100,
    method: 'delivery',
    remainingCapacity: Math.max(0, slot.capacity - slot.currentBookings),
  };
}

function mapPickupSlot(slot: any): DeliveryWindow {
  return {
    id: slot.id,
    date: toISODate(slot.date),
    startTime: slot.startTime,
    endTime: slot.endTime,
    available: slot.isAvailable && slot.availableCapacity > 0,
    fee: 0,
    method: 'pickup',
    remainingCapacity: slot.availableCapacity,
  };
}

export async function getDeliveryWindows(date?: string): Promise<{ windows: DeliveryWindow[] }> {
  try {
    const { data } = await storefrontGraphQL<{ deliverySlots: any[] }>(`
      query GetDeliverySlots {
        deliverySlots(
          where: { isActive: { equals: true } }
          orderBy: [{ date: asc }, { startTime: asc }]
          take: 30
        ) {
          id
          date
          startTime
          endTime
          capacity
          currentBookings
          deliveryFee
        }
      }
    `, undefined, { cache: 'no-store' });
    const mapped = (data?.deliverySlots || []).map(mapDeliverySlot);

    return {
      windows: date ? mapped.filter((slot: DeliveryWindow) => slot.date === date) : mapped,
    };
  } catch (error) {
    console.error('Error fetching delivery windows:', error);
    return { windows: [] };
  }
}

export async function getPickupWindows(date?: string): Promise<{ windows: DeliveryWindow[] }> {
  try {
    const { data } = await storefrontGraphQL<{ availablePickupSlots: any[] }>(`
      query GetPickupWindows {
        availablePickupSlots(days: 7, minCapacity: 1) {
          id
          date
          startTime
          endTime
          availableCapacity
          maxOrders
          currentOrders
          isAvailable
        }
      }
    `, undefined, { cache: 'no-store' });
    const mapped = (data?.availablePickupSlots || []).map(mapPickupSlot);

    return {
      windows: date ? mapped.filter((slot: DeliveryWindow) => slot.date === date) : mapped,
    };
  } catch (error) {
    console.error('Error fetching pickup windows:', error);
    return { windows: [] };
  }
}

export async function getFulfillmentWindows(method: 'delivery' | 'pickup', date?: string) {
  return method === 'pickup' ? getPickupWindows(date) : getDeliveryWindows(date);
}

export async function getAvailableDates(method: 'delivery' | 'pickup' = 'delivery'): Promise<string[]> {
  const { windows } = await getFulfillmentWindows(method);
  const uniqueDates = Array.from(new Set(windows.map((window) => window.date)));
  return uniqueDates.filter(Boolean).slice(0, 7);
}
