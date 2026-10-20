import { publicError } from './publicError';
import { quantityMilli } from './inventoryMovements';

const integer = (value: unknown, label: string) => { const amount = Number(value); if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw publicError(`${label} must be non-negative integer minor units`); return amount; };
export type RefundLineInput = { lineItemId: string; quantityMilli: number; disposition: string; conditionNote?: string; returnedLots?: Array<{ lotId: string; quantityMilli: number }> };
function cumulativeShare(total: number, quantity: number, basis: number) { return Number((BigInt(total) * BigInt(quantity) + BigInt(Math.floor(basis / 2))) / BigInt(basis)); }

/** Net goods, discount and tax each round cumulatively; full reversal reproduces every penny. */
export function allocateFinalSaleRefund(finalSale: any, requested: RefundLineInput[], prior: any[]) {
  if (finalSale?.status !== 'finalized' || !finalSale.settlementId || !Array.isArray(finalSale.lines) || !Array.isArray(finalSale.actuals)) throw publicError('Line refunds require an immutable finalized sale snapshot');
  if (!requested.length || requested.length > 500 || new Set(requested.map(line => line.lineItemId)).size !== requested.length) throw publicError('Refund requires distinct final-sale line identities');
  return [...requested].sort((a, b) => a.lineItemId.localeCompare(b.lineItemId)).map(input => {
    const commercial = finalSale.lines.find((line: any) => line.id === input.lineItemId);
    const actual = finalSale.actuals.find((line: any) => line.lineItemId === input.lineItemId);
    if (!commercial || !actual) throw publicError('Refund line does not belong to the finalized sale');
    const fulfilledQuantityMilli = integer(actual.quantityMilli, 'Final fulfilled quantity');
    const refundQuantityMilli = integer(input.quantityMilli, 'Refund quantity');
    if (refundQuantityMilli < 1 || fulfilledQuantityMilli < 1) throw publicError('Refund quantity must be positive for a fulfilled line');
    if (!['refund_only', 'return_to_stock', 'waste', 'quarantine'].includes(input.disposition)) throw publicError('Explicit refund disposition required');
    if (input.disposition !== 'refund_only' && !input.conditionNote?.trim()) throw publicError('Returned goods require condition or custody evidence');
    const existing = prior.filter(row => (row.lineItemId || row.lineItem?.id) === input.lineItemId);
    const quantityBefore = existing.reduce((total, row) => total + integer(row.quantityMilli, 'Prior refund quantity'), 0);
    const quantityAfter = quantityBefore + refundQuantityMilli;
    if (quantityAfter > fulfilledQuantityMilli) throw publicError('Cumulative refunded quantity exceeds the final fulfilled quantity');
    const subtotal = integer(commercial.subtotalCents, 'Line subtotal'), discount = integer(commercial.discountCents, 'Line discount'), tax = integer(commercial.taxCents, 'Line tax');
    if (discount > subtotal) throw publicError('Final sale discount exceeds line subtotal');
    const share = (amount: number) => cumulativeShare(amount, quantityAfter, fulfilledQuantityMilli) - cumulativeShare(amount, quantityBefore, fulfilledQuantityMilli);
    const netGoodsCents = share(subtotal - discount), discountCents = share(discount), taxCents = share(tax);
    const returnedLots = input.returnedLots || [];
    if (new Set(returnedLots.map(lot => lot.lotId)).size !== returnedLots.length) throw publicError('Return lot identities must be distinct');
    if (input.disposition === 'refund_only' && returnedLots.length) throw publicError('Refund-only requests cannot include physical returns');
    if (input.disposition !== 'refund_only') {
      if (returnedLots.reduce((sum, lot) => sum + integer(lot.quantityMilli, 'Returned lot quantity'), 0) !== refundQuantityMilli) throw publicError('Returned lot quantities must equal the refunded physical quantity');
      for (const returned of returnedLots) {
        const allocated = (actual.allocations || []).filter((lot: any) => (lot.lotId || lot.inventoryLotId) === returned.lotId).reduce((sum: number, lot: any) => sum + quantityMilli(lot.quantity), 0);
        const previous = existing.flatMap(row => row.returnedLots || []).filter((lot: any) => lot.lotId === returned.lotId).reduce((sum: number, lot: any) => sum + Number(lot.quantityMilli), 0);
        if (returned.quantityMilli <= 0 || returned.quantityMilli + previous > allocated) throw publicError('Return lot quantity exceeds its original actual allocation');
      }
    }
    return { lineItemId: input.lineItemId, finalSettlementId: finalSale.settlementId, finalFulfillmentId: actual.id || '', productId: actual.productId || actual.product?.id, productTitle: actual.productTitle || commercial.id, unitOfMeasure: actual.unitOfMeasure || 'each', quantityMilli: refundQuantityMilli, quantityBefore, quantityAfter, fulfilledQuantityMilli, subtotalCents: netGoodsCents + discountCents, discountCents, netGoodsCents, taxCents, totalCents: netGoodsCents + taxCents, taxRateBasisPoints: commercial.taxRateBasisPoints, disposition: input.disposition, conditionNote: input.conditionNote?.trim() || '', returnedLots };
  });
}

