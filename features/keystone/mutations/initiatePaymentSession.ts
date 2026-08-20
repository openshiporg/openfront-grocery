import type { Context } from '.keystone/types';
import {
  assertPublicPaymentProvider,
  type PaymentProviderRecord,
} from '../../integrations/payment';
import { createPayment } from '../utils/paymentProviderAdapter';
import { calculateCouponDiscount } from '../lib/couponPricing';
import { evaluateFulfillmentWindow } from '../lib/rollingFulfillment';
import { assertSellableQuantity } from '../lib/sellableInventory';
import { calculateTaxCents, getStoreTaxRateBps } from '../lib/storeMoney';
import { isLiveFulfillmentSlot } from '../lib/storeTime';
import { ensureCheckoutAttempt, type SubmitOrderData } from './submitGroceryOrder';

type CheckoutRecoveryInput = {
  email: string;
  deliveryAddress: SubmitOrderData['deliveryAddress'];
  substitutionPreference: string;
  deliveryInstructions?: string | null;
};

function fulfillmentWindow(startTime: string) {
  const hour = Number.parseInt(startTime.slice(0, 2), 10);
  if (hour < 10) return 'time_8_10';
  if (hour < 12) return 'time_10_12';
  if (hour < 14) return 'time_12_14';
  if (hour < 16) return 'time_14_16';
  if (hour < 18) return 'time_16_18';
  return 'time_18_20';
}

interface InitiatePaymentSessionArgs {
  cartId: string;
  paymentProviderId: string;
  deliverySlotId?: string;
  pickupSlotId?: string;
  sessionId?: string;
  couponCode?: string;
  recovery: CheckoutRecoveryInput;
}

