import { publicError } from '../lib/publicError';
import { unconvertedLotCapacityMilli } from '../lib/inventoryConversion';
import { createHash } from 'node:crypto';
import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { canonicalGroceryOutboxPayload } from '../lib/groceryOutbox';
import { allocateFinalSaleRefund, commercialAdjustmentsForRefund, reconcileOrderLineRefundRows, unlinkedLineRefundReservedCents, type RefundLineInput } from '../lib/refundAllocations';
import { appendInventoryMovement, quantityMilli } from '../lib/inventoryMovements';
import { isInventoryLotEligible } from '../lib/inventorySafety';
import { withSerializableRetry } from '../utils/serializableTransaction';

type Args = { orderId: string; paymentId: string; idempotencyKey: string; reason: string; lines: RefundLineInput[] };
type Dependencies = { refund: (root: unknown, args: { paymentId: string; amountCents: number; reason: string; idempotencyKey: string }, context: Context) => Promise<any> };

/** Return custody is recorded once when accepted, independently of payment-provider timing. */
async function recordReturnCustody(tx: any, allocations: any[], storeId: string, orderId: string, actorId: string) {
  const returns = allocations.flatMap(line => line.returnedLots.map((lot: any) => ({ ...lot, line })));
  const productIds = [...new Set<string>(returns.map(row => row.line.productId))].sort();
  const lotIds = [...new Set<string>(returns.map(row => row.lotId))].sort();
  for (const productId of productIds) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
  for (const lotId of lotIds) await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
  for (const entry of returns) {
    const lot = await tx.inventoryLot.findUnique({ where: { id: entry.lotId } });
    const product = await tx.product.findUnique({ where: { id: entry.line.productId } });
    if (!lot || !product || lot.storeId !== storeId || product.storeId !== storeId || lot.productId !== product.id) throw publicError('Returned lot is outside the refunded product and store');
    if (entry.line.disposition === 'return_to_stock' && !isInventoryLotEligible(lot)) throw publicError('Unsafe or expired returned goods require quarantine or waste');
    const delta = entry.line.disposition === 'waste' ? 0 : entry.quantityMilli;
    const nextLot = (quantityMilli(lot.quantityRemaining) + delta) / 1000;
    const nextProduct = (quantityMilli(product.stockQuantity) + delta) / 1000;
    if (quantityMilli(nextLot) > await unconvertedLotCapacityMilli(tx, storeId, lot)) throw publicError('Returned stock exceeds original received quantity remaining after conversions');
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityRemaining: nextLot, ...(entry.line.disposition === 'quarantine' && lot.safetyStatus !== 'recalled' ? { safetyStatus: 'quarantined', safetyReason: entry.line.conditionNote } : {}) } });
    await tx.product.update({ where: { id: product.id }, data: { stockQuantity: nextProduct, inStock: nextProduct > 0 } });
    await appendInventoryMovement(tx, { storeId, orderId, productId: product.id, inventoryLotId: lot.id, sourceType: `line_refund_${entry.line.disposition}`, sourceId: entry.line.id, idempotencyKey: `line-return:${entry.line.id}:${lot.id}`, actorId, reason: entry.line.conditionNote || entry.line.reason, quantityBefore: lot.quantityRemaining, quantityAfter: nextLot, productStockBefore: product.stockQuantity, productStockAfter: nextProduct, metadata: { orderLineRefundId: entry.line.id, quantityMilli: entry.quantityMilli, disposition: entry.line.disposition, custodyAcceptedAt: new Date().toISOString(), paymentOutcomeIndependent: true } });
  }
}

