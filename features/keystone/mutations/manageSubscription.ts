import type { Context } from '.keystone/types';
import { requireSessionStore } from '../lib/storeScope';
import { requireStoreProduct } from '../lib/catalogAccess';

// Helper to calculate next delivery date based on frequency
function calculateNextDeliveryDate(frequency: string, fromDate?: Date): Date {
  const date = fromDate || new Date();

  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      date.setDate(date.getDate() + 7);
  }

  return date;
}

// Create a new subscription
export async function createSubscription(
  root: any,
  {
    productId,
    quantity,
    frequency,
    deliveryDay,
  }: {
    productId: string;
    quantity: number;
    frequency: string;
    deliveryDay?: string;
  },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('Must be logged in to create a subscription');
  }

  const sudoContext = context.sudo();
  const store = await requireSessionStore(context);

  // Verify the product belongs to the caller's active Store and is published.
  const product = await requireStoreProduct(context, productId, store.id, { publishedOnly: true });

  // Check if user already has an active subscription for this product
  const existingSubscriptions = await sudoContext.query.Subscription.findMany({
    where: {
      user: { id: { equals: context.session.itemId } },
      product: { equals: productId },
      isActive: { equals: true },
    },
    query: 'id',
  });

  if (existingSubscriptions.length > 0) {
    const existing = await sudoContext.query.Subscription.findOne({
      where: { id: existingSubscriptions[0].id },
      query: `
        id
        product
        quantity
        frequency
        nextDeliveryDate
        discount
        isActive
        pausedUntil
      `,
    });
    return {
      id: existing.id,
      productId: existing.product,
      quantity: existing.quantity,
      frequency: existing.frequency,
      nextDeliveryDate: existing.nextDeliveryDate,
      discount: existing.discount,
      isActive: existing.isActive,
      isPaused: !!existing.pausedUntil,
      pausedUntil: existing.pausedUntil,
    };
  }

  // Calculate next delivery date
  const nextDeliveryDate = calculateNextDeliveryDate(frequency);

  // Create the subscription
  const subscription = await sudoContext.query.Subscription.createOne({
    data: {
      user: { connect: { id: context.session.itemId } },
      product: productId,
      productRef: { connect: { id: product.id } },
      quantity,
      frequency: frequency as 'weekly' | 'biweekly' | 'monthly',
      nextDeliveryDate: nextDeliveryDate.toISOString(),
      isActive: true,
      discount: 5, // Legacy display value; discountBps is authoritative
      discountBps: 500,
    },
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
      createdAt
    `,
  });

  return {
    id: subscription.id,
    productId: subscription.product,
    quantity: subscription.quantity,
    frequency: subscription.frequency,
    nextDeliveryDate: subscription.nextDeliveryDate,
    discount: subscription.discount,
    isActive: subscription.isActive,
    isPaused: !!subscription.pausedUntil,
    pausedUntil: subscription.pausedUntil,
  };
}

// Update an existing subscription
export async function updateSubscription(
  root: any,
  {
    subscriptionId,
    quantity,
    frequency,
  }: {
    subscriptionId: string;
    quantity?: number;
    frequency?: string;
  },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('Must be logged in to update a subscription');
  }

  const sudoContext = context.sudo();

  // Find the subscription
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: 'id user { id } product quantity frequency nextDeliveryDate isActive',
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  // Verify ownership
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error('You can only update your own subscriptions');
  }

  // Build update data
  const updateData: any = {};

  if (quantity !== undefined) {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }
    updateData.quantity = quantity;
  }

  if (frequency !== undefined) {
    if (!['weekly', 'biweekly', 'monthly'].includes(frequency)) {
      throw new Error('Invalid frequency. Must be weekly, biweekly, or monthly');
    }
    updateData.frequency = frequency;
    // Recalculate next delivery date with new frequency
    updateData.nextDeliveryDate = calculateNextDeliveryDate(frequency).toISOString();
  }

  // Update the subscription
  const updatedSubscription = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: updateData,
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
    `,
  });

  return {
    id: updatedSubscription.id,
    productId: updatedSubscription.product,
    quantity: updatedSubscription.quantity,
    frequency: updatedSubscription.frequency,
    nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    discount: updatedSubscription.discount,
    isActive: updatedSubscription.isActive,
    isPaused: !!updatedSubscription.pausedUntil,
    pausedUntil: updatedSubscription.pausedUntil,
  };
}

