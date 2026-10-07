import type { GroceryOrder, GroceryParkingSpot } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';
import { mapStorefrontOrder } from './order-mappers';

async function getOrderSubstitutions(lineItemIds: string[]) {
  if (!lineItemIds.length) return [];

  try {
    const { data } = await storefrontGraphQL<{ orderItemSubstitutions: any[] }>(`
      query GetOrderSubstitutions($lineItemIds: [String!]) {
        orderItemSubstitutions(where: { orderItem: { in: $lineItemIds } }) {
          id
          orderItem
          originalProduct
          substitutedProduct
          reason
          customerApproved
          approvedAt
        }
      }
    `, { lineItemIds }, { cache: 'no-store' });
    return data?.orderItemSubstitutions || [];
  } catch (error) {
    console.error('Error fetching order substitutions:', error);
    return [];
  }
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

export async function getOrderById(id: string): Promise<GroceryOrder | null> {
  try {
    const { data } = await storefrontGraphQL<{ order: any | null }>(`
      query GetOrder($id: ID!) {
        order(where: { id: $id }) {
          id
          displayId
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
    const order = data?.order;
    if (!order) return null;

    const substitutions = await getOrderSubstitutions((order.lineItems || []).map((item: any) => item.id));
    return mapStorefrontOrder({ ...order, orderItemSubstitutions: substitutions });
  } catch (error) {
    console.error('Error fetching order:', error);
    return null;
  }
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

/** Client-only repeat buying uses the same owned cart session as product and basket controls. */
export async function reorderFromOrder(orderId: string): Promise<{ success: boolean; added: number; skipped: string[]; error?: string }> {
  if (typeof window === 'undefined') return { success: false, added: 0, skipped: [], error: 'Open this order in your browser to shop it again.' };
  const order = await getOrderById(orderId);
  if (!order) return { success: false, added: 0, skipped: [], error: 'Order unavailable. Sign in and try again.' };
  const { addToCart } = await import('./cart');
  let added = 0;
  const skipped: string[] = [];
  // Original pack counts are valid Int quantities; picked weights must never become cart counts.
  for (const item of order.requestedItems || order.items) {
    if (!item.product?.id || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      skipped.push(item.title);
      continue;
    }
    const cart = await addToCart(item.product.id, item.quantity);
    if (cart) added += 1;
    else skipped.push(item.title);
  }
  return { success: skipped.length === 0 && added > 0, added, skipped, ...(!added ? { error: 'No items were added. Availability may have changed; browse the shop to choose alternatives.' } : {}) };
}
