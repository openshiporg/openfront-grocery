import { randomUUID } from 'node:crypto';
import type { Context } from '.keystone/types';
import { createGuestOrderToken } from '../utils/guestOrderToken';
import { getPaymentStatus, refundPayment } from '../utils/paymentProviderAdapter';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { withSerializableRetry } from '../utils/serializableTransaction';
import { calculateCouponDiscount } from '../lib/couponPricing';
import { evaluateFulfillmentWindow } from '../lib/rollingFulfillment';
import { assertSellableQuantity, deriveSellableQuantity, planSellableLotAllocation } from '../lib/sellableInventory';
import { calculateTaxCents, getStoreTaxRateBps } from '../lib/storeMoney';
import { isLiveFulfillmentSlot } from '../lib/storeTime';
import {
  assertFinalizationLease,
  claimCheckoutAttempt,
  completeCompensation,
  finalizeCheckoutAttempt,
  refreshFinalizationSettlement,
  type CheckoutLease,
} from '../utils/checkoutAttemptLease';

export type SubmitOrderData = {
  cartId: string;
  paymentSessionId: string;
  paymentIntentId: string;
  sessionId?: string | null;
  couponCode?: string | null;
  email: string;
  deliveryAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    city: string;
    province: string;
    postalCode: string;
    phone: string;
  };
  deliveryDate: string;
  deliveryTimeWindow: string;
  fulfillmentMethod: 'delivery' | 'pickup';
  deliverySlotId?: string | null;
  pickupSlotId?: string | null;
  deliveryFee: number;
  expectedTotal: number;
  substitutionPreference: string;
  deliveryInstructions?: string | null;
  /** Internal recovery ownership; never accepted in the public GraphQL input. */
  checkoutOwnerId?: string | null;
};

type SubmitOrderArgs = { data: SubmitOrderData };

type SettledPayment = {
  providerCode: string;
  providerPaymentId: string;
  status: string;
  amountCents: number;
  currency: string;
};

type CheckoutAttemptRecord = { id: string; status: string; orderId?: string | null };

export async function ensureCheckoutAttempt(context: Context, data: SubmitOrderData, cart: any, session: any, providerPaymentId: string) {
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const idempotencyKey = `checkout:${data.paymentSessionId}`;
    // One atomic insert-or-return avoids Prisma's emulated find/create upsert
    // race. Parallel finalization requests converge before either marks
    // settlement or claims the fencing lease.
    const attempts = await tx.$queryRawUnsafe<Array<{ id: string; status: string; orderId: string | null }>>(
      `INSERT INTO "CheckoutAttempt" (
         "id", "idempotencyKey", "providerCode", "providerPaymentId",
         "amountCents", "currencyCode", "status", "attempts", "requestData",
         "store", "cart", "paymentSession", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, 'usd', 'pending', 0, $6::jsonb, $7, $8, $9, NOW(), NOW())
       ON CONFLICT ("idempotencyKey") DO UPDATE
         SET "requestData" = CASE
           WHEN "CheckoutAttempt"."status" IN ('pending', 'settled_pending_finalize') AND "CheckoutAttempt"."order" IS NULL
             THEN EXCLUDED."requestData"
           ELSE "CheckoutAttempt"."requestData"
         END
       RETURNING "id", "status"::text AS "status", "order" AS "orderId"`,
      randomUUID(),
      idempotencyKey,
      session.paymentProvider.code,
      providerPaymentId,
      Number(session.amountCents || Math.round(Number(session.amount || 0) * 100)),
      JSON.stringify(data),
      cart.store.id,
      cart.id,
      session.id,
    );
    if (!attempts[0]) throw new Error('Unable to establish checkout attempt');
    return attempts[0];
  });
}

async function markCheckoutAttemptSettled(context: Context, attemptId: string, settled: SettledPayment) {
  return context.transaction(async (transactionContext) => {
    const rows = await transactionContext.prisma.$queryRawUnsafe<Array<{ id: string; status: string; orderId: string | null }>>(
      `UPDATE "CheckoutAttempt"
       SET "status" = 'settled_pending_finalize', "amountCents" = $2, "currencyCode" = $3,
           "settledAt" = COALESCE("settledAt", NOW())
       WHERE "id" = $1 AND "order" IS NULL
         AND "status" IN ('pending', 'settled_pending_finalize')
       RETURNING "id", "status", "order" AS "orderId"`,
      attemptId, settled.amountCents, settled.currency,
    );
    if (rows[0]) return rows[0];
    const existing = await transactionContext.prisma.checkoutAttempt.findUnique({ where: { id: attemptId }, select: { id: true, status: true, orderId: true } });
    if (existing?.status === 'finalized' && existing.orderId) return existing;
    throw new Error(`Checkout attempt is already owned by another reconciliation path: ${existing?.status || 'missing'}`);
  });
}

