import { deriveSellableQuantity, isInventoryLotEligible, planSellableLotAllocation } from './sellableInventory';
import { appendInventoryMovement } from './inventoryMovements';

export type FulfillmentActualInput = {
  orderId: string;
  lineItemId: string;
  resolution: 'picked' | 'short' | 'substituted';
  productId?: string | null;
  quantity: string;
  tare?: string | null;
  unitOfMeasure: string;
  reason?: string | null;
  consentChannel?: string | null;
  consentCustomer?: string | null;
  consentEvidence?: string | null;
  idempotencyKey: string;
};

export const ACTUAL_FIELDS = `id lineItemIdSnapshot resolution product { id } productTitle productSku
  quantityMilli grossMilli tareMilli unitOfMeasure unitPriceCents subtotalCents taxRateBasisPoints allocations evidence`;

export function measureMilli(value: string, label = 'Quantity'): number {
  if (!/^\d{1,7}(?:\.\d{1,3})?$/.test(value)) throw new Error(`${label} must be nonnegative with at most three decimal places`);
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  if (!Number.isSafeInteger(result) || result > 2_147_483_647) throw new Error(`${label} is too large`);
  return result;
}

// Rational base units avoid binary floating point in conversions and charges.
const UNITS: Record<string, [string, bigint, bigint]> = {
  each: ['unit', BigInt(1), BigInt(1)], g: ['weight', BigInt(1), BigInt(1)], kg: ['weight', BigInt(1000), BigInt(1)],
  lb: ['weight', BigInt(45359237), BigInt(100000)], oz: ['weight', BigInt(45359237), BigInt(1600000)],
  mL: ['volume', BigInt(1), BigInt(1)], L: ['volume', BigInt(1000), BigInt(1)],
  gallon: ['volume', BigInt(3785411784), BigInt(1000000)], quart: ['volume', BigInt(946352946), BigInt(1000000)], pint: ['volume', BigInt(473176473), BigInt(1000000)],
};
function roundRatio(numerator: bigint, denominator: bigint) {
  const value = Number((numerator + denominator / BigInt(2)) / denominator);
  if (!Number.isSafeInteger(value) || value > 2_147_483_647) throw new Error('Measured amount exceeds supported precision');
  return value;
}
export function convertMeasureMilli(value: number, from: string, to: string) {
  const source = UNITS[from], target = UNITS[to];
  if (!source || !target || source[0] !== target[0]) throw new Error('Measurement units are incompatible');
  return roundRatio(BigInt(value) * source[1] * target[2], source[2] * target[1]);
}
function convertMeasureMilliFloor(value: number, from: string, to: string) {
  const source = UNITS[from], target = UNITS[to];
  if (!source || !target || source[0] !== target[0]) throw new Error('Measurement units are incompatible');
  const converted = Number((BigInt(value) * source[1] * target[2]) / (source[2] * target[1]));
  if (!Number.isSafeInteger(converted) || converted > 2_147_483_647) throw new Error('Measured amount exceeds supported precision');
  return converted;
}
export function measuredSubtotalCents(unitPriceCents: number, quantityMilli: number) {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 || !Number.isSafeInteger(quantityMilli) || quantityMilli < 0) {
    throw new Error('Price and quantity must be nonnegative integers');
  }
  return roundRatio(BigInt(unitPriceCents) * BigInt(quantityMilli), BigInt(1000));
}

export function normalizeActualInput(input: FulfillmentActualInput) {
  const result = {
    orderId: input.orderId.trim(), lineItemId: input.lineItemId.trim(), resolution: input.resolution,
    productId: input.productId?.trim() || '', quantity: input.quantity.trim(), tare: input.tare?.trim() || '0',
    unitOfMeasure: input.unitOfMeasure.trim(), reason: input.reason?.trim() || '',
    consentChannel: input.consentChannel?.trim() || '', consentCustomer: input.consentCustomer?.trim() || '',
    consentEvidence: input.consentEvidence?.trim() || '', idempotencyKey: input.idempotencyKey.trim(),
  };
  if (!result.orderId || !result.lineItemId || !['picked', 'short', 'substituted'].includes(result.resolution)) throw new Error('Order, line and resolution are required');
  if (result.idempotencyKey.length < 12 || result.idempotencyKey.length > 200) throw new Error('A valid resolution idempotency key is required');
  if (result.reason.length > 1000 || result.consentEvidence.length > 1000 || result.consentCustomer.length > 200) throw new Error('Resolution evidence is too long');
  measureMilli(result.quantity); measureMilli(result.tare, 'Tare');
  if (result.resolution !== 'picked' && !result.reason) throw new Error('A reason is required for shortages and substitutions');
  return result;
}

