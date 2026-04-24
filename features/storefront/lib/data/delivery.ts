import type { DeliveryWindow } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

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
    fee: (slot.deliveryFee || 0) / 100,
  };
}

export async function getDeliveryWindows(date?: string): Promise<{ windows: DeliveryWindow[] }> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
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
        `,
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
    const mapped = (data?.deliverySlots || []).map(mapDeliverySlot);

    return {
      windows: date ? mapped.filter((slot: DeliveryWindow) => slot.date === date) : mapped,
    };
  } catch (error) {
    console.error('Error fetching delivery windows:', error);
    return { windows: [] };
  }
}

export async function getAvailableDates(): Promise<string[]> {
  const { windows } = await getDeliveryWindows();
  const uniqueDates = Array.from(new Set(windows.map((window) => window.date)));
  return uniqueDates.filter(Boolean).slice(0, 7);
}
