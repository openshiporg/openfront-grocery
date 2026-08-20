import type { Context } from '.keystone/types';
import { verifyGuestOrderToken } from '../utils/guestOrderToken';

export async function getGuestGroceryOrder(
  root: unknown,
  { orderId, sessionId, token }: { orderId: string; sessionId: string; token: string },
  context: Context
) {
  const order = await context.sudo().db.Order.findOne({ where: { id: orderId } });
  if (
    !order ||
    (order.metadata as any)?.guestSessionId !== sessionId.trim() ||
    !verifyGuestOrderToken(orderId, sessionId, token, undefined, order.createdAt)
  ) {
    throw new Error('Guest order not found');
  }

  const [shippingAddress, lineItems] = await Promise.all([
    order.shippingAddressId
      ? context.sudo().db.Address.findOne({ where: { id: order.shippingAddressId } })
      : null,
    context.prisma.orderLineItem.findMany({
      where: { orderId: String(order.id) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, title: true, quantity: true, unitPrice: true, unitPriceCents: true,
        thumbnail: true, metadata: true,
        product: { select: { id: true, handle: true } },
        substitutions: {
          orderBy: { createdAt: 'desc' }, take: 1,
          select: { id: true, originalProduct: true, substitutedProduct: true, reason: true, customerApproved: true, approvedAt: true },
        },
      },
    }),
  ]);
  const lineItemsSnapshot = lineItems.map((line) => ({
    id: line.id,
    title: line.title,
    quantity: line.quantity,
    unitPrice: Number(line.unitPriceCents || Math.round(Number(line.unitPrice || 0) * 100)) / 100,
    unitPriceCents: line.unitPriceCents,
    thumbnail: line.thumbnail || null,
    product: line.product,
    metadata: {
      ...((line.metadata as Record<string, unknown> | null) || {}),
      substitution: line.substitutions[0]
        ? { ...line.substitutions[0], approvedAt: line.substitutions[0].approvedAt?.toISOString() || null }
        : null,
    },
  }));

  return {
    ...order,
    metadata: { ...((order.metadata as Record<string, unknown> | null) || {}), lineItemsSnapshot },
    shippingAddress,
    lineItems: [],
  };
}
