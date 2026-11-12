import type { Context } from '.keystone/types';
import { publicError } from '../lib/publicError';
import { noChargeOrderPaymentState } from '../lib/checkoutIdentity';
import { verifyGuestOrderToken } from '../utils/guestOrderToken';
import { cancelGroceryOrderForStore } from './cancelOrder';
import { voidGroceryPaymentAuthorizationForStore } from './voidGroceryPaymentAuthorization';

/** Customers may cancel until the store starts shopping the order (Instacart-style). */
export const CUSTOMER_CANCELLABLE_STATUSES = ['pending'];
const CUSTOMER_CANCEL_REASON = 'Cancelled by the customer before shopping started';

type Args = { orderId: string; sessionId?: string | null; token?: string | null };

/** Same ownership proof as substitution answers: the signed-in owner, or the guest session plus its signed order token. */
export function customerOwnsOrder(order: any, session: { itemId?: string } | undefined, args: Args, now = Date.now()) {
  if (!order) return false;
  if (session?.itemId) return order.userId === session.itemId;
  return Boolean(!order.userId && args.sessionId && args.token && order.metadata?.guestSessionId === args.sessionId
    && verifyGuestOrderToken(order.id, args.sessionId, args.token, Math.floor(now / 1000), order.createdAt));
}

/** Which payments the customer may release themselves: only uncaptured holds and server no-charge rows. */
export function customerCancellationBlocker(payments: Array<{ status: string; amountCents: number; providerData?: any; providerPaymentId?: string | null }>) {
  for (const payment of payments) {
    if (['authorized', 'pending', 'cancelled', 'failed', 'refunded'].includes(payment.status)) continue;
    if (payment.status === 'succeeded' && payment.amountCents === 0 && noChargeOrderPaymentState(payment)) continue;
    return 'This order has already been charged. Contact the store to cancel it and arrange a refund.';
  }
  if (payments.some(payment => ['processing', 'unknown'].includes(payment.providerData?.authorizationVoid?.status))) return 'Your card hold is still being released. Refresh in a moment.';
  return null;
}

export async function cancelMyGroceryOrder(_root: unknown, args: Args, context: Context) {
  const orderId = args.orderId?.trim();
  if (!orderId) throw publicError('Order not found', 'NOT_FOUND');
  const prisma = context.sudo().prisma as any;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true, payments: { orderBy: { id: 'asc' } } } });
  if (!customerOwnsOrder(order, context.session as any, args) || !order.store?.isActive) throw publicError('Order not found', 'NOT_FOUND');
  if (order.status === 'cancelled') return { success: true, orderId, status: 'cancelled', reused: true };
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status) || order.deliveryRouteId) {
    throw publicError('The store has started shopping this order, so it can no longer be cancelled online. Contact the store.');
  }
  const blocker = customerCancellationBlocker(order.payments || []);
  if (blocker) throw publicError(blocker);

  const actorId = (context.session as any)?.itemId || null;
  const sudo = context.sudo();
  // Release every uncaptured card hold first, through the same void path staff use.
  for (const payment of order.payments || []) {
    if (!['authorized', 'pending'].includes(payment.status)) continue;
    await voidGroceryPaymentAuthorizationForStore({ paymentId: payment.id, reason: CUSTOMER_CANCEL_REASON, idempotencyKey: `customer-cancel:${payment.id}` }, sudo, order.store, actorId);
  }
  // Then the audited cancellation: stock back, slot capacity, coupon and loyalty released.
  return cancelGroceryOrderForStore({ orderId, reason: CUSTOMER_CANCEL_REASON, idempotencyKey: `customer-cancel:${orderId}`, allowedStatuses: CUSTOMER_CANCELLABLE_STATUSES }, sudo, order.store, actorId);
}
