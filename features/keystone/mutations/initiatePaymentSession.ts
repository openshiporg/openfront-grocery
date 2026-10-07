import { checkoutRequestFingerprint, checkoutCartFingerprint, checkoutTermsFingerprint, claimPaymentCreationData, writePaymentCreationResult } from '../lib/checkoutIdentity';
import { groceryOutboxPayloadHash } from '../lib/groceryOutbox';
import { randomUUID } from 'node:crypto';
import {requireSessionStore} from "../lib/storeScope";
import {zonedDateKey,zonedDateTimeForDateKey} from "../lib/storeTime";
import { validateLoyaltyCoupon } from "../lib/loyaltyAccounting";
import { evaluateDeliveryPolicy } from '../lib/deliveryPolicy';
import { priceCommercialLines, isCouponLineEligible } from '../lib/commercialPricing';
import type { Context } from '.keystone/types';
import {
  assertIdempotentCaptureProvider,
  assertPublicPaymentProvider,
  TEST_PROVIDER_CODE,
  type PaymentProviderRecord,
} from '../../integrations/payment';
import { createPayment } from '../utils/paymentProviderAdapter';
import { calculateCouponDiscount } from '../lib/couponPricing';
import { evaluateFulfillmentWindow } from '../lib/rollingFulfillment';
import { assertSellableQuantity } from '../lib/sellableInventory';
import { getStoreTaxRateBps } from '../lib/storeMoney';
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

export type CheckoutRestartSource = {
  paymentSessionId: string;
  amountCents: number;
  checkoutFingerprint: string;
  cartFingerprint: string;
  termsFingerprint: string;
};

function isTerminalRestartReplay(existing: any, source: CheckoutRestartSource | undefined, amountCents: number, checkoutFingerprint: string, cartFingerprint: string, termsFingerprint: string) {
  if (!source || !existing) return false;
  const data = existing.data || {};
  return data.checkoutRestartOfPaymentSessionId === source.paymentSessionId
    && data.checkoutRestartTermsFingerprint === source.termsFingerprint
    && data.checkoutFingerprint === checkoutFingerprint
    && data.cartFingerprint === cartFingerprint
    && Number(existing.amountCents) === amountCents
    && termsFingerprint === source.termsFingerprint
    && (data.status === 'completed' || Boolean(data.compensationStatus));
}

async function bindRestartChild(tx: any, source: CheckoutRestartSource | undefined, childPaymentSessionId: string) {
  if (!source) return;
  await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentSession" WHERE "id" = $1 FOR UPDATE', source.paymentSessionId);
  const parent = await tx.paymentSession.findUnique({ where: { id: source.paymentSessionId }, select: { data: true } });
  const parentData = parent?.data && typeof parent.data === 'object' ? parent.data as Record<string, any> : {};
  if (parentData.compensationStatus !== 'refunded') throw new Error('Checkout compensation is no longer confirmed');
  if (parentData.checkoutRestartPaymentSessionId && parentData.checkoutRestartPaymentSessionId !== childPaymentSessionId) {
    throw new Error('A different fresh checkout is already bound to this compensated attempt');
  }
  if (!parentData.checkoutRestartPaymentSessionId) {
    await tx.paymentSession.update({
      where: { id: source.paymentSessionId },
      data: { data: { ...parentData, checkoutRestartPaymentSessionId: childPaymentSessionId } },
    });
  }
}

