import { unconvertedLotCapacityMilli } from '../lib/inventoryConversion';
import { releaseOrderCoupon } from '../lib/couponRedemptions';
import { restoreLoyaltyRedemptionForOrder, reconcileOrderLoyalty } from "../lib/loyaltyAccounting";
import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { requireSessionStore } from '../lib/storeScope';
import { appendInventoryMovement, quantityMilli } from '../lib/inventoryMovements';
import { isInventoryLotEligible } from '../lib/inventorySafety';
import { withSerializableRetry } from '../utils/serializableTransaction';
import { noChargeOrderPaymentState } from '../lib/checkoutIdentity';
import { finalSaleSnapshotHash } from '../lib/finalSaleIdentity';

export function hasOutstandingSettledPayment(statuses: string[]) {
  return statuses.some((status) => status === 'succeeded' || status === 'partially_refunded');
}

/** Payment rows and their refund ledger are read only after the Order → Payment locks. */
export function assertCancellationPaymentProof(payments: any[], orderId: string, storeId: string, finalized?: { settlement: any; finalSale: any; currencyCode: string }) {
  for (const payment of payments) {
    if (!payment.id || payment.orderId !== orderId || payment.storeId !== storeId || !Number.isSafeInteger(payment.amountCents) || payment.amountCents < 0 || !Array.isArray(payment.refunds)) throw new Error('Cancellation requires complete payment ownership, amount and refund evidence');
    if (['processing', 'unknown'].includes(payment.providerData?.authorizationVoid?.status)) throw new Error('Authorization void requires reconciliation before cancellation');
    if (['authorized', 'pending'].includes(payment.status)) throw new Error('Void the active payment authorization before cancelling this order');
    if (payment.status === 'processing') throw new Error('Payment reconciliation must complete before cancellation');
    let refundedCents = 0;
    for (const refund of payment.refunds) {
      if (!refund.id || refund.paymentId !== payment.id || !Number.isSafeInteger(refund.amountCents) || refund.amountCents <= 0 || !['processing', 'succeeded', 'failed', 'canceled'].includes(refund.status)) throw new Error('Cancellation requires complete and consistent refund evidence');
      if (refund.status === 'processing' || refund.providerStatus === 'unknown') throw new Error('Refund reconciliation must complete before cancellation');
      if (refund.status === 'succeeded') refundedCents += refund.amountCents;
    }
    if (!Number.isSafeInteger(refundedCents) || refundedCents > payment.amountCents) throw new Error('Refund ledger exceeds the recorded payment amount');
    if (payment.amountCents === 0) {
      const noCharge = noChargeOrderPaymentState(payment);
      const checkoutZero = noCharge && payment.status === 'succeeded' && !['capturedAmountCents', 'authorizedAmountCents', 'capturableAmountCents'].some(field => payment.providerData?.[field] != null && payment.providerData[field] !== 0);
      const settlement = finalized?.settlement;
      const sale = finalized?.finalSale;
      const evidence = settlement?.providerEvidence;
      const snapshot = settlement?.snapshot;
      // The finalizer can replace a free checkout or void an estimated authorization
      // down to zero. Its immutable settlement, not historical authorization amounts,
      // proves those cancelled rows carry no remaining payment exposure.
      const finalIdentity = payment.status === 'cancelled' && payment.providerData?.capturedAmountCents === 0
        && settlement?.id && settlement.orderId === orderId && settlement.status === 'finalized'
        && settlement.idempotencyKey === `order-actuals:${orderId}` && payment.providerData.finalSettlementId === settlement.id
        && evidence?.originalPaymentId === payment.id && !evidence.finalizationLease && !evidence.abandonment
        && sale?.status === 'finalized' && sale.settlementId === settlement.id
        && Number.isSafeInteger(settlement.totalCents) && settlement.totalCents >= 0 && sale.totalCents === settlement.totalCents
        && snapshot?.totalCents === settlement.totalCents && snapshot.currency === String(finalized?.currencyCode).toLowerCase()
        && sale.currency === snapshot.currency && evidence.currency === snapshot.currency
        && settlement.actualsHash === finalSaleSnapshotHash(snapshot);
      const revised = finalIdentity && noCharge && evidence.reauthorization?.paymentIntentId
        ? payments.find(row => row.id !== payment.id && row.orderId === orderId && row.storeId === storeId
          && row.providerPaymentId === evidence.reauthorization.paymentIntentId && row.paymentProviderId === payment.paymentProviderId
          && row.providerData?.finalSettlementId === settlement.id && row.amountCents === evidence.amountCents) : null;
      const replacedZero = revised && revised.status === 'refunded' && settlement.totalCents > 0 && ['succeeded', 'captured'].includes(evidence.status)
        && Number.isSafeInteger(evidence.amountCents) && Number.isSafeInteger(evidence.refundedCents)
        && evidence.refundedCents >= 0 && evidence.amountCents - evidence.refundedCents === settlement.totalCents;
      const voidedToZero = finalIdentity && !noCharge && !evidence.reauthorization?.paymentIntentId
        && typeof payment.providerPaymentId === 'string' && payment.providerPaymentId && !payment.providerPaymentId.startsWith('grocery_no_charge:')
        && settlement.totalCents === 0 && ['canceled', 'cancelled'].includes(evidence.status)
        && evidence.amountCents === 0 && evidence.refundedCents === 0 && payment.providerData.captureRecognition?.basis === 'no_capture';
      if (payment.refunds.length || !(checkoutZero || replacedZero || voidedToZero)) throw new Error('Zero payment cancellation requires verified server no-charge evidence or finalized zero-exposure settlement proof');
      continue;
    }
    if (hasOutstandingSettledPayment([payment.status])) throw new Error('Settled payments must be fully refunded through the refund workflow before cancelling the order');
    if (payment.status === 'refunded' && refundedCents !== payment.amountCents) throw new Error('Fully refunded status requires matching succeeded refund evidence before cancellation');
    if (!['refunded', 'failed', 'cancelled'].includes(payment.status)) throw new Error('Unknown payment state requires reconciliation before cancellation');
  }
}

