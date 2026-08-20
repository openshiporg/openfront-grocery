import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';
import { withSerializableRetry } from '../utils/serializableTransaction';

type RecordOrderItemSubstitutionArgs = {
  orderItemId: string;
  substitutedProduct: string;
  reason?: string | null;
  customerApproved?: boolean | null;
  idempotencyKey: string;
};

function normalize(args: RecordOrderItemSubstitutionArgs) {
  const orderItemId = args.orderItemId.trim();
  const substitutedProduct = args.substitutedProduct.trim();
  const reason = args.reason?.trim() || '';
  const idempotencyKey = args.idempotencyKey.trim();
  if (!orderItemId) throw new Error('Order line item is required');
  if (!substitutedProduct || substitutedProduct.length > 200) {
    throw new Error('A substitution product snapshot between 1 and 200 characters is required');
  }
  if (substitutedProduct.toUpperCase() === 'REMOVED') {
    throw new Error('Removed items require a refund operation before substitution evidence can be recorded');
  }
  if (reason.length > 1000) throw new Error('Substitution reason cannot exceed 1000 characters');
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new Error('A valid substitution idempotency key is required');
  }
  return {
    orderItemId,
    substitutedProduct,
    reason,
    customerApproved: Boolean(args.customerApproved),
    idempotencyKey,
  };
}

export async function recordOrderItemSubstitution(
  _root: unknown,
  rawArgs: RecordOrderItemSubstitutionArgs,
  context: Context
) {
  await requireFreshCapability(context, 'canManageOrders');
  const args = normalize(rawArgs);
  const store = await requireSessionStore(context);

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "OrderLineItem" WHERE "id" = $1 FOR UPDATE',
      args.orderItemId
    );
    const sudoContext = transactionContext.sudo();
    const lineItem = await sudoContext.query.OrderLineItem.findOne({
      where: { id: args.orderItemId },
      query: 'id title order { id }',
    });
    if (!lineItem?.order?.id) throw new Error('Order line item not found');

    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE',
      lineItem.order.id
    );
    const order = await sudoContext.query.Order.findOne({
      where: { id: lineItem.order.id },
      query: 'id status store { id }',
    });
    if (!order || order.store?.id !== store.id) throw new Error('Order not found in active store');
    if (order.status !== 'picking') {
      throw new Error('Substitutions can only be recorded while an order is picking');
    }

    const settledPayment = await sudoContext.query.Payment.findMany({
      where: {
        order: { id: { equals: order.id } },
        status: { equals: 'succeeded' },
      },
      take: 1,
      query: 'id',
    });
    if (!settledPayment.length) throw new Error('Substitution requires a succeeded payment');

    const existing = (await sudoContext.query.OrderItemSubstitution.findMany({
      where: { idempotencyKey: { equals: args.idempotencyKey } },
      take: 1,
      query: 'id orderItem originalProduct substitutedProduct reason customerApproved approvedAt createdAt lineItem { id } recordedBy { id }',
    }))[0];
    if (existing) {
      const matches = existing.lineItem?.id === args.orderItemId
        && existing.orderItem === args.orderItemId
        && existing.substitutedProduct === args.substitutedProduct
        && (existing.reason || '') === args.reason
        && Boolean(existing.customerApproved) === args.customerApproved;
      if (!matches) {
        throw new Error('Substitution idempotency key was reused with different substitution input');
      }
      await enqueueGroceryOutboxEvent(transactionContext.prisma, {
        storeId: store.id,
        eventKey: `substitution:${args.idempotencyKey}:recorded:v1`,
        eventType: 'substitution.recorded',
        aggregateType: 'order_line_item',
        aggregateId: args.orderItemId,
        occurredAt: new Date(existing.createdAt).toISOString(),
        payload: {
          substitutionId: existing.id,
          orderId: order.id,
          orderItemId: args.orderItemId,
          originalProduct: existing.originalProduct,
          substitutedProduct: existing.substitutedProduct,
          reason: existing.reason || '',
          customerApproved: Boolean(existing.customerApproved),
          approvedAt: existing.approvedAt ? new Date(existing.approvedAt).toISOString() : null,
          recordedById: existing.recordedBy?.id || null,
        },
      });
      return {
        success: true,
        substitutionId: existing.id,
        orderItemId: args.orderItemId,
        customerApproved: Boolean(existing.customerApproved),
        approvedAt: existing.approvedAt || null,
        reused: true,
      };
    }

    const substitution = await sudoContext.db.OrderItemSubstitution.createOne({
      data: {
        idempotencyKey: args.idempotencyKey,
        orderItem: args.orderItemId,
        lineItem: { connect: { id: args.orderItemId } },
        recordedBy: context.session?.itemId
          ? { connect: { id: context.session.itemId } }
          : undefined,
        originalProduct: lineItem.title,
        substitutedProduct: args.substitutedProduct,
        reason: args.reason,
        customerApproved: args.customerApproved,
      },
    });

    await enqueueGroceryOutboxEvent(transactionContext.prisma, {
      storeId: store.id,
      eventKey: `substitution:${args.idempotencyKey}:recorded:v1`,
      eventType: 'substitution.recorded',
      aggregateType: 'order_line_item',
      aggregateId: args.orderItemId,
      occurredAt: new Date(substitution.createdAt).toISOString(),
      payload: {
        substitutionId: substitution.id,
        orderId: order.id,
        orderItemId: args.orderItemId,
        originalProduct: lineItem.title,
        substitutedProduct: args.substitutedProduct,
        reason: args.reason,
        customerApproved: args.customerApproved,
        approvedAt: substitution.approvedAt ? new Date(substitution.approvedAt).toISOString() : null,
        recordedById: context.session?.itemId || null,
      },
    });

    if (process.env.GROCERY_SUBSTITUTION_ROLLBACK_PROOF === args.idempotencyKey) {
      throw new Error('Injected substitution rollback proof');
    }

    return {
      success: true,
      substitutionId: substitution.id,
      orderItemId: args.orderItemId,
      customerApproved: args.customerApproved,
      approvedAt: substitution.approvedAt
        ? new Date(substitution.approvedAt).toISOString()
        : null,
      reused: false,
    };
  }, { isolationLevel: 'ReadCommitted' as any }));
}
