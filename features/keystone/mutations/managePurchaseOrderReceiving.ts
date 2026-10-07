import {enqueueGroceryOutboxEvent} from "../lib/groceryOutbox";
import { createHash } from 'node:crypto';
import { appendInventoryMovement, quantityMilli } from '../lib/inventoryMovements';
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
  receiptKey?: string | null;
  deliveryReference?: string | null;
  conditionStatus?: string | null;
  inspectionNote?: string | null;
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

export function receiptQuantityDelta({
  targetQuantityReceived,
  orderedQuantity,
  currentQuantityReceived,
  productTitle,
}: {
  targetQuantityReceived: number;
  orderedQuantity: number;
  currentQuantityReceived: number;
  productTitle: string;
}) {
  quantityMilli(targetQuantityReceived); quantityMilli(orderedQuantity); quantityMilli(currentQuantityReceived);
  if (targetQuantityReceived > orderedQuantity) {
    throw new Error(`Received quantity cannot exceed ordered quantity for ${productTitle}`);
  }
  if (targetQuantityReceived < currentQuantityReceived) {
    throw new Error(`Received quantity cannot move backward for ${productTitle}`);
  }
  return (quantityMilli(targetQuantityReceived) - quantityMilli(currentQuantityReceived)) / 1000;
}

function assertUniqueReceipts(receipts: ReceiptInput[]) {
  if (!receipts.length) throw new Error('At least one purchase order receipt is required');
  if (new Set(receipts.map((receipt) => receipt.poItemId)).size !== receipts.length) {
    throw new Error('Each purchase order item may appear only once per receipt request');
  }
  for (const receipt of receipts) {
    if (quantityMilli(receipt.targetQuantityReceived) < 0) {
      throw new Error('Received quantity targets must be non-negative quantities with at most three decimal places');
    }
    if (!['accepted', 'inspection_pending', 'rejected'].includes(receipt.conditionStatus || 'accepted')) throw new Error('Invalid receipt inspection condition');
    if (receipt.conditionStatus && receipt.conditionStatus !== 'accepted' && !receipt.inspectionNote?.trim()) throw new Error('Inspection exception requires evidence');
    if (!receipt.lotNumber.trim()) throw new Error('Each received item requires a lot number');
    const expirationDate = new Date(receipt.expirationDate);
    if (!Number.isFinite(expirationDate.getTime())) throw new Error('Each received item requires a valid expiration date');
    if (receipt.receiptKey != null && receipt.receiptKey.trim().length < 12) throw new Error('Receipt idempotency key must contain at least 12 characters');
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
      supplier { id name email store { id } }
      items {
        id
        quantity
        quantityReceived
        productTitle productSku unitCost unitCostCents
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
    // Decimal fields are source-owned; generated Context types await the reviewed migration.
    const sudoContext: any = transactionContext.sudo();
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

    if(status==='sent') {
      const supplier:any=purchaseOrder.supplier;
      if(!supplier || supplier.store?.id!==store.id || !supplier.email?.trim())throw new Error('Purchase order needs a same-Store supplier email before sending');
      await enqueueGroceryOutboxEvent(transactionContext.prisma,{storeId:store.id,eventKey:`purchase-order:${purchaseOrderId}:send`,eventType:'purchase_order.send_requested',aggregateType:'PurchaseOrder',aggregateId:purchaseOrderId,occurredAt:new Date().toISOString(),payload:{purchaseOrderId,supplierId:supplier.id,recipient:supplier.email,poNumber:purchaseOrder.poNumber,currencyCode:store.currencyCode,lines:purchaseOrder.items.map((item:any)=>({title:item.productTitle || item.product?.title,sku:item.productSku,quantity:Number(item.quantity),unitCostCents:Number(item.unitCostCents)}))}});
    }
    await sudoContext.db.PurchaseOrder.updateOne({
      where: { id: purchaseOrderId },
      data: { status: status as any },
    });
    return { success: true, purchaseOrderId, status, receivedUnits: 0, message: status==='sent'?'Purchase order queued for supplier delivery; inspect Communications for the delivery outcome.':`Purchase order moved to ${status}.` };
  }, { isolationLevel: 'Serializable' as any }));
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
    // Decimal fields are source-owned; generated Context types await the reviewed migration.
    const sudoContext: any = transactionContext.sudo();
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
      const receiptKey = receipt.receiptKey?.trim() || `receipt:${purchaseOrderId}:${item.id}:${receipt.targetQuantityReceived}`;
      const existingReceipt = await (transactionContext.prisma as any).purchaseReceipt.findUnique({ where: { idempotencyKey: receiptKey } });
      if (existingReceipt) {
        if (existingReceipt.storeId !== store.id || existingReceipt.poItemId !== item.id || existingReceipt.supplierLotNumber !== receipt.lotNumber.trim() || quantityMilli(existingReceipt.targetQuantityReceived) !== quantityMilli(receipt.targetQuantityReceived) || existingReceipt.conditionStatus !== (receipt.conditionStatus || 'accepted') || (existingReceipt.inspectionNote || '') !== (receipt.inspectionNote?.trim() || '') || (existingReceipt.deliveryReference || '') !== (receipt.deliveryReference?.trim() || '') || new Date(existingReceipt.expirationDate).getTime() !== new Date(receipt.expirationDate).getTime()) throw new Error('Receipt replay conflicts with original delivery evidence');
        resultingTargets.set(item.id, Number(item.quantityReceived || 0));
        continue;
      }
      const currentReceived = Number(item.quantityReceived || 0);
      const quantityDelta = receiptQuantityDelta({
        targetQuantityReceived: receipt.targetQuantityReceived,
        orderedQuantity: Number(item.quantity),
        currentQuantityReceived: currentReceived,
        productTitle: item.product.title,
      });
      resultingTargets.set(item.id, receipt.targetQuantityReceived);
      if (quantityDelta === 0) continue;
      if (new Date(receipt.expirationDate).getTime() <= Date.now()) throw new Error('Inventory lot expiration date must be in the future');

      const supplierLotNumber = receipt.lotNumber.trim();
      const batchRecalls: any[] = [];
      for (let skip = 0; ; skip += 100) {
        const page = await (transactionContext.prisma as any).inventoryRecall.findMany({ where: { storeId: store.id }, orderBy: { id: 'asc' }, take: 100, skip });
        batchRecalls.push(...page.filter((recall: any) => recall.scope?.productId === item.product.id || (recall.scope?.lots || []).some((lot: any) => lot.productId === item.product.id && lot.supplierId === (purchaseOrder.supplier?.id || null) && lot.supplierLotNumber === supplierLotNumber)));
        if (page.length < 100) break;
      }
      const lotNumber = `R-${createHash('sha256').update(`${store.id}:${receiptKey}`).digest('hex').slice(0, 32)}`;
      const lot = await sudoContext.db.InventoryLot.createOne({
        data: {
          store: { connect: { id: store.id } },
          lotNumber,
          supplierLotNumber,
          safetyStatus: batchRecalls.length ? 'recalled' : (receipt.conditionStatus || 'accepted') === 'accepted' ? 'available' : 'quarantined',
          conditionStatus: receipt.conditionStatus || 'accepted',
          safetyReason: receipt.inspectionNote?.trim() || undefined,
          expirationDate: new Date(receipt.expirationDate).toISOString(),
          receivedDate: new Date().toISOString(),
          quantity: String(quantityDelta),
          quantityRemaining: String(quantityDelta),
          costPerUnit: item.unitCost,
          costPerUnitCents: Number(item.unitCostCents ?? Math.round(Number(item.unitCost) * 100)),
          location: receipt.location?.trim() || undefined,
          product: { connect: { id: item.product.id } },
          supplier: purchaseOrder.supplier?.id
            ? { connect: { id: purchaseOrder.supplier.id } }
            : undefined,
        },
      });
      for (const recall of batchRecalls) {
        await (transactionContext.prisma as any).inventoryRecall.update({ where: { id: recall.id }, data: { status: 'open', ...(recall.status === 'closed' ? { closedAt: null, closedBy: '' } : {}), scope: { ...recall.scope, lots: [...recall.scope.lots, { id: lot.id, supplierLotNumber, supplierId: purchaseOrder.supplier?.id || null, productId: item.product.id, quantity: quantityDelta, quantityRemaining: quantityDelta }] }, events: [...(recall.events || []), { action: recall.status === 'closed' ? 'reopened_for_receipt' : 'receipt_join', idempotencyKey: receiptKey, actorId: context.session?.itemId, at: new Date().toISOString(), reason: 'New delivery matches active recall scope', evidence: { inventoryLotId: lot.id, quantity: quantityDelta } }] } });
      }
      const stockBefore = productStock.get(item.product.id) || 0;
      const nextStock = (quantityMilli(stockBefore) + quantityMilli(quantityDelta)) / 1000;
      const receiptRecord = await (transactionContext.prisma as any).purchaseReceipt.create({ data: { storeId: store.id, purchaseOrderId, poItemId: item.id, inventoryLotId: lot.id, productId: item.product.id, supplierId: purchaseOrder.supplier?.id || null, idempotencyKey: receiptKey, supplierLotNumber, deliveryReference: receipt.deliveryReference?.trim() || '', quantity: quantityDelta, targetQuantityReceived: receipt.targetQuantityReceived, unitCostCents: Number(item.unitCostCents ?? Math.round(Number(item.unitCost) * 100)), conditionStatus: receipt.conditionStatus || 'accepted', inspectionNote: receipt.inspectionNote?.trim() || '', receivedBy: context.session?.itemId, expirationDate: new Date(receipt.expirationDate) } });
      await appendInventoryMovement(transactionContext.prisma, { storeId: store.id, productId: item.product.id, inventoryLotId: lot.id, sourceType: 'purchase_receipt', sourceId: receiptRecord.id, idempotencyKey: `movement:${receiptKey}`, actorId: context.session?.itemId, reason: receipt.inspectionNote?.trim() || (batchRecalls.length ? 'Purchase receipt held by active recall' : 'Purchase receipt accepted'), quantityBefore: 0, quantityAfter: quantityDelta, productStockBefore: stockBefore, productStockAfter: nextStock, metadata: { purchaseOrderId, poItemId: item.id, supplierLotNumber, conditionStatus: receipt.conditionStatus || 'accepted' } });
      productStock.set(item.product.id, nextStock);
      await sudoContext.db.Product.updateOne({
        where: { id: item.product.id },
        data: { stockQuantity: String(nextStock), inStock: true },
      });
      await sudoContext.db.POItem.updateOne({
        where: { id: item.id },
        data: { quantityReceived: String(receipt.targetQuantityReceived) },
      });
      receivedUnits += quantityDelta;
    }

    const fullyReceived = purchaseOrder.items.every((item: any) =>
      (resultingTargets.get(item.id) ?? Number(item.quantityReceived || 0)) === Number(item.quantity)
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
  }, { isolationLevel: 'Serializable' as any }));
}
