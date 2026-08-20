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

export async function getOrdersByUser(): Promise<GroceryOrder[]> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return [];

    const { data } = await storefrontGraphQL<{ orders: any[] }>(`
      query GetUserOrders($userId: ID!) {
        orders(
          where: { user: { id: { equals: $userId } } }
          orderBy: { createdAt: desc }
          take: 20
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
            thumbnail
            metadata
            product {
              id
              handle
            }
          }
        }
      }
    `, { userId }, { cache: 'no-store' });
    const orders = data?.orders || [];
    const lineItemIds = orders.flatMap((order: any) => (order.lineItems || []).map((item: any) => item.id));
    const substitutions = await getOrderSubstitutions(lineItemIds);

    return orders.map((order: any) => ({
      ...order,
      orderItemSubstitutions: substitutions.filter((substitution: any) =>
        (order.lineItems || []).some((item: any) => item.id === substitution.orderItem)
      ),
    })).map(mapStorefrontOrder);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    return [];
  }
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

export async function reorderFromOrder(orderId: string): Promise<{ success: boolean; cartId?: string; error?: string }> {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    const { data: authData } = await storefrontGraphQL<{
      authenticatedItem?: { id: string } | null;
    }>(`
      query GetReorderSessionId {
        authenticatedItem {
          ... on User {
            id
          }
        }
      }
    `, undefined, { cache: 'no-store' });

    const isSignedIn = Boolean(authData?.authenticatedItem?.id);
    const sessionId = !isSignedIn ? `guest_reorder_${Date.now()}` : undefined;

    for (const item of order.items) {
      if (item.product?.id) {
        await storefrontGraphQL(`
          mutation ReorderItem($productId: ID!, $quantity: Int!, $sessionId: String) {
            addItemToGroceryCart(productId: $productId, quantity: $quantity, sessionId: $sessionId) {
              id
            }
          }
        `, { productId: item.product.id, quantity: item.quantity, sessionId });
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error reordering:', error);
    return { success: false, error: 'Failed to reorder' };
  }
}
