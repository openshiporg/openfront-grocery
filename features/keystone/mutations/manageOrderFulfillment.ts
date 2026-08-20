import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { withSerializableRetry } from '../utils/serializableTransaction';

type FulfillmentTarget = 'picking' | 'packed' | 'ready_for_pickup';

type AdvanceOrderFulfillmentArgs = {
  orderId: string;
  target: FulfillmentTarget;
};

const NEXT_STATUS: Record<string, FulfillmentTarget | undefined> = {
  pending: 'picking',
  picking: 'packed',
};

async function assertCanManageOrders(context: Context) {
  return requireFreshCapability(context, 'canManageOrders');
}

export async function advanceOrderFulfillment(
  _root: unknown,
  { orderId, target }: AdvanceOrderFulfillmentArgs,
  context: Context
) {
  const { storeId } = await assertCanManageOrders(context);
  if (!['picking', 'packed', 'ready_for_pickup'].includes(target)) {
    throw new Error('Unsupported fulfillment target');
  }

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE',
      orderId
    );
    const sudoContext = transactionContext.sudo();
    const order = await sudoContext.query.Order.findOne({
      where: { id: orderId },
      query: `
        id displayId status metadata substitutionPreference store { id } deliveryRoute { id }
        lineItems {
          id metadata
          substitutions(orderBy: { createdAt: desc }, take: 1) { customerApproved }
        }
      `,
    });
    if (!order || order.store?.id !== storeId) throw new Error('Order not found in active store');
    if (order.deliveryRoute?.id) {
      throw new Error('Routed orders advance through the delivery route workflow');
    }

    const metadata = (order.metadata || {}) as Record<string, unknown>;
    const fulfillmentMethod = metadata.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';
    const isReadyRetry = target === 'ready_for_pickup' && metadata.readyForPickup === true;
    if (order.status === target || isReadyRetry) {
      return {
        success: true,
        orderId,
        status: order.status,
        stage: target,
        reused: true,
        message: 'Fulfillment transition was already applied.',
      };
    }

    const expectedTarget = order.status === 'packed' && fulfillmentMethod === 'pickup'
      ? 'ready_for_pickup'
      : NEXT_STATUS[order.status];
    if (target !== expectedTarget) {
      throw new Error(`Cannot move fulfillment from ${order.status} to ${target}`);
    }

    if (target === 'packed') {
      const unresolved = (order.lineItems || []).some((lineItem: any) => {
        const linePreference = lineItem.metadata?.substitutionPreference;
        const requiresApproval = linePreference === 'contact' || order.substitutionPreference === 'call_me';
        return requiresApproval
          && lineItem.substitutions?.length
          && lineItem.substitutions[0].customerApproved !== true;
      });
      if (unresolved) {
        throw new Error('Customer approval is required before packing substituted items');
      }
    }

    const settledPayments = await sudoContext.query.Payment.findMany({
      where: {
        order: { id: { equals: orderId } },
        status: { in: ['succeeded', 'partially_refunded'] },
      },
      take: 1,
      query: 'id',
    });
    if (!settledPayments.length) {
      throw new Error('Order fulfillment requires a succeeded payment');
    }

    const now = new Date().toISOString();
    const nextMetadata = {
      ...metadata,
      ...(target === 'picking' ? { pickingStartedAt: now } : {}),
      ...(target === 'packed' ? { packedAt: now } : {}),
      ...(target === 'ready_for_pickup'
        ? { readyForPickup: true, pickupReadyAt: now }
        : {}),
    };
    const nextStatus = target === 'ready_for_pickup' ? 'packed' : target;
    await sudoContext.db.Order.updateOne({
      where: { id: orderId },
      data: { status: nextStatus as any, metadata: nextMetadata },
    });

    return {
      success: true,
      orderId,
      status: nextStatus,
      stage: target,
      reused: false,
      message: target === 'ready_for_pickup'
        ? `Order #${order.displayId} is ready for pickup.`
        : `Order #${order.displayId} moved to ${target}.`,
    };
  }, { isolationLevel: 'ReadCommitted' as any }));
}