async function reserveOrderDisplayId(transactionContext: Context) {
  await transactionContext.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-order-display-id'), hashtext('allocation'))");
  const [orderMax, sessionMax] = await Promise.all([
    transactionContext.prisma.order.aggregate({ _max: { displayId: true } }),
    transactionContext.prisma.paymentSession.aggregate({ _max: { reservedOrderDisplayId: true } }),
  ]);
  return Math.max(orderMax._max.displayId || 0, sessionMax._max.reservedOrderDisplayId || 0) + 1;
}

function assertCartOwnership(cart: any, data: SubmitOrderData, sessionUserId: string | null) {
  const cartOwnerId = cart.customer?.id || null;
  if (sessionUserId) {
    if (cartOwnerId !== sessionUserId) throw new Error('You do not have access to this cart');
    return;
  }
  if (!data.sessionId?.trim() || cartOwnerId || cart.sessionId !== data.sessionId.trim()) {
    throw new Error('You do not have access to this cart');
  }
}

function assertFulfillmentInput(data: SubmitOrderData) {
  if (!/^\S+@\S+\.\S+$/.test(data.email.trim()) || data.email.length > 320) throw new Error('A valid checkout email is required');
  for (const [label, value] of [['first name', data.deliveryAddress.firstName], ['last name', data.deliveryAddress.lastName], ['phone', data.deliveryAddress.phone]] as const) {
    if (value.trim().length < 2 || value.length > 200) throw new Error(`A valid delivery ${label} is required`);
  }
  if (data.fulfillmentMethod === 'delivery') {
    for (const [label, value] of [['address', data.deliveryAddress.address1], ['city', data.deliveryAddress.city], ['province', data.deliveryAddress.province], ['postal code', data.deliveryAddress.postalCode]] as const) {
      if (value.trim().length < 2 || value.length > 200) throw new Error(`A valid delivery ${label} is required`);
    }
  }
  if (data.fulfillmentMethod === 'delivery' && !data.deliverySlotId) {
    throw new Error('Delivery orders require a delivery slot');
  }
  if (data.fulfillmentMethod === 'pickup' && !data.pickupSlotId) {
    throw new Error('Pickup orders require a pickup slot');
  }
}