export async function initiatePaymentSessionWithDependencies(
  root: any,
  { cartId, paymentProviderId, deliverySlotId, pickupSlotId, sessionId, couponCode, recovery }: InitiatePaymentSessionArgs,
  context: Context,
  dependencies = { createPayment, ensureCheckoutAttempt },
  restartSource?: CheckoutRestartSource,
) {
  // Preserve the server-owned test-adapter prohibition before any context read;
  // configurable providers are evaluated against their fetched protected record below.
  if (paymentProviderId === TEST_PROVIDER_CODE) assertIdempotentCaptureProvider(paymentProviderId);
  if (context.session?.itemId) await requireSessionStore(context);
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
      items { id quantity substitutionPreference product { id title price priceCents taxRateBasisPoints pricingMethod unitOfMeasure department status store { id } inventoryLots { id expirationDate quantityRemaining safetyStatus conditionStatus store { id } } } }
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
    query: 'id code isInstalled publicCheckout supportsIdempotentCapture captureIdempotencyEvidence credentials metadata createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction getRefundStatusFunction cancelPaymentFunction generatePaymentLinkFunction handleWebhookFunction',
  });

  if (!provider || !provider.isInstalled) {
    throw new Error(`Payment provider ${paymentProviderId} not found or not installed`);
  }
  assertPublicPaymentProvider(provider as PaymentProviderRecord);
  assertIdempotentCaptureProvider(provider as PaymentProviderRecord);

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
  const storeSettings = await (context.prisma as any).storeSettings.findFirst({
    where: { storeId: cart.store.id, isActive: true },
    select: { hours: true, deliveryPolicy: true },
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
  const now = new Date(Math.max(Date.now(),zonedDateTimeForDateKey(zonedDateKey(selectedSlot.date,cart.store.timezone),selectedSlot.endTime,cart.store.timezone).getTime()));
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
  let deliveryFeeDollars = Number(((deliverySlot?.deliveryFee || 0) / 100).toFixed(2));
  let discountDollars = 0;
  let couponSnapshot: any = null;
  if (couponCode?.trim()) {
    const coupon = await sudoContext.query.Coupon.findOne({ where: { code: couponCode.trim().toUpperCase() }, query: 'id code discountType discountValue discountValueCents minPurchase minPurchaseCents validFrom validTo isActive maxUses currentUses productCategories excludedProducts store { id }' });
    if (!coupon || coupon.store?.id !== cart.store?.id) throw new Error('Coupon is not available for this store');
    await validateLoyaltyCoupon(context.prisma, coupon.id, context.session?.itemId, cart.store!.id);
    discountDollars = calculateCouponDiscount(coupon as any, cart.items || []);
    couponSnapshot = { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount: discountDollars, productCategories: coupon.productCategories, excludedProducts: coupon.excludedProducts, minPurchaseCents: coupon.minPurchaseCents, discountValueCents: coupon.discountValueCents };
  }
  const discountCents = Math.round(discountDollars * 100);
  const service = evaluateDeliveryPolicy(storeSettings.deliveryPolicy, fulfillmentMethod, recovery.deliveryAddress.postalCode, subtotalCents - discountCents);
  deliveryFeeDollars += service.feeCents / 100;
  const commercial = priceCommercialLines(cart.items.map((item: any) => ({
    id: item.id, subtotalCents: Number(item.product.priceCents) * item.quantity,
    taxRateBasisPoints: item.product.taxRateBasisPoints ?? taxRateBps,
    discountEligible: isCouponLineEligible(item.product, couponSnapshot),
  })), discountCents, Math.round(deliveryFeeDollars * 100), service.feeTaxRateBasisPoints);
  const taxCents = commercial.taxCents;
  const taxDollars = taxCents / 100;
  const amountInCents = Math.max(0, subtotalCents + taxCents + Math.round(deliveryFeeDollars * 100) - discountCents);
  const totalDollars = amountInCents / 100;
  const slotKey = pickupSlotId ? `pickup:${pickupSlotId}` : `delivery:${deliverySlotId || 'no-slot'}`;
  const couponIdentity = couponSnapshot ? `${couponSnapshot.id}:${couponSnapshot.code}` : 'none';
  let idempotencyKey = `${cart.id}:${provider.code}:${slotKey}:coupon:${couponIdentity}:amount:${amountInCents}`;

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
    commercial,
    deliveryPolicySnapshot: service.policy,
    captureMethod: "manual",
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
    ...(restartSource ? {
      checkoutRestartOfPaymentSessionId: restartSource.paymentSessionId,
      checkoutRestartTermsFingerprint: restartSource.termsFingerprint,
    } : {}),
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

  const checkoutFingerprint = checkoutRequestFingerprint(checkoutRequest('', ''));
  const cartFingerprint = checkoutCartFingerprint(cart);
  const termsFingerprint = checkoutTermsFingerprint(claimData);
  if (restartSource && (checkoutFingerprint !== restartSource.checkoutFingerprint
    || cartFingerprint !== restartSource.cartFingerprint
    || amountInCents !== restartSource.amountCents
    || termsFingerprint !== restartSource.termsFingerprint)) {
    throw new Error('Checkout details or terms changed after compensation; review checkout before restarting');
  }
  const identityPayload = {
    commercialKey: idempotencyKey,
    checkoutFingerprint,
    cartFingerprint,
    ...(restartSource ? { checkoutRestartOfPaymentSessionId: restartSource.paymentSessionId } : {}),
  };
  idempotencyKey = `grocery-checkout:${groceryOutboxPayloadHash(identityPayload)}`;

  // Claim the durable checkout key before calling Stripe. The row lock and
  // unique idempotency key ensure concurrent browser submits share one
  // provider request instead of creating duplicate PaymentIntents.
  let claim: { session: any; shouldCreate: boolean; terminalReplay?: boolean };
  try {
    claim = await context.transaction(async (transactionContext) => {
    if (context.session?.itemId) {
      await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', context.session.itemId);
      const owner = await (transactionContext.prisma as any).user.findUnique({where:{id:context.session.itemId},select:{id:true,storeId:true,privacyErasedAt:true}});
      if (!owner || owner.privacyErasedAt || owner.storeId !== cart.store.id) throw new Error('Checkout customer is no longer active');
    }
    await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id"=$1 FOR UPDATE', cart.id);
    const freshCart = await transactionContext.sudo().query.Cart.findOne({where:{id:cart.id},query:'id customer { id } sessionId items { id quantity substitutionPreference product { id priceCents taxRateBasisPoints pricingMethod unitOfMeasure } }'});
    if (!freshCart || checkoutCartFingerprint(freshCart) !== cartFingerprint || (context.session?.itemId ? freshCart.customer?.id !== context.session.itemId : freshCart.customer?.id || freshCart.sessionId !== sessionId?.trim())) throw new Error('Cart changed while payment was being prepared; review checkout');
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
    if (isTerminalRestartReplay(existing, restartSource, amountInCents, checkoutFingerprint, cartFingerprint, termsFingerprint)) {
      await bindRestartChild(transactionContext.prisma, restartSource, existing.id);
      return { session: existing, shouldCreate: false, terminalReplay: true };
    }
    const now = Date.now();
    const creation = claimPaymentCreationData(existing?.data, { ...claimData, checkoutFingerprint, cartFingerprint }, randomUUID(), now);
    if (creation.action !== 'create') {
      await bindRestartChild(transactionContext.prisma, restartSource, existing.id);
      return { session: existing, shouldCreate: false };
    }
    // Persist the original instructions before the provider can accept a request
    // whose response might be lost. Recovery never reconstructs them from a cart.
    const baseData: any = { ...creation.data, ...(!existing ? { creationBindingVersion: 1, recoveryRequest: checkoutRequest('', '') } : {}) };
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
      await bindRestartChild(transactionContext.prisma, restartSource, updated.id);
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
    const bound = await transactionContext.sudo().query.PaymentSession.updateOne({
      where: { id: created.id },
      data: { data: { ...baseData, recoveryRequest: { ...baseData.recoveryRequest, paymentSessionId: created.id } } },
      query: sessionSelection,
    });
    await bindRestartChild(transactionContext.prisma, restartSource, bound.id);
    return { session: bound, shouldCreate: true };
    });
  } catch (error) {
    const candidate = error as { code?: string; extensions?: { prisma?: { code?: string } } };
    const errorCode = candidate.code || candidate.extensions?.prisma?.code;
    if (errorCode !== 'P2002') throw error;
    const winner = await sudoContext.query.PaymentSession.findMany({ where: { idempotencyKey: { equals: idempotencyKey } }, take: 1, query: sessionSelection });
    if (!winner[0]) throw error;
    claim = {
      session: winner[0],
      shouldCreate: false,
      terminalReplay: isTerminalRestartReplay(winner[0], restartSource, amountInCents, checkoutFingerprint, cartFingerprint, termsFingerprint),
    };
  }

  if (claim.terminalReplay) return claim.session;
  if (!claim.shouldCreate) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const ready = await sudoContext.query.PaymentSession.findOne({ where: { id: claim.session.id }, query: sessionSelection });
      if (ready?.data?.paymentIntentId && ['ready','attempt_pending','unknown'].includes(ready.data?.status)) {
        const providerPaymentId = ready.data?.paymentIntentId;
        if (!providerPaymentId) throw new Error('Payment session is missing a durable payment identity');
        await dependencies.ensureCheckoutAttempt(context, checkoutRequest(ready.id, providerPaymentId), cart, ready, providerPaymentId);
        if (ready.data.status !== 'ready') return writePaymentCreationResult(context, {sessionId: ready.id, phase:'ready', paymentIntentId:providerPaymentId});
        return ready;
      }
      if (ready?.data?.status === 'failed') throw new Error(ready.data.error || 'Payment session initiation failed');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Payment session is still being initialized; please retry without changing the cart or slot');
  }

  try {
    const sessionData: any = amountInCents === 0 ? {
      paymentIntentId: `grocery_no_charge:${claim.session.id}`,
      clientSecret: undefined,
      noCharge: { version: 1, amountCents: 0, paymentSessionId: claim.session.id,
        reason: couponSnapshot && subtotalCents > 0 ? 'coupon_covers_total' : 'zero_priced_goods',
        couponId: couponSnapshot?.id || null, authorizedAt: new Date().toISOString() },
    } : await dependencies.createPayment({
      provider: provider as PaymentProviderRecord,
      cart: claim.session.data.creationBindingVersion === 1
        ? { ...cart, checkoutPaymentSessionId: claim.session.id, checkoutFingerprint, cartFingerprint } : cart,
      amount: amountInCents,
      currency: 'usd',
      captureMethod: 'manual',
      idempotencyKey,
    });
    const providerPaymentId = sessionData?.paymentIntentId;
    const ready = await writePaymentCreationResult(context, { sessionId: claim.session.id, claimToken: claim.session.data.creationClaimToken,
      phase: 'provider_ready', paymentIntentId: providerPaymentId, clientSecret: sessionData?.clientSecret, noCharge: sessionData?.noCharge });
    if (!providerPaymentId) throw new Error('Payment provider did not return a durable payment identity');
    await dependencies.ensureCheckoutAttempt(context, checkoutRequest(ready.id, providerPaymentId), cart, ready, providerPaymentId);
    return writePaymentCreationResult(context, { sessionId: ready.id, phase: 'ready', paymentIntentId: providerPaymentId });
  } catch (error) {
    await writePaymentCreationResult(context, { sessionId: claim.session.id, claimToken: claim.session.data.creationClaimToken, phase: 'unknown' });
    throw error;
  }
}

export default function initiatePaymentSession(root: unknown, args: InitiatePaymentSessionArgs, context: Context) {
  return initiatePaymentSessionWithDependencies(root, args, context);
}
