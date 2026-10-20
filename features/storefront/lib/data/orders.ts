import type { GroceryOrder, GroceryParkingSpot } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';
import { mapStorefrontOrder } from './order-mappers';

/** The signed-in customer's replacement evidence; failures propagate (never shown as "no substitutions"). */
async function getOrderSubstitutions(orderId: string) {
  const { data, errors } = await storefrontGraphQL<{ customerOrderSubstitutions: any[] }>(`
    query GetCustomerOrderSubstitutions($orderId: ID!) {
      customerOrderSubstitutions(orderId: $orderId) {
        id
        orderItem
        originalProduct
        substitutedProduct
        reason
        customerApproved
        approvedAt
      }
    }
  `, { orderId }, { cache: 'no-store' });
  throwGraphQLErrors(errors);
  if (!data?.customerOrderSubstitutions) throw new Error('Replacement details are unavailable');
  return data.customerOrderSubstitutions;
}

async function getAuthenticatedUserId() {
  const { data } = await storefrontGraphQL<{
    authenticatedItem?: { id: string } | null;
  }>(`
    query GetAuthenticatedUserId {
      authenticatedItem {
        ... on User {
          id
        }
      }
    }
  `, undefined, { cache: 'no-store' });
  return data?.authenticatedItem?.id || null;
}

export type OrderRead = { status: 'found'; order: GroceryOrder } | { status: 'not_found' } | { status: 'unavailable' };

/**
 * Read a signed-in customer's order with a typed outcome: not visible to this
 * shopper, found, or temporarily unavailable. An outage is never reported as a
 * missing order.
 */
export async function readOrderById(id: string): Promise<OrderRead> {
  try {
    const { data, errors } = await storefrontGraphQL<{ order: any | null }>(`
      query GetOrder($id: ID!) {
        order(where: { id: $id }) {
          id
          displayId
          currencyCode
          status
          email
          taxRate
          createdAt
          updatedAt
          shippingAddress {
            firstName
            lastName
            address1
            address2
            city
            province
            postalCode
            phone
          }
          deliveryDate
          deliveryTimeWindow
          deliveryInstructions
          substitutionPreference
          metadata
          lineItems {
            id
            title
            quantity
            unitPrice
            unitPriceCents
            thumbnail
            metadata
            product {
              id
              handle
            }
          }
        }
      }
    `, { id }, { cache: 'no-store' });
    throwGraphQLErrors(errors);
    const order = data?.order;
    if (!order) return { status: 'not_found' };

    const substitutions = await getOrderSubstitutions(order.id);
    return { status: 'found', order: mapStorefrontOrder({ ...order, orderItemSubstitutions: substitutions }) };
  } catch (error) {
    console.error('Order read unavailable:', error instanceof Error ? error.message : 'unknown error');
    return { status: 'unavailable' };
  }
}

export async function getOrderById(id: string): Promise<GroceryOrder | null> {
  const result = await readOrderById(id);
  return result.status === 'found' ? result.order : null;
}

export async function getOrderHistory(requestedPage = 1, pageSize = 10): Promise<{ orders: GroceryOrder[]; total: number; page: number; pageSize: number; error?: string }> {
  const page = Math.max(1, Math.min(10000, Math.floor(Number(requestedPage) || 1)));
  pageSize = Math.max(1, Math.min(50, Math.floor(pageSize)));
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return { orders: [], total: 0, page, pageSize };
    const { data, errors } = await storefrontGraphQL<{ orders: any[]; ordersCount: number }>(`
      query GetUserOrders($userId: ID!, $take: Int!, $skip: Int!) {
        ordersCount(where: { user: { id: { equals: $userId } } })
        orders(
          where: { user: { id: { equals: $userId } } }
          orderBy: [{ createdAt: desc }, { id: desc }]
          take: $take
          skip: $skip
        ) {
          id
          displayId
          currencyCode
          status
          email
          taxRate
          createdAt
          updatedAt
          deliveryDate
          deliveryTimeWindow
          deliveryInstructions
          substitutionPreference
          metadata
          lineItems {
            id
            title
            quantity
            unitPrice
            unitPriceCents
            thumbnail
            metadata
            product {
              id
              handle
            }
          }
        }
      }
    `, { userId, take: pageSize, skip: (page - 1) * pageSize }, { cache: 'no-store' });
    throwGraphQLErrors(errors);
    if (!data) throw new Error('Order history is unavailable. Please try again.');
    return { orders: data.orders.map(mapStorefrontOrder), total: data.ordersCount, page, pageSize };
  } catch (error) {
    return { orders: [], total: 0, page, pageSize, error: error instanceof Error ? error.message : 'Unable to load orders' };
  }
}