export async function refundGroceryOrderLinesWithDependencies(args: Args, context: Context, dependencies: Dependencies) {
  await requireFreshCapability(context, 'canManagePayments');
  await requireFreshCapability(context, 'canManageOrders');
  const store = await requireSessionStore(context);
  const reason = args.reason?.trim(), requestKey = args.idempotencyKey?.trim();
  if (!reason || reason.length < 3 || reason.length > 500 || !requestKey || requestKey.length < 12 || requestKey.length > 150 || !Array.isArray(args.lines)) throw publicError('Line refund requires a reason, idempotency key and explicit lines');
  const fingerprint = canonicalGroceryOutboxPayload({ orderId: args.orderId, paymentId: args.paymentId, reason, lines: [...args.lines].sort((a, b) => a.lineItemId.localeCompare(b.lineItemId)).map(line => ({ ...line, conditionNote: line.conditionNote?.trim() || '', returnedLots: [...(line.returnedLots || [])].sort((a, b) => a.lotId.localeCompare(b.lotId)) })) });
  const providerRefundKey = `line-refund:${createHash('sha256').update(`${store.id}:${args.orderId}:${requestKey}`).digest('hex')}`;
  const claim = await withSerializableRetry(() => context.transaction(async transactionContext => {
    const tx: any = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', args.orderId);
    const order = await tx.order.findUnique({ where: { id: args.orderId } });
    if (!order || order.storeId !== store.id) throw publicError('Refund order not found in active store');
    const existing = await tx.orderLineRefund.findMany({ where: { providerRefundKey }, orderBy: { lineItemId: 'asc' } });
    if (existing.length) {
      if (existing.some((row: any) => row.storeId !== store.id || row.inputFingerprint !== fingerprint || row.paymentId !== args.paymentId)) throw publicError('Line refund replay differs from original allocations or owner');
      return { allocations: existing, amountCents: existing.reduce((sum: number, row: any) => sum + row.totalCents, 0), reused: true };
    }
    if (order.status === 'cancelled' && args.lines.some(line => line.disposition !== 'refund_only')) throw publicError('Cancelled goods already have custody disposition; a new physical return would duplicate it');
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const payment = await tx.payment.findUnique({ where: { id: args.paymentId } });
    if (!payment || payment.storeId !== store.id || payment.orderId !== order.id || !['succeeded', 'partially_refunded'].includes(payment.status)) throw publicError('Select a settled payment belonging to this order and store');
    // Payment rows carry no currency column. The finalized settlement recorded the currency the
    // provider confirmed at capture, so it is the authoritative currency of this settled payment.
    const settlement = order.metadata?.finalSale?.settlementId ? await tx.orderSettlement.findUnique({ where: { id: order.metadata.finalSale.settlementId } }) : null;
    const settledCurrency = String(settlement?.providerEvidence?.currency || settlement?.snapshot?.currency || '').toUpperCase();
    if (!settlement || settlement.orderId !== order.id || settlement.status !== 'finalized' || (payment.providerData?.finalSettlementId !== settlement.id && settlement.providerEvidence?.originalPaymentId !== payment.id)) throw publicError('Finalize the actual sale and select its settled payment before refunding items');
    if (!order.currencyCode || settledCurrency !== String(order.currencyCode).toUpperCase()) throw publicError('Refund payment currency differs from the finalized order');
    const prior = await tx.orderLineRefund.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
    const allocations = allocateFinalSaleRefund(order.metadata?.finalSale, args.lines, prior);
    const amountCents = allocations.reduce((sum, line) => sum + line.totalCents, 0);
    if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 2147483647) throw publicError('Selected line quantities must allocate a positive supported refund amount');
    const existingRefunds = await tx.paymentRefund.aggregate({ where: { paymentId: payment.id, status: { in: ['processing', 'succeeded'] } }, _sum: { amountCents: true } });
    const pendingLineCents = await unlinkedLineRefundReservedCents(tx, payment.id, providerRefundKey);
    if (Number(existingRefunds._sum.amountCents || 0) + pendingLineCents + amountCents > Number(payment.amountCents)) throw publicError('Line refund exceeds unreserved settled payment balance; review other goodwill and pending refunds');
    const records = [];
    for (const allocation of allocations) records.push(await tx.orderLineRefund.create({ data: { ...allocation, storeId: store.id, orderId: order.id, paymentId: payment.id, idempotencyKey: `${providerRefundKey}:${allocation.lineItemId}`, requestKey, providerRefundKey, inputFingerprint: fingerprint, currencyCode: order.currencyCode || store.currencyCode, reason, requestedBy: context.session!.itemId, status: 'reserved', events: [{ action: 'reserved', actorId: context.session!.itemId, at: new Date().toISOString(), quantityMilli: allocation.quantityMilli, disposition: allocation.disposition }] } }));
    await recordReturnCustody(tx, records, store.id, order.id, context.session!.itemId);
    return { allocations: records, amountCents, reused: false };
  }, { isolationLevel: 'Serializable' as any }));

  let failure: string | null = null;
  try { await dependencies.refund(null, { paymentId: args.paymentId, amountCents: claim.amountCents, reason, idempotencyKey: providerRefundKey }, context); }
  catch (error) { failure = error instanceof Error ? error.message : 'Provider outcome requires reconciliation'; }
  const result = await withSerializableRetry(() => context.transaction(async transactionContext => {
    const tx: any = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const refund = await tx.paymentRefund.findUnique({ where: { idempotencyKey: providerRefundKey } });
    if (refund) {
      const adjustments = await reconcileOrderLineRefundRows(tx, refund);
      return { success: refund.status === 'succeeded', status: refund.status, paymentRefundId: refund.id, amountCents: claim.amountCents, allocations: adjustments, reused: claim.reused, message: failure || (refund.status === 'succeeded' ? 'Line refund and commercial reversal recorded.' : 'Line quantities remain reserved while the payment refund is reconciled.') };
    }
    await tx.orderLineRefund.updateMany({ where: { providerRefundKey }, data: { failureMessage: failure || 'Provider refund reservation has not been created; retry this request.' } });
    return { success: false, status: 'reserved', paymentRefundId: null, amountCents: claim.amountCents, allocations: await commercialAdjustmentsForRefund(tx, providerRefundKey), reused: claim.reused, message: failure || 'Refund request is reserved. Retry with the same inputs.' };
  }, { isolationLevel: 'Serializable' as any }));
  return result;
}

