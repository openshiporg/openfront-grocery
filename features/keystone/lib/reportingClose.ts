import { createHash } from 'node:crypto';
import { canonicalGroceryOutboxPayload } from './groceryOutbox';
import { zonedDateKey, zonedStartOfDateKey } from './storeTime';
import { quantityMilli } from './inventoryMovements';

export type ClosePeriod = { startDate: string; endDate: string; timezone: string; start: Date; end: Date; cutoff: Date };
export function closePeriod(startDate: string, endDate: string, timezone: string, cutoff = new Date()): ClosePeriod {
  function dateKey(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Use a valid YYYY-MM-DD trading date');
    return value;
  }
  dateKey(startDate); dateKey(endDate);
  const start = zonedStartOfDateKey(startDate, timezone);
  const next = new Date(`${endDate}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const end = zonedStartOfDateKey(next.toISOString().slice(0, 10), timezone);
  if (end <= start || end.getTime() - start.getTime() > 367 * 86400000 || start > cutoff || endDate > zonedDateKey(cutoff, timezone)) throw new Error('Choose a past or current trading period of at most one year');
  return { startDate, endDate, timezone, start, end, cutoff };
}
export function csvCell(value: unknown) {
  let text = value == null ? '' : String(value);
  if (typeof value !== 'number' && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function rowsToCsv(rows: Record<string, unknown>[]) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [columns.map(csvCell).join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\r\n');
}
export function parseCsv(text: string) {
  if (text.length > 1_000_000) throw new Error('Statement must be at most 1 MB');
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && char === ',') { row.push(value); value = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (quoted) throw new Error('Statement contains an unclosed quoted field');
  row.push(value); if (row.some(Boolean)) rows.push(row);
  return rows;
}

const STATEMENT_COLUMNS = ['entryReference', 'entryType', 'paymentReference', 'refundReference', 'amountCents', 'feeCents', 'netCents', 'currencyCode', 'payoutReference', 'settledAt'];
export const STATEMENT_TEMPLATE = `${STATEMENT_COLUMNS.join(',')}\nentry-001,capture,payment-reference,,1200,35,1165,USD,payout-001,2026-09-05T12:00:00Z`;
export type StatementEntry = { entryReference: string; entryType: 'capture' | 'refund'; paymentReference: string; refundReference: string;
  amountCents: number; feeCents: number; netCents: number; currencyCode: string; payoutReference: string; settledAt: string };
function integerCents(value: unknown, allowNegative = false) {
  if (!/^-?\d+$/.test(String(value))) throw new Error('Statement amounts must be integer cents');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 2_147_483_647 || (!allowNegative && result < 0)) throw new Error('Statement amount is outside the supported range');
  return result;
}
export function statementEntries(csv: string, now = new Date()): StatementEntry[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header || header.join(',') !== STATEMENT_COLUMNS.join(',')) throw new Error(`Statement headers must be ${STATEMENT_COLUMNS.join(',')}`);
  if (!rows.length || rows.length > 1000) throw new Error('Import between 1 and 1000 statement entries');
  const seen = new Set<string>();
  return rows.map(row => {
    if (row.length !== header.length) throw new Error('Statement row has an incorrect number of columns');
    const item = Object.fromEntries(header.map((key, index) => [key, row[index].trim()]));
    if (!item.entryReference || !item.paymentReference || seen.has(item.entryReference)) throw new Error('Statement entries need unique references and payment references');
    if (Object.values(item).some(value => value.length > 200)) throw new Error('Statement reference is too long');
    seen.add(item.entryReference);
    if (!['capture', 'refund'].includes(item.entryType) || (item.entryType === 'refund' && !item.refundReference)) throw new Error('Choose capture or refund and supply refund identity when needed');
    if (!/^[A-Za-z]{3}$/.test(item.currencyCode)) throw new Error('Statement currency must use its three-letter code');
    const settledAt = new Date(item.settledAt);
    if (!/Z$|[+-]\d{2}:\d{2}$/.test(item.settledAt) || !Number.isFinite(settledAt.getTime()) || settledAt > now) throw new Error('Settlement time must be a past timestamp with an explicit timezone');
    const amountCents = integerCents(item.amountCents), feeCents = integerCents(item.feeCents), netCents = integerCents(item.netCents, true);
    if (netCents !== (item.entryType === 'refund' ? -amountCents : amountCents) - feeCents) throw new Error('Statement net must equal signed amount less provider fee');
    return { ...item, currencyCode: item.currencyCode.toUpperCase(), settledAt: settledAt.toISOString(), amountCents, feeCents, netCents } as StatementEntry;
  });
}

export function matchStatementEntry(entry: StatementEntry, payment: any, storeId: string, providerCode: string) {
  let reason = '';
  if (!payment || payment.storeId !== storeId || payment.paymentProvider?.code !== providerCode) reason = 'No payment in this store/provider matches the statement reference';
  else if (String(payment.order?.currencyCode || '').toUpperCase() !== entry.currencyCode) reason = 'Statement and order currency differ';
  else if (entry.entryType === 'capture') {
    if (!['succeeded', 'partially_refunded', 'refunded'].includes(payment.status)) reason = 'Local payment has no confirmed capture';
    else if (Number(payment.amountCents) !== entry.amountCents) reason = 'Statement capture amount differs from the local capture';
  } else {
    const refund = payment.refunds?.find((refund: any) => refund.providerRefundId === entry.refundReference);
    if (!refund || refund.status !== 'succeeded') reason = 'No confirmed local refund matches the statement refund';
    else if (Number(refund.amountCents) !== entry.amountCents) reason = 'Statement refund amount differs from the local refund';
  }
  if (!reason && !entry.payoutReference) reason = 'Provider deposit/payout reference is missing';
  return { status: reason ? 'unresolved' : 'matched', reason: reason || 'Amount, currency and provider reference match local evidence', paymentId: payment?.storeId === storeId ? payment.id : null };
}

export async function readReportRows(delegate: any, args: any) {
  const rows: any[] = []; let cursor: string | undefined;
  while (true) {
    const page = await delegate.findMany({ ...args, orderBy: { id: 'asc' }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    rows.push(...page);
    if (page.length < 500) return rows;
    if (rows.length >= 100000) throw new Error('Report exceeds 100,000 source rows; choose a shorter period');
    cursor = page[page.length - 1].id;
  }
}

export function compileFinancialClose(storeId: string, currencyCode: string, period: ClosePeriod, sources: {
  orders: any[]; payments: any[]; refunds: any[]; statements: any[]; movements: any[]; lots: any[]; coupons: any[];
}) {
  currencyCode = currencyCode.toUpperCase();
  const rows: Record<string, unknown>[] = [], exceptions: Array<{ sourceType: string; sourceId: string; reason: string }> = [];
  const totals = { requestedGrossCents: 0, actualGrossCents: 0, discountsCents: 0, taxCents: 0, feesCents: 0, actualTotalCents: 0,
    refundedGoodsCents: 0, refundedTaxCents: 0, reversedDiscountCents: 0, netTaxCents: 0, capturedCents: 0, refundedCents: 0, netPaymentsCents: 0, providerFeesCents: 0, statementNetCents: 0, knownStockValueCents: 0, unknownStockLots: 0, fixedCouponExposureCents: 0, percentageCouponCount: 0 };
  const owns = (entry: any, source: string) => { if (entry.storeId !== storeId) throw new Error(`${source} contains a record outside the active store`); };
  const inPeriod = (value: any) => { const time = new Date(value).getTime(); return time >= period.start.getTime() && time < period.end.getTime() && time <= period.cutoff.getTime(); };
  for (const order of sources.orders) {
    owns(order, 'Order');
    const requestedInPeriod = inPeriod(order.createdAt);
    if (requestedInPeriod) {
      totals.requestedGrossCents += Number(order.subtotalCents || 0);
      rows.push({ sourceType: 'order_request', sourceId: order.id, orderId: order.id, occurredAt: new Date(order.createdAt).toISOString(), status: order.status,
        currency: currencyCode, requestedGrossCents: order.subtotalCents });
    }
    const final = order.metadata?.finalSale?.status === 'finalized' ? order.metadata.finalSale : null;
    const settlement = order.settlements?.find((item: any) => item.status === 'finalized' && item.id === final?.settlementId);
    const commercial = settlement?.snapshot;
    if (!commercial || !final) {
      exceptions.push({ sourceType: 'order', sourceId: order.id, reason: `Order ${order.status} has no identified finalized commercial snapshot` });
      continue;
    }
    // Requested order placement is a separate cohort. Actual goods and tax are
    // recognized only on the durable finalization timestamp, never backdated.
    if (!final.finalizedAt || !Number.isFinite(new Date(final.finalizedAt).getTime())) {
      exceptions.push({ sourceType: 'order', sourceId: order.id, reason: 'Finalized sale has no valid original finalization timestamp; actual goods and tax require historical review' });
      continue;
    }
    if (!inPeriod(final.finalizedAt)) continue;
    const gross = Number(commercial.subtotalCents), discount = Number(commercial.discountCents);
    const tax = Number(commercial.taxCents), fee = Number(commercial.feeCents), total = Number(commercial.totalCents);
    totals.actualGrossCents += gross; totals.discountsCents += discount; totals.taxCents += tax; totals.feesCents += fee; totals.actualTotalCents += total;
    rows.push({ sourceType: 'order', sourceId: order.id, orderId: order.id, settlementId: settlement.id, occurredAt: new Date(final.finalizedAt).toISOString(), status: order.status,
      currency: currencyCode, actualGrossCents: gross, discountCents: discount, taxCents: tax, feeCents: fee, actualTotalCents: total });
    for (const line of commercial.lines || []) rows.push({ sourceType: 'actual_line', sourceId: line.id, orderId: order.id, settlementId: settlement.id, occurredAt: new Date(final.finalizedAt).toISOString(), currency: currencyCode,
      actualGrossCents: line.subtotalCents, discountCents: line.discountCents, taxCents: line.taxCents, actualTotalCents: line.totalCents });
  }
  for (const payment of sources.payments) {
    owns(payment, 'Payment'); if (!inPeriod(payment.processedAt || payment.createdAt)) continue;
    const captured = ['succeeded', 'partially_refunded', 'refunded'].includes(payment.status) ? Number(payment.amountCents) : 0;
    totals.capturedCents += captured;
    rows.push({ sourceType: 'payment', sourceId: payment.id, orderId: payment.orderId, occurredAt: new Date(payment.processedAt || payment.createdAt).toISOString(), status: payment.status,
      currency: currencyCode, capturedCents: captured, providerReference: payment.providerPaymentId });
    if (!captured) exceptions.push({ sourceType: 'payment', sourceId: payment.id, reason: `Payment is ${payment.status}; no confirmed capture included` });
    else if (!sources.statements.some(row => row.paymentId === payment.id && row.entryType === 'capture' && row.status === 'matched')) exceptions.push({ sourceType: 'payment', sourceId: payment.id, reason: 'Capture has no matched provider settlement entry' });
  }
  for (const refund of sources.refunds) {
    owns(refund.payment, 'Refund payment'); if (!inPeriod(refund.processedAt || refund.requestedAt)) continue;
    const amount = refund.status === 'succeeded' ? Number(refund.amountCents) : 0; totals.refundedCents += amount;
    rows.push({ sourceType: 'refund', sourceId: refund.id, orderId: refund.payment.orderId, occurredAt: new Date(refund.processedAt || refund.requestedAt).toISOString(), status: refund.status, currency: currencyCode,
      refundedCents: amount, providerReference: refund.providerRefundId, reason: refund.providerData?.requestReason || refund.failureMessage || '' });
    if (refund.status === 'processing') exceptions.push({ sourceType: 'refund', sourceId: refund.id, reason: 'Provider refund outcome is unresolved' });
    const reversal=refund.providerData?.commercialAdjustments;
    if(amount && reversal?.kind==='final_sale_line_refund') {
      if(Number(reversal.totalCents)!==amount || String(reversal.currencyCode).toUpperCase()!==currencyCode)throw new Error('Commercial refund does not match cash/currency evidence');
      totals.refundedGoodsCents+=Number(reversal.netGoodsCents);totals.refundedTaxCents+=Number(reversal.taxCents);totals.reversedDiscountCents+=Number(reversal.discountCents);
      for(const line of reversal.lines || [])rows.push({sourceType:'refund_line',sourceId:line.id,refundId:refund.id,orderId:refund.payment.orderId,lineItemId:line.lineItemId,quantityMilli:line.quantityMilli,netGoodsReversedCents:line.netGoodsCents,taxReversedCents:line.taxCents,discountReversedCents:line.discountCents,refundedCents:line.totalCents,disposition:line.disposition,currency:currencyCode});
    }
    if (amount && !refund.providerData?.commercialAdjustments) exceptions.push({ sourceType: 'refund', sourceId: refund.id, reason: 'Cash refund has no item/tax allocation snapshot; tax reversal requires review' });
  }
  for (const entry of sources.statements) {
    owns(entry, 'Statement'); if (!inPeriod(entry.settledAt)) continue;
    if (entry.currencyCode === currencyCode) { totals.providerFeesCents += Number(entry.feeCents); totals.statementNetCents += Number(entry.netCents); }
    else exceptions.push({ sourceType: 'settlement', sourceId: entry.id, reason: 'Foreign-currency statement entry excluded from store-currency totals' });
    rows.push({ sourceType: 'settlement', sourceId: entry.id, paymentId: entry.paymentId, occurredAt: new Date(entry.settledAt).toISOString(), currency: entry.currencyCode,
      status: entry.status, providerReference: entry.paymentReference, refundReference: entry.refundReference, statementReference: entry.statementReference, payoutReference: entry.payoutReference,
      amountCents: entry.amountCents, providerFeeCents: entry.feeCents, statementNetCents: entry.netCents, reason: entry.reason });
    if (entry.status !== 'matched') exceptions.push({ sourceType: 'settlement', sourceId: entry.id, reason: entry.reason });
  }
  const asOf = new Date(Math.min(period.end.getTime(), period.cutoff.getTime()));
  const latest = new Map<string, any>();
  for (const movement of [...sources.movements].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.sequence - b.sequence)) {
    owns(movement, 'Inventory movement');
    if (new Date(movement.createdAt) < asOf) latest.set(movement.inventoryLotId, movement);
    if (inPeriod(movement.createdAt)) rows.push({ sourceType: 'inventory_movement', sourceId: movement.id, orderId: movement.orderId, lotId: movement.inventoryLotId, occurredAt: new Date(movement.createdAt).toISOString(),
      quantityDelta: Number(movement.quantityDelta), quantityAfter: Number(movement.quantityAfter), reason: movement.reason });
  }
  for (const lot of sources.lots) {
    owns(lot, 'Inventory lot'); if (new Date(lot.createdAt) >= asOf) continue;
    const movement = latest.get(lot.id);
    const value = movement ? Number((BigInt(quantityMilli(movement.quantityAfter)) * BigInt(lot.costPerUnitCents || 0) + BigInt(500)) / BigInt(1000)) : null;
    if (value == null) { totals.unknownStockLots++; exceptions.push({ sourceType: 'inventory_lot', sourceId: lot.id, reason: 'No movement before stock cutoff; historical opening quantity is unknown' }); }
    else totals.knownStockValueCents += value;
    rows.push({ sourceType: 'stock_valuation', sourceId: lot.id, lotId: lot.id, occurredAt: asOf.toISOString(), quantity: movement ? Number(movement.quantityAfter) : null,
      costPerUnitCents: lot.costPerUnitCents, stockValueCents: value, lastMovementId: movement?.id || '', basis: 'Available physical units at period end × lot cost recorded at export cutoff' });
  }
  for (const clipped of sources.coupons) {
    owns(clipped.user, 'Coupon customer');
    const coupon = clipped.coupon;
    if (new Date(clipped.clippedAt) >= asOf || (clipped.usedAt && new Date(clipped.usedAt) < asOf) || (coupon.validTo && new Date(coupon.validTo) < asOf)) continue;
    const amount = coupon.discountType === 'fixed' ? Number(coupon.discountValueCents || 0) : null;
    if (amount === null) totals.percentageCouponCount++; else totals.fixedCouponExposureCents += amount;
    rows.push({ sourceType: 'coupon_exposure', sourceId: clipped.id, couponId: coupon.id, code: coupon.code, currency: currencyCode, conditionalFaceValueCents: amount,
      basis: 'Unused clipped offer at cutoff; eligibility conditions apply; not an unconditional cash liability' });
  }
  totals.netTaxCents = totals.taxCents-totals.refundedTaxCents;
  totals.netPaymentsCents = totals.capturedCents - totals.refundedCents;
  if (totals.actualTotalCents !== totals.netPaymentsCents) exceptions.push({ sourceType: 'period', sourceId: `${period.startDate}:${period.endDate}`,
    reason: `Final sales and period net cash differ by ${totals.actualTotalCents - totals.netPaymentsCents} cents; review capture/refund timing and order exceptions` });
  if (totals.netPaymentsCents - totals.providerFeesCents !== totals.statementNetCents) exceptions.push({ sourceType: 'period', sourceId: `${period.startDate}:${period.endDate}`,
    reason: 'Net payments less provider fees do not equal the imported settlement net; review settlement timing and missing entries' });
  for (const [key, amount] of Object.entries(totals)) if (!Number.isSafeInteger(amount)) throw new Error(`Invalid report total: ${key}`);
  rows.sort((a, b) => String(a.sourceType).localeCompare(String(b.sourceType)) || String(a.sourceId).localeCompare(String(b.sourceId)));
  return { version: 2, storeId, currencyCode, startDate: period.startDate, endDate: period.endDate, timezone: period.timezone,
    periodStart: period.start.toISOString(), periodEndExclusive: period.end.toISOString(), cutoff: period.cutoff.toISOString(),
    basis: 'Requested orders by placed date; actual goods, discount, tax and fees by original finalization timestamp. Captures/refunds by processed date and provider entries by settlement date. Missing historical finalization timestamps remain exceptions.', totals, rows, exceptions };
}

export const reportHash = (value: unknown) => createHash('sha256').update(canonicalGroceryOutboxPayload(value as Record<string, unknown>)).digest('hex');
