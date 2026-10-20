import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { appendInventoryMovement, quantityMilli } from '../lib/inventoryMovements';
import { traceAffectedOrders } from '../lib/inventorySafety';
import { enqueueGroceryOutboxEvent, canonicalGroceryOutboxPayload } from '../lib/groceryOutbox';
import { requirePrismaSuccess, withSerializableRetry } from '../utils/serializableTransaction';
import { expandConvertedLotScope, lockInventoryConversionScope } from '../lib/inventoryConversion';

type SafetyArgs = { action: string; inventoryLotIds?: string[]; productId?: string; recallId?: string; reason: string; idempotencyKey: string; evidence?: any };
const effectiveDispositions = (events: any[]) => events.filter(event => event.action === 'disposition' && !events.some(later => later.action === 'disposition' && later.evidence?.replacesIdempotencyKey === event.idempotencyKey));

export async function manageInventorySafety(_root: unknown, args: SafetyArgs, context: Context) {
  const { storeId } = await requireFreshCapability(context, 'canManageInventory');
  if (!storeId || !context.session?.itemId) throw new Error('Active store and actor required');
  if (!['hold', 'quarantine', 'release', 'recall', 'notice', 'disposition', 'close'].includes(args.action)) throw new Error('Unsupported safety action');
  if (!args.reason?.trim() || args.idempotencyKey?.trim().length < 12) throw new Error('Safety reason and idempotency key required');
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx: any = transactionContext.prisma;
    requirePrismaSuccess(await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-safety'), hashtext($1))", args.recallId || args.idempotencyKey), 'inventory safety scope lock');
    await lockInventoryConversionScope(tx, storeId);
    const recall = args.recallId
      ? requirePrismaSuccess(await tx.inventoryRecall.findUnique({ where: { id: args.recallId } }), 'recall lookup')
      : args.action === 'recall' ? requirePrismaSuccess(await tx.inventoryRecall.findUnique({ where: { idempotencyKey: args.idempotencyKey } }), 'recall idempotency lookup')
      : null;
    if (recall && recall.storeId !== storeId) throw new Error('Recall not found in active store');
    const events = recall?.events || [];
    const scopeFingerprint = canonicalGroceryOutboxPayload({ action: args.action, productId: args.productId || null, inventoryLotIds: [...new Set(args.inventoryLotIds || [])].sort(), reason: args.reason.trim(), evidence: args.evidence || null });
    const event = { action: args.action, idempotencyKey: args.idempotencyKey, reason: args.reason.trim(), evidence: args.evidence || null, scopeFingerprint, actorId: context.session!.itemId, at: new Date().toISOString() };
    const replay = events.find((value: any) => value.idempotencyKey === args.idempotencyKey);
    if (replay) {
      if (replay.scopeFingerprint !== scopeFingerprint) throw new Error('Safety replay conflicts with original evidence');
      return { success: true, recallId: recall.id, status: recall.status, affectedOrders: recall.affectedOrders, reused: true };
    }
    if (['notice', 'disposition', 'close'].includes(args.action)) {
      if (!recall || recall.status !== 'open') throw new Error('An open recall is required');
      if (args.action === 'notice') {
        if (!(recall.affectedOrders || []).some((order: any) => order.orderId === args.evidence?.orderId)) throw new Error('Notice order is outside recall scope');
        if (!['phone', 'email', 'in_person', 'sms'].includes(args.evidence?.channel) || !['delivered', 'failed', 'unreachable'].includes(args.evidence?.outcome) || !args.evidence?.reference?.trim()) throw new Error('Notice requires channel, outcome and communication reference');
      }
      if (args.action === 'disposition') {
        if (!(recall.scope?.lots || []).some((lot: any) => lot.id === args.evidence?.lotId)) throw new Error('Disposition lot is outside recall scope');
        if (!['released', 'recovered', 'disposed', 'unaccounted'].includes(args.evidence?.disposition) || quantityMilli(args.evidence?.quantity) <= 0 || !args.evidence?.custody?.trim()) throw new Error('Disposition requires positive quantity and custody evidence');
        let replaced: any = null;
        if (args.evidence.replacesIdempotencyKey) {
          replaced = effectiveDispositions(events).find(value => value.idempotencyKey === args.evidence.replacesIdempotencyKey);
          if (!replaced || replaced.evidence.lotId !== args.evidence.lotId || quantityMilli(replaced.evidence.quantity) !== quantityMilli(args.evidence.quantity)) throw new Error('Disposition correction must replace one current outcome for the same lot and quantity');
        }
        const lotScope = recall.scope.lots.find((lot: any) => lot.id === args.evidence.lotId);
        const assigned = effectiveDispositions([...events, event]).filter(value => value.evidence.lotId === args.evidence.lotId).reduce((total, value) => total + quantityMilli(value.evidence.quantity), 0);
        if (assigned > quantityMilli(lotScope.quantity)) throw new Error('Disposition evidence exceeds recalled quantity');
        const stockQuantity = quantityMilli(args.evidence?.stockQuantity ?? 0);
        if (stockQuantity < 0 || stockQuantity > quantityMilli(args.evidence.quantity)) throw new Error('Disposition stock quantity must be between zero and the evidenced quantity');
        const identity = requirePrismaSuccess(await tx.inventoryLot.findUnique({ where: { id: args.evidence.lotId } }), 'disposition lot identity lookup');
        if (!identity || identity.storeId !== storeId) throw new Error('Disposition lot not found in active store');
        requirePrismaSuccess(await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', identity.productId), 'disposition product lock');
        requirePrismaSuccess(await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', identity.id), 'disposition lot lock');
        const lot = requirePrismaSuccess(await tx.inventoryLot.findUnique({ where: { id: identity.id } }), 'disposition lot lookup');
        const product = requirePrismaSuccess(await tx.product.findUnique({ where: { id: identity.productId } }), 'disposition product lookup');
        // Physical effect of an outcome on stock (milli-units).
        const physicalDelta = (evidence: any) => evidence.disposition === 'recovered' ? quantityMilli(evidence.stockQuantity ?? 0)
          : evidence.disposition === 'unaccounted' ? 0 : -quantityMilli(evidence.stockQuantity ?? 0);
        // A correction replaces the earlier outcome's evidence: only the difference
        // between the two physical effects moves stock (the original movement stays
        // in the journal; this is its compensating entry).
        const deltaMilli = physicalDelta(args.evidence) - (replaced ? physicalDelta(replaced.evidence) : 0);
        const delta = deltaMilli;
        const nextLot = (quantityMilli(lot.quantityRemaining) + delta) / 1000;
        const nextProduct = (quantityMilli(product.stockQuantity) + delta) / 1000;
        if (Math.min(nextLot, nextProduct) < 0 || quantityMilli(nextLot) > quantityMilli(lot.quantity)) throw new Error('Disposition exceeds recorded physical stock');
        requirePrismaSuccess(await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityRemaining: nextLot } }), 'disposition lot balance update');
        requirePrismaSuccess(await tx.product.update({ where: { id: product.id }, data: { stockQuantity: nextProduct, inStock: nextProduct > 0 } }), 'disposition product balance update');
        if (delta !== 0 || !replaced) await appendInventoryMovement(tx, { storeId, productId: product.id, inventoryLotId: lot.id, sourceType: replaced ? 'recall_correction' : `recall_${args.evidence.disposition}`, sourceId: recall.id, idempotencyKey: `recall-disposition:${args.idempotencyKey}`, actorId: context.session!.itemId, reason: args.reason, quantityBefore: lot.quantityRemaining, quantityAfter: nextLot, productStockBefore: product.stockQuantity, productStockAfter: nextProduct, metadata: { ...args.evidence, recallId: recall.id, ...(replaced ? { replacesIdempotencyKey: replaced.idempotencyKey, replacedDisposition: replaced.evidence.disposition } : {}) } });
      }
      if (args.action === 'close') {
        for (const lot of recall.scope.lots) {
          const dispositions = effectiveDispositions(events).filter((value: any) => value.evidence.lotId === lot.id);
          const accounted = dispositions.filter((value: any) => value.evidence.disposition !== 'unaccounted').reduce((sum: number, value: any) => sum + quantityMilli(value.evidence.quantity), 0);
          if (accounted !== quantityMilli(lot.quantity) || dispositions.some((value: any) => value.evidence.disposition === 'unaccounted')) throw new Error('Recall quantities must be fully reconciled without unaccounted stock before closure');
        }
        for (const order of recall.affectedOrders || []) {
          if (!events.some((value: any) => value.action === 'notice' && value.evidence.orderId === order.orderId && value.evidence.outcome === 'delivered')) throw new Error('All affected orders require a delivered notice outcome before closure');
        }
      }
      const updated = requirePrismaSuccess(await tx.inventoryRecall.update({ where: { id: recall.id }, data: { events: [...events, event], ...(args.action === 'close' ? { status: 'closed', closedBy: context.session!.itemId, closedAt: new Date(), closure: { reason: args.reason.trim(), evidence: args.evidence || null } } : {}) } }), 'recall evidence update');
      return { success: true, recallId: recall.id, status: updated.status, affectedOrders: recall.affectedOrders, reused: false };
    }
    const ids = [...new Set(args.inventoryLotIds || [])].sort();
    const priorOperation = requirePrismaSuccess(await tx.inventoryMovement.findFirst({ where: { storeId, idempotencyKey: { startsWith: `safety:${args.idempotencyKey}:` } } }), 'safety replay lookup');
    if (priorOperation && priorOperation.metadata?.scopeFingerprint !== scopeFingerprint) throw new Error('Safety replay conflicts with original scope');
    if (!ids.length && !args.productId) throw new Error('Select a product or explicit lot scope');
    const lots: any[] = [];
    for (let skip = 0; ; skip += 100) {
      const page = requirePrismaSuccess(await tx.inventoryLot.findMany({ where: { storeId, ...(ids.length ? { id: { in: ids } } : { productId: args.productId }) }, orderBy: { id: 'asc' }, take: 100, skip }), 'safety lot scope lookup');
      lots.push(...page);
      if (page.length < 100) break;
    }
    if (!lots.length || (ids.length && lots.length !== ids.length)) throw new Error('Lot scope not found in active store');
    const conversionScope = await expandConvertedLotScope(tx, storeId, lots.map(lot => lot.id));
    const descendants = conversionScope.lotIds.filter(id => !lots.some(lot => lot.id === id));
    for (let offset = 0; offset < descendants.length; offset += 100) {
      const requested = descendants.slice(offset, offset + 100);
      const children = requirePrismaSuccess(await tx.inventoryLot.findMany({ where: { storeId, id: { in: requested } } }), 'converted descendant lot lookup');
      if (children.length !== requested.length) throw new Error('Converted descendant lot is missing or outside the active Store');
      lots.push(...children);
    }
    lots.sort((left, right) => left.id.localeCompare(right.id));
    for (const productId of [...new Set(lots.map((lot: any) => lot.productId))].sort()) requirePrismaSuccess(await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId), 'safety product lock');
    for (const lot of lots) requirePrismaSuccess(await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lot.id), 'safety lot lock');
    const affectedOrders: any[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = requirePrismaSuccess(await tx.order.findMany({ where: { storeId }, take: 100, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { user: { select: { email: true } }, lineItems: { include: { inventoryAllocations: true, fulfillment: true } } } }), 'affected order lookup');
      affectedOrders.push(...traceAffectedOrders(page, lots.map((lot: any) => lot.id)));
      if (page.length < 100) break;
      cursor = page[page.length - 1].id;
    }
    let recallId: string | undefined;
    if (args.action === 'recall') {
      const scopeLots = lots.map((lot: any) => {
        const convertedOut = conversionScope.convertedOutMilli.get(lot.id) || 0;
        const attributable = quantityMilli(lot.quantity) - convertedOut;
        if (attributable < 0 || quantityMilli(lot.quantityRemaining) > attributable) throw new Error('Conversion provenance conflicts with original received lot quantity or remaining stock');
        return { id: lot.id, supplierLotNumber: lot.supplierLotNumber || lot.lotNumber, supplierId: lot.supplierId || null, productId: lot.productId, quantity: attributable / 1000, originalQuantity: Number(lot.quantity), convertedOutQuantity: convertedOut / 1000, quantityRemaining: Number(lot.quantityRemaining) };
      });
      const created = requirePrismaSuccess(await tx.inventoryRecall.create({ data: { storeId, idempotencyKey: args.idempotencyKey, reason: args.reason.trim(), status: 'open', openedBy: context.session!.itemId, scope: { productId: args.productId || null, conversionIds: conversionScope.conversions.map(record => record.id), lots: scopeLots }, affectedOrders, events: [event] } }), 'recall record creation');
      recallId = created.id;
      for(const order of affectedOrders) await enqueueGroceryOutboxEvent(tx,{storeId,eventKey:`recall:${created.id}:notice:${order.orderId}`,eventType:'inventory.recall.notice',aggregateType:'Order',aggregateId:order.orderId,occurredAt:new Date().toISOString(),payload:{orderId:order.orderId,recallId:created.id,reason:args.reason.trim()}});
    }
    for (const initial of lots) {
      const lot = requirePrismaSuccess(await tx.inventoryLot.findUnique({ where: { id: initial.id } }), 'safety lot lookup');
      const key = `safety:${args.idempotencyKey}:${lot.id}`;
      const previous = requirePrismaSuccess(await tx.inventoryMovement.findUnique({ where: { idempotencyKey: key } }), 'safety movement replay lookup');
      if (previous) {
        if (previous.storeId !== storeId || previous.sourceType !== `safety_${args.action}` || previous.reason !== args.reason.trim()) throw new Error('Safety replay conflicts with original evidence');
        continue;
      }
      if (args.action === 'release') {
        if (!args.evidence?.inspection?.trim()) throw new Error('Release requires inspection evidence');
        if (lot.safetyStatus === 'recalled') throw new Error('Recalled stock remains excluded; record recall disposition without returning it to sale');
        if (new Date(lot.expirationDate) <= new Date()) throw new Error('Expired stock cannot be released');
      }
      const status = args.action === 'hold' ? 'held' : args.action === 'quarantine' ? 'quarantined' : args.action === 'recall' ? 'recalled' : 'available';
      const product = requirePrismaSuccess(await tx.product.findUnique({ where: { id: lot.productId } }), 'safety product lookup');
      requirePrismaSuccess(await tx.inventoryLot.update({ where: { id: lot.id }, data: { safetyStatus: status, safetyReason: args.reason.trim(), ...(args.action === 'release' ? { conditionStatus: 'accepted' } : {}) } }), 'inventory safety status update');
      await appendInventoryMovement(tx, { storeId, productId: lot.productId, inventoryLotId: lot.id, sourceType: `safety_${args.action}`, sourceId: recallId || lot.id, idempotencyKey: key, actorId: context.session!.itemId, reason: args.reason, quantityBefore: lot.quantityRemaining, quantityAfter: lot.quantityRemaining, productStockBefore: product.stockQuantity, productStockAfter: product.stockQuantity, metadata: { previousStatus: lot.safetyStatus, safetyStatus: status, scopeFingerprint, evidence: args.evidence || null, affectedOrders } });
    }
    return { success: true, recallId: recallId || null, status: args.action === 'recall' ? 'open' : args.action, affectedOrders, reused: false };
  }, { isolationLevel: 'Serializable' as any }));
}