export async function resumeSubscription(
  root: any,
  { subscriptionId }: { subscriptionId: string },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('Must be logged in to resume a subscription');
  }

  const sudoContext = context.sudo();
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: 'id user { id } product quantity frequency nextDeliveryDate discount isActive pausedUntil',
  });
  if (!subscription) throw new Error('Subscription not found');
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error('You can only resume your own subscriptions');
  }
  if (subscription.isActive && !subscription.pausedUntil) {
    return {
      id: subscription.id,
      productId: subscription.product,
      quantity: subscription.quantity,
      frequency: subscription.frequency,
      nextDeliveryDate: subscription.nextDeliveryDate,
      discount: subscription.discount,
      isActive: true,
      isPaused: false,
      pausedUntil: null,
    };
  }

  const updated = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: { isActive: true, pausedUntil: null },
    query: 'id product quantity frequency nextDeliveryDate discount isActive pausedUntil',
  });
  return {
    id: updated.id,
    productId: updated.product,
    quantity: updated.quantity,
    frequency: updated.frequency,
    nextDeliveryDate: updated.nextDeliveryDate,
    discount: updated.discount,
    isActive: updated.isActive,
    isPaused: false,
    pausedUntil: null,
  };
}

// Pause a subscription
export async function pauseSubscription(
  root: any,
  {
    subscriptionId,
    pauseUntil,
  }: {
    subscriptionId: string;
    pauseUntil: string;
  },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('Must be logged in to pause a subscription');
  }

  const sudoContext = context.sudo();

  // Find the subscription
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: 'id user { id } isActive',
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  // Verify ownership
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error('You can only pause your own subscriptions');
  }

  if (!subscription.isActive) {
    throw new Error('Cannot pause an inactive subscription');
  }

  // Validate pause date
  const pauseDate = new Date(pauseUntil);
  if (pauseDate <= new Date()) {
    throw new Error('Pause date must be in the future');
  }

  // Update the subscription
  const updatedSubscription = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: {
      pausedUntil: pauseDate.toISOString(),
    },
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
    `,
  });

  return {
    id: updatedSubscription.id,
    productId: updatedSubscription.product,
    quantity: updatedSubscription.quantity,
    frequency: updatedSubscription.frequency,
    nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    discount: updatedSubscription.discount,
    isActive: updatedSubscription.isActive,
    isPaused: true,
    pausedUntil: updatedSubscription.pausedUntil,
  };
}

// Cancel a subscription
export async function cancelSubscription(
  root: any,
  { subscriptionId }: { subscriptionId: string },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('Must be logged in to cancel a subscription');
  }

  const sudoContext = context.sudo();

  // Find the subscription
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: 'id user { id } isActive',
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  // Verify ownership
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error('You can only cancel your own subscriptions');
  }

  if (!subscription.isActive) {
    const existing = await sudoContext.query.Subscription.findOne({
      where: { id: subscriptionId },
      query: 'id product quantity frequency nextDeliveryDate discount isActive pausedUntil',
    });
    return {
      id: existing.id,
      productId: existing.product,
      quantity: existing.quantity,
      frequency: existing.frequency,
      nextDeliveryDate: existing.nextDeliveryDate,
      discount: existing.discount,
      isActive: false,
      isPaused: false,
      pausedUntil: null,
    };
  }

  // Deactivate the subscription
  const updatedSubscription = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: {
      isActive: false,
      pausedUntil: null,
    },
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
    `,
  });

  return {
    id: updatedSubscription.id,
    productId: updatedSubscription.product,
    quantity: updatedSubscription.quantity,
    frequency: updatedSubscription.frequency,
    nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    discount: updatedSubscription.discount,
    isActive: false,
    isPaused: false,
    pausedUntil: null,
  };
}

// Skip the next delivery
export async function skipNextDelivery(
  root: any,
  { subscriptionId }: { subscriptionId: string },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('Must be logged in to skip a delivery');
  }

  const sudoContext = context.sudo();

  // Find the subscription
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: 'id user { id } frequency nextDeliveryDate isActive pausedUntil',
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  // Verify ownership
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error('You can only modify your own subscriptions');
  }

  if (!subscription.isActive) {
    throw new Error('Cannot skip delivery for inactive subscription');
  }

  // Calculate the next delivery date after the current one
  const currentDeliveryDate = subscription.nextDeliveryDate
    ? new Date(subscription.nextDeliveryDate)
    : new Date();
  const newNextDeliveryDate = calculateNextDeliveryDate(
    subscription.frequency,
    currentDeliveryDate
  );

  // Update the subscription
  const updatedSubscription = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: {
      nextDeliveryDate: newNextDeliveryDate.toISOString(),
    },
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
    `,
  });

  return {
    id: updatedSubscription.id,
    productId: updatedSubscription.product,
    quantity: updatedSubscription.quantity,
    frequency: updatedSubscription.frequency,
    nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    discount: updatedSubscription.discount,
    isActive: updatedSubscription.isActive,
    isPaused: !!updatedSubscription.pausedUntil,
    pausedUntil: updatedSubscription.pausedUntil,
    skippedDate: subscription.nextDeliveryDate,
  };
}
