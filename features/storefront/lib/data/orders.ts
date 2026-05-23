import type { GroceryOrder, GroceryParkingSpot } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

function mapOrderStatus(status: string): GroceryOrder['status'] {
  const statusMap: Record<string, GroceryOrder['status']> = {
    pending: 'pending',
    confirmed: 'confirmed',
    processing: 'processing',
    picking: 'picking',
    packed: 'processing',
    picked: 'picking',
    out_for_delivery: 'out_for_delivery',
    shipped: 'out_for_delivery',
    delivered: 'delivered',
    completed: 'delivered',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };
  return statusMap[status?.toLowerCase()] || 'pending';
}

function mapSubstitutionPreference(pref: string): 'allow' | 'contact' | 'remove' {
  const prefMap: Record<string, 'allow' | 'contact' | 'remove'> = {
    best_match: 'allow',
    allow: 'allow',
    call_me: 'contact',
    contact: 'contact',
    refund: 'remove',
    remove: 'remove',
  };
  return prefMap[pref?.toLowerCase()] || 'allow';
}

function mapLineItems(lineItems: any[] = [], substitutions: any[] = []) {
  const substitutionByItem = new Map(substitutions.map((substitution) => [substitution.orderItem, substitution]));

  return lineItems.map((item: any) => {
    const substitution = substitutionByItem.get(item.id);

    return {
      id: item.id,
      title: item.title,
      variant: undefined,
      quantity: item.quantity,
      unit_price: Math.round((item.unitPrice || 0) * 100),
      thumbnail: item.thumbnail,
      product: item.product
        ? {
            id: item.product.id,
            handle: item.product.handle,
          }
        : undefined,
      substitutionPreference: item.metadata?.substitutionPreference || null,
      substitution: substitution
        ? {
            id: substitution.id,
            originalProduct: substitution.originalProduct,
            substitutedProduct: substitution.substitutedProduct,
            reason: substitution.reason,
            customerApproved: Boolean(substitution.customerApproved),
            approvedAt: substitution.approvedAt,
          }
        : undefined,
    };
  });
}

function mapOrder(order: any): GroceryOrder {
  const items = mapLineItems(order.lineItems || [], order.orderItemSubstitutions || []);
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const taxTotal = Math.round(subtotal * (order.taxRate || 0));
  const shippingTotal = Math.round((order.metadata?.deliveryFee || 0) * 100);
  const total = subtotal + taxTotal + shippingTotal;
  const metadata = order.metadata || {};
  const fulfillmentSlot = metadata.selectedFulfillmentSlot;
  const fulfillmentMethod = metadata.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';
  const pickupReady = fulfillmentMethod === 'pickup' && Boolean(metadata.readyForPickup);

  return {
    id: order.id,
    orderNumber: String(order.displayId || order.id.slice(-8).toUpperCase()),
    status: pickupReady && order.status === 'packed' ? 'out_for_delivery' : mapOrderStatus(order.status),
    email: order.email,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    subtotal,
    tax_total: taxTotal,
    shipping_total: shippingTotal,
    discount_total: 0,
    total,
    shippingAddress: order.shippingAddress,
    fulfillmentMethod,
    deliverySlot: order.deliveryDate
      ? {
          date: new Date(order.deliveryDate).toISOString(),
          startTime: fulfillmentSlot?.startTime || (order.deliveryTimeWindow?.startsWith('time_8')
            ? '08:00'
            : order.deliveryTimeWindow?.startsWith('time_10')
            ? '10:00'
            : order.deliveryTimeWindow?.startsWith('time_12')
            ? '12:00'
            : order.deliveryTimeWindow?.startsWith('time_14')
            ? '14:00'
            : order.deliveryTimeWindow?.startsWith('time_16')
            ? '16:00'
            : '18:00'),
          endTime: fulfillmentSlot?.endTime || (order.deliveryTimeWindow?.endsWith('10')
            ? '10:00'
            : order.deliveryTimeWindow?.endsWith('12')
            ? '12:00'
            : order.deliveryTimeWindow?.endsWith('14')
            ? '14:00'
            : order.deliveryTimeWindow?.endsWith('16')
            ? '16:00'
            : order.deliveryTimeWindow?.endsWith('18')
            ? '18:00'
            : '20:00'),
        }
      : undefined,
    pickupCheckIn: fulfillmentMethod === 'pickup'
      ? {
          customerArrived: Boolean(metadata.customerArrived),
          checkInTime: metadata.checkInTime || null,
          parkingSpotId: metadata.parkingSpotId || null,
          parkingSpotNumber: metadata.parkingSpotNumber || null,
          vehicleDescription: metadata.vehicleDescription || null,
        }
      : undefined,
    deliveryInstructions: order.deliveryInstructions,
    substitutionPreference: mapSubstitutionPreference(order.substitutionPreference),
    items,
  };
}

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
    return mapOrder({ ...order, orderItemSubstitutions: substitutions });
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
    })).map(mapOrder);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    return [];
  }
}

export async function getAvailableParkingSpots(accessibleOnly = false): Promise<GroceryParkingSpot[]> {
  try {
    const { data } = await storefrontGraphQL<{ availableParkingSpots: GroceryParkingSpot[] }>(`
      query GetAvailableParkingSpots($accessibleOnly: Boolean) {
        availableParkingSpots(accessibleOnly: $accessibleOnly) {
          id
          spotNumber
          description
          isAccessible
          isAvailable
        }
      }
    `, { accessibleOnly }, { cache: 'no-store' });
    return data?.availableParkingSpots || [];
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