export function calculateLineActual(line: any, order: any, product: any, input: ReturnType<typeof normalizeActualInput>) {
  const commercial = line.metadata?.commercial || {};
  const replacement = input.resolution === 'substituted';
  const pricingMethod = replacement ? product.pricingMethod : commercial.pricingMethod || product.pricingMethod;
  const unit = replacement ? product.unitOfMeasure : commercial.unitOfMeasure || commercial.unitOfMeasurement || product.unitOfMeasure;
  const grossMilli = convertMeasureMilli(measureMilli(input.quantity), input.unitOfMeasure, unit);
  const tareMilli = convertMeasureMilli(measureMilli(input.tare, 'Tare'), input.unitOfMeasure, unit);
  if (tareMilli > grossMilli) throw new Error('Tare cannot exceed gross measurement');
  const quantityMilli = grossMilli - tareMilli;
  if (pricingMethod === 'unit' && (quantityMilli % 1000 !== 0 || tareMilli !== 0 || input.unitOfMeasure !== unit)) throw new Error('Unit products require whole quantities without tare');
  if (input.resolution === 'picked' && pricingMethod === 'unit' && quantityMilli !== line.quantity * 1000) throw new Error('Use shortage resolution when fewer units are picked');
  if (input.resolution === 'short' && quantityMilli >= line.quantity * 1000) throw new Error('Short quantity must be less than the requested quantity');
  if (input.resolution !== 'short' && quantityMilli === 0) throw new Error('Zero quantity requires shortage resolution');
  if (replacement && product.id === line.product?.id) throw new Error('Select a different replacement product');
  if (!replacement && input.productId && input.productId !== line.product?.id) throw new Error('Only substitutions may change the product');
  const preference = line.metadata?.substitutionPreference;
  if (replacement && (['none', 'remove', 'no_substitutions', 'refund'].includes(preference) || order.substitutionPreference === 'refund')) throw new Error('Customer preferences prohibit substitutions');
  const unitPriceCents = replacement ? product.priceCents : line.unitPriceCents;
  const subtotalCents = measuredSubtotalCents(unitPriceCents, quantityMilli);
  const requestedUnit = commercial.unitOfMeasure || commercial.unitOfMeasurement || line.product?.unitOfMeasure;
  let requestedQuantityCeilingMilli: number | null = null;
  if (replacement && requestedUnit && Number.isSafeInteger(line.quantity) && line.quantity >= 0) {
    try { requestedQuantityCeilingMilli = convertMeasureMilliFloor(line.quantity * 1000, requestedUnit, unit); }
    catch { /* Incompatible or unknown dimensions require affirmative consent. */ }
  }
  const exceedsRequestedQuantity = replacement
    ? requestedQuantityCeilingMilli === null || quantityMilli > requestedQuantityCeilingMilli
    : quantityMilli > line.quantity * 1000;
  const requiresConsent = (replacement && (preference === 'contact' || order.substitutionPreference === 'call_me')) || exceedsRequestedQuantity || subtotalCents > measuredSubtotalCents(line.unitPriceCents, line.quantity * 1000);
  if (requiresConsent || input.consentChannel || input.consentEvidence || input.consentCustomer) {
    if (!['phone', 'in_person'].includes(input.consentChannel) || input.consentCustomer.toLowerCase() !== order.email.toLowerCase() || input.consentEvidence.length < 8) {
      throw new Error('Record phone or in-person consent, the order customer email, and approval details');
    }
  }
  const taxRateBasisPoints = replacement ? product.taxRateBasisPoints ?? order.storeTaxRateBasisPoints : commercial.taxRateBasisPoints ?? order.storeTaxRateBasisPoints;
  if (!Number.isInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 10000) throw new Error('A valid snapshotted tax treatment is required');
  return { grossMilli, tareMilli, quantityMilli, unitOfMeasure: unit, unitPriceCents, subtotalCents, taxRateBasisPoints };
}

