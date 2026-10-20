import type { Context } from '.keystone/types';
import { publicError } from '../lib/publicError';
import { requireSessionStore } from '../lib/storeScope';

/**
 * Replacement evidence for the signed-in customer's own order (the same latest
 * per-line record the guest receipt carries). Ownership is checked before the
 * privileged read; raw OrderItemSubstitution access stays staff-only.
 */
export async function getCustomerOrderSubstitutions(_root: unknown, { orderId }: { orderId: string }, context: Context) {
  if (!context.session?.itemId) throw publicError('Order not found', 'NOT_FOUND');
  const store = await requireSessionStore(context);
  const order = await context.prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, storeId: true } });
  if (!order || order.userId !== context.session.itemId || order.storeId !== store.id) throw publicError('Order not found', 'NOT_FOUND');
  const lines = await context.prisma.orderLineItem.findMany({
    where: { orderId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 1000,
    select: {
      id: true,
      substitutions: {
        orderBy: { createdAt: 'desc' }, take: 1,
        select: { id: true, originalProduct: true, substitutedProduct: true, reason: true, customerApproved: true, approvedAt: true },
      },
    },
  });
  return lines.flatMap((line) => line.substitutions[0] ? [{
    ...line.substitutions[0],
    orderItem: line.id,
    approvedAt: line.substitutions[0].approvedAt?.toISOString() || null,
  }] : []);
}
