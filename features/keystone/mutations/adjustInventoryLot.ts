import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { withSerializableRetry } from '../utils/serializableTransaction';

const REASONS = new Set(['cycle_count', 'damage', 'spoilage', 'correction']);

type Args = {
  inventoryLotId: string;
  targetQuantityRemaining: number;
  reason: string;
  idempotencyKey: string;
  note?: string | null;
};

export async function adjustInventoryLot(_root: unknown, args: Args, context: Context) {
  const { storeId } = await requireFreshCapability(context, 'canManageInventory');
  if (!Number.isInteger(args.targetQuantityRemaining) || args.targetQuantityRemaining < 0) {
    throw new Error('Target remaining quantity must be a non-negative integer');
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
    if (args.targetQuantityRemaining > lot.quantity) {
      throw new Error('Target remaining quantity cannot exceed the received lot quantity');
    }

    const quantityBefore = lot.quantityRemaining;
    const quantityDelta = args.targetQuantityRemaining - quantityBefore;
    const productStockBefore = Number(product.stockQuantity || 0);
    const productStockAfter = productStockBefore + quantityDelta;
    if (productStockAfter < 0) throw new Error('Inventory adjustment would make product stock negative');

    const sudoContext = transactionContext.sudo();
    await sudoContext.db.InventoryLot.updateOne({
      where: { id: lot.id },
      data: { quantityRemaining: args.targetQuantityRemaining },
    });
    await sudoContext.db.Product.updateOne({
      where: { id: product.id },
      data: { stockQuantity: productStockAfter, inStock: productStockAfter > 0 },
    });
    const adjustment = await sudoContext.db.InventoryAdjustment.createOne({
      data: {
        idempotencyKey,
        reason: args.reason as any,
        quantityBefore,
        quantityAfter: args.targetQuantityRemaining,
        quantityDelta,
        productStockBefore,
        productStockAfter,
        note: args.note?.trim() || undefined,
        store: { connect: { id: storeId } },
        product: { connect: { id: product.id } },
        inventoryLot: { connect: { id: lot.id } },
        adjustedBy: context.session?.itemId
          ? { connect: { id: context.session.itemId } }
          : undefined,
      },
    });
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
  }, { isolationLevel: 'ReadCommitted' as any }));
}
