import type { GrocerySubscription } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

export async function getSubscriptions(): Promise<GrocerySubscription[]> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
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
        `,
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
    return data?.subscriptions || [];
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return [];
  }
}

export async function getSubscriptionById(id: string): Promise<GrocerySubscription | null> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
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
        `,
        variables: { id },
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
    return data?.subscription || null;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}

export async function createSubscription(data: {
  productId: string;
  quantity: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
}): Promise<GrocerySubscription | null> {
  try {
    const nextDate = calculateNextDeliveryDate(data.frequency);
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation CreateSubscription($product: String!, $quantity: Int!, $frequency: SubscriptionFrequencyType!, $nextDeliveryDate: DateTime!) {
            createSubscription(data: {
              product: $product
              quantity: $quantity
              frequency: $frequency
              nextDeliveryDate: $nextDeliveryDate
              isActive: true
              discount: 10
            }) {
              id
              product
              quantity
              frequency
              nextDeliveryDate
              discount
              isActive
            }
          }
        `,
        variables: {
          product: data.productId,
          quantity: data.quantity,
          frequency: data.frequency,
          nextDeliveryDate: nextDate.toISOString(),
        },
      }),
    });

    const result = await response.json();
    return result.data?.createSubscription || null;
  } catch (error) {
    console.error('Error creating subscription:', error);
    return null;
  }
}

export async function updateSubscription(
  id: string,
  data: Partial<{
    quantity: number;
    frequency: 'weekly' | 'biweekly' | 'monthly';
    isActive: boolean;
    pausedUntil: string | null;
  }>
): Promise<GrocerySubscription | null> {
  try {
    const updateData: Record<string, unknown> = {};
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.frequency !== undefined) updateData.frequency = data.frequency;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.pausedUntil !== undefined) updateData.pausedUntil = data.pausedUntil;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation UpdateSubscription($id: ID!, $data: SubscriptionUpdateInput!) {
            updateSubscription(where: { id: $id }, data: $data) {
              id
              product
              quantity
              frequency
              nextDeliveryDate
              discount
              isActive
              pausedUntil
            }
          }
        `,
        variables: { id, data: updateData },
      }),
    });

    const result = await response.json();
    return result.data?.updateSubscription || null;
  } catch (error) {
    console.error('Error updating subscription:', error);
    return null;
  }
}

export async function pauseSubscription(id: string, until: Date): Promise<GrocerySubscription | null> {
  return updateSubscription(id, { pausedUntil: until.toISOString() });
}

export async function resumeSubscription(id: string): Promise<GrocerySubscription | null> {
  return updateSubscription(id, { pausedUntil: null, isActive: true });
}

export async function cancelSubscription(id: string): Promise<GrocerySubscription | null> {
  return updateSubscription(id, { isActive: false });
}

export async function skipNextDelivery(id: string): Promise<GrocerySubscription | null> {
  try {
    const sub = await getSubscriptionById(id);
    if (!sub) return null;

    const nextDate = calculateNextDeliveryDate(sub.frequency, new Date(sub.nextDeliveryDate));
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation SkipDelivery($id: ID!, $nextDeliveryDate: DateTime!) {
            updateSubscription(where: { id: $id }, data: { nextDeliveryDate: $nextDeliveryDate }) {
              id
              nextDeliveryDate
            }
          }
        `,
        variables: { id, nextDeliveryDate: nextDate.toISOString() },
      }),
    });

    const result = await response.json();
    return result.data?.updateSubscription || null;
  } catch (error) {
    console.error('Error skipping delivery:', error);
    return null;
  }
}

function calculateNextDeliveryDate(
  frequency: 'weekly' | 'biweekly' | 'monthly',
  fromDate: Date = new Date()
): Date {
  const next = new Date(fromDate);
  
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
  }
  
  return next;
}