/** Caller has authenticated current staff capability; all reads/writes use its transaction. */
export async function resolveActualInTransaction(tx: any, actor: { storeId: string; userId: string }, rawInput: FulfillmentActualInput, now = new Date()) {
  const input = normalizeActualInput(rawInput);
  await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', input.orderId);
  const sudo = tx.sudo();
  const order = await sudo.query.Order.findOne({ where: { id: input.orderId }, query: 'id status email metadata substitutionPreference store { id }' });
  if (!order || order.store?.id !== actor.storeId) throw new Error('Order not found in active store');
  const line = await sudo.query.OrderLineItem.findOne({ where: { id: input.lineItemId }, query: `id title sku quantity unitPriceCents metadata order { id } product { id pricingMethod unitOfMeasure } fulfillment { ${ACTUAL_FIELDS} } inventoryAllocations { quantity inventoryLot { id product { id } store { id } } }` });
  if (!line || line.order?.id !== order.id) throw new Error('Line does not belong to this order');
  const fingerprint = JSON.stringify(input);
  if (line.fulfillment) {
    if (line.fulfillment.evidence?.inputFingerprint !== fingerprint) throw new Error('This line was already resolved with different input');
    return { ...line.fulfillment, reused: true };
  }
  if (order.status !== 'picking' || order.metadata?.finalSale) throw new Error('Actual goods can only be resolved while picking before finalization');
  const payment = await sudo.query.Payment.findMany({ where: { order: { id: { equals: order.id } }, status: { in: ['authorized', 'succeeded', 'partially_refunded'] } }, take: 1, query: 'id' });
  if (!payment.length) throw new Error('Picking requires an authorized or succeeded payment');
  const productId = input.resolution === 'substituted' ? input.productId : line.product?.id;
  if (!productId || !line.product?.id) throw new Error('The original and actual products must be identifiable');
  const productIds = [...new Set([line.product.id, productId])].sort() as string[];
  for (const id of productIds) await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', id);
  for (const id of productIds) await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "product" = $1 ORDER BY "expirationDate", "id" FOR UPDATE', id);
  const products: any[] = [];
  for (const id of productIds) products.push(await sudo.query.Product.findOne({ where: { id }, query: `id title sku status department priceCents taxRateBasisPoints pricingMethod unitOfMeasure store { id } inventoryLots(take: 1001) { id quantityRemaining expirationDate safetyStatus conditionStatus store { id } }` }));
  if (products.some(product => !product || product.store?.id !== actor.storeId || product.inventoryLots.length > 1000)) throw new Error('Product inventory is unavailable in this store');
  const product = products.find(product => product.id === productId);
  if (input.resolution === 'substituted' && product.status !== 'published') throw new Error('Replacement product is not available');
  const settings = await sudo.query.StoreSettings.findMany({ where: { store: { id: { equals: actor.storeId } } }, take: 1, query: 'taxRateBps' });
  order.storeTaxRateBasisPoints = Number(settings[0]?.taxRateBps || 0);
  const actual = calculateLineActual(line, order, product, input);
  const originalAllocations = line.inventoryAllocations || [];
  if (!originalAllocations.length) throw new Error('Original inventory allocation evidence is required');
  const lotBefore = new Map<string, number>();
  const productBefore = new Map(products.map(product => [product.id, product.inventoryLots.reduce((sum:number,lot:any)=>sum+Number(lot.quantityRemaining),0)]));
  for (const product of products) for (const lot of product.inventoryLots) lotBefore.set(lot.id, Number(lot.quantityRemaining));
  for (const allocation of originalAllocations) {
    const original = products.find(product => product.id === allocation.inventoryLot?.product?.id);
    const lot = original?.inventoryLots.find((lot: any) => lot.id === allocation.inventoryLot?.id);
    if (!lot || allocation.inventoryLot?.store?.id !== actor.storeId) throw new Error('Original allocation does not belong to this store and product');
    lot.quantityRemaining = (Math.round(Number(lot.quantityRemaining) * 1000) + Math.round(Number(allocation.quantity) * 1000)) / 1000;
  }
  const promisedAt = new Date(Math.max(now.getTime(), new Date(order.metadata?.fulfillmentPromise?.endsAt || order.metadata?.promiseEndsAt || now).getTime() || 0));
  const planned = planSellableLotAllocation(product.inventoryLots.filter((lot: any) => isInventoryLotEligible(lot, promisedAt)), actor.storeId, actual.quantityMilli / 1000, product.title, promisedAt);
  const allocations = planned.map(({ lot, quantity }: any) => {
    lot.quantityRemaining = (Math.round(Number(lot.quantityRemaining) * 1000) - Math.round(quantity * 1000)) / 1000;
    return { lotId: lot.id, productId, quantity };
  });
  const record = await sudo.db.OrderLineFulfillment.createOne({ data: {
    idempotencyKey: input.idempotencyKey, lineItemIdSnapshot: line.id, lineItem: { connect: { id: line.id } },
    product: { connect: { id: product.id } }, recordedBy: { connect: { id: actor.userId } },
    resolution: input.resolution, productTitle: input.resolution === 'substituted' ? product.title : line.title, productSku: input.resolution === 'substituted' ? product.sku || '' : line.sku || '', ...actual, allocations,
    evidence: { inputFingerprint: fingerprint, reason: input.reason, department: product.department, pricingMethod: product.pricingMethod,
      measuredAt: now.toISOString(), enteredUnit: input.unitOfMeasure, enteredGross: input.quantity, enteredTare: input.tare,
      consent: input.consentChannel ? { channel: input.consentChannel, customer: order.email, actorId: actor.userId, recordedAt: now.toISOString(), details: input.consentEvidence } : null,
      releasedAllocations: originalAllocations.map((entry: any) => ({ lotId: entry.inventoryLot.id, quantity: Number(entry.quantity) })) },
  } });
  const touchedLots = new Set([...originalAllocations.map((entry: any) => entry.inventoryLot.id), ...allocations.map((entry: any) => entry.lotId)]);
  for (const changedProduct of products) {
    const after = changedProduct.inventoryLots.reduce((sum:number,lot:any)=>sum+Number(lot.quantityRemaining),0);
    for (const lot of changedProduct.inventoryLots) {
      const before = lotBefore.get(lot.id)!;
      if (!touchedLots.has(lot.id)) continue;
      await sudo.db.InventoryLot.updateOne({ where: { id: lot.id }, data: { quantityRemaining: String(lot.quantityRemaining) } });
      await appendInventoryMovement(tx.prisma, { storeId: actor.storeId, productId: changedProduct.id, inventoryLotId: lot.id, orderId: order.id,
        sourceType: 'fulfillment_actual', sourceId: record.id, idempotencyKey: `actuals:${input.idempotencyKey}:lot:${lot.id}`,
        actorId: actor.userId, reason: input.reason || 'Picked actual goods', quantityBefore: before, quantityAfter: Number(lot.quantityRemaining),
        productStockBefore: productBefore.get(changedProduct.id)!, productStockAfter: after, metadata: { lineItemId: line.id, resolution: input.resolution } });
    }
    await sudo.db.Product.updateOne({ where: { id: changedProduct.id }, data: { stockQuantity: String(after), inStock: deriveSellableQuantity(changedProduct, actor.storeId, now) > 0 } });
  }
  return { ...record, reused: false };
}

export async function getFulfillmentActualLines(tx: any, orderId: string) {
  const lines = await tx.sudo().query.OrderLineItem.findMany({ where: { order: { id: { equals: orderId } } }, take: 1001,
    query: `id fulfillment { ${ACTUAL_FIELDS} }` });
  if (!lines.length || lines.length > 1000 || lines.some((line: any) => !line.fulfillment)) throw new Error('Resolve every order line before finalizing or packing');
  return lines.map((line: any) => ({ ...line.fulfillment, lineItemId: line.id, productId: line.fulfillment.product?.id }));
}
export async function getFulfillmentActualGoodsCents(tx: any, orderId: string) {
  return (await getFulfillmentActualLines(tx, orderId)).reduce((sum: number, line: any) => sum + line.subtotalCents, 0);
}
