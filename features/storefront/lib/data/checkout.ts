import type { GroceryOrder } from '../../types';
import { clearCart, getSessionId } from './cart';
import { getGuestOrderById, rememberGuestOrder } from './guest-orders';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

export async function initiatePaymentSession(
  cartId: string,
  paymentProviderId: string,
  deliverySlotId: string | undefined,
  pickupSlotId: string | undefined,
  couponCode: string | undefined,
  recovery: {
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
    substitutionPreference: 'call_me' | 'best_match' | 'refund';
    deliveryInstructions?: string;
  },
): Promise<{
  id: string;
  data?: {
    clientSecret?: string;
    paymentIntentId?: string;
    subtotal?: number;
    tax?: number;
    total?: number;
    deliveryFee?: number;
    discount?: number;
    couponCode?: string | null;
  };
  amount?: number | string;
} | null> {
  const { data, errors } = await storefrontGraphQL<{
    initiatePaymentSession?: {
      id: string;
      data?: {
        clientSecret?: string;
        paymentIntentId?: string;
        subtotal?: number;
        tax?: number;
        total?: number;
        deliveryFee?: number;
        discount?: number;
        couponCode?: string | null;
      };
      amount?: number | string;
    } | null;
  }>(
    `
      mutation InitiatePaymentSession($cartId: ID!, $paymentProviderId: String!, $deliverySlotId: ID, $pickupSlotId: ID, $sessionId: String, $couponCode: String, $recovery: CheckoutRecoveryInput!) {
        initiatePaymentSession(cartId: $cartId, paymentProviderId: $paymentProviderId, deliverySlotId: $deliverySlotId, pickupSlotId: $pickupSlotId, sessionId: $sessionId, couponCode: $couponCode, recovery: $recovery) {
          id
          amount
          data
        }
      }
    `,
    { cartId, paymentProviderId, deliverySlotId, pickupSlotId, couponCode, recovery, sessionId: getSessionId() }
  );

  throwGraphQLErrors(errors);
  return data?.initiatePaymentSession || null;
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
  couponCode?: string;
  substitutionPreference: 'call_me' | 'best_match' | 'refund';
  deliveryInstructions?: string;
  sessionId?: string;
}): Promise<GroceryOrder | null> {
  const submitResult = await storefrontGraphQL<{
    submitGroceryOrder?: {
      success?: boolean;
      orderId?: string;
      displayId?: number;
      guestOrderToken?: string;
      message?: string;
    };
  }>(
    `
      mutation SubmitGroceryOrder($data: SubmitGroceryOrderInput!) {
        submitGroceryOrder(data: $data) {
          success
          orderId
          displayId
          guestOrderToken
          message
        }
      }
    `,
    {
      data: { ...orderData, sessionId: orderData.sessionId ?? getSessionId() },
    }
  );

  throwGraphQLErrors(submitResult.errors);

  const result = submitResult.data?.submitGroceryOrder;
  if (!result?.success || !result.orderId) {
    throw new Error(result?.message || 'Failed to create order');
  }

  if (result.guestOrderToken) {
    await rememberGuestOrder(result.orderId, result.guestOrderToken);
    const guestOrder = await getGuestOrderById(result.orderId);
    await clearCart({ preserveSession: true });
    return guestOrder || {
      id: result.orderId,
      orderNumber: String(result.displayId || result.orderId),
      status: 'pending',
      email: orderData.email,
      items: [],
      subtotal: 0,
      tax_total: 0,
      shipping_total: Math.round(orderData.deliveryFee * 100),
      discount_total: 0,
      total: Math.round(orderData.expectedTotal * 100),
      shippingAddress: orderData.deliveryAddress,
      fulfillmentMethod: orderData.fulfillmentMethod,
      substitutionPreference: orderData.substitutionPreference === 'call_me' ? 'contact' : orderData.substitutionPreference === 'refund' ? 'remove' : 'allow',
      createdAt: new Date().toISOString(),
    };
  }

  const finalOrderResult = await storefrontGraphQL<{ order: any | null }>(
    `
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
            product {
              id
              handle
            }
          }
        }
      }
    `,
    { id: result.orderId },
    { cache: 'no-store' }
  );

  const order = finalOrderResult.data?.order;
  await clearCart({ preserveSession: false });

  if (!order) {
    return {
      id: result.orderId,
      orderNumber: String(result.displayId || result.orderId),
      status: 'pending',
      email: orderData.email,
      items: [],
      subtotal: 0,
      tax_total: 0,
      shipping_total: Math.round(orderData.deliveryFee * 100),
      discount_total: 0,
      total: Math.round(orderData.expectedTotal * 100),
      shippingAddress: orderData.deliveryAddress,
      fulfillmentMethod: orderData.fulfillmentMethod,
      deliverySlot: {
        date: orderData.deliveryDate,
        startTime: orderData.deliveryTimeWindow.startsWith('time_8')
          ? '08:00'
          : orderData.deliveryTimeWindow.startsWith('time_10')
          ? '10:00'
          : orderData.deliveryTimeWindow.startsWith('time_12')
          ? '12:00'
          : orderData.deliveryTimeWindow.startsWith('time_14')
          ? '14:00'
          : orderData.deliveryTimeWindow.startsWith('time_16')
          ? '16:00'
          : '18:00',
        endTime: orderData.deliveryTimeWindow.endsWith('10')
          ? '10:00'
          : orderData.deliveryTimeWindow.endsWith('12')
          ? '12:00'
          : orderData.deliveryTimeWindow.endsWith('14')
          ? '14:00'
          : orderData.deliveryTimeWindow.endsWith('16')
          ? '16:00'
          : orderData.deliveryTimeWindow.endsWith('18')
          ? '18:00'
          : '20:00',
      },
      deliveryInstructions: orderData.deliveryInstructions,
      substitutionPreference:
        orderData.substitutionPreference === 'call_me'
          ? 'contact'
          : orderData.substitutionPreference === 'refund'
          ? 'remove'
          : 'allow',
      createdAt: new Date().toISOString(),
    };
  }

  const mappedItems = (order.lineItems || []).map((item: any) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    unit_price: Number(item.unitPriceCents || Math.round((item.unitPrice || 0) * 100)),
    thumbnail: item.thumbnail,
    product: item.product,
  }));
  const subtotal = mappedItems.reduce(
    (sum: number, item: any) => sum + item.unit_price * item.quantity,
    0
  );
  const taxTotal = Math.round(subtotal * (order.taxRate || 0));
  const shippingTotal = Math.round((order.metadata?.deliveryFee || 0) * 100);

  return {
    id: order.id,
    orderNumber: String(order.displayId),
    status: 'pending',
    email: order.email,
    items: mappedItems,
    subtotal,
    tax_total: taxTotal,
    shipping_total: shippingTotal,
    discount_total: 0,
    total: subtotal + taxTotal + shippingTotal,
    shippingAddress: order.shippingAddress,
    fulfillmentMethod: order.metadata?.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery',
    deliverySlot: order.deliveryDate
      ? {
          date: order.deliveryDate,
          startTime: order.metadata?.selectedFulfillmentSlot?.startTime || '08:00',
          endTime: order.metadata?.selectedFulfillmentSlot?.endTime || '10:00',
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
