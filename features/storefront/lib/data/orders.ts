import type { GroceryOrder } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

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

function mapLineItems(lineItems: any[] = []) {
  return lineItems.map((item: any) => ({
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
  }));
}

function mapOrder(order: any): GroceryOrder {
  const items = mapLineItems(order.lineItems || []);
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const taxTotal = Math.round(subtotal * (order.taxRate || 0));
  const shippingTotal = 0;
  const total = subtotal + taxTotal + shippingTotal;

  return {
    id: order.id,
    orderNumber: String(order.displayId || order.id.slice(-8).toUpperCase()),
    status: mapOrderStatus(order.status),
    email: order.email,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    subtotal,
    tax_total: taxTotal,
    shipping_total: shippingTotal,
    discount_total: 0,
    total,
    shippingAddress: order.shippingAddress,
    deliverySlot: order.deliveryDate
      ? {
          date: new Date(order.deliveryDate).toISOString(),
          startTime: order.deliveryTimeWindow?.startsWith('time_8')
            ? '08:00'
            : order.deliveryTimeWindow?.startsWith('time_10')
            ? '10:00'
            : order.deliveryTimeWindow?.startsWith('time_12')
            ? '12:00'
            : order.deliveryTimeWindow?.startsWith('time_14')
            ? '14:00'
            : order.deliveryTimeWindow?.startsWith('time_16')
            ? '16:00'
            : '18:00',
          endTime: order.deliveryTimeWindow?.endsWith('10')
            ? '10:00'
            : order.deliveryTimeWindow?.endsWith('12')
            ? '12:00'
            : order.deliveryTimeWindow?.endsWith('14')
            ? '14:00'
            : order.deliveryTimeWindow?.endsWith('16')
            ? '16:00'
            : order.deliveryTimeWindow?.endsWith('18')
            ? '18:00'
            : '20:00',
        }
      : undefined,
    deliveryInstructions: order.deliveryInstructions,
    substitutionPreference: mapSubstitutionPreference(order.substitutionPreference),
    items,
  };
}

async function getAuthenticatedUserId() {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      query: `
        query GetAuthenticatedUserId {
          authenticatedItem {
            ... on User {
              id
            }
          }
        }
      `,
    }),
    cache: 'no-store',
  });

  const { data } = await response.json();
  return data?.authenticatedItem?.id || null;
}

export async function getOrderById(id: string): Promise<GroceryOrder | null> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
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
              lineItems {
                id
                title
                quantity
                unitPrice
                thumbnail
                product {
                  id
                  handle
                }
              }
            }
          }
        `,
        variables: { id },
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
    const order = data?.order;
    return order ? mapOrder(order) : null;
  } catch (error) {
    console.error('Error fetching order:', error);
    return null;
  }
}

export async function getOrdersByUser(): Promise<GroceryOrder[]> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return [];

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
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
              lineItems {
                id
                title
                quantity
                unitPrice
                thumbnail
                product {
                  id
                  handle
                }
              }
            }
          }
        `,
        variables: { userId },
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
    return (data?.orders || []).map(mapOrder);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    return [];
  }
}

export async function reorderFromOrder(orderId: string): Promise<{ success: boolean; cartId?: string; error?: string }> {
  try {
    const order = await getOrderById(orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    for (const item of order.items) {
      if (item.product?.id) {
        await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            query: `
              mutation ReorderItem($productId: ID!, $quantity: Int!) {
                addItemToGroceryCart(productId: $productId, quantity: $quantity) {
                  id
                }
              }
            `,
            variables: { productId: item.product.id, quantity: item.quantity },
          }),
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error reordering:', error);
    return { success: false, error: 'Failed to reorder' };
  }
}
