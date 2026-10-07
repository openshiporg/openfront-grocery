import { requirePrismaSuccess } from '../utils/serializableTransaction';

/** Physical quantities use Product.unitOfMeasurement, with three decimal places. */
export function quantityMilli(value: unknown): number {
  const number = Number(value);
  const milli = Math.round(number * 1000);
  if (!Number.isFinite(number) || !Number.isSafeInteger(milli) || Math.abs(number * 1000 - milli) > 0.00001) {
    throw new Error('Stock quantity must have at most three decimal places');
  }
  return milli;
}

export function stockQuantityFromMilli(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error('Invalid stock quantity');
  return value / 1000;
}

export type InventoryMovementInput = {
  storeId: string; productId: string; inventoryLotId?: string; orderId?: string;
  sourceType: string; sourceId: string; idempotencyKey: string; actorId?: string;
  reason: string; quantityBefore: unknown; quantityAfter: unknown;
  productStockBefore: unknown; productStockAfter: unknown; metadata?: Record<string, unknown>;
};

function canonicalEvidence(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalEvidence);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalEvidence(value[key])]));
  return value;
}

/** Caller authorizes, locks and applies balances in the same transaction. No external effects. */
export async function appendInventoryMovement(tx: any, input: InventoryMovementInput) {
  if (!input.storeId || !input.productId || !input.sourceId || !input.reason?.trim() || !input.idempotencyKey) throw new Error('Inventory movement requires ownership and source evidence');
  const before = quantityMilli(input.quantityBefore), after = quantityMilli(input.quantityAfter);
  const productBefore = quantityMilli(input.productStockBefore), productAfter = quantityMilli(input.productStockAfter);
  if (Math.min(before, after, productBefore, productAfter) < 0) throw new Error('Inventory movement cannot have negative balances');
  const data = { ...input, reason: input.reason.trim(), quantityBefore: before / 1000, quantityAfter: after / 1000, quantityDelta: (after - before) / 1000, productStockBefore: productBefore / 1000, productStockAfter: productAfter / 1000 };
  const existing = requirePrismaSuccess(await tx.inventoryMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } }), 'inventory movement lookup');
  if (existing) {
    for (const field of ['storeId', 'productId', 'inventoryLotId', 'orderId', 'sourceType', 'sourceId', 'reason', 'actorId'] as const) {
      if ((existing[field] || null) !== (data[field] || null)) throw new Error('Inventory movement replay conflicts with original evidence');
    }
    for (const field of ['quantityBefore', 'quantityAfter', 'productStockBefore', 'productStockAfter'] as const) {
      if (quantityMilli(existing[field]) !== quantityMilli(data[field])) throw new Error('Inventory movement replay conflicts with original balances');
    }
    if (JSON.stringify(canonicalEvidence(existing.metadata || null)) !== JSON.stringify(canonicalEvidence(input.metadata || null))) throw new Error('Inventory movement replay conflicts with original source evidence');
    return existing;
  }
  const previous = requirePrismaSuccess(await tx.inventoryMovement.findFirst({ where: { storeId: input.storeId, inventoryLotId: input.inventoryLotId || null, productId: input.productId }, orderBy: { sequence: 'desc' } }), 'inventory journal lookup');
  if (previous && quantityMilli(previous.quantityAfter) !== before) throw new Error('Inventory movement does not continue the lot journal balance');
  return requirePrismaSuccess(await tx.inventoryMovement.create({ data: { ...data, sequence: Number(previous?.sequence || 0) + 1 } }), 'inventory movement append');
}

/** First entry carries the opening balance for legacy lots; earlier history is unknown. */
export function inventoryBalanceAt(movements: any[], cutoff: Date) {
  const result = new Map<string, { quantity: number; openingQuantity: number; historyStartsAt: string }>();
  for (const entry of [...movements].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || Number(a.sequence || 0) - Number(b.sequence || 0) || a.id.localeCompare(b.id))) {
    if (new Date(entry.createdAt) > cutoff || !entry.inventoryLotId) continue;
    const previous = result.get(entry.inventoryLotId);
    if (previous && quantityMilli(previous.quantity) !== quantityMilli(entry.quantityBefore)) throw new Error('Inventory journal has a balance gap');
    result.set(entry.inventoryLotId, { quantity: Number(entry.quantityAfter), openingQuantity: previous?.openingQuantity ?? Number(entry.quantityBefore), historyStartsAt: previous?.historyStartsAt ?? new Date(entry.createdAt).toISOString() });
  }
  return result;
}
