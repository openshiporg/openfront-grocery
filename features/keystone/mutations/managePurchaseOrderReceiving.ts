import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { withSerializableRetry } from '../utils/serializableTransaction';

type ReceiptInput = {
  poItemId: string;
  targetQuantityReceived: number;
  lotNumber: string;
  expirationDate: string;
  location?: string | null;
};

type ReceiveArgs = {
  purchaseOrderId: string;
  receipts: ReceiptInput[];
};

type TransitionArgs = {
  purchaseOrderId: string;
  status: 'sent' | 'confirmed' | 'cancelled';
};

async function assertCanManageInventory(context: Context) {
  await requireFreshCapability(context, 'canManageInventory');
}

function assertUniqueReceipts(receipts: ReceiptInput[]) {
  if (!receipts.length) throw new Error('At least one purchase order receipt is required');
  if (new Set(receipts.map((receipt) => receipt.poItemId)).size !== receipts.length) {
    throw new Error('Each purchase order item may appear only once per receipt request');
  }
  for (const receipt of receipts) {
    if (!Number.isInteger(receipt.targetQuantityReceived) || receipt.targetQuantityReceived < 0) {
      throw new Error('Received quantity targets must be non-negative integers');
    }
    if (!receipt.lotNumber.trim()) throw new Error('Each received item requires a lot number');
    const expirationDate = new Date(receipt.expirationDate);
    if (!Number.isFinite(expirationDate.getTime())) throw new Error('Each received item requires a valid expiration date');
    if (expirationDate.getTime() <= Date.now()) throw new Error('Inventory lot expiration date must be in the future');
  }
}

async function lockPurchaseOrder(transactionContext: Context, purchaseOrderId: string) {
  const tx = transactionContext.prisma;
  await tx.$queryRawUnsafe(
    'SELECT "id" FROM "PurchaseOrder" WHERE "id" = $1 FOR UPDATE',
    purchaseOrderId
  );
  await tx.$queryRawUnsafe(
    'SELECT "id" FROM "POItem" WHERE "purchaseOrder" = $1 ORDER BY "id" FOR UPDATE',
    purchaseOrderId
  );
}

async function loadPurchaseOrder(sudoContext: Context, purchaseOrderId: string, storeId: string) {
  const purchaseOrder = await sudoContext.query.PurchaseOrder.findOne({
    where: { id: purchaseOrderId },
    query: `
      id
      store { id }
      poNumber
      status
      receivedAt
      supplier { id }
      items {
        id
        quantity
        quantityReceived
        unitCost
        product { id title stockQuantity inStock }
      }
    `,
  });
  return purchaseOrder?.store?.id === storeId ? purchaseOrder : null;
}

export async function transitionPurchaseOrder(
  _root: unknown,
  { purchaseOrderId, status }: TransitionArgs,
  context: Context
) {
  await assertCanManageInventory(context);
  if (!['sent', 'confirmed', 'cancelled'].includes(status)) {
    throw new Error('Unsupported purchase order transition');
  }
  const store = await requireSessionStore(context);

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    await lockPurchaseOrder(transactionContext, purchaseOrderId);
    const sudoContext = transactionContext.sudo();
    const purchaseOrder = await loadPurchaseOrder(sudoContext, purchaseOrderId, store.id);
    if (!purchaseOrder) throw new Error('Purchase order not found in active store');
    if (purchaseOrder.status === status) {
      return { success: true, purchaseOrderId, status, receivedUnits: 0, message: `Purchase order already ${status}.` };
    }
    if (purchaseOrder.status === 'received' || purchaseOrder.status === 'cancelled') {
      throw new Error('Received and cancelled purchase orders are terminal');
    }
    const allowed =
      (purchaseOrder.status === 'draft' && (status === 'sent' || status === 'cancelled')) ||
      (purchaseOrder.status === 'sent' && (status === 'confirmed' || status === 'cancelled')) ||
      (purchaseOrder.status === 'confirmed' && status === 'cancelled');
    if (!allowed) throw new Error(`Cannot move purchase order from ${purchaseOrder.status} to ${status}`);
    if (status === 'cancelled' && purchaseOrder.items.some((item: any) => Number(item.quantityReceived || 0) > 0)) {
      throw new Error('A purchase order with received inventory cannot be cancelled');
    }

    await sudoContext.db.PurchaseOrder.updateOne({
      where: { id: purchaseOrderId },
      data: { status: status as any },
    });
    return { success: true, purchaseOrderId, status, receivedUnits: 0, message: `Purchase order moved to ${status}.` };
  }, { isolationLevel: 'ReadCommitted' as any }));
}

