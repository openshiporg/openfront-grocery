import { unconvertedLotCapacityMilli } from '../lib/inventoryConversion';
import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { appendInventoryMovement, quantityMilli } from '../lib/inventoryMovements';
import { requirePrismaSuccess, withSerializableRetry } from '../utils/serializableTransaction';

export async function manageInventoryCount(_root: unknown, args: { action: string; inventoryLotId?: string; countId?: string; quantity?: number; reason: string; idempotencyKey: string }, context: Context) {
  const { storeId } = await requireFreshCapability(context, 'canManageInventory');
  if (!storeId || !context.session?.itemId) throw new Error('Active store and actor required');
  if (!['observe', 'recount', 'approve'].includes(args.action)) throw new Error('Unsupported count action');
  if (!args.reason?.trim() || args.idempotencyKey?.trim().length < 12) throw new Error('Count reason and idempotency key required');
  if (args.action !== 'approve' && (args.quantity == null || quantityMilli(args.quantity) < 0)) throw new Error('Non-negative observed quantity required');
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx: any = transactionContext.prisma;
    requirePrismaSuccess(await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-count'), hashtext($1))", args.countId || args.idempotencyKey), 'inventory count lock');
    let count = args.countId
      ? requirePrismaSuccess(await tx.inventoryCount.findUnique({ where: { id: args.countId } }), 'inventory count lookup')
      : requirePrismaSuccess(await tx.inventoryCount.findUnique({ where: { idempotencyKey: args.idempotencyKey } }), 'inventory count lookup');
    if (count && count.storeId !== storeId) throw new Error('Count not found in active store');
    const events = count?.events || [];
    const replay = events.find((event: any) => event.idempotencyKey === args.idempotencyKey);
    if (replay) {
      if (replay.action !== args.action || replay.reason !== args.reason.trim() || replay.quantity !== (args.quantity ?? null) || (args.inventoryLotId && count.inventoryLotId !== args.inventoryLotId)) throw new Error('Count replay conflicts with original input');
      return { success: true, countId: count.id, status: count.status, reused: true };
    }
    if (args.action !== 'observe' && !count) throw new Error('Count not found');
    if (args.action === 'observe' && count) throw new Error('Count already exists');
    const lotId = count?.inventoryLotId || args.inventoryLotId;
    const identity = requirePrismaSuccess(await tx.inventoryLot.findUnique({ where: { id: lotId }, select: { productId: true, storeId: true } }), 'inventory lot ownership lookup');
    if (!identity || identity.storeId !== storeId || !identity.productId) throw new Error('Lot not found in active store');
    requirePrismaSuccess(await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', identity.productId), 'product lock');
    requirePrismaSuccess(await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId), 'lot lock');
    const lot = requirePrismaSuccess(await tx.inventoryLot.findUnique({ where: { id: lotId } }), 'locked lot lookup');
    const event = { action: args.action, idempotencyKey: args.idempotencyKey, reason: args.reason.trim(), quantity: args.quantity ?? null, actorId: context.session!.itemId, at: new Date().toISOString() };
    if (args.action === 'observe') {
      count = requirePrismaSuccess(await tx.inventoryCount.create({ data: { storeId, inventoryLotId: lotId, productId: identity.productId, idempotencyKey: args.idempotencyKey, status: 'observed', expectedQuantity: lot.quantityRemaining, observedQuantity: args.quantity, reason: args.reason.trim(), observedBy: context.session!.itemId, events: [event] } }), 'inventory count creation');
    } else if (args.action === 'recount') {
      if (count.status !== 'observed') throw new Error('Only an observed count can be recounted');
      count = requirePrismaSuccess(await tx.inventoryCount.update({ where: { id: count.id }, data: { status: 'recounted', recountQuantity: args.quantity, recountedBy: context.session!.itemId, events: [...events, event] } }), 'inventory recount update');
    } else {
      if (count.status === 'approved') throw new Error('Count is already approved');
      const variance = quantityMilli(count.observedQuantity) !== quantityMilli(count.expectedQuantity);
      if (variance && count.status !== 'recounted') throw new Error('A count variance requires a recount before approval');
      if (count.observedBy === context.session!.itemId || count.recountedBy === context.session!.itemId) throw new Error('A different inventory operator must approve the count');
      if (quantityMilli(lot.quantityRemaining) !== quantityMilli(count.expectedQuantity)) throw new Error('Stock changed since observation; start a fresh count');
      const target = Number(count.status === 'recounted' ? count.recountQuantity : count.observedQuantity);
      if (quantityMilli(target) > await unconvertedLotCapacityMilli(tx, storeId, lot)) throw new Error('Count exceeds received quantity remaining after case conversions; reconcile receipt provenance first');
      const product = requirePrismaSuccess(await tx.product.findUnique({ where: { id: identity.productId } }), 'product lookup');
      const nextStock = (quantityMilli(product.stockQuantity) + quantityMilli(target) - quantityMilli(lot.quantityRemaining)) / 1000;
      if (nextStock < 0) throw new Error('Count would make product stock negative');
      requirePrismaSuccess(await tx.inventoryLot.update({ where: { id: lotId }, data: { quantityRemaining: target } }), 'inventory lot balance update');
      requirePrismaSuccess(await tx.product.update({ where: { id: product.id }, data: { stockQuantity: nextStock, inStock: nextStock > 0 } }), 'product stock update');
      await appendInventoryMovement(tx, { storeId, productId: product.id, inventoryLotId: lotId, sourceType: 'approved_count', sourceId: count.id, idempotencyKey: `count:${args.idempotencyKey}`, actorId: context.session!.itemId, reason: args.reason, quantityBefore: lot.quantityRemaining, quantityAfter: target, productStockBefore: product.stockQuantity, productStockAfter: nextStock });
      count = requirePrismaSuccess(await tx.inventoryCount.update({ where: { id: count.id }, data: { status: 'approved', approvedBy: context.session!.itemId, approvedAt: new Date(), events: [...events, event] } }), 'inventory count approval');
    }
    return { success: true, countId: count.id, status: count.status, reused: false };
  }, { isolationLevel: 'Serializable' as any }));
}