export default async function initiatePaymentSession(
  root: any,
  { cartId, paymentProviderId, deliverySlotId, pickupSlotId, sessionId, couponCode, recovery }: InitiatePaymentSessionArgs,
  context: Context
) {
  assertPublicPaymentProvider(paymentProviderId);
  const sudoContext = context.sudo();

  if (Boolean(deliverySlotId) === Boolean(pickupSlotId)) {
    throw new Error('Choose exactly one live delivery or pickup slot');
  }
  const requestedFulfillmentMethod = pickupSlotId ? 'pickup' : 'delivery';
  if (!/^\S+@\S+\.\S+$/.test(recovery?.email?.trim() || '') || recovery.email.length > 320) throw new Error('Checkout recovery requires a valid email');
  for (const value of [recovery.deliveryAddress?.firstName, recovery.deliveryAddress?.lastName, recovery.deliveryAddress?.phone]) {
    if (!value?.trim() || value.length > 200) throw new Error('Checkout recovery requires customer contact details');
  }
  if (requestedFulfillmentMethod === 'delivery') {
    for (const value of [recovery.deliveryAddress.address1, recovery.deliveryAddress.city, recovery.deliveryAddress.province, recovery.deliveryAddress.postalCode]) {
      if (!value?.trim() || value.length > 200) throw new Error('Checkout recovery requires a valid delivery address');
    }
  }
  if (!['call_me', 'best_match', 'refund'].includes(recovery.substitutionPreference)) {
    throw new Error('Checkout recovery substitution preference is invalid');
  }

  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      store { id timezone isActive }
      sessionId
      expiresAt
      customer { id }
      subtotal
      subtotalCents
      items { quantity product { id title price priceCents department status store { id } inventoryLots { id expirationDate quantityRemaining store { id } } } }
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
  if (!cart.store?.isActive) throw new Error('Cart store is unavailable');
  if (!context.session?.itemId && cart.expiresAt && new Date(cart.expiresAt).getTime() <= Date.now()) {
    throw new Error('Guest cart session has expired; start a new cart');
  }
  if (!cart.items?.length) throw new Error('Cart is empty');

  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: paymentProviderId },
    query: 'id code isInstalled',
  });

  if (!provider || !provider.isInstalled) {
    throw new Error(`Payment provider ${paymentProviderId} not found or not installed`);
  }

  const deliverySlot = deliverySlotId
    ? await sudoContext.query.DeliverySlot.findOne({
        where: { id: deliverySlotId },
        query: 'id date startTime endTime deliveryFee capacity currentBookings isActive store { id }',
      })
    : null;

  const pickupSlot = pickupSlotId
    ? await sudoContext.query.PickupSlot.findOne({
        where: { id: pickupSlotId },
        query: 'id date startTime endTime maxOrders currentOrders isActive isAvailable store { id }',
      })
    : null;

  if (deliverySlotId && (!deliverySlot || deliverySlot.store?.id !== cart.store?.id)) {
    throw new Error('Selected delivery slot was not found in the active store');
  }

  if (pickupSlotId && (!pickupSlot || pickupSlot.store?.id !== cart.store?.id)) {
    throw new Error('Selected pickup slot was not found in the active store');
  }
  const selectedSlot = deliverySlot || pickupSlot;
  if (!selectedSlot || !isLiveFulfillmentSlot(selectedSlot as { date: string; endTime: string }, cart.store.timezone)) {
    throw new Error('Selected fulfillment slot is no longer a live Store-local window');
  }
  const storeSettings = await context.prisma.storeSettings.findFirst({
    where: { storeId: cart.store.id, isActive: true },
    select: { hours: true },
  });
  const windowDecision = evaluateFulfillmentWindow({
    hours: storeSettings?.hours,
    timeZone: cart.store.timezone,
    date: selectedSlot.date,
    startTime: selectedSlot.startTime,
    endTime: selectedSlot.endTime,
  });
  if (!storeSettings || !windowDecision.allowed) {
    throw new Error('Selected fulfillment slot is outside current Store hours, blackout, horizon, or cutoff policy');
  }

  if (deliverySlot && !deliverySlot.isActive) {
    throw new Error('Selected delivery slot is no longer available');
  }

  if (pickupSlot && (!pickupSlot.isActive || !pickupSlot.isAvailable)) {
    throw new Error('Selected pickup slot is no longer available');
  }

  if (deliverySlot && deliverySlot.capacity - deliverySlot.currentBookings <= 0) {
    throw new Error('Selected delivery slot is fully booked');
  }

  if (pickupSlot && pickupSlot.maxOrders - pickupSlot.currentOrders <= 0) {
    throw new Error('Selected pickup slot is fully booked');
  }

  const fulfillmentMethod = pickupSlot ? 'pickup' : 'delivery';
  const now = new Date();
  let subtotalCents = 0;
  for (const item of cart.items) {
    const product = item.product;
    if (!product || product.store?.id !== cart.store.id || product.status !== 'published') {
      throw new Error('Cart contains a product that is no longer available');
    }
    assertSellableQuantity(product, cart.store.id, item.quantity, now);
    subtotalCents += Number(product.priceCents ?? Math.round(Number(product.price || 0) * 100)) * item.quantity;
  }
  const subtotalDollars = subtotalCents / 100;
  await sudoContext.db.Cart.updateOne({ where: { id: cart.id }, data: { subtotal: subtotalDollars, subtotalCents, itemCount: cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0) } });

  const taxRateBps = await getStoreTaxRateBps(context, cart.store?.id);
  const deliveryFeeDollars = Number(((deliverySlot?.deliveryFee || 0) / 100).toFixed(2));
  let discountDollars = 0;
  let couponSnapshot: any = null;
  if (couponCode?.trim()) {
    const coupon = await sudoContext.query.Coupon.findOne({ where: { code: couponCode.trim().toUpperCase() }, query: 'id code discountType discountValue discountValueCents minPurchase minPurchaseCents validFrom validTo isActive maxUses currentUses productCategories excludedProducts store { id }' });
    if (!coupon || coupon.store?.id !== cart.store?.id) throw new Error('Coupon is not available for this store');
    discountDollars = calculateCouponDiscount(coupon as any, cart.items || []);
    couponSnapshot = { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount: discountDollars };
  }
  const discountCents = Math.round(discountDollars * 100);
  const taxCents = calculateTaxCents(Math.max(0, subtotalCents - discountCents), taxRateBps);
  const taxDollars = taxCents / 100;
  const amountInCents = Math.max(0, subtotalCents + taxCents + Math.round(deliveryFeeDollars * 100) - discountCents);
  const totalDollars = amountInCents / 100;
  const slotKey = pickupSlotId ? `pickup:${pickupSlotId}` : `delivery:${deliverySlotId || 'no-slot'}`;
  const couponIdentity = couponSnapshot ? `${couponSnapshot.id}:${couponSnapshot.code}` : 'none';
  const idempotencyKey = `${cart.id}:${provider.code}:${slotKey}:coupon:${couponIdentity}:amount:${amountInCents}`;

  const sessionSelection = `
    id
    data
    amount
    amountCents
    reservedOrderDisplayId
    idempotencyKey
    isInitiated
    isSelected
    paymentProvider { id code }
  `;
  const claimData = {
    subtotal: subtotalDollars,
    tax: taxDollars,
    deliveryFee: deliveryFeeDollars,
    total: totalDollars,
    fulfillmentMethod,
    taxRateBps,
    fulfillmentSlot: {
      id: (pickupSlot || deliverySlot)?.id,
      date: (pickupSlot || deliverySlot)?.date,
      startTime: (pickupSlot || deliverySlot)?.startTime,
      endTime: (pickupSlot || deliverySlot)?.endTime,
    },
    deliverySlotId: deliverySlotId || null,
    pickupSlotId: pickupSlotId || null,
    amountInCents,
    couponCode: couponCode?.trim().toUpperCase() || null,
    coupon: couponSnapshot,
    discount: discountDollars,
    currency: 'usd',
  };
  const checkoutRequest = (paymentSessionId: string, providerPaymentId: string): SubmitOrderData => ({
    cartId: cart.id,
    paymentSessionId,
    paymentIntentId: providerPaymentId,
    sessionId: context.session?.itemId ? undefined : sessionId?.trim(),
    couponCode: couponCode?.trim().toUpperCase() || undefined,
    email: recovery.email.trim(),
    deliveryAddress: recovery.deliveryAddress,
    deliveryDate: new Date(selectedSlot.date).toISOString(),
    deliveryTimeWindow: fulfillmentWindow(selectedSlot.startTime),
    fulfillmentMethod,
    deliverySlotId: deliverySlotId || undefined,
    pickupSlotId: pickupSlotId || undefined,
    deliveryFee: deliveryFeeDollars,
    expectedTotal: totalDollars,
    substitutionPreference: recovery.substitutionPreference,
    deliveryInstructions: recovery.deliveryInstructions?.trim() || undefined,
    checkoutOwnerId: context.session?.itemId || null,
  });

  // Claim the durable checkout key before calling Stripe. The row lock and
  // unique idempotency key ensure concurrent browser submits share one
  // provider request instead of creating duplicate PaymentIntents.
  let claim: { session: any; shouldCreate: boolean };
  try {
    claim = await context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$queryRaw`
      WITH payment_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))
      )
      SELECT true AS locked FROM payment_lock
    `;
    await transactionContext.prisma.$queryRaw`SELECT "id" FROM "PaymentSession" WHERE "idempotencyKey" = ${idempotencyKey} FOR UPDATE`;
    const existingRows = await transactionContext.sudo().query.PaymentSession.findMany({
      where: { idempotencyKey: { equals: idempotencyKey } },
      take: 1,
      query: sessionSelection,
    });
    const existing = existingRows[0] || null;
    const now = Date.now();
    const existingClaimedAt = Number(existing?.data?.claimedAt || 0);
    const existingStatus = existing?.data?.status;
    if (existing?.isInitiated && existingStatus === 'ready') return { session: existing, shouldCreate: false };
    if (existing && existing.reservedOrderDisplayId && existingStatus !== 'failed' && existingStatus !== 'expired' && now - existingClaimedAt < 30_000) {
      return { session: existing, shouldCreate: false };
    }

    const baseData = { ...claimData, status: 'initiating', claimedAt: now };
    const reservedOrderDisplayId = existing?.reservedOrderDisplayId || await (async () => {
      await transactionContext.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-order-display-id'), hashtext('allocation'))");
      const [orderMax, sessionMax] = await Promise.all([
        transactionContext.prisma.order.aggregate({ _max: { displayId: true } }),
        transactionContext.prisma.paymentSession.aggregate({ _max: { reservedOrderDisplayId: true } }),
      ]);
      return Math.max(orderMax._max.displayId || 0, sessionMax._max.reservedOrderDisplayId || 0) + 1;
    })();
    if (existing) {
      const updated = await transactionContext.sudo().query.PaymentSession.updateOne({
        where: { id: existing.id },
        data: { isSelected: true, isInitiated: false, amountCents: amountInCents, reservedOrderDisplayId, data: baseData },
        query: sessionSelection,
      });
      return { session: updated, shouldCreate: true };
    }

    const existingSelected = await transactionContext.sudo().query.PaymentSession.findMany({
      where: { cart: { id: { equals: cart.id } }, isSelected: { equals: true } },
      query: 'id',
    });
    for (const selected of existingSelected) {
      await transactionContext.sudo().query.PaymentSession.updateOne({ where: { id: selected.id }, data: { isSelected: false } });
    }

    const created = await transactionContext.sudo().query.PaymentSession.createOne({
      data: {
        cart: { connect: { id: cart.id } },
        paymentProvider: { connect: { id: provider.id } },
        amount: totalDollars.toFixed(2),
        idempotencyKey,
        isSelected: true,
        isInitiated: false,
        amountCents: amountInCents,
        reservedOrderDisplayId,
        data: baseData,
      },
      query: sessionSelection,
    });
    return { session: created, shouldCreate: true };
    });
  } catch (error) {
    const candidate = error as { code?: string; extensions?: { prisma?: { code?: string } } };
    const errorCode = candidate.code || candidate.extensions?.prisma?.code;
    if (errorCode !== 'P2002') throw error;
    const winner = await sudoContext.query.PaymentSession.findMany({ where: { idempotencyKey: { equals: idempotencyKey } }, take: 1, query: sessionSelection });
    if (!winner[0]) throw error;
    claim = { session: winner[0], shouldCreate: false };
  }

  if (!claim.shouldCreate) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const ready = await sudoContext.query.PaymentSession.findOne({ where: { id: claim.session.id }, query: sessionSelection });
      if (ready?.isInitiated && ready.data?.status === 'ready') {
        const providerPaymentId = ready.data?.paymentIntentId;
        if (!providerPaymentId) throw new Error('Payment session is missing a durable payment identity');
        await ensureCheckoutAttempt(context, checkoutRequest(ready.id, providerPaymentId), cart, ready, providerPaymentId);
        return ready;
      }
      if (ready?.data?.status === 'failed') throw new Error(ready.data.error || 'Payment session initiation failed');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Payment session is still being initialized; please retry without changing the cart or slot');
  }

  try {
    const sessionData = await createPayment({
      provider: provider as PaymentProviderRecord,
      cart,
      amount: amountInCents,
      currency: 'usd',
      idempotencyKey,
    });
    const ready = await sudoContext.query.PaymentSession.updateOne({
      where: { id: claim.session.id },
      data: {
        isSelected: true,
        isInitiated: true,
        amountCents: amountInCents,
        data: { ...claimData, ...sessionData, status: 'attempt_pending', claimedAt: undefined },
      },
      query: sessionSelection,
    });
    const providerPaymentId = sessionData?.paymentIntentId;
    if (!providerPaymentId) throw new Error('Payment provider did not return a durable payment identity');
    await ensureCheckoutAttempt(context, checkoutRequest(ready.id, providerPaymentId), cart, ready, providerPaymentId);
    return sudoContext.query.PaymentSession.updateOne({
      where: { id: ready.id },
      data: { data: { ...claimData, ...sessionData, status: 'ready', claimedAt: undefined } },
      query: sessionSelection,
    });
  } catch (error) {
    await sudoContext.query.PaymentSession.updateOne({
      where: { id: claim.session.id },
      data: { isInitiated: false, data: { ...claimData, status: 'failed', error: error instanceof Error ? error.message : 'Provider initiation failed' } },
    });
    throw error;
  }
}