export async function receivePurchaseOrder(
  _root: unknown,
  { purchaseOrderId, receipts }: ReceiveArgs,
  context: Context
) {
  await assertCanManageInventory(context);
  assertUniqueReceipts(receipts);
  const store = await requireSessionStore(context);

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    await lockPurchaseOrder(transactionContext, purchaseOrderId);
    const sudoContext = transactionContext.sudo();
    const purchaseOrder = await loadPurchaseOrder(sudoContext, purchaseOrderId, store.id);
    if (!purchaseOrder) throw new Error('Purchase order not found in active store');
    if (purchaseOrder.status === 'draft' || purchaseOrder.status === 'cancelled') {
      throw new Error('Only sent or confirmed purchase orders can receive inventory');
    }

    const itemsById = new Map<string, any>(
      (purchaseOrder.items || []).map((item: any) => [item.id, item])
    );
    for (const receipt of receipts) {
      if (!itemsById.has(receipt.poItemId)) throw new Error('Receipt item does not belong to this purchase order');
    }

    const productIds = Array.from(new Set(receipts.map((receipt) => itemsById.get(receipt.poItemId).product?.id).filter(Boolean))).sort() as string[];
    for (const productId of productIds) {
      await transactionContext.prisma.$queryRawUnsafe(
        'SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE',
        productId
      );
      await transactionContext.prisma.$queryRawUnsafe(
        'SELECT "id" FROM "InventoryLot" WHERE "product" = $1 ORDER BY "id" FOR UPDATE',
        productId
      );
    }
    for (const lotNumber of receipts.map((receipt) => receipt.lotNumber.trim()).sort()) {
      await transactionContext.prisma.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext('grocery-po-lot'), hashtext($1))",
        lotNumber
      );
    }

    let receivedUnits = 0;
    const resultingTargets = new Map<string, number>();
    const productStock = new Map<string, number>();
    for (const item of purchaseOrder.items) {
      if (item.product?.id && !productStock.has(item.product.id)) {
        productStock.set(item.product.id, Number(item.product.stockQuantity || 0));
      }
    }
    for (const receipt of receipts) {
      const item = itemsById.get(receipt.poItemId);
      if (!item.product) throw new Error('Purchase order item is missing its product');
      const currentReceived = Number(item.quantityReceived || 0);
      if (receipt.targetQuantityReceived > item.quantity) {
        throw new Error(`Received quantity cannot exceed ordered quantity for ${item.product.title}`);
      }
      if (receipt.targetQuantityReceived < currentReceived) {
        throw new Error(`Received quantity cannot move backward for ${item.product.title}`);
      }
      const quantityDelta = receipt.targetQuantityReceived - item.quantityReceived;
      resultingTargets.set(item.id, receipt.targetQuantityReceived);
      if (quantityDelta === 0) continue;

      const lotNumber = receipt.lotNumber.trim();
      const existingLot = await transactionContext.prisma.inventoryLot.findUnique({
        where: { lotNumber },
        select: { id: true },
      });
      if (existingLot) throw new Error(`Inventory lot ${lotNumber} has already received inventory`);

      await sudoContext.db.InventoryLot.createOne({
        data: {
          store: { connect: { id: store.id } },
          lotNumber,
          expirationDate: new Date(receipt.expirationDate).toISOString(),
          receivedDate: new Date().toISOString(),
          quantity: quantityDelta,
          quantityRemaining: quantityDelta,
          costPerUnit: item.unitCost,
          costPerUnitCents: Math.round(item.unitCost * 100),
          location: receipt.location?.trim() || undefined,
          product: { connect: { id: item.product.id } },
          supplier: purchaseOrder.supplier?.id
            ? { connect: { id: purchaseOrder.supplier.id } }
            : undefined,
        },
      });
      const nextStock = (productStock.get(item.product.id) || 0) + quantityDelta;
      productStock.set(item.product.id, nextStock);
      await sudoContext.db.Product.updateOne({
        where: { id: item.product.id },
        data: { stockQuantity: nextStock, inStock: true },
      });
      await sudoContext.db.POItem.updateOne({
        where: { id: item.id },
        data: { quantityReceived: receipt.targetQuantityReceived },
      });
      receivedUnits += quantityDelta;
    }

    const fullyReceived = purchaseOrder.items.every((item: any) =>
      (resultingTargets.get(item.id) ?? Number(item.quantityReceived || 0)) === item.quantity
    );
    if (fullyReceived && purchaseOrder.status !== 'received') {
      await sudoContext.db.PurchaseOrder.updateOne({
        where: { id: purchaseOrderId },
        data: {
          status: 'received',
          receivedAt: purchaseOrder.receivedAt || new Date().toISOString(),
        },
      });
    }

    return {
      success: true,
      purchaseOrderId,
      status: fullyReceived ? 'received' : purchaseOrder.status,
      receivedUnits,
      message: receivedUnits === 0
        ? 'Purchase order receipt was already applied.'
        : `Received ${receivedUnits} unit${receivedUnits === 1 ? '' : 's'}.`,
    };
  }, { isolationLevel: 'ReadCommitted' as any }));
}