export async function refundGroceryOrderLines(_root: unknown, args: Args, context: Context) {
  const { refundPaymentForOrder } = await import('./managePaymentRefund');
  return refundGroceryOrderLinesWithDependencies(args, context, { refund: refundPaymentForOrder });
}

export async function getGroceryOrderRefundLines(_root: unknown, { orderId }: { orderId: string }, context: Context) {
  await requireFreshCapability(context, 'canManagePayments');
  await requireFreshCapability(context, 'canManageOrders');
  const store = await requireSessionStore(context);
  const tx: any = context.prisma;
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, currencyCode: true, metadata: true } });
  if (!order || order.storeId !== store.id) throw publicError('Order not found in active store');
  const finalSale = order.metadata?.finalSale;
  if (finalSale?.status !== 'finalized') return { orderId, currencyCode: order.currencyCode, lines: [], requests: [], message: 'Finalize actual goods before issuing a line refund.' };
  const prior = await tx.orderLineRefund.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
  return { orderId, currencyCode: order.currencyCode, finalSale, settlementId: finalSale.settlementId, lines: finalSale.actuals.map((actual: any) => ({ lineItemId: actual.lineItemId, productTitle: actual.productTitle, quantityMilli: actual.quantityMilli, unitOfMeasure: actual.unitOfMeasure, reservedQuantityMilli: prior.filter((row: any) => row.lineItemId === actual.lineItemId).reduce((sum: number, row: any) => sum + row.quantityMilli, 0), allocations: actual.allocations, commercial: finalSale.lines.find((line: any) => line.id === actual.lineItemId) })), requests: prior.map((row: any) => ({ id: row.id, requestKey: row.requestKey, lineItemId: row.lineItemId, quantityMilli: row.quantityMilli, totalCents: row.totalCents, status: row.status, failureMessage: row.failureMessage, disposition: row.disposition, conditionNote: row.conditionNote, returnedLots: row.returnedLots, reason: row.reason, paymentId: row.paymentId })) };
}