export async function cancelGroceryOrder(
  _root: unknown,
  { orderId, reason, idempotencyKey, disposition, conditionNote }: { orderId: string; reason: string; idempotencyKey: string; disposition?: string; conditionNote?: string },
  context: Context,
) {
  await requireFreshCapability(context, 'canManageOrders');
  const store = await requireSessionStore(context);
  const normalizedReason = reason.trim();
  const normalizedKey = idempotencyKey.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) throw new Error('Cancellation reason must be between 3 and 500 characters');
  if (normalizedKey.length < 12) throw new Error('Cancellation idempotency key is required');

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx: any = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        lineItems: {
          select: {
            id: true,
            quantity: true,
            productId: true,
            inventoryLotId: true,
            fulfillment: { select: { id: true, allocations: true } },
            metadata: true,
            inventoryAllocations: { select: { id: true, inventoryLotId: true, quantity: true } },
          },
        },
      },
    });
    if (!order || order.storeId !== store.id) throw new Error('Order not found in active store');
    const cancellation = (order.metadata as any)?.cancellation;
    if (order.status === 'cancelled') {
      if (cancellation?.idempotencyKey !== normalizedKey || cancellation.reason !== normalizedReason || (cancellation.disposition || 'return_to_stock') !== (disposition || 'return_to_stock') || (cancellation.conditionNote || '') !== (conditionNote?.trim() || '')) throw new Error('Order was already cancelled by another operation');
      return { success: true, orderId, status: 'cancelled', reused: true };
    }
    if (order.deliveryRouteId || order.status === 'out_for_delivery' || order.status === 'delivered') {
      throw new Error('Dispatched or delivered orders cannot be cancelled');
    }
    if (!['pending', 'picking', 'packed', 'returned'].includes(order.status)) throw new Error(`Order status ${order.status} cannot be cancelled`);
    const settlement = await tx.orderSettlement.findFirst({ where: { orderId, status: { in: ['processing', 'requires_customer_authorization'] } } });
    if (settlement) throw new Error('Resolve the reserved final sale before cancelling this order');
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "order" = $1 ORDER BY "id" FOR UPDATE', orderId);
    const payments = await tx.payment.findMany({ where: { orderId }, include: { refunds: true }, orderBy: { id: 'asc' } });
    const finalSale = order.metadata?.finalSale;
    const finalized = payments.some((payment: any) => payment.amountCents === 0 && payment.status === 'cancelled') && finalSale?.settlementId
      ? { settlement: await tx.orderSettlement.findUnique({ where: { id: finalSale.settlementId } }), finalSale, currencyCode: order.currencyCode } : undefined;
    assertCancellationPaymentProof(payments, orderId, store.id, finalized);

    if (['packed', 'returned'].includes(order.status) && (!disposition || !conditionNote?.trim())) throw new Error('Packed goods require explicit return, waste or quarantine disposition and condition evidence');
    const returnDisposition = disposition || 'return_to_stock';
    if (!['return_to_stock', 'waste', 'quarantine'].includes(returnDisposition)) throw new Error('Unsupported cancellation disposition');
    const originalAllocations = order.lineItems.flatMap((line: any) => {
      const allocations = line.fulfillment ? line.fulfillment.allocations || [] : line.inventoryAllocations.length ? line.inventoryAllocations : (line.metadata?.inventoryAllocations || (line.inventoryLotId ? [{ inventoryLotId: line.inventoryLotId, quantity: line.quantity }] : []));
      return allocations.map((allocation: any) => ({ lineItemId: line.id, lotId: allocation.lotId || allocation.inventoryLotId, productId: allocation.productId || line.productId, quantity: Number(allocation.quantity) }));
    });
    // Custody was accepted when a line refund was reserved, independently of its
    // provider result. Waste also consumes custody even though it adds no stock.
    const priorReturns = await tx.orderLineRefund.findMany({ where: { orderId, storeId: store.id }, select: { id: true, lineItemId: true, returnedLots: true } });
    const remaining = new Map<string, any>();
    for (const allocation of originalAllocations) {
      const key = JSON.stringify([allocation.lineItemId, allocation.lotId]);
      const existing = remaining.get(key);
      if (existing && existing.productId !== allocation.productId) throw new Error('Cancellation lot has conflicting product provenance');
      remaining.set(key, { ...allocation, quantityMilli: quantityMilli(allocation.quantity) + (existing?.quantityMilli || 0) });
    }
    for (const prior of priorReturns) for (const returned of prior.returnedLots || []) {
      const allocation = remaining.get(JSON.stringify([prior.lineItemId, returned.lotId]));
      if (!allocation || !Number.isSafeInteger(returned.quantityMilli) || returned.quantityMilli <= 0 || returned.quantityMilli > allocation.quantityMilli) throw new Error('Previously accepted return exceeds actual cancellation allocation');
      allocation.quantityMilli -= returned.quantityMilli;
    }
    const effectiveAllocations = [...remaining.values()].filter(allocation => allocation.quantityMilli > 0).map(({ quantityMilli: milli, ...allocation }) => ({ ...allocation, quantity: milli / 1000 }));
    const productIds = [...new Set(effectiveAllocations.map((allocation: any) => allocation.productId))].sort();
    const lotIds = [...new Set(effectiveAllocations.map((allocation: any) => allocation.lotId))].sort();
    for (const productId of productIds) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
    for (const lotId of lotIds) await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
    if (order.deliverySlotId) await tx.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id" = $1 FOR UPDATE', order.deliverySlotId);
    if (order.pickupSlotId) await tx.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', order.pickupSlotId);
    const couponId = typeof (order.metadata as any)?.coupon?.id === 'string' ? (order.metadata as any).coupon.id : null;
    if (couponId) await tx.$queryRawUnsafe('SELECT "id" FROM "Coupon" WHERE "id" = $1 FOR UPDATE', couponId);

    for (const allocation of effectiveAllocations) {
      const lot = await tx.inventoryLot.findUnique({ where: { id: allocation.lotId } });
      const product = await tx.product.findUnique({ where: { id: allocation.productId } });
      if (!lot || !product || lot.storeId !== store.id || product.storeId !== store.id || lot.productId !== product.id) throw new Error('Cancellation allocation is outside the active store');
      if (returnDisposition === 'return_to_stock' && ['packed', 'returned'].includes(order.status) && !isInventoryLotEligible(lot)) throw new Error('Unsafe or expired packed stock requires quarantine or waste disposition');
      const delta = returnDisposition === 'waste' ? 0 : quantityMilli(allocation.quantity);
      const nextLot = (quantityMilli(lot.quantityRemaining) + delta) / 1000;
      const nextStock = (quantityMilli(product.stockQuantity) + delta) / 1000;
      if (quantityMilli(nextLot) > await unconvertedLotCapacityMilli(tx, store.id, lot)) throw new Error('Cancellation would exceed received lot quantity remaining after conversions');
      await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityRemaining: nextLot, ...(returnDisposition === 'quarantine' && lot.safetyStatus !== 'recalled' ? { safetyStatus: 'quarantined', safetyReason: conditionNote?.trim() || normalizedReason } : {}) } });
      await tx.product.update({ where: { id: product.id }, data: { stockQuantity: nextStock, inStock: nextStock > 0 } });
      await appendInventoryMovement(tx, { storeId: store.id, productId: product.id, inventoryLotId: lot.id, orderId, sourceType: `cancellation_${returnDisposition}`, sourceId: orderId, idempotencyKey: `cancel:${normalizedKey}:${allocation.lineItemId}:${lot.id}`, actorId: context.session?.itemId, reason: normalizedReason, quantityBefore: lot.quantityRemaining, quantityAfter: nextLot, productStockBefore: product.stockQuantity, productStockAfter: nextStock, metadata: { disposition: returnDisposition, conditionNote: conditionNote?.trim() || null, quantity: allocation.quantity, lineItemId: allocation.lineItemId } });
    }
    // Original allocation rows and snapshots remain immutable historical provenance.

    if (order.deliverySlotId) {
      const slot = await tx.deliverySlot.findUnique({ where: { id: order.deliverySlotId }, select: { currentBookings: true } });
      await tx.deliverySlot.update({ where: { id: order.deliverySlotId }, data: { currentBookings: Math.max(0, Number(slot?.currentBookings || 0) - 1) } });
    }
    if (order.pickupSlotId) {
      const slot = await tx.pickupSlot.findUnique({ where: { id: order.pickupSlotId }, select: { currentOrders: true, maxOrders: true, isActive: true } });
      const nextOrders = Math.max(0, Number(slot?.currentOrders || 0) - 1);
      await tx.pickupSlot.update({
        where: { id: order.pickupSlotId },
        data: { currentOrders: nextOrders, isAvailable: Boolean(slot?.isActive) && nextOrders < Number(slot?.maxOrders || 0) },
      });
    }
    const parkingSpotId = typeof (order.metadata as any)?.parkingSpotId === 'string' ? (order.metadata as any).parkingSpotId : null;
    if (parkingSpotId) {
      const spot = await tx.parkingSpot.findUnique({ where: { id: parkingSpotId }, select: { storeId: true } });
      if (spot?.storeId === store.id) await tx.parkingSpot.update({ where: { id: parkingSpotId }, data: { isAvailable: true } });
    }

    const couponRelease = await releaseOrderCoupon(tx, { storeId: store.id, orderId, sourceId: `cancel:${normalizedKey}`, reason: normalizedReason });

    await restoreLoyaltyRedemptionForOrder(tx, {storeId:store.id,orderId,sourceId:`cancel:${normalizedKey}`,reason:normalizedReason});
    await reconcileOrderLoyalty(tx, {storeId:store.id,orderId,sourceId:`cancel:${normalizedKey}`,reason:normalizedReason,netGoodsCents:0,settled:true,actorId:context.session?.itemId});
    const cancelledAt = new Date();
    const metadata = {
      ...couponRelease.metadata,
      cancellation: {
        idempotencyKey: normalizedKey,
        reason: normalizedReason,
        cancelledBy: context.session?.itemId,
        cancelledAt: cancelledAt.toISOString(),
        inventoryRestored: returnDisposition !== 'waste',
        disposition: returnDisposition,
        conditionNote: conditionNote?.trim() || null,
        allocations: effectiveAllocations,
        priorReturnIds: priorReturns.filter((row: any) => row.returnedLots?.length).map((row: any) => row.id),
        fulfillmentCapacityReleased: true,
        couponRedemptionReleased: couponRelease.released,
      },
    };
    await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled', canceledAt: cancelledAt, metadata } });
    await enqueueGroceryOutboxEvent(tx, {
      storeId: store.id,
      eventKey: `order.cancelled:${orderId}:${normalizedKey}`,
      eventType: 'order.cancelled',
      aggregateType: 'Order',
      aggregateId: orderId,
      occurredAt: cancelledAt.toISOString(),
      payload: { orderId, reason: normalizedReason, idempotencyKey: normalizedKey, inventoryRestored: returnDisposition !== 'waste', disposition: returnDisposition, fulfillmentCapacityReleased: true, couponRedemptionReleased: couponRelease.released },
    });
    return { success: true, orderId, status: 'cancelled', reused: false };
  }, { isolationLevel: 'Serializable' as any }));
}
