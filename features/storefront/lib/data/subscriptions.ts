import type { GrocerySubscription } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

type Frequency = 'weekly' | 'biweekly' | 'monthly';

function mapSubscription(subscription: any): GrocerySubscription {
  return {
    id: subscription.id,
    product: subscription.productId || subscription.product,
    quantity: subscription.quantity,
    frequency: subscription.frequency,
    nextDeliveryDate: subscription.nextDeliveryDate,
    discount: subscription.discount || 0,
    isActive: subscription.isActive,
    pausedUntil: subscription.pausedUntil || null,
    createdAt: subscription.createdAt || new Date().toISOString(),
  };
}

async function requestGraphQL<T = any>(query: string, variables?: Record<string, unknown>) {
  const result = await storefrontGraphQL<T>(query, variables, { cache: 'no-store' });

  throwGraphQLErrors(result.errors);

  return result.data as T;
}

const SUBSCRIPTION_RESULT_FIELDS = `
  id
  productId
  quantity
  frequency
  nextDeliveryDate
  discount
  isActive
  isPaused
  pausedUntil
  skippedDate
`;

export async function getSubscriptions(): Promise<GrocerySubscription[]> {
  try {
    const data = await requestGraphQL<{ subscriptions: any[] }>(`
      query GetSubscriptions {
        subscriptions(orderBy: { createdAt: desc }) {
          id
          product
          quantity
          frequency
          nextDeliveryDate
          discount
          isActive
          pausedUntil
          createdAt
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
          id
          product
          quantity
          frequency
          nextDeliveryDate
          discount
          isActive
          pausedUntil
          createdAt
        }
      }
    `, { id });

    return data?.subscription ? mapSubscription(data.subscription) : null;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}

export async function createSubscription(data: {
  productId: string;
  quantity: number;
  frequency: Frequency;
  deliveryDay?: string;
}): Promise<GrocerySubscription | null> {
  try {
    const result = await requestGraphQL<{ createGrocerySubscription: any }>(`
      mutation CreateGrocerySubscription($productId: ID!, $quantity: Int!, $frequency: String!, $deliveryDay: String) {
        createGrocerySubscription(productId: $productId, quantity: $quantity, frequency: $frequency, deliveryDay: $deliveryDay) {
          ${SUBSCRIPTION_RESULT_FIELDS}
        }
      }
    `, {
      productId: data.productId,
      quantity: data.quantity,
      frequency: data.frequency,
      deliveryDay: data.deliveryDay,
    });

    return result?.createGrocerySubscription ? mapSubscription(result.createGrocerySubscription) : null;
  } catch (error) {
    console.error('Error creating subscription:', error);
    return null;
  }
}

export async function updateSubscription(
  id: string,
  data: Partial<{
    quantity: number;
    frequency: Frequency;
    isActive: boolean;
    pausedUntil: string | null;
  }>
): Promise<GrocerySubscription | null> {
  try {
    if (data.isActive === false) {
      return cancelSubscription(id);
    }

    if (data.pausedUntil) {
      return pauseSubscription(id, new Date(data.pausedUntil));
    }

    if (data.pausedUntil === null) {
      return resumeSubscription(id);
    }

    const result = await requestGraphQL<{ updateGrocerySubscription: any }>(`
      mutation UpdateGrocerySubscription($subscriptionId: ID!, $quantity: Int, $frequency: String) {
        updateGrocerySubscription(subscriptionId: $subscriptionId, quantity: $quantity, frequency: $frequency) {
          ${SUBSCRIPTION_RESULT_FIELDS}
        }
      }
    `, {
      subscriptionId: id,
      quantity: data.quantity,
      frequency: data.frequency,
    });

    return result?.updateGrocerySubscription ? mapSubscription(result.updateGrocerySubscription) : null;
  } catch (error) {
    console.error('Error updating subscription:', error);
    return null;
  }
}

export async function pauseSubscription(id: string, until: Date): Promise<GrocerySubscription | null> {
  try {
    const result = await requestGraphQL<{ pauseGrocerySubscription: any }>(`
      mutation PauseGrocerySubscription($subscriptionId: ID!, $pauseUntil: String!) {
        pauseGrocerySubscription(subscriptionId: $subscriptionId, pauseUntil: $pauseUntil) {
          ${SUBSCRIPTION_RESULT_FIELDS}
        }
      }
    `, {
      subscriptionId: id,
      pauseUntil: until.toISOString(),
    });

    return result?.pauseGrocerySubscription ? mapSubscription(result.pauseGrocerySubscription) : null;
  } catch (error) {
    console.error('Error pausing subscription:', error);
    return null;
  }
}

export async function resumeSubscription(id: string): Promise<GrocerySubscription | null> {
  try {
    const result = await requestGraphQL<{ updateSubscription: any }>(`
      mutation ResumeSubscription($id: ID!) {
        updateSubscription(where: { id: $id }, data: { pausedUntil: null, isActive: true }) {
          id
          product
          quantity
          frequency
          nextDeliveryDate
          discount
          isActive
          pausedUntil
          createdAt
        }
      }
    `, { id });

    return result?.updateSubscription ? mapSubscription(result.updateSubscription) : null;
  } catch (error) {
    console.error('Error resuming subscription:', error);
    return null;
  }
}

export async function cancelSubscription(id: string): Promise<GrocerySubscription | null> {
  try {
    const result = await requestGraphQL<{ cancelGrocerySubscription: any }>(`
      mutation CancelGrocerySubscription($subscriptionId: ID!) {
        cancelGrocerySubscription(subscriptionId: $subscriptionId) {
          ${SUBSCRIPTION_RESULT_FIELDS}
        }
      }
    `, { subscriptionId: id });

    return result?.cancelGrocerySubscription ? mapSubscription(result.cancelGrocerySubscription) : null;
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return null;
  }
}

export async function skipNextDelivery(id: string): Promise<GrocerySubscription | null> {
  try {
    const result = await requestGraphQL<{ skipNextGroceryDelivery: any }>(`
      mutation SkipNextGroceryDelivery($subscriptionId: ID!) {
        skipNextGroceryDelivery(subscriptionId: $subscriptionId) {
          ${SUBSCRIPTION_RESULT_FIELDS}
        }
      }
    `, { subscriptionId: id });

    return result?.skipNextGroceryDelivery ? mapSubscription(result.skipNextGroceryDelivery) : null;
  } catch (error) {
    console.error('Error skipping delivery:', error);
    return null;
  }
}
