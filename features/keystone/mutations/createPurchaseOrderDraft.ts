import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { withSerializableRetry } from '../utils/serializableTransaction';

type DraftItemInput = { productId: string; quantity: number; unitCost: number };
type DraftArgs = {
  idempotencyKey: string;
  supplierId: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  items: DraftItemInput[];
};

function validateDraft(args: DraftArgs) {
  if (args.idempotencyKey.trim().length < 12) throw new Error('A valid purchase order idempotency key is required');
  if (!args.supplierId) throw new Error('A supplier is required');
  if (!args.items.length) throw new Error('At least one purchase order item is required');
  if (new Set(args.items.map((item) => item.productId)).size !== args.items.length) {
    throw new Error('Each product may appear only once in a purchase order draft');
  }
  for (const item of args.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error('PO quantities must be positive integers');
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0 || Math.abs(item.unitCost * 100 - Math.round(item.unitCost * 100)) > 1e-8) {
      throw new Error('PO unit costs must be non-negative amounts with at most two decimal places');
    }
  }
  if (args.expectedDeliveryDate && !Number.isFinite(new Date(args.expectedDeliveryDate).getTime())) {
    throw new Error('Expected delivery date is invalid');
  }
}

export async function createPurchaseOrderDraft(
  _root: unknown,
  args: DraftArgs,
  context: Context
) {
  await requireFreshCapability(context, 'canManageInventory');
  validateDraft(args);
  const idempotencyKey = args.idempotencyKey.trim();
  const store = await requireSessionStore(context);

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-po-draft'), hashtext('numbering'))"
    );
    const sudoContext = transactionContext.sudo();
    const existing = await sudoContext.query.PurchaseOrder.findOne({
      where: { idempotencyKey },
      query: 'id poNumber status totalAmount store { id } items { id }',
    });
    if (existing && existing.store?.id !== store.id) throw new Error('Purchase order idempotency key belongs to another store');
    if (existing) {
      return {
        success: true,
        purchaseOrderId: existing.id,
        poNumber: existing.poNumber,
        status: existing.status,
        totalAmount: Number(existing.totalAmount || 0),
        itemCount: existing.items?.length || 0,
        reused: true,
      };
    }

    const supplier = await tx.supplier.findUnique({
      where: { id: args.supplierId },
      select: { id: true, name: true, email: true, storeId: true },
    });
    if (!supplier || supplier.storeId !== store.id) throw new Error('Supplier not found in active store');
    const productIds = args.items.map((item) => item.productId).sort();
    for (const productId of productIds) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR SHARE', productId);
    }
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, storeId: store.id },
      select: { id: true, title: true, sku: true },
    });
    if (products.length !== productIds.length) throw new Error('One or more purchase order products were not found');
    const productsById = new Map(products.map((product) => [product.id, product]));

    const now = new Date();
    const prefix = `PO-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const latest = await tx.purchaseOrder.findFirst({
      where: { poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
      select: { poNumber: true },
    });
    const latestSequence = Number.parseInt(latest?.poNumber.slice(prefix.length + 1) || '0', 10) || 0;
    const poNumber = `${prefix}-${String(latestSequence + 1).padStart(4, '0')}`;
    const totalAmountCents = args.items.reduce((sum, item) => sum + item.quantity * Math.round(item.unitCost * 100), 0);
    const totalAmount = totalAmountCents / 100;

    const purchaseOrder = await sudoContext.db.PurchaseOrder.createOne({
      data: {
        store: { connect: { id: store.id } },
        poNumber,
        idempotencyKey,
        status: 'draft',
        supplierName: supplier.name,
        supplierEmail: supplier.email,
        orderDate: now.toISOString(),
        expectedDeliveryDate: args.expectedDeliveryDate
          ? new Date(args.expectedDeliveryDate).toISOString()
          : undefined,
        totalAmount,
        totalAmountCents,
        notes: args.notes?.trim() || undefined,
        supplier: { connect: { id: supplier.id } },
      },
    });
    for (const item of args.items) {
      const product = productsById.get(item.productId)!;
      await sudoContext.db.POItem.createOne({
        data: {
          productTitle: product.title,
          productSku: product.sku,
          quantity: item.quantity,
          unitCost: item.unitCost,
          unitCostCents: Math.round(item.unitCost * 100),
          quantityReceived: 0,
          purchaseOrder: { connect: { id: purchaseOrder.id } },
          product: { connect: { id: item.productId } },
        },
      });
    }
    return {
      success: true,
      purchaseOrderId: purchaseOrder.id,
      poNumber,
      status: 'draft',
      totalAmount,
      itemCount: args.items.length,
      reused: false,
    };
  }, { isolationLevel: 'ReadCommitted' as any }));
}
