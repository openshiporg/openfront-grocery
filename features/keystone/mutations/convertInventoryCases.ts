import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { appendInventoryMovement, quantityMilli } from '../lib/inventoryMovements';
import { isInventoryLotEligible } from '../lib/inventorySafety';
import { conversionHash, lockInventoryConversionScope, splitWholeCaseCost, unconvertedLotCapacityMilli } from '../lib/inventoryConversion';
import { requirePrismaSuccess, withSerializableRetry } from '../utils/serializableTransaction';

type Args = { mode: string; sourceInventoryLotId: string; quantityCases: number; reason: string; conditionNote: string; destinationLocation?: string; idempotencyKey: string; expectedReviewHash?: string };
export async function convertInventoryCases(_root: unknown, args: Args, context: Context) {
  await requireFreshCapability(context, 'canManageInventory');
  const store = await requireSessionStore(context);
  const reason = args.reason?.trim(), conditionNote = args.conditionNote?.trim(), destinationLocation = args.destinationLocation?.trim() || '';
  if (!['dry_run', 'commit'].includes(args.mode) || !reason || reason.length > 500 || !conditionNote || conditionNote.length > 500 || destinationLocation.length > 200 || typeof args.idempotencyKey !== 'string' || args.idempotencyKey.length < 12 || args.idempotencyKey.length > 150) throw new Error('Conversion requires mode, reason, condition evidence and a stable request identity');
  const fingerprint = conversionHash({ storeId: store.id, sourceInventoryLotId: args.sourceInventoryLotId, quantityCases: args.quantityCases, reason, conditionNote, destinationLocation });
  const idempotencyKey = conversionHash([store.id, args.idempotencyKey]);
  return withSerializableRetry(() => context.transaction(async transactionContext => {
    const tx: any = transactionContext.prisma;
    await lockInventoryConversionScope(tx, store.id);
    const prior = requirePrismaSuccess(await tx.inventoryConversion.findUnique({ where: { idempotencyKey } }), 'inventory conversion lookup');
    if (prior) {
      if (prior.storeId !== store.id || prior.inputFingerprint !== fingerprint) throw new Error('Conversion request identity was reused with different physical evidence');
      return { success: true, committed: true, reused: true, conversionId: prior.id, reviewHash: prior.reviewHash, source: prior.sourceSnapshot, destinations: prior.destinations, totalCostCents: prior.totalCostCents, currencyCode: prior.currencyCode };
    }
    const identity = requirePrismaSuccess(await tx.inventoryLot.findUnique({ where: { id: args.sourceInventoryLotId } }), 'inventory lot identity lookup');
    if (!identity || identity.storeId !== store.id || !identity.productId) throw new Error('Source lot not found in active Store');
    const originalProduct = requirePrismaSuccess(await tx.product.findUnique({ where: { id: identity.productId } }), 'inventory product lookup');
    if (!originalProduct?.variantOfId) throw new Error('Source product must be a configured case variant of its base product');
    for (const id of [identity.productId, originalProduct.variantOfId].sort()) requirePrismaSuccess(await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', id), 'inventory product lock');
    requirePrismaSuccess(await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', identity.id), 'inventory lot lock');
    const lot = requirePrismaSuccess(await tx.inventoryLot.findUnique({ where: { id: identity.id } }), 'locked inventory lot lookup');
    const source = requirePrismaSuccess(await tx.product.findUnique({ where: { id: identity.productId } }), 'locked source product lookup');
    const target = requirePrismaSuccess(await tx.product.findUnique({ where: { id: originalProduct.variantOfId } }), 'locked destination product lookup');
    if (!lot || !source || !target || lot.storeId !== store.id || source.storeId !== store.id || target.storeId !== store.id || lot.productId !== source.id || source.variantOfId !== target.id || source.id === target.id || target.variantOfId) throw new Error('Conversion products and physical lot must share one Store and an unchanged root relationship');
    if ([source, target].some(product => product.unitOfMeasure !== 'each' || product.pricingMethod !== 'unit' || product.status === 'archived') || Number(target.packBaseUnitsMilli ?? 1000) !== 1000 || Number(source.packBaseUnitsMilli) % 1000 !== 0) throw new Error('Only whole case-to-each conversion with an integer configured pack factor is supported');
    if (!isInventoryLotEligible(lot)) throw new Error('Held, recalled, quarantined or expired cases cannot be converted');
    if (lot.costPerUnitCents === null || lot.costPerUnitCents === undefined) throw new Error('Source case cost evidence is required');
    const plan = splitWholeCaseCost(args.quantityCases, Number(source.packBaseUnitsMilli) / 1000, Number(lot.costPerUnitCents));
    const capacity = await unconvertedLotCapacityMilli(tx, store.id, lot);
    if (quantityMilli(lot.quantityRemaining) > capacity || quantityMilli(plan.quantityCases) > capacity) throw new Error('Source stock exceeds the original quantity left after prior case conversions');
    if (quantityMilli(lot.quantityRemaining) < quantityMilli(args.quantityCases) || quantityMilli(source.stockQuantity) < quantityMilli(args.quantityCases)) throw new Error('Conversion exceeds unallocated source stock');
    const supplierLotNumber = lot.supplierLotNumber || lot.lotNumber;
    for (let skip = 0; ; skip += 100) {
      const recalls = requirePrismaSuccess(await tx.inventoryRecall.findMany({ where: { storeId: store.id }, orderBy: { id: 'asc' }, take: 100, skip }), 'inventory recall lookup');
      if (recalls.some((recall: any) => recall.scope?.productId === target.id || (recall.scope?.lots || []).some((scope: any) => scope.productId === target.id && scope.supplierId === (lot.supplierId || null) && scope.supplierLotNumber === supplierLotNumber))) throw new Error('The destination product or supplier batch is in a recorded recall scope');
      if (recalls.length < 100) break;
    }
    const receipt = requirePrismaSuccess(await tx.purchaseReceipt.findFirst({ where: { inventoryLotId: lot.id, storeId: store.id } }), 'purchase receipt lookup');
    const sourceSnapshot = { lotId: lot.id, productId: source.id, productTitle: source.title, productSku: source.sku, unitOfMeasure: source.unitOfMeasure, quantityRemaining: Number(lot.quantityRemaining), costPerUnitCents: Number(lot.costPerUnitCents), supplierId: lot.supplierId || null, supplierLotNumber, expirationDate: new Date(lot.expirationDate).toISOString(), receivedDate: new Date(lot.receivedDate).toISOString(), location: lot.location || '', safetyStatus: lot.safetyStatus, conditionStatus: lot.conditionStatus, receiptId: receipt?.id || null, purchaseOrderId: receipt?.purchaseOrderId || null, poItemId: receipt?.poItemId || null, destinationProductId: target.id, destinationProductTitle: target.title, sourceStockQuantity: Number(source.stockQuantity), destinationStockQuantity: Number(target.stockQuantity), unitsPerCase: plan.unitsPerCase, quantityCases: plan.quantityCases };
    const reviewHash = conversionHash({ fingerprint, sourceSnapshot, plan });
    if (args.mode === 'dry_run') return { success: true, committed: false, reused: false, conversionId: null, reviewHash, source: sourceSnapshot, destinations: plan.lots, totalCostCents: plan.totalCostCents, currencyCode: store.currencyCode };
    if (args.expectedReviewHash !== reviewHash) throw new Error('Physical conversion changed after review; review the current case stock again');
    const nextSourceLot = (quantityMilli(lot.quantityRemaining) - quantityMilli(plan.quantityCases)) / 1000, nextSourceStock = (quantityMilli(source.stockQuantity) - quantityMilli(plan.quantityCases)) / 1000;
    const nextTargetStock = (quantityMilli(target.stockQuantity) + quantityMilli(plan.destinationQuantity)) / 1000;
    requirePrismaSuccess(await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityRemaining: nextSourceLot } }), 'inventory lot balance update');
    requirePrismaSuccess(await tx.product.update({ where: { id: source.id }, data: { stockQuantity: nextSourceStock, inStock: nextSourceStock > 0 } }), 'source product balance update');
    requirePrismaSuccess(await tx.product.update({ where: { id: target.id }, data: { stockQuantity: nextTargetStock, inStock: nextTargetStock > 0 } }), 'destination product balance update');
    const destinations = [];
    for (const [index, split] of plan.lots.entries()) {
      const child = requirePrismaSuccess(await tx.inventoryLot.create({ data: { storeId: store.id, productId: target.id, supplierId: lot.supplierId || null, lotNumber: `C-${idempotencyKey.slice(0, 32)}-${index}`, supplierLotNumber, expirationDate: lot.expirationDate, receivedDate: lot.receivedDate, quantity: split.quantity, quantityRemaining: split.quantity, costPerUnitCents: split.costPerUnitCents, costPerUnit: split.costPerUnitCents / 100, location: destinationLocation || lot.location || '', safetyStatus: 'available', conditionStatus: 'accepted', safetyReason: conditionNote } }), 'destination inventory lot creation');
      destinations.push({ lotId: child.id, productId: target.id, ...split, totalCostCents: split.quantity * split.costPerUnitCents, unitOfMeasure: 'each', supplierLotNumber, supplierId: lot.supplierId || null, expirationDate: sourceSnapshot.expirationDate, receivedDate: sourceSnapshot.receivedDate });
    }
    const record = requirePrismaSuccess(await tx.inventoryConversion.create({ data: { storeId: store.id, idempotencyKey, inputFingerprint: fingerprint, reviewHash, sourceInventoryLotId: lot.id, sourceProductId: source.id, destinationProductId: target.id, quantityCases: plan.quantityCases, unitsPerCase: plan.unitsPerCase, destinationQuantity: plan.destinationQuantity, totalCostCents: plan.totalCostCents, currencyCode: store.currencyCode, sourceSnapshot, destinations, actorId: context.session!.itemId, reason, conditionNote, committedAt: new Date() } }), 'inventory conversion record creation');
    await appendInventoryMovement(tx, { storeId: store.id, productId: source.id, inventoryLotId: lot.id, sourceType: 'case_conversion_out', sourceId: record.id, idempotencyKey: `conversion:${record.id}:source`, actorId: context.session!.itemId, reason, quantityBefore: lot.quantityRemaining, quantityAfter: nextSourceLot, productStockBefore: source.stockQuantity, productStockAfter: nextSourceStock, metadata: { conversionId: record.id, valueDeltaCents: -plan.totalCostCents, destinations, conditionNote } });
    let targetBalance = Number(target.stockQuantity);
    for (const child of destinations) {
      const after = (quantityMilli(targetBalance) + quantityMilli(child.quantity)) / 1000;
      await appendInventoryMovement(tx, { storeId: store.id, productId: target.id, inventoryLotId: child.lotId, sourceType: 'case_conversion_in', sourceId: record.id, idempotencyKey: `conversion:${record.id}:${child.lotId}`, actorId: context.session!.itemId, reason, quantityBefore: 0, quantityAfter: child.quantity, productStockBefore: targetBalance, productStockAfter: after, metadata: { conversionId: record.id, sourceInventoryLotId: lot.id, sourceProductId: source.id, costPerUnitCents: child.costPerUnitCents, valueDeltaCents: child.totalCostCents, supplierLotNumber, conditionNote } });
      targetBalance = after;
    }
    return { success: true, committed: true, reused: false, conversionId: record.id, reviewHash, source: sourceSnapshot, destinations, totalCostCents: plan.totalCostCents, currencyCode: store.currencyCode };
  }, { isolationLevel: 'Serializable' as any }));
}