export async function commercialAdjustmentsForRefund(tx: any, providerRefundKey: string) {
  const rows = await tx.orderLineRefund.findMany({ where: { providerRefundKey }, orderBy: { lineItemId: 'asc' } });
  if (!rows.length) return null;
  return { kind: 'final_sale_line_refund', requestKey: rows[0].requestKey, orderId: rows[0].orderId, settlementId: rows[0].finalSettlementId, currencyCode: rows[0].currencyCode,
    netGoodsCents: rows.reduce((sum: number, row: any) => sum + row.netGoodsCents, 0), discountCents: rows.reduce((sum: number, row: any) => sum + row.discountCents, 0), taxCents: rows.reduce((sum: number, row: any) => sum + row.taxCents, 0), totalCents: rows.reduce((sum: number, row: any) => sum + row.totalCents, 0),
    lines: rows.map((row: any) => ({ id: row.id, lineItemId: row.lineItemId, finalFulfillmentId: row.finalFulfillmentId, quantityMilli: row.quantityMilli, subtotalCents: row.subtotalCents, discountCents: row.discountCents, netGoodsCents: row.netGoodsCents, taxCents: row.taxCents, totalCents: row.totalCents, disposition: row.disposition })) };
}

/** Payment-lock-safe: commercial evidence only; no Order or stock locks are acquired. */
export async function reconcileOrderLineRefundRows(tx: any, refund: any) {
  const adjustments = await commercialAdjustmentsForRefund(tx, refund.idempotencyKey);
  if (!adjustments) return null;
  const payment = await tx.payment.findUnique({ where: { id: refund.paymentId }, select: { storeId: true, orderId: true } });
  const rows = await tx.orderLineRefund.findMany({ where: { providerRefundKey: refund.idempotencyKey } });
  if (!payment || rows.some((row: any) => row.paymentId !== refund.paymentId || row.storeId !== payment.storeId || row.orderId !== payment.orderId) || adjustments.totalCents !== Number(refund.amountCents)) throw new Error('Line refund evidence differs from provider refund ownership or amount');
  await tx.orderLineRefund.updateMany({ where: { providerRefundKey: refund.idempotencyKey }, data: { paymentRefundId: refund.id, status: refund.status, failureMessage: refund.failureMessage || '', processedAt: refund.processedAt || null } });
  await tx.paymentRefund.update({ where: { id: refund.id }, data: { providerData: { ...(refund.providerData || {}), commercialAdjustments: adjustments } } });
  return adjustments;
}

/** Existing PaymentRefund processing/success budgets count linked requests separately. */
export async function unlinkedLineRefundReservedCents(tx: any, paymentId: string, excludedProviderRefundKey?: string) {
  const rows = await tx.orderLineRefund.findMany({ where: { paymentId, ...(excludedProviderRefundKey ? { providerRefundKey: { not: excludedProviderRefundKey } } : {}) }, select: { providerRefundKey: true, totalCents: true } });
  const active = await tx.paymentRefund.findMany({ where: { paymentId, status: { in: ['processing', 'succeeded'] } }, select: { idempotencyKey: true } });
  const alreadyCounted = new Set(active.map((refund: any) => refund.idempotencyKey));
  return rows.filter((row: any) => !alreadyCounted.has(row.providerRefundKey)).reduce((sum: number, row: any) => sum + Number(row.totalCents), 0);
}
