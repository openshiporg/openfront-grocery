import type { Context } from '.keystone/types';
import { checkoutCartFingerprint, checkoutRequestFingerprint, checkoutTermsFingerprint } from '../lib/checkoutIdentity';
import { requireSessionStore } from '../lib/storeScope';
import { initiatePaymentSessionWithDependencies, type CheckoutRestartSource } from './initiatePaymentSession';
import type { SubmitOrderData } from './submitGroceryOrder';

type RestartArgs = { paymentSessionId: string; sessionId?: string | null };

const unavailable = () => new Error('Checkout attempt not found');

/** Create/replay one new payment identity from a confirmed compensated checkout. */
export async function restartGroceryCheckout(_root: unknown, args: RestartArgs, context: Context) {
  const paymentSessionId = args.paymentSessionId?.trim();
  const guestSessionId = args.sessionId?.trim();
  const userId = context.session?.itemId || null;
  if (!paymentSessionId || (!userId && !guestSessionId)) throw unavailable();
  const activeStore = userId ? await requireSessionStore(context) : null;

  const source = await context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentSession" WHERE "id" = $1 FOR UPDATE', paymentSessionId);
    const session = await tx.paymentSession.findUnique({
      where: { id: paymentSessionId },
      include: { cart: { include: { items: { include: { product: true } } } }, paymentProvider: true },
    });
    if (!session) throw unavailable();

    const attemptKey = `checkout:${paymentSessionId}`;
    await tx.$queryRawUnsafe('SELECT "id" FROM "CheckoutAttempt" WHERE "idempotencyKey" = $1 FOR UPDATE', attemptKey);
    const attempt = await tx.checkoutAttempt.findUnique({ where: { idempotencyKey: attemptKey } });
    const cart = session.cart;
    const request = attempt?.requestData as SubmitOrderData | null;
    const sessionData = session.data && typeof session.data === 'object' ? session.data as Record<string, any> : {};

    if (!attempt || !cart || !request || attempt.paymentSessionId !== session.id || attempt.cartId !== cart.id
      || attempt.storeId !== cart.storeId || session.paymentProvider?.code !== attempt.providerCode) throw unavailable();
    if (userId) {
      if (activeStore?.id !== cart.storeId || request.checkoutOwnerId !== userId) throw unavailable();
    } else if (request.checkoutOwnerId || request.sessionId !== guestSessionId) {
      throw unavailable();
    }

    if (attempt.status !== 'compensated' || attempt.orderId || !attempt.compensationAt
      || sessionData.compensationStatus !== 'refunded' || !sessionData.compensationProviderRefundId) {
      throw new Error('A fresh checkout is available only after payment compensation is confirmed');
    }
    if (sessionData.status === 'completed' || !sessionData.paymentIntentId
      || sessionData.paymentIntentId !== attempt.providerPaymentId
      || Number(session.amountCents) !== Number(attempt.amountCents)
      || Number(sessionData.amountInCents) !== Number(attempt.amountCents)
      || attempt.currencyCode !== 'usd') throw unavailable();

    const checkoutFingerprint = String(sessionData.checkoutFingerprint || '');
    const cartFingerprint = String(sessionData.cartFingerprint || '');
    if (!checkoutFingerprint || !cartFingerprint || checkoutRequestFingerprint(request) !== checkoutFingerprint) throw unavailable();

    const linkedChildId = typeof sessionData.checkoutRestartPaymentSessionId === 'string' ? sessionData.checkoutRestartPaymentSessionId : null;
    if (linkedChildId) {
      const child = await tx.paymentSession.findUnique({ where: { id: linkedChildId }, select: { id: true, cartId: true, data: true } });
      const childData = child?.data && typeof child.data === 'object' ? child.data as Record<string, any> : {};
      if (!child || child.cartId !== cart.id || childData.checkoutRestartOfPaymentSessionId !== session.id) throw unavailable();
      if (childData.status === 'completed' || childData.compensationStatus) return { terminalChildPaymentSessionId: child.id };
    }

    if (userId ? cart.customerId !== userId : cart.customerId || cart.sessionId !== guestSessionId) throw unavailable();
    if (checkoutCartFingerprint(cart) !== cartFingerprint) throw new Error('Your basket changed after payment compensation. Review checkout before restarting.');

    const restartSource: CheckoutRestartSource = {
      paymentSessionId: session.id,
      amountCents: Number(attempt.amountCents),
      checkoutFingerprint,
      cartFingerprint,
      termsFingerprint: checkoutTermsFingerprint(sessionData),
    };
    return { attempt, request, providerCode: session.paymentProvider.code, restartSource };
  });

  if ('terminalChildPaymentSessionId' in source) {
    return context.sudo().query.PaymentSession.findOne({
      where: { id: source.terminalChildPaymentSessionId },
      query: 'id data amount amountCents reservedOrderDisplayId idempotencyKey isInitiated isSelected paymentProvider { id code }',
    });
  }

  return initiatePaymentSessionWithDependencies(_root, {
    cartId: source.attempt.cartId,
    paymentProviderId: source.providerCode,
    deliverySlotId: source.request.deliverySlotId || undefined,
    pickupSlotId: source.request.pickupSlotId || undefined,
    sessionId: userId ? undefined : guestSessionId,
    couponCode: source.request.couponCode || undefined,
    recovery: {
      email: source.request.email,
      deliveryAddress: source.request.deliveryAddress,
      substitutionPreference: source.request.substitutionPreference as 'call_me' | 'best_match' | 'refund',
      deliveryInstructions: source.request.deliveryInstructions || undefined,
    },
  }, context, undefined, source.restartSource);
}

export default restartGroceryCheckout;
