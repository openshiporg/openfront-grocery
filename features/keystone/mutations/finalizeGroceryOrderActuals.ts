import { randomUUID } from 'node:crypto';
import { assertIdempotentCaptureProvider } from '../../integrations/payment';
import { finalSaleSnapshotHash } from '../lib/finalSaleIdentity';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { getFulfillmentActualLines } from '../lib/fulfillmentActuals';
import { priceCommercialLines, isCouponLineEligible } from '../lib/commercialPricing';
import { capturePayment, cancelPayment, getPaymentStatus } from '../utils/paymentProviderAdapter';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { reconcileOrderLoyalty } from '../lib/loyaltyAccounting';
import { withSerializableRetry } from '../utils/serializableTransaction';
import { refundPaymentForOrder } from './managePaymentRefund';
import { adjustmentFingerprint } from './authorizeOrderAdjustment';
import { noChargeOrderPaymentState } from '../lib/checkoutIdentity';

function cents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Settlement requires nonnegative integer minor units');
  return value;
}
function decimalHundredths(value: unknown) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Invalid coupon decimal amount');
  return cents(Number(BigInt(match[1]) * BigInt(100) + BigInt((match[2] || '').padEnd(2, '0'))));
}
export function priceActualSale(order: any, actuals: any[]) {
  const coupon = order.metadata?.coupon;
  const subtotal = actuals.reduce((sum, line) => cents(sum + cents(line.subtotalCents)), 0);
  for (const line of actuals) { cents(line.quantityMilli); cents(line.unitPriceCents); }
  const eligible = actuals.filter(line => isCouponLineEligible({ id: line.productId, department: line.evidence?.department }, coupon));
  const eligibleCents = eligible.reduce((sum, line) => cents(sum + line.subtotalCents), 0);
  let discountCents = 0;
  if (coupon && subtotal >= cents(coupon.minPurchaseCents ?? decimalHundredths(coupon.minPurchase ?? 0))) {
    // Use already-rounded actual line cents; recomputing weight x price loses pennies.
    if (coupon.discountType === 'percentage') {
      const bps = decimalHundredths(coupon.discountValue);
      if (bps > 10000) throw new Error('Coupon percentage exceeds 100');
      discountCents = Number((BigInt(eligibleCents) * BigInt(bps) + BigInt(5000)) / BigInt(10000));
    } else if (coupon.discountType === 'fixed') discountCents = cents(coupon.discountValueCents ?? decimalHundredths(coupon.discountValue));
    else if (coupon.discountType === 'bogo') discountCents = eligible.reduce((sum, line) => cents(sum + Math.floor(line.quantityMilli / 2000) * line.unitPriceCents), 0);
    else throw new Error('Unsupported coupon type');
    discountCents = Math.min(eligibleCents, discountCents);
  }
  const feeCents = actuals.some(line => line.quantityMilli > 0) ? cents(order.deliveryFeeCents || 0) : 0;
  return priceCommercialLines(actuals.map(line => ({ id: line.lineItemId, subtotalCents: line.subtotalCents, taxRateBasisPoints: line.taxRateBasisPoints,
    discountEligible: isCouponLineEligible({ id: line.productId, department: line.evidence?.department }, coupon) })), discountCents, feeCents, Number(order.metadata?.deliveryPolicySnapshot?.feeTaxRateBasisPoints || 0));
}
function canonical(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
export function finalSaleSnapshot(order: any, actuals: any[]) {
  const stable = actuals.map(line => ({ ...line, allocations: [...(line.allocations || [])].sort((a, b) => `${a.productId}:${a.lotId}`.localeCompare(`${b.productId}:${b.lotId}`)) }))
    .sort((a, b) => a.lineItemId.localeCompare(b.lineItemId));
  return canonical({ ...priceActualSale(order, stable), actuals: stable, currency: String(order.currencyCode).toLowerCase(), originalTotalCents: cents(order.totalCents) });
}
/** Customer receipts carry commercial facts; private lot and staff consent evidence stays on the settlement. */
export function customerFinalSaleSnapshot(snapshot: any) {
  return { ...snapshot, actuals: (snapshot.actuals || []).map((line: any) => Object.fromEntries([
    'lineItemId', 'productId', 'productTitle', 'productSku', 'quantityMilli', 'grossMilli', 'tareMilli',
    'unitOfMeasure', 'unitPriceCents', 'subtotalCents', 'taxRateBasisPoints', 'resolution',
  ].filter(key => line[key] !== undefined).map(key => [key, line[key]]))) };
}
const authorized = (state: any) => ['requires_capture', 'authorized'].includes(state.status);
const captured = (state: any) => ['succeeded', 'captured'].includes(state.status);
const cancelled = (state: any) => ['canceled', 'cancelled'].includes(state.status);
function capturedCents(state: any) { return cents(state.capturedAmountCents ?? (captured(state) ? state.amountCents ?? state.amount : 0)); }
function checkState(state: any, currency: string, paymentId: string) {
  if (String(state.currency).toLowerCase() !== currency) throw new Error('Payment currency does not match final sale');
  if (state.data?.id && state.data.id !== paymentId) throw new Error('Provider returned a different payment identity');
  if (authorized(state)) {
    cents(state.authorizedAmountCents ?? state.amountCents ?? state.amount);
    cents(state.capturableAmountCents ?? state.amountCents ?? state.amount);
  }
  capturedCents(state);
}
function refundsCents(refunds: any[]) {
  if (refunds.some(refund => refund.status === 'processing')) throw new Error('Refund is still processing; retry finalization after reconciliation');
  return refunds.filter(refund => refund.status === 'succeeded').reduce((sum, refund) => cents(sum + cents(refund.amountCents)), 0);
}
function checkVoid(payment: any) {
  if (['processing', 'unknown'].includes(payment.providerData?.authorizationVoid?.status)) throw new Error('Authorization void requires reconciliation before finalization');
}
const defaults = { requireFreshCapability, requireSessionStore, getFulfillmentActualLines, capturePayment, cancelPayment, getPaymentStatus,
  enqueueGroceryOutboxEvent, reconcileOrderLoyalty, refundPaymentForOrder, now: () => Date.now(), token: randomUUID };

/** Short locked transactions fence provider work; every retry retrieves provider state before acting. */
export function makeFinalizeGroceryOrderActuals(overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides };
  return async function finalizeGroceryOrderActuals(_root: unknown, { orderId }: { orderId: string }, context: any): Promise<{ status: string; totalCents: number; message: string }> {
    await deps.requireFreshCapability(context, 'canManageOrders');
    await deps.requireFreshCapability(context, 'canManagePayments');
    const store = await deps.requireSessionStore(context);
    const transaction = (operation: (tc: any) => Promise<any>) => withSerializableRetry<any>(() => context.transaction(operation));
    const claim = await transaction(async (tc: any) => {
      const tx = tc.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.storeId !== store.id) throw new Error('Order not found in active store');
      const prior = await tx.orderSettlement.findUnique({ where: { idempotencyKey: `order-actuals:${orderId}` } });
      if (prior?.providerEvidence?.abandonment || prior?.status === 'abandoned') throw new Error('Final sale has been abandoned or is being reversed');
      if (prior?.status === 'finalized') return { done: true, settlement: prior, status: 'finalized' };
      if (order.status !== 'picking') throw new Error('Finalize actuals while the order is being picked');
      const snapshot = finalSaleSnapshot(order, await deps.getFulfillmentActualLines(tc, orderId));
      if (!/^[a-z]{3}$/.test(snapshot.currency)) throw new Error('Invalid final sale currency');
      const actualsHash = finalSaleSnapshotHash(snapshot);
      if (prior && (prior.actualsHash !== actualsHash || prior.totalCents !== snapshot.totalCents)) throw new Error('Finalization input changed after payment was requested');
      if (prior?.providerEvidence?.finalizationLease && new Date(prior.providerEvidence.finalizationLease.expiresAt).getTime() > deps.now()) return { done: true, settlement: prior, status: 'processing' };
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "order"=$1 ORDER BY "id" FOR UPDATE', orderId);
      const payments = await tx.payment.findMany({ where: { orderId }, include: { paymentProvider: true, refunds: true }, orderBy: { id: 'asc' } });
      const candidates = payments.filter((payment: any) => ['authorized', 'succeeded', 'partially_refunded'].includes(payment.status));
      const payment = prior?.providerEvidence?.originalPaymentId ? payments.find((payment: any) => payment.id === prior.providerEvidence.originalPaymentId) : candidates.length === 1 ? candidates[0] : null;
      if (!payment || payment.storeId !== store.id || !payment.providerPaymentId || !payment.paymentProvider?.isInstalled) throw new Error('Order requires one unambiguous original payment before finalization');
      assertIdempotentCaptureProvider(payment.paymentProvider);
      for (const row of payments) { checkVoid(row); refundsCents(row.refunds || []); }
      const budget = cents(payment.amountCents) - refundsCents(payment.refunds || []);
      if (budget < 0) throw new Error('Original refund ledger exceeds its payment');
      const revised = prior?.providerEvidence?.reauthorization;
      const status = snapshot.totalCents > budget && !revised?.paymentIntentId ? 'requires_customer_authorization' : 'processing';
      const lease = status === 'processing' ? { token: deps.token(), expiresAt: new Date(deps.now() + 120000).toISOString() } : null;
      const providerEvidence = { ...prior?.providerEvidence, originalPaymentId: payment.id, finalizationLease: lease };
      const settlement = prior
        ? await tx.orderSettlement.update({ where: { id: prior.id }, data: { status, providerEvidence } })
        : await tx.orderSettlement.create({ data: { orderId, idempotencyKey: `order-actuals:${orderId}`, actualsHash, status, totalCents: snapshot.totalCents, snapshot, providerEvidence, finalizedById: context.session.itemId } });
      if (revised?.paymentIntentId && (revised.paymentIntentId === payment.providerPaymentId
        || revised.fingerprint !== adjustmentFingerprint(settlement, payment)
        || providerEvidence.customerApproval?.fingerprint !== revised.fingerprint)) throw new Error('Customer approval does not match revised authorization');
      await tx.order.update({ where: { id: orderId }, data: { metadata: { ...order.metadata, finalSale: { ...customerFinalSaleSnapshot(snapshot), settlementId: settlement.id, status } } } });
      if (status === 'requires_customer_authorization') await deps.enqueueGroceryOutboxEvent(tx, { storeId: store.id, eventKey: `order.adjustment:${settlement.id}`, eventType: 'order.adjustment.requested', aggregateType: 'Order', aggregateId: orderId, occurredAt: new Date(deps.now()).toISOString(), payload: { orderId, totalCents: snapshot.totalCents } });
      return { done: false, settlement, order, payment, status, lease };
    });
    if (claim.done || claim.status === 'requires_customer_authorization') return { status: claim.status, totalCents: claim.settlement.totalCents,
      message: claim.status === 'finalized' ? 'Final sale already recorded' : claim.status === 'processing' ? 'Final payment reconciliation is already processing' : 'Customer must authorize the revised amount before capture' };
    const { settlement, payment, lease } = claim;
    const provider = payment.paymentProvider;
    const revisedPaymentId = settlement.providerEvidence?.reauthorization?.paymentIntentId;
    const effectivePaymentId = revisedPaymentId || payment.providerPaymentId;
    const desired = cents(settlement.totalCents);
    const currency = settlement.snapshot.currency;
    let originalState: any;
    let awaitingCustomer = false;
    try {
      const originalNoCharge = noChargeOrderPaymentState(payment);
      let state = !revisedPaymentId && originalNoCharge ? originalNoCharge : await deps.getPaymentStatus({ provider, paymentId: effectivePaymentId });
      checkState(state, currency, effectivePaymentId);
      if (revisedPaymentId) {
        if (!authorized(state) && !captured(state)) { awaitingCustomer = true; throw new Error('Customer has not confirmed the revised authorization'); }
        const revisedAmount = authorized(state) ? cents(state.authorizedAmountCents ?? state.amountCents ?? state.amount) : capturedCents(state);
        if (revisedAmount !== desired) throw new Error('Revised authorization amount does not match final sale');
        if (authorized(state) && (capturedCents(state) !== 0 || cents(state.capturableAmountCents ?? state.amountCents ?? state.amount) < desired)) throw new Error('Revised authorization is not fully capturable');
        // Validate replacement currency and amount before any original reversal.
        originalState = originalNoCharge || await deps.getPaymentStatus({ provider, paymentId: payment.providerPaymentId });
        checkState(originalState, currency, payment.providerPaymentId);
        if (authorized(originalState)) {
          await deps.cancelPayment({ provider, paymentId: payment.providerPaymentId, idempotencyKey: `${settlement.idempotencyKey}:void-original` });
          originalState = await deps.getPaymentStatus({ provider, paymentId: payment.providerPaymentId });
          checkState(originalState, currency, payment.providerPaymentId);
          if (!cancelled(originalState) || capturedCents(originalState) !== 0) throw new Error('Original authorization reversal is not confirmed');
        } else if (captured(originalState)) {
          const rows = await context.prisma.paymentRefund.findMany({ where: { paymentId: payment.id } });
          const remaining = capturedCents(originalState) - refundsCents(rows);
          if (remaining < 0) throw new Error('Original refund ledger exceeds provider capture');
          if (remaining > 0) {
            const refund = await deps.refundPaymentForOrder(null, { paymentId: payment.id, amountCents: remaining, reason: 'Customer approved revised final authorization; reverse original payment', idempotencyKey: `${settlement.idempotencyKey}:reverse-original` }, context);
            if (refund.status !== 'succeeded') throw new Error('Original payment reversal is still processing');
          }
        } else if (!cancelled(originalState) || capturedCents(originalState) !== 0) throw new Error('Original payment outcome needs reconciliation');
      }
      if (authorized(state)) {
        if (desired > cents(state.capturableAmountCents ?? state.amountCents ?? state.amount)) throw new Error('Provider authorization is below final sale; customer authorization requires reconciliation');
        if (desired === 0) await deps.cancelPayment({ provider, paymentId: effectivePaymentId, idempotencyKey: settlement.idempotencyKey });
        else await deps.capturePayment({ provider, paymentId: effectivePaymentId, amountCents: desired, idempotencyKey: settlement.idempotencyKey });
        state = await deps.getPaymentStatus({ provider, paymentId: effectivePaymentId });
        checkState(state, currency, effectivePaymentId);
      } else if (!revisedPaymentId && captured(state)) {
        const rows = await context.prisma.paymentRefund.findMany({ where: { paymentId: payment.id } });
        const remaining = capturedCents(state) - refundsCents(rows) - desired;
        if (remaining < 0) throw new Error('Provider net capture is below final sale');
        if (remaining > 0) {
          const refund = await deps.refundPaymentForOrder(null, { paymentId: payment.id, amountCents: remaining, reason: 'Actual picked quantities and item tax adjustment', idempotencyKey: `${settlement.idempotencyKey}:refund` }, context);
          if (refund.status !== 'succeeded') throw new Error('Final adjustment refund is still processing');
        }
      }
      return await transaction(async (tc: any) => {
        const tx = tc.prisma;
        await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
        await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "order"=$1 ORDER BY "id" FOR UPDATE', orderId);
        const current = await tx.orderSettlement.findUnique({ where: { id: settlement.id } });
        if (current?.status === 'finalized') return { status: 'finalized', totalCents: desired, message: 'Final sale already recorded' };
        if (current?.providerEvidence?.finalizationLease?.token !== lease.token || current.actualsHash !== settlement.actualsHash
          || current.providerEvidence?.abandonment) throw new Error('Finalization claim changed; retry reconciliation');
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order || order.storeId !== store.id || order.status !== 'picking') throw new Error('Order state changed during finalization');
        const payments = await tx.payment.findMany({ where: { orderId }, include: { refunds: true }, orderBy: { id: 'asc' } });
        for (const row of payments) { checkVoid(row); refundsCents(row.refunds || []); }
        const originalPayment = payments.find((row: any) => row.id === payment.id);
        if (!originalPayment || originalPayment.storeId !== store.id || originalPayment.providerPaymentId !== payment.providerPaymentId) throw new Error('Original payment identity changed');
        const priorPayment = revisedPaymentId ? await tx.payment.findUnique({ where: { providerPaymentId: revisedPaymentId }, include: { refunds: true } }) : originalPayment;
        if (priorPayment && (priorPayment.orderId !== orderId || priorPayment.storeId !== store.id || priorPayment.paymentProviderId !== provider.id)) throw new Error('Final payment belongs to another order or provider');
        const refunded = refundsCents(priorPayment?.refunds || []);
        const gross = capturedCents(state);
        if ((!captured(state) && !(desired === 0 && cancelled(state) && gross === 0)) || gross - refunded !== desired) throw new Error('Provider net capture does not match the final sale');
        if (revisedPaymentId) {
          const originalRefunded = refundsCents(originalPayment.refunds || []);
          if (capturedCents(originalState) - originalRefunded !== 0) throw new Error('Original payment reversal is not fully settled');
          await tx.payment.update({ where: { id: payment.id }, data: { status: originalNoCharge || cancelled(originalState) ? 'cancelled' : 'refunded',
            providerData: { ...originalPayment.providerData, finalSettlementId: settlement.id, capturedAmountCents: capturedCents(originalState) } } });
        }
        for (const other of payments) {
          if (other.id === payment.id || other.providerPaymentId === revisedPaymentId) continue;
          if (other.status === 'authorized' || (['succeeded', 'partially_refunded', 'refunded'].includes(other.status) && cents(other.amountCents) - refundsCents(other.refunds || []) !== 0)) throw new Error('Another order payment remains unsettled');
        }
        const observedAt = new Date(deps.now());
        const existingCapture = priorPayment && ['succeeded', 'partially_refunded', 'refunded'].includes(priorPayment.status);
        // Existing captures keep their recognition date, including an explicitly unknown date.
        // The adapter does not supply a capture posting timestamp: PI.created is authorization
        // creation time. A newly confirmed capture therefore uses local recognition, even when
        // retrieval recovers a provider success from an earlier timed-out request.
        const processedAt = existingCapture || gross === 0 ? priorPayment?.processedAt ?? null : observedAt;
        const priorRecognition = priorPayment?.providerData?.captureRecognition;
        const captureRecognition = {
          ...priorRecognition,
          basis: gross === 0 ? 'no_capture' : existingCapture
            ? priorRecognition?.basis || (processedAt ? 'existing_payment_timestamp' : 'unknown_existing_capture_time')
            : 'local_confirmation',
          observedAt: observedAt.toISOString(),
          providerCapturedAt: priorRecognition?.providerCapturedAt ?? priorPayment?.providerData?.providerCapturedAt ?? null,
        };
        const paymentData = { amountCents: gross, amount: (gross / 100).toFixed(2), status: cancelled(state) ? 'cancelled' : refunded > 0 ? refunded === gross ? 'refunded' : 'partially_refunded' : 'succeeded',
          processedAt, providerData: { ...priorPayment?.providerData, capturedAmountCents: gross, finalSettlementId: settlement.id, captureRecognition } };
        if (priorPayment) await tx.payment.update({ where: { id: priorPayment.id }, data: paymentData });
        else await tx.payment.create({ data: { ...paymentData, storeId: store.id, orderId, paymentProviderId: provider.id, providerPaymentId: revisedPaymentId, paymentMethod: 'credit_card', deliveryTipCents: 0, deliveryTipAmount: '0.00' } });
        await tx.orderSettlement.update({ where: { id: settlement.id }, data: { status: 'finalized', failureMessage: '', providerEvidence: { ...current.providerEvidence, finalizationLease: null, status: state.status, amountCents: gross, refundedCents: refunded, currency } } });
        const finalSale = { ...customerFinalSaleSnapshot(settlement.snapshot), status: 'finalized', settlementId: settlement.id, finalizedAt: new Date(deps.now()).toISOString() };
        if (desired === 0 && settlement.snapshot.actuals.some((line: any) => line.quantityMilli > 0)) {
          finalSale.noChargeAuthorized = { actorId: context.session.itemId, paymentId: priorPayment?.id || payment.id,
            reason: finalSale.discountCents > 0 ? 'coupon_covers_total' : 'zero_priced_goods', couponId: order.metadata?.coupon?.id || null,
            authorizedAt: finalSale.finalizedAt };
        }
        await tx.order.update({ where: { id: orderId }, data: { metadata: { ...order.metadata, finalSale } } });
        await deps.reconcileOrderLoyalty(tx, { storeId: store.id, orderId, actorId: context.session.itemId, sourceId: `settlement:${settlement.id}`, reason: 'Final picked goods settled', netGoodsCents: finalSale.subtotalCents - finalSale.discountCents, settled: true });
        await deps.enqueueGroceryOutboxEvent(tx, { storeId: store.id, eventKey: `order.finalized:${orderId}`, eventType: 'order.finalized', aggregateType: 'Order', aggregateId: orderId, occurredAt: finalSale.finalizedAt, payload: { orderId, settlementId: settlement.id, totalCents: desired } });
        return { status: 'finalized', totalCents: desired, message: 'Actual goods and final payment recorded' };
      });
    } catch (error) {
      await transaction(async (tc: any) => {
        const tx = tc.prisma;
        await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
        const current = await tx.orderSettlement.findUnique({ where: { id: settlement.id } });
        if (!current || current.status === 'finalized' || current.providerEvidence?.finalizationLease?.token !== lease.token) return;
        const status = awaitingCustomer ? 'requires_customer_authorization' : 'processing';
        await tx.orderSettlement.update({ where: { id: current.id }, data: { status, failureMessage: error instanceof Error ? error.message : 'Finalization requires reconciliation', providerEvidence: { ...current.providerEvidence, finalizationLease: null } } });
        if (awaitingCustomer) {
          const order = await tx.order.findUnique({ where: { id: orderId } });
          await tx.order.update({ where: { id: orderId }, data: { metadata: { ...order.metadata, finalSale: { ...order.metadata?.finalSale, status } } } });
        }
      });
      if (awaitingCustomer) return { status: 'requires_customer_authorization', totalCents: desired, message: 'Customer must confirm the revised authorization' };
      throw error;
    }
  };
}
export const finalizeGroceryOrderActuals = makeFinalizeGroceryOrderActuals();
