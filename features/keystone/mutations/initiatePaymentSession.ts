import type { Context } from '.keystone/types';
import { createPayment } from '../utils/paymentProviderAdapter';

interface InitiatePaymentSessionArgs {
  cartId: string;
  paymentProviderId: string;
  deliverySlotId?: string;
  pickupSlotId?: string;
  sessionId?: string;
}

export default async function initiatePaymentSession(
  root: any,
  { cartId, paymentProviderId, deliverySlotId, pickupSlotId, sessionId }: InitiatePaymentSessionArgs,
  context: Context
) {
  const sudoContext = context.sudo();

  if (deliverySlotId && pickupSlotId) {
    throw new Error('Choose either delivery or pickup, not both');
  }

  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      sessionId
      customer { id }
      subtotal
      paymentSessions {
        id
        isSelected
        isInitiated
        amount
        idempotencyKey
        paymentProvider {
          id
          code
        }
        data
      }
    `,
  });

  if (!cart) {
    throw new Error('Cart not found');
  }

  if (context.session?.itemId) {
    if (cart.customer?.id !== context.session.itemId) {
      throw new Error('You do not have access to this cart');
    }
  } else if (!sessionId?.trim() || cart.customer?.id || cart.sessionId !== sessionId.trim()) {
    throw new Error('You do not have access to this cart');
  }

  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: paymentProviderId },
    query: `
      id
      code
      isInstalled
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
      credentials
    `,
  });

  if (!provider || !provider.isInstalled) {
    throw new Error(`Payment provider ${paymentProviderId} not found or not installed`);
  }

  const deliverySlot = deliverySlotId
    ? await sudoContext.query.DeliverySlot.findOne({
        where: { id: deliverySlotId },
        query: 'id deliveryFee capacity currentBookings isActive',
      })
    : null;

  const pickupSlot = pickupSlotId
    ? await sudoContext.query.PickupSlot.findOne({
        where: { id: pickupSlotId },
        query: 'id maxOrders currentOrders isAvailable',
      })
    : null;

  if (deliverySlotId && !deliverySlot) {
    throw new Error('Selected delivery slot was not found');
  }

  if (pickupSlotId && !pickupSlot) {
    throw new Error('Selected pickup slot was not found');
  }

  if (deliverySlot && !deliverySlot.isActive) {
    throw new Error('Selected delivery slot is no longer available');
  }

  if (pickupSlot && !pickupSlot.isAvailable) {
    throw new Error('Selected pickup slot is no longer available');
  }

  if (deliverySlot && deliverySlot.capacity - deliverySlot.currentBookings <= 0) {
    throw new Error('Selected delivery slot is fully booked');
  }

  if (pickupSlot && pickupSlot.maxOrders - pickupSlot.currentOrders <= 0) {
    throw new Error('Selected pickup slot is fully booked');
  }

  const fulfillmentMethod = pickupSlot ? 'pickup' : 'delivery';
  const subtotalDollars = Number(cart.subtotal || 0);
  const taxDollars = Number((subtotalDollars * 0.0875).toFixed(2));
  const deliveryFeeDollars = Number(((deliverySlot?.deliveryFee || 0) / 100).toFixed(2));
  const totalDollars = Number((subtotalDollars + taxDollars + deliveryFeeDollars).toFixed(2));
  const amountInCents = Math.round(totalDollars * 100);
  const slotKey = pickupSlotId ? `pickup:${pickupSlotId}` : `delivery:${deliverySlotId || 'no-slot'}`;
  const idempotencyKey = `${cart.id}:${provider.code}:${slotKey}:${amountInCents}`;

  const existingSession = cart.paymentSessions?.find(
    (session: any) => session.paymentProvider?.code === provider.code && session.idempotencyKey === idempotencyKey
  );

  if (existingSession) {
    return existingSession;
  }

  const existingSelectedSessions = cart.paymentSessions?.filter((session: any) => session.isSelected) || [];
  for (const session of existingSelectedSessions) {
    await sudoContext.query.PaymentSession.updateOne({
      where: { id: session.id },
      data: { isSelected: false },
    });
  }

  const sessionData = await createPayment({
    provider,
    cart,
    amount: amountInCents,
    currency: 'usd',
  });

  const newSession = await sudoContext.query.PaymentSession.createOne({
    data: {
      cart: { connect: { id: cart.id } },
      paymentProvider: { connect: { id: provider.id } },
      amount: totalDollars.toFixed(2),
      idempotencyKey,
      isSelected: true,
      isInitiated: true,
      data: {
        ...sessionData,
        subtotal: subtotalDollars,
        tax: taxDollars,
        deliveryFee: deliveryFeeDollars,
        total: totalDollars,
        fulfillmentMethod,
        deliverySlotId: deliverySlotId || null,
        pickupSlotId: pickupSlotId || null,
        amountInCents,
      },
    },
    query: `
      id
      data
      amount
      idempotencyKey
      isInitiated
      isSelected
      paymentProvider {
        id
        code
      }
    `,
  });

  return newSession;
}