async function loadCart(sudoContext: Context, cartId: string) {
  return sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      store { id }
      sessionId
      customer { id }
      items {
        id
        quantity
        subtotal
        substitutionPreference
        product {
          id
          title
          handle
          sku
          price
          priceCents
          department
          imageUrl
          status
          store { id }
          inventoryLots {
            id
            expirationDate
            quantityRemaining
            store { id }
          }
        }
      }
    `,
  });
}

export async function compensateFailedCheckout({
  context,
  provider,
  cause,
  attemptId,
  finalizationLease,
  compensationLease,
  forceFullRefund,
}: {
  context: Context;
  provider: any;
  cause: unknown;
  attemptId: string;
  finalizationLease?: CheckoutLease;
  compensationLease?: CheckoutLease;
  forceFullRefund?: boolean;
}) {
  const causeMessage = cause instanceof Error ? cause.message : 'Checkout finalization failed';
  const claim = compensationLease || await context.transaction(async (transactionContext) => {
    const claimed = await claimCheckoutAttempt(transactionContext.prisma, attemptId, 'compensate', {
      expected: finalizationLease,
    });
    if (!claimed) return null;
    await enqueueGroceryOutboxEvent(transactionContext.prisma, {
      storeId: claimed.storeId,
      eventKey: `checkout.compensation:${claimed.paymentSessionId}:requested`,
      eventType: 'checkout.compensation.requested',
      aggregateType: 'CheckoutAttempt',
      aggregateId: claimed.id,
      occurredAt: new Date().toISOString(),
      payload: { paymentSessionId: claimed.paymentSessionId, cartId: claimed.cartId, providerPaymentId: claimed.providerPaymentId, amountCents: claimed.amountCents },
    });
    return claimed;
  });
  if (!claim) return { claimed: false, status: 'not_claimed' };

  const eventKey = `checkout.compensation:${claim.paymentSessionId}`;
  const paymentSessionBeforeRefund = await context.prisma.paymentSession.findUnique({
    where: { id: claim.paymentSessionId },
    select: { data: true },
  });
  const fullRefund = forceFullRefund === true || (paymentSessionBeforeRefund?.data as Record<string, unknown> | null)?.compensationFullRefund === true;
  let compensation: { status: string; providerRefundId?: string; refundedAmountCents?: number; error?: string };
  try {
    const result = await refundPayment({
      provider,
      paymentId: claim.providerPaymentId,
      amount: fullRefund ? undefined : claim.amountCents,
      idempotencyKey: eventKey,
    });
    compensation = {
      status: result.status === 'succeeded' ? 'refunded' : 'refund_required',
      providerRefundId: result.data?.id,
      refundedAmountCents: Number.isInteger(Number(result.amount)) ? Number(result.amount) : undefined,
    };
  } catch (refundError) {
    compensation = { status: 'refund_required', error: refundError instanceof Error ? refundError.message : 'Compensation refund failed' };
  }

  const recorded = await context.transaction(async (transactionContext) => {
    const terminalStatus = compensation.status === 'refunded' ? 'compensated' : 'compensation_required';
    const applied = await completeCompensation(transactionContext.prisma, claim, terminalStatus, compensation.error || causeMessage);
    if (!applied) return false;
    const session = await transactionContext.prisma.paymentSession.findUnique({ where: { id: claim.paymentSessionId }, select: { data: true } });
    const { clientSecret: _discardedClientSecret, ...sessionEvidence } = (session?.data as Record<string, unknown> | null) || {};
    const data = {
      ...sessionEvidence,
      compensationStatus: compensation.status,
      compensationProviderRefundId: compensation.providerRefundId || null,
      compensationError: compensation.error || causeMessage,
      compensationAt: new Date().toISOString(),
    };
    await transactionContext.prisma.paymentSession.update({ where: { id: claim.paymentSessionId }, data: { data } });
    await enqueueGroceryOutboxEvent(transactionContext.prisma, {
      storeId: claim.storeId,
      eventKey: `${eventKey}:recorded:${compensation.status}:${compensation.providerRefundId || 'none'}:${claim.fencingToken}`,
      eventType: 'checkout.compensation.recorded',
      aggregateType: 'PaymentSession',
      aggregateId: claim.paymentSessionId,
      occurredAt: new Date().toISOString(),
      payload: { cartId: claim.cartId, providerPaymentId: claim.providerPaymentId, amountCents: fullRefund ? null : claim.amountCents, fullRefund, compensation },
    });
    return true;
  });
  return { claimed: recorded, status: recorded ? (compensation.status === 'refunded' ? 'compensated' : 'compensation_required') : 'fenced' };
}

async function loadPaymentSession(sudoContext: Context, paymentSessionId: string) {
  return sudoContext.query.PaymentSession.findOne({
    where: { id: paymentSessionId },
    query: `
      id
      amount
      amountCents
      isSelected
      isInitiated
      reservedOrderDisplayId
      data
      paymentProvider { id code isInstalled }
      cart { id }
    `,
  });
}

async function lockCheckoutRows(transactionContext: Context, data: SubmitOrderData, finalizationLease?: CheckoutLease) {
  const tx = transactionContext.prisma;
  // The attempt row is the fencing boundary. It must be locked before any order-side writes.
  if (finalizationLease) await assertFinalizationLease(tx, finalizationLease);
  await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', data.cartId);
  await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentSession" WHERE "id" = $1 FOR UPDATE', data.paymentSessionId);
  await tx.$queryRawUnsafe('SELECT "id" FROM "CartItem" WHERE "cart" = $1 ORDER BY "id" FOR UPDATE', data.cartId);

  if (data.deliverySlotId) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id" = $1 FOR UPDATE', data.deliverySlotId);
  }
  if (data.pickupSlotId) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', data.pickupSlotId);
  }
  if (data.couponCode?.trim()) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Coupon" WHERE "code" = $1 FOR UPDATE', data.couponCode.trim().toUpperCase());
  }

  const productRows = await tx.cartItem.findMany({
    where: { cartId: data.cartId },
    select: { productId: true },
  });
  const productIds = Array.from(new Set(productRows.flatMap((row) => row.productId ? [row.productId] : []))).sort();
  for (const productId of productIds) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "InventoryLot" WHERE "product" = $1 ORDER BY "expirationDate", "id" FOR UPDATE',
      productId
    );
  }
}

function fulfillmentWindow(startTime: string) {
  const startHour = Number.parseInt(startTime.slice(0, 2), 10);
  if (!Number.isFinite(startHour)) throw new Error('Selected fulfillment slot has an invalid start time');
  if (startHour < 10) return 'time_8_10';
  if (startHour < 12) return 'time_10_12';
  if (startHour < 14) return 'time_12_14';
  if (startHour < 16) return 'time_14_16';
  if (startHour < 18) return 'time_16_18';
  return 'time_18_20';
}

function calculateTotals(cart: any, deliverySlot: any, fulfillmentMethod: 'delivery' | 'pickup', taxRateBps: number, discount = 0) {
  const subtotalCents = cart.items.reduce(
    (sum: number, item: any) => sum + Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity,
    0,
  );
  const discountCents = Math.round(discount * 100);
  // Launch coupons are retailer-funded, so tax is calculated on the
  // post-discount taxable selling price rather than the pre-coupon subtotal.
  const taxCents = calculateTaxCents(Math.max(0, subtotalCents - discountCents), taxRateBps);
  const deliveryFeeCents = fulfillmentMethod === 'delivery' ? Number(deliverySlot?.deliveryFee || 0) : 0;
  const totalCents = Math.max(0, subtotalCents + taxCents + deliveryFeeCents - discountCents);
  return {
    subtotal: subtotalCents / 100,
    subtotalCents,
    taxAmount: taxCents / 100,
    taxCents,
    deliveryFee: deliveryFeeCents / 100,
    deliveryFeeCents,
    discount,
    discountCents,
    orderTotal: totalCents / 100,
    totalCents,
  };
}

export async function commitGroceryOrder(
  data: SubmitOrderData,
  context: Context,
  settledPayment: SettledPayment,
  attemptId?: string,
  sessionUserIdOverride?: string | null,
  finalizationLease?: CheckoutLease,
) {
  const sessionUserId = sessionUserIdOverride === undefined ? context.session?.itemId || null : sessionUserIdOverride;
  const fulfillmentMethod = data.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await lockCheckoutRows(transactionContext, data, finalizationLease);
    if (finalizationLease) await refreshFinalizationSettlement(tx, finalizationLease, settledPayment.amountCents, settledPayment.currency);
    const sudoContext = transactionContext.sudo();
    const cart = await loadCart(sudoContext, data.cartId);
    if (!cart) throw new Error('Cart not found');
    const storeId = cart.store?.id;
    if (!storeId) throw new Error('Cart is missing an active store');
    assertCartOwnership(cart, data, sessionUserId);
    if (!cart.items?.length) throw new Error('Cart is empty or has already been submitted');

    const deliverySlot = fulfillmentMethod === 'delivery'
      ? await sudoContext.query.DeliverySlot.findOne({
          where: { id: data.deliverySlotId as string },
          query: 'id store { id } date startTime endTime capacity currentBookings isActive deliveryFee',
        })
      : null;
    const pickupSlot = fulfillmentMethod === 'pickup'
      ? await sudoContext.query.PickupSlot.findOne({
          where: { id: data.pickupSlotId as string },
          query: 'id store { id } date startTime endTime maxOrders currentOrders isActive isAvailable',
        })
      : null;

    if (fulfillmentMethod === 'delivery' && (!deliverySlot || deliverySlot.store?.id !== storeId)) throw new Error('Selected delivery slot was not found in active store');
    if (fulfillmentMethod === 'pickup' && (!pickupSlot || pickupSlot.store?.id !== storeId)) throw new Error('Selected pickup slot was not found in active store');
    const [store, storeSettings] = await Promise.all([
      tx.store.findUnique({ where: { id: storeId }, select: { timezone: true, isActive: true } }),
      tx.storeSettings.findFirst({ where: { storeId, isActive: true }, select: { hours: true } }),
    ]);
    const selectedLiveSlot = deliverySlot || pickupSlot;
    if (!store?.isActive || !storeSettings || !selectedLiveSlot || !isLiveFulfillmentSlot(selectedLiveSlot as { date: string; endTime: string }, store.timezone)) {
      throw new Error('Selected fulfillment slot is no longer a live Store-local window');
    }
    const windowDecision = evaluateFulfillmentWindow({
      hours: storeSettings.hours,
      timeZone: store.timezone,
      date: selectedLiveSlot.date,
      startTime: selectedLiveSlot.startTime,
      endTime: selectedLiveSlot.endTime,
      applyCutoff: false,
    });
    if (!windowDecision.allowed) {
      throw new Error('Selected fulfillment slot is outside current Store hours, blackout, or rolling horizon policy');
    }
    if (deliverySlot && (!deliverySlot.isActive || deliverySlot.currentBookings >= deliverySlot.capacity)) {
      throw new Error('Selected delivery slot is fully booked');
    }
    if (pickupSlot && (!pickupSlot.isActive || !pickupSlot.isAvailable || pickupSlot.currentOrders >= pickupSlot.maxOrders)) {
      throw new Error('Selected pickup slot is fully booked');
    }

    const inventoryCutoff = new Date();
    for (const item of cart.items) {
      const product = item.product;
      if (!product || product.store?.id !== storeId || product.status !== 'published') throw new Error('Cart contains an unavailable product');
      assertSellableQuantity(product, storeId, item.quantity, inventoryCutoff);
    }

    let coupon: any = null;
    let discount = 0;
    if (data.couponCode?.trim()) {
      coupon = await sudoContext.query.Coupon.findOne({
        where: { code: data.couponCode.trim().toUpperCase() },
        query: 'id code discountType discountValue discountValueCents minPurchase minPurchaseCents validFrom validTo isActive maxUses currentUses productCategories excludedProducts store { id }',
      });
      if (!coupon || coupon.store?.id !== storeId) throw new Error('Coupon is not available for this store');
      discount = calculateCouponDiscount(coupon, cart.items);
    }
    const taxRateBps = await getStoreTaxRateBps(transactionContext, storeId);
    const totals = calculateTotals(cart, deliverySlot, fulfillmentMethod, taxRateBps, discount);
    if (Math.round(Number(data.expectedTotal) * 100) !== totals.totalCents) {
      throw new Error('Order total changed before checkout. Please review your cart and fulfillment slot.');
    }
    if (Math.round(Number(data.deliveryFee) * 100) !== totals.deliveryFeeCents) {
      throw new Error('Delivery fee changed before checkout. Please review your fulfillment slot.');
    }

    const selectedSession = await loadPaymentSession(sudoContext, data.paymentSessionId);
    if (!selectedSession || selectedSession.cart?.id !== cart.id || !selectedSession.isInitiated) {
      throw new Error('Selected payment session not found for this cart');
    }
    if ((selectedSession.data?.fulfillmentMethod || fulfillmentMethod) !== fulfillmentMethod) {
      throw new Error('Payment session fulfillment method does not match checkout');
    }
    if (fulfillmentMethod === 'delivery' && selectedSession.data?.deliverySlotId !== data.deliverySlotId) {
      throw new Error('Payment session delivery slot does not match checkout delivery slot');
    }
    if (fulfillmentMethod === 'pickup' && selectedSession.data?.pickupSlotId !== data.pickupSlotId) {
      throw new Error('Payment session pickup slot does not match checkout pickup slot');
    }
    if ((selectedSession.data?.couponCode || null) !== (data.couponCode?.trim().toUpperCase() || null)) {
      throw new Error('Payment session coupon does not match checkout');
    }
    if (Number(selectedSession.amountCents) !== totals.totalCents) {
      throw new Error('Payment session amount does not match order total');
    }

    const paymentProvider = selectedSession.paymentProvider;
    const providerPaymentId = selectedSession.data?.paymentIntentId || data.paymentIntentId;
    if (!paymentProvider?.isInstalled || paymentProvider.code !== settledPayment.providerCode) {
      throw new Error('Payment provider does not match the settled payment');
    }
    if (!providerPaymentId || providerPaymentId !== settledPayment.providerPaymentId) {
      throw new Error('Payment session provider id does not match the settled payment');
    }
    if (!['succeeded', 'captured'].includes(settledPayment.status)) {
      throw new Error(`Payment is not settled: ${settledPayment.status}`);
    }

    const address = await sudoContext.db.Address.createOne({
      data: {
        firstName: data.deliveryAddress.firstName,
        lastName: data.deliveryAddress.lastName,
        address1: fulfillmentMethod === 'pickup' ? 'Curbside pickup' : data.deliveryAddress.address1,
        city: fulfillmentMethod === 'pickup' ? 'Store pickup' : data.deliveryAddress.city,
        province: fulfillmentMethod === 'pickup' ? 'N/A' : data.deliveryAddress.province,
        postalCode: fulfillmentMethod === 'pickup' ? 'N/A' : data.deliveryAddress.postalCode,
        phone: data.deliveryAddress.phone,
        user: sessionUserId ? { connect: { id: sessionUserId } } : undefined,
      },
    });

    const selectedSlot = deliverySlot || pickupSlot;
    if (!selectedSlot) throw new Error('Selected fulfillment slot was not found in active store');
    const lineItemsSnapshot = cart.items.map((item: any) => ({
      id: item.id,
      title: item.product?.title || 'Product',
      quantity: item.quantity,
      unitPrice: Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) / 100,
      unitPriceCents: Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)),
      thumbnail: item.product?.imageUrl || null,
      metadata: { substitutionPreference: item.substitutionPreference || null },
      product: item.product?.id
        ? { id: item.product.id, handle: item.product.handle || null }
        : null,
    }));
    const displayId = selectedSession.reservedOrderDisplayId || await reserveOrderDisplayId(transactionContext);
    const order = await sudoContext.db.Order.createOne({
      data: {
        store: { connect: { id: storeId } },
        displayId,
        email: data.email,
        status: 'pending',
        currencyCode: 'USD',
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        deliveryFeeCents: totals.deliveryFeeCents,
        discountCents: totals.discountCents,
        totalCents: totals.totalCents,
        taxRate: taxRateBps / 10_000,
        deliveryDate: new Date(selectedSlot.date).toISOString(),
        deliveryTimeWindow: fulfillmentWindow(selectedSlot.startTime) as any,
        substitutionPreference: data.substitutionPreference as any,
        deliveryInstructions: data.deliveryInstructions || undefined,
        metadata: {
          fulfillmentMethod,
          guestSessionId: sessionUserId ? null : data.sessionId?.trim() || null,
          deliverySlotId: data.deliverySlotId || null,
          pickupSlotId: data.pickupSlotId || null,
          ...totals,
          coupon: coupon ? { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount: discount } : null,
          lineItemsSnapshot,
          selectedFulfillmentSlot: selectedSlot
            ? { date: selectedSlot.date, startTime: selectedSlot.startTime, endTime: selectedSlot.endTime }
            : null,
        },
        user: sessionUserId ? { connect: { id: sessionUserId } } : undefined,
        deliverySlot: data.deliverySlotId ? { connect: { id: data.deliverySlotId } } : undefined,
        pickupSlot: data.pickupSlotId ? { connect: { id: data.pickupSlotId } } : undefined,
        shippingAddress: { connect: { id: address.id } },
      },
    });

    for (const item of cart.items) {
      const product = item.product;
      const plannedAllocations = planSellableLotAllocation(
        product.inventoryLots || [],
        storeId,
        item.quantity,
        product.title || 'Product',
        inventoryCutoff,
      );
      const inventoryAllocations: Array<{ lotId: string; quantity: number }> = [];
      for (const { lot, quantity } of plannedAllocations) {
        await sudoContext.db.InventoryLot.updateOne({
          where: { id: lot.id },
          data: { quantityRemaining: Number(lot.quantityRemaining || 0) - quantity },
        });
        inventoryAllocations.push({ lotId: lot.id as string, quantity });
      }

      const createdLineItem = await sudoContext.db.OrderLineItem.createOne({
        data: {
          title: product.title || 'Product',
          sku: product.sku || undefined,
          quantity: item.quantity,
          unitPrice: Number(product.priceCents || Math.round(Number(product.price || 0) * 100)) / 100,
          unitPriceCents: Number(product.priceCents || Math.round(Number(product.price || 0) * 100)),
          thumbnail: product.imageUrl || undefined,
          order: { connect: { id: order.id } },
          product: { connect: { id: product.id } },
          inventoryLot: inventoryAllocations[0]
            ? { connect: { id: inventoryAllocations[0].lotId } }
            : undefined,
          metadata: {
            cartItemId: item.id,
            substitutionPreference: item.substitutionPreference || null,
            inventoryAllocations,
          },
        },
      });
      for (const allocation of inventoryAllocations) {
        await sudoContext.db.OrderLineInventoryAllocation.createOne({
          data: {
            lineItem: { connect: { id: createdLineItem.id } },
            inventoryLot: { connect: { id: allocation.lotId } },
            store: { connect: { id: storeId } },
            quantity: allocation.quantity,
            provenance: { source: 'checkout-fefo', cartItemId: item.id },
          },
        });
      }

      const nextSellableQuantity = Math.max(0, deriveSellableQuantity(product, storeId) - item.quantity);
      await sudoContext.db.Product.updateOne({
        where: { id: product.id },
        // Product stock fields remain an operator/reporting cache only. Heal
        // them from the lot authority after each FEFO allocation.
        data: { stockQuantity: nextSellableQuantity, inStock: nextSellableQuantity > 0 },
      });
    }

    if (deliverySlot && data.deliverySlotId) {
      const nextBookings = deliverySlot.currentBookings + 1;
      await sudoContext.db.DeliverySlot.updateOne({
        where: { id: data.deliverySlotId },
        data: { currentBookings: nextBookings },
      });
    }
    if (pickupSlot && data.pickupSlotId) {
      const nextOrders = pickupSlot.currentOrders + 1;
      await sudoContext.db.PickupSlot.updateOne({
        where: { id: data.pickupSlotId },
        data: { currentOrders: nextOrders, isAvailable: pickupSlot.isActive && nextOrders < pickupSlot.maxOrders },
      });
    }

    if (coupon) {
      // Guest checkout has no session-backed Store for generic Coupon hooks.
      // The coupon row is already Store-validated and locked above, so update
      // the authoritative redemption counter directly inside this transaction.
      await tx.coupon.update({ where: { id: coupon.id }, data: { currentUses: { increment: 1 } } });
      if (sessionUserId) {
        const clippedRows = await sudoContext.query.UserCoupon.findMany({ where: { user: { id: { equals: sessionUserId } }, coupon: { id: { equals: coupon.id } }, used: { equals: false } }, take: 1, query: 'id' });
        const clipped = clippedRows[0];
        if (clipped) await sudoContext.db.UserCoupon.updateOne({ where: { id: clipped.id }, data: { used: true, usedAt: new Date().toISOString() } });
      }
    }

    const { clientSecret: _discardedClientSecret, ...paymentSessionEvidence } = (selectedSession.data as Record<string, unknown> | null) || {};
    await sudoContext.db.Payment.createOne({
      data: {
        store: { connect: { id: storeId } },
        amount: totals.orderTotal.toFixed(2),
        amountCents: totals.totalCents,
        deliveryTipCents: 0,
        status: 'succeeded',
        paymentMethod: 'credit_card',
        providerPaymentId,
        providerData: {
          ...paymentSessionEvidence,
          status: settledPayment.status,
          providerCode: paymentProvider.code,
        },
        processedAt: new Date().toISOString(),
        order: { connect: { id: order.id } },
        paymentProvider: { connect: { id: paymentProvider.id } },
        processedBy: sessionUserId ? { connect: { id: sessionUserId } } : undefined,
      },
    });

    await sudoContext.db.PaymentSession.updateOne({
      where: { id: selectedSession.id },
      data: { data: { ...paymentSessionEvidence, status: 'completed' } },
    });
    for (const item of cart.items) {
      await sudoContext.db.CartItem.deleteOne({ where: { id: item.id } });
    }
    await transactionContext.prisma.cart.update({
      where: { id: cart.id },
      data: {
        customerId: null,
        sessionId: `checked-out:${cart.id}:${order.id}`,
        itemCount: 0,
        subtotal: 0,
        subtotalCents: 0,
      },
    });
    if (finalizationLease) {
      await finalizeCheckoutAttempt(transactionContext.prisma, finalizationLease, order.id);
    } else if (attemptId) {
      throw new Error('Checkout attempt finalization requires an exclusive reconciliation lease');
    }

    return {
      orderId: order.id,
      displayId: order.displayId,
      guestOrderToken: !sessionUserId && data.sessionId?.trim()
        ? createGuestOrderToken(order.id, data.sessionId.trim())
        : null,
    };
  }, {
    isolationLevel: 'ReadCommitted' as any,
  }));
}

export default async function submitGroceryOrder(
  _root: unknown,
  { data }: SubmitOrderArgs,
  context: Context
) {
  assertFulfillmentInput(data);
  const sessionUserId = context.session?.itemId || null;
  data.checkoutOwnerId = sessionUserId;
  const sudoContext = context.sudo();
  const [cart, selectedSession] = await Promise.all([
    loadCart(sudoContext, data.cartId),
    loadPaymentSession(sudoContext, data.paymentSessionId),
  ]);
  if (!cart) throw new Error('Cart not found');
  if (!selectedSession || selectedSession.cart?.id !== cart.id) {
    throw new Error('Selected payment session not found for this cart');
  }
  const existingAttempt = await context.prisma.checkoutAttempt.findUnique({
    where: { idempotencyKey: `checkout:${selectedSession.id}` },
    select: { status: true, orderId: true, requestData: true },
  });
  if (existingAttempt?.status === 'finalized' && existingAttempt.orderId) {
    const originalRequest = (existingAttempt.requestData as Record<string, any> | null) || {};
    const ownsReplay = sessionUserId
      ? originalRequest.checkoutOwnerId === sessionUserId
      : Boolean(data.sessionId?.trim() && originalRequest.sessionId === data.sessionId.trim());
    if (!ownsReplay) throw new Error('You do not have access to this checkout attempt');
    return {
      success: true,
      orderId: existingAttempt.orderId,
      guestOrderToken: !sessionUserId && data.sessionId?.trim()
        ? createGuestOrderToken(existingAttempt.orderId, data.sessionId.trim())
        : null,
    };
  }
  assertCartOwnership(cart, data, sessionUserId);
  const paymentProvider = selectedSession.paymentProvider;
  if (!paymentProvider?.isInstalled) throw new Error('Payment provider missing from payment session');
  const providerPaymentId = selectedSession.data?.paymentIntentId || data.paymentIntentId;
  if (!providerPaymentId) throw new Error('Payment session is missing provider payment id');
  const attempt = await ensureCheckoutAttempt(context, data, cart, selectedSession, providerPaymentId) as CheckoutAttemptRecord;
  if (attempt.status === 'finalized' && attempt.orderId) return { success: true, orderId: attempt.orderId, guestOrderToken: !sessionUserId && data.sessionId?.trim() ? createGuestOrderToken(attempt.orderId, data.sessionId.trim()) : null };
  if (['compensation_required', 'compensation_processing', 'compensated', 'failed'].includes(attempt.status)) {
    throw new Error(`Checkout attempt cannot be finalized from ${attempt.status}`);
  }

  const paymentStatus = await getPaymentStatus({
    provider: paymentProvider as any,
    paymentId: providerPaymentId,
  });
  const normalizedStatus = paymentStatus?.status || 'unknown';
  if (!['succeeded', 'captured'].includes(normalizedStatus)) {
    throw new Error(`Payment is not settled: ${normalizedStatus}`);
  }
  const expectedAmountCents = Number(selectedSession.amountCents || Math.round(Number(selectedSession.amount || 0) * 100));
  const settledAmountCents = Number(paymentStatus?.amount ?? 0);
  const settledCurrency = String(paymentStatus?.currency || selectedSession.data?.currency || 'usd').toLowerCase();
  if (!Number.isInteger(settledAmountCents) || settledAmountCents !== expectedAmountCents || settledCurrency !== 'usd') {
    throw new Error('Settled payment amount or currency does not match the checkout session');
  }

  const settledPayment = { providerCode: paymentProvider.code, providerPaymentId, status: normalizedStatus, amountCents: settledAmountCents, currency: settledCurrency };
  if (process.env.GROCERY_TEST_CRASH_AFTER_SETTLEMENT === 'true' && process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL?.includes('_ephemeral_')) process.exitCode = 137, process.exit();
  await markCheckoutAttemptSettled(context, attempt.id, settledPayment);
  const finalizationLease = await context.transaction(async (transactionContext) => claimCheckoutAttempt(transactionContext.prisma, attempt.id, 'finalize'));
  if (!finalizationLease) throw new Error('Checkout attempt is already being finalized by another worker');
  let committed;
  try {
    committed = await commitGroceryOrder(data, context, settledPayment, attempt.id, sessionUserId, finalizationLease);
  } catch (error) {
    await compensateFailedCheckout({ context, attemptId: attempt.id, provider: paymentProvider as any, cause: error, finalizationLease });
    throw new Error('Checkout could not be finalized; payment compensation was recorded');
  }
  return {
    success: true,
    ...committed,
    message: 'Order submitted successfully',
  };
}
