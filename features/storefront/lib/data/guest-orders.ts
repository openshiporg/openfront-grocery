'use server';

import { cookies } from 'next/headers';
import type { GroceryOrder } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';
import { mapStorefrontOrder } from './order-mappers';

const GUEST_ORDER_COOKIE_PREFIX = 'grocery_order_';
const GUEST_CART_COOKIE = 'grocery_cart_session';
const GUEST_ORDER_MAX_AGE = Number.parseInt(
  process.env.GUEST_ORDER_TOKEN_MAX_AGE_SECONDS || '',
  10
) || 60 * 60 * 24 * 30;

export async function rememberGuestOrder(orderId: string, token: string) {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  cookieStore.set(`${GUEST_ORDER_COOKIE_PREFIX}${orderId}`, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: GUEST_ORDER_MAX_AGE,
  });
}

export async function checkInOwnedPickupOrder(input: {
  orderId: string;
  parkingSpotId?: string;
  vehicleDescription?: string;
}): Promise<{ success: boolean; message: string; estimatedWaitMinutes?: number; parkingSpotNumber?: string }> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(GUEST_CART_COOKIE)?.value;
  const token = cookieStore.get(`${GUEST_ORDER_COOKIE_PREFIX}${input.orderId}`)?.value;
  const guest = Boolean(sessionId && token);
  const operation = guest ? 'guestCustomerCheckIn' : 'customerCheckIn';
  const variables = guest ? { ...input, sessionId, token } : input;
  try {
    const { data, errors } = await storefrontGraphQL<Record<string, any>>(`
      mutation PickupCheckIn($orderId: ID!, $parkingSpotId: ID, $vehicleDescription: String${guest ? ', $sessionId: String!, $token: String!' : ''}) {
        ${operation}(orderId: $orderId, parkingSpotId: $parkingSpotId, vehicleDescription: $vehicleDescription${guest ? ', sessionId: $sessionId, token: $token' : ''}) {
          success
          message
          estimatedWaitMinutes
          parkingSpot { spotNumber }
        }
      }
    `, variables, { cache: 'no-store' });
    throwGraphQLErrors(errors);
    const result = data?.[operation];
    return {
      success: Boolean(result?.success),
      message: result?.message || 'Checked in successfully.',
      estimatedWaitMinutes: result?.estimatedWaitMinutes,
      parkingSpotNumber: result?.parkingSpot?.spotNumber,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Pickup check-in failed' };
  }
}

export async function getGuestOrderById(orderId: string): Promise<GroceryOrder | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(GUEST_CART_COOKIE)?.value;
  const token = cookieStore.get(`${GUEST_ORDER_COOKIE_PREFIX}${orderId}`)?.value;
  if (!sessionId || !token) return null;

  try {
    const { data, errors } = await storefrontGraphQL<{ guestGroceryOrder: any | null }>(
      `
        query GetGuestGroceryOrder($orderId: ID!, $sessionId: String!, $token: String!) {
          guestGroceryOrder(orderId: $orderId, sessionId: $sessionId, token: $token) {
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
          }
        }
      `,
      { orderId, sessionId, token },
      { cache: 'no-store' }
    );
    throwGraphQLErrors(errors);
    if (!data?.guestGroceryOrder) return null;

    const lineItems = Array.isArray(data.guestGroceryOrder.metadata?.lineItemsSnapshot)
      ? data.guestGroceryOrder.metadata.lineItemsSnapshot
      : [];
    return mapStorefrontOrder({ ...data.guestGroceryOrder, lineItems });
  } catch (error) {
    console.error('Error fetching guest order:', error);
    return null;
  }
}
