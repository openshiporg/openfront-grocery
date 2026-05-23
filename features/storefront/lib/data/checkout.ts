import type { GroceryOrder } from '../../types';
import { clearCart, getSessionId } from './cart';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

export async function initiatePaymentSession(
  cartId: string,
  paymentProviderId: string,
  deliverySlotId?: string,
  pickupSlotId?: string
): Promise<{ id: string; data?: { clientSecret?: string; paymentIntentId?: string }; amount?: number | string } | null> {
  try {
    const { data, errors } = await storefrontGraphQL<{
      initiatePaymentSession?: { id: string; data?: { clientSecret?: string; paymentIntentId?: string }; amount?: number | string } | null;
    }>(`
      mutation InitiatePaymentSession($cartId: ID!, $paymentProviderId: String!, $deliverySlotId: ID, $pickupSlotId: ID, $sessionId: String) {
        initiatePaymentSession(cartId: $cartId, paymentProviderId: $paymentProviderId, deliverySlotId: $deliverySlotId, pickupSlotId: $pickupSlotId, sessionId: $sessionId) {
          id
          amount
          data
        }
      }
    `, { cartId, paymentProviderId, deliverySlotId, pickupSlotId, sessionId: getSessionId() });

    throwGraphQLErrors(errors);

    return data?.initiatePaymentSession || null;
  } catch (error) {
    console.error('Error initiating payment session:', error);
    return null;
  }
}


export async function submitOrder(orderData: {
  cartId: string;
  paymentSessionId: string;
  paymentIntentId: string;
  email: string;
  deliveryAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    city: string;
    province: string;
    postalCode: string;
    phone: string;
  };
  deliveryDate: string;
  deliveryTimeWindow: string;
  fulfillmentMethod: 'delivery' | 'pickup';
  deliverySlotId?: string;
  pickupSlotId?: string;
  deliveryFee: number;
  expectedTotal: number;
  substitutionPreference: 'call_me' | 'best_match' | 'refund';
  deliveryInstructions?: string;
  sessionId?: string;
}): Promise<GroceryOrder | null> {
  try {
    const submitResult = await storefrontGraphQL<{
      submitGroceryOrder?: {
        success?: boolean;
        orderId?: string;
        displayId?: string;
        message?: string;
      };
    }>(`
      mutation SubmitGroceryOrder($data: SubmitGroceryOrderInput!) {
        submitGroceryOrder(data: $data) {
          success
          orderId
          displayId
          message
        }
      }
    `, {
      data: { ...orderData, sessionId: orderData.sessionId ?? getSessionId() },
    });

    const orderId = submitResult?.data?.submitGroceryOrder?.orderId;

    if (!submitResult?.data?.submitGroceryOrder?.success || !orderId) {
      throw new Error(submitResult?.data?.submitGroceryOrder?.message || 'Failed to create order');
    }

    const finalOrderResult = await storefrontGraphQL<{ order: any | null }>(`
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
            product {
              id
              handle
            }
          }
        }
      }
    `, { id: orderId }, { cache: 'no-store' });

    const order = finalOrderResult?.data?.order;

    if (!order) {
      return null;
    }

    await clearCart();

    const mappedItems = (order.lineItems || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unit_price: Math.round((item.unitPrice || 0) * 100),
      thumbnail: item.thumbnail,
      product: item.product,
    }));
    const subtotal = mappedItems.reduce((sum: number, item: any) => sum + item.unit_price * item.quantity, 0);
    const taxTotal = Math.round(subtotal * (order.taxRate || 0));

    return {
      id: order.id,
      orderNumber: String(order.displayId),
      status: 'pending',
      email: order.email,
      items: mappedItems,
      subtotal,
      tax_total: taxTotal,
      shipping_total: Math.round((order.metadata?.deliveryFee || 0) * 100),
      discount_total: 0,
      total: subtotal + taxTotal + Math.round((order.metadata?.deliveryFee || 0) * 100),
      shippingAddress: order.shippingAddress,
      deliverySlot: order.deliveryDate
        ? {
            date: order.deliveryDate,
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
      substitutionPreference:
        order.substitutionPreference === 'call_me'
          ? 'contact'
          : order.substitutionPreference === 'refund'
          ? 'remove'
          : 'allow',
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  } catch (error) {
    console.error('Error submitting order:', error);
    return null;
  }
}

export async function getOrder(orderId: string): Promise<GroceryOrder | null> {
  const { getOrderById } = await import('./orders');
  return getOrderById(orderId);
}

export async function updatePaymentStatus(
  _paymentIntentId: string,
  _status: 'succeeded' | 'failed',
  _chargeId?: string
): Promise<boolean> {
  return true;
}
