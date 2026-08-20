import type { GrocerySubscription } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

function mapSubscription(subscription: any): GrocerySubscription {
  return {
    id: subscription.id,
    product: subscription.product,
    quantity: subscription.quantity,
    frequency: subscription.frequency,
    nextDeliveryDate: subscription.nextDeliveryDate,
    discount: subscription.discount || 0,
    isActive: subscription.isActive,
    pausedUntil: subscription.pausedUntil || null,
    createdAt: subscription.createdAt || new Date().toISOString(),
  };
}

async function requestGraphQL<T>(query: string, variables?: Record<string, unknown>) {
  const result = await storefrontGraphQL<T>(query, variables, { cache: 'no-store' });
  throwGraphQLErrors(result.errors);
  return result.data as T;
}

const SUBSCRIPTION_READ_FIELDS = `
  id
  product
  quantity
  frequency
  nextDeliveryDate
  discount
  isActive
  pausedUntil
  createdAt
`;

/**
 * Legacy subscription rows remain readable for existing customer records.
 * Recurring-order creation and automation are intentionally outside the
 * bounded initial launch, so this module exposes no subscription writes.
 */
export async function getSubscriptions(): Promise<GrocerySubscription[]> {
  try {
    const data = await requestGraphQL<{ subscriptions: any[] }>(`
      query GetSubscriptions {
        subscriptions(
          orderBy: [{ createdAt: desc }, { id: asc }]
          take: 100
        ) {
          ${SUBSCRIPTION_READ_FIELDS}
        }
      }
    `);

    return (data?.subscriptions || []).map(mapSubscription);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return [];
  }
}

export async function getSubscriptionById(id: string): Promise<GrocerySubscription | null> {
  try {
    const data = await requestGraphQL<{ subscription: any | null }>(`
      query GetSubscription($id: ID!) {
        subscription(where: { id: $id }) {
          ${SUBSCRIPTION_READ_FIELDS}
        }
      }
    `, { id });

    return data?.subscription ? mapSubscription(data.subscription) : null;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}
