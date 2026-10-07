import { unconvertedLotCapacityMilli } from '../lib/inventoryConversion';
import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { appendInventoryMovement, quantityMilli } from '../lib/inventoryMovements';
import { withSerializableRetry } from '../utils/serializableTransaction';

const REASONS = new Set(['damage', 'spoilage', 'correction']);

type Args = {
  inventoryLotId: string;
  targetQuantityRemaining: number;
  reason: string;
  idempotencyKey: string;
  note?: string | null;
};

export async function adjustInventoryLot(_root: unknown, args: Args, context: Context) {
  const { storeId } = await requireFreshCapability(context, 'canManageInventory');
  if (quantityMilli(args.targetQuantityRemaining) < 0) {
    throw new Error('Target remaining quantity must be a non-negative quantity with at most three decimal places');
  }
  if (!REASONS.has(args.reason)) throw new Error('Unsupported inventory adjustment reason');
  if (args.idempotencyKey.trim().length < 12) throw new Error('A valid inventory adjustment idempotency key is required');
  const idempotencyKey = args.idempotencyKey.trim();

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-inventory-adjustment'), hashtext($1))",
      idempotencyKey
    );
    const existing = await tx.inventoryAdjustment.findUnique({ where: { idempotencyKey } });
    if (existing && existing.storeId !== storeId) throw new Error('Inventory adjustment idempotency key belongs to another store');
    if (existing) {
      if (existing.inventoryLotId !== args.inventoryLotId || quantityMilli(existing.quantityAfter) !== quantityMilli(args.targetQuantityRemaining) || existing.reason !== args.reason || (existing.note || '') !== (args.note?.trim() || '')) throw new Error('Inventory adjustment replay conflicts with original inputs');
      return {
        success: true,
        adjustmentId: existing.id,
        inventoryLotId: existing.inventoryLotId,
        productId: existing.productId,
        quantityDelta: existing.quantityDelta,
        quantityRemaining: existing.quantityAfter,
        productStock: existing.productStockAfter,
        reused: true,
      };
    }

    const identity = await tx.inventoryLot.findUnique({ where: { id: args.inventoryLotId }, select: { productId: true, storeId: true } });
    if (!identity || identity.storeId !== storeId || !identity.productId) throw new Error('Inventory lot not found in active store');
    await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', identity.productId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', args.inventoryLotId);
    const lot = await tx.inventoryLot.findUnique({
      where: { id: args.inventoryLotId },
      select: { id: true, quantity: true, quantityRemaining: true, productId: true, storeId: true },
    });
    if (!lot || lot.storeId !== storeId) throw new Error('Inventory lot not found in active store');
    if (!lot?.productId) throw new Error('Inventory lot or related product not found');
    const activeAllocations = await tx.orderLineInventoryAllocation.count({
      where: {
        inventoryLotId: lot.id,
        lineItem: { order: { status: { notIn: ['delivered', 'cancelled'] } } },
      },
    });
    if (activeAllocations > 0) {
      throw new Error('Inventory lots reserved by active orders must be released or fulfilled before adjustment');
    }
    await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', lot.productId);
    const product = await tx.product.findUnique({
      where: { id: lot.productId },
      select: { id: true, stockQuantity: true },
    });
    if (!product) throw new Error('Inventory product not found');
    if (quantityMilli(args.targetQuantityRemaining) > await unconvertedLotCapacityMilli(tx, storeId!, lot)) {
      throw new Error('Target remaining quantity cannot exceed the received lot quantity');
    }

    const quantityBefore = Number(lot.quantityRemaining);
    const quantityDelta = (quantityMilli(args.targetQuantityRemaining) - quantityMilli(quantityBefore)) / 1000;
    const productStockBefore = Number(product.stockQuantity || 0);
    const productStockAfter = (quantityMilli(productStockBefore) + quantityMilli(quantityDelta)) / 1000;
    if (productStockAfter < 0) throw new Error('Inventory adjustment would make product stock negative');

    // Decimal fields are source-owned; generated Context types await the reviewed migration.
    const sudoContext: any = transactionContext.sudo();
    await sudoContext.db.InventoryLot.updateOne({
      where: { id: lot.id },
      data: { quantityRemaining: String(args.targetQuantityRemaining) },
    });
    await sudoContext.db.Product.updateOne({
      where: { id: product.id },
      data: { stockQuantity: String(productStockAfter), inStock: productStockAfter > 0 },
    });
    const adjustment = await sudoContext.db.InventoryAdjustment.createOne({
      data: {
        idempotencyKey,
        reason: args.reason as any,
        quantityBefore: String(quantityBefore),
        quantityAfter: String(args.targetQuantityRemaining),
        quantityDelta: String(quantityDelta),
        productStockBefore: String(productStockBefore),
        productStockAfter: String(productStockAfter),
        note: args.note?.trim() || undefined,
        store: { connect: { id: storeId } },
        product: { connect: { id: product.id } },
        inventoryLot: { connect: { id: lot.id } },
        adjustedBy: context.session?.itemId
          ? { connect: { id: context.session.itemId } }
          : undefined,
      },
    });
    await appendInventoryMovement(tx, { storeId: storeId!, productId: product.id, inventoryLotId: lot.id, sourceType: args.reason === 'spoilage' || args.reason === 'damage' ? 'waste' : 'manual_adjustment', sourceId: adjustment.id, idempotencyKey: `adjustment:${idempotencyKey}`, actorId: context.session?.itemId, reason: args.note?.trim() || args.reason, quantityBefore, quantityAfter: args.targetQuantityRemaining, productStockBefore, productStockAfter });
    return {
      success: true,
      adjustmentId: adjustment.id,
      inventoryLotId: lot.id,
      productId: product.id,
      quantityDelta,
      quantityRemaining: args.targetQuantityRemaining,
      productStock: productStockAfter,
      reused: false,
    };
  }, { isolationLevel: 'Serializable' as any }));
}