export async function getOrdersByUser(): Promise<GroceryOrder[]> {
  return (await getOrderHistory(1, 20)).orders;
}

export async function getAvailableParkingSpots(accessibleOnly = false): Promise<GroceryParkingSpot[]> {
  try {
    const { data } = await storefrontGraphQL<{
      publicGroceryAvailability: { parkingSpots: GroceryParkingSpot[] };
    }>(`
      query GetAvailableParkingSpots {
        publicGroceryAvailability(days: 7) {
          parkingSpots {
            id
            spotNumber
            description
            isAccessible
          }
        }
      }
    `, undefined, { cache: 'no-store' });
    const spots = data?.publicGroceryAvailability?.parkingSpots || [];
    return spots
      .filter((spot) => !accessibleOnly || spot.isAccessible)
      .map((spot) => ({ ...spot, isAvailable: true }));
  } catch (error) {
    console.error('Error fetching parking spots:', error);
    return [];
  }
}

export async function checkInPickupOrder(input: {
  orderId: string;
  parkingSpotId?: string;
  vehicleDescription?: string;
}): Promise<{ success: boolean; message: string; estimatedWaitMinutes?: number; parkingSpotNumber?: string }> {
  try {
    const { data, errors } = await storefrontGraphQL<{
      customerCheckIn?: {
        success?: boolean;
        message?: string;
        estimatedWaitMinutes?: number;
        parkingSpot?: { spotNumber?: string } | null;
      };
    }>(`
      mutation CheckInPickupOrder($orderId: ID!, $parkingSpotId: ID, $vehicleDescription: String) {
        customerCheckIn(orderId: $orderId, parkingSpotId: $parkingSpotId, vehicleDescription: $vehicleDescription) {
          success
          message
          estimatedWaitMinutes
          parkingSpot {
            spotNumber
          }
        }
      }
    `, input);

    throwGraphQLErrors(errors);

    const result = data?.customerCheckIn;
    return {
      success: Boolean(result?.success),
      message: result?.message || 'Checked in successfully.',
      estimatedWaitMinutes: result?.estimatedWaitMinutes,
      parkingSpotNumber: result?.parkingSpot?.spotNumber,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to check in for pickup',
    };
  }
}

/**
 * Shop a past order again as one store-side batch. The caller keeps
 * `requestKey` for retries after an uncertain response, so the items are added
 * exactly once; a new deliberate reorder uses a new key.
 */
export async function reorderFromOrder(orderId: string, requestKey: string): Promise<{ success: boolean; added: number; skipped: string[]; replayed: boolean; error?: string }> {
  if (typeof window === 'undefined') return { success: false, added: 0, skipped: [], replayed: false, error: 'Open this order in your browser to shop it again.' };
  const { getSessionId } = await import('./cart');
  const { data, errors } = await storefrontGraphQL<{ reorderGroceryOrder: { success: boolean; addedCount: number; skippedItems: string[]; replayed: boolean } }>(
    'mutation Reorder($orderId: ID!, $requestKey: String!, $sessionId: String) { reorderGroceryOrder(orderId: $orderId, requestKey: $requestKey, sessionId: $sessionId) { success addedCount skippedItems replayed } }',
    { orderId, requestKey, sessionId: getSessionId() || null },
    { cache: 'no-store' },
  );
  throwGraphQLErrors(errors);
  const result = data?.reorderGroceryOrder;
  if (!result) throw new Error('The order could not be added to your basket. Try again.');
  return { success: result.success, added: result.addedCount, skipped: result.skippedItems, replayed: result.replayed, ...(!result.addedCount ? { error: 'No items were added. Availability may have changed; browse the shop to choose alternatives.' } : {}) };
}
