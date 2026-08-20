import type { DeliveryWindow } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

type PublicAvailability = {
  deliveryWindows: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    feeCents: number;
    remainingCapacity: number;
  }>;
  pickupWindows: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    remainingCapacity: number;
  }>;
};

function toISODate(dateString: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getAvailability() {
  const { data, errors } = await storefrontGraphQL<{
    publicGroceryAvailability: PublicAvailability;
  }>(
    `
      query GetPublicGroceryAvailability {
        publicGroceryAvailability(days: 7) {
          deliveryWindows {
            id
            date
            startTime
            endTime
            feeCents
            remainingCapacity
          }
          pickupWindows {
            id
            date
            startTime
            endTime
            remainingCapacity
          }
        }
      }
    `,
    undefined,
    { cache: 'no-store' }
  );
  throwGraphQLErrors(errors);
  if (!data?.publicGroceryAvailability) {
    throw new Error('Fulfillment availability did not return an authoritative response');
  }
  return data.publicGroceryAvailability;
}

export async function getCheckoutFulfillmentWindows() {
  const availability = await getAvailability();
  const deliveryWindows: DeliveryWindow[] = availability.deliveryWindows.map((slot) => ({
    id: slot.id,
    date: toISODate(slot.date),
    startTime: slot.startTime,
    endTime: slot.endTime,
    available: slot.remainingCapacity > 0,
    fee: slot.feeCents / 100,
    method: 'delivery',
    remainingCapacity: slot.remainingCapacity,
  }));
  const pickupWindows: DeliveryWindow[] = availability.pickupWindows.map((slot) => ({
    id: slot.id,
    date: toISODate(slot.date),
    startTime: slot.startTime,
    endTime: slot.endTime,
    available: slot.remainingCapacity > 0,
    fee: 0,
    method: 'pickup',
    remainingCapacity: slot.remainingCapacity,
  }));
  return { deliveryWindows, pickupWindows };
}

export async function getDeliveryWindows(date?: string): Promise<{ windows: DeliveryWindow[] }> {
  const { deliveryWindows } = await getCheckoutFulfillmentWindows();
  return { windows: date ? deliveryWindows.filter((slot) => slot.date === date) : deliveryWindows };
}

export async function getPickupWindows(date?: string): Promise<{ windows: DeliveryWindow[] }> {
  const { pickupWindows } = await getCheckoutFulfillmentWindows();
  return { windows: date ? pickupWindows.filter((slot) => slot.date === date) : pickupWindows };
}

export async function getFulfillmentWindows(method: 'delivery' | 'pickup', date?: string) {
  return method === 'pickup' ? getPickupWindows(date) : getDeliveryWindows(date);
}

export async function getAvailableDates(method: 'delivery' | 'pickup' = 'delivery'): Promise<string[]> {
  const { windows } = await getFulfillmentWindows(method);
  const uniqueDates = Array.from(new Set(windows.map((window) => window.date)));
  return uniqueDates.filter(Boolean).slice(0, 7);
}
