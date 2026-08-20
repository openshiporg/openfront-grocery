import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { withSerializableRetry } from '../utils/serializableTransaction';

type Args = {
  purchaseOrderId: string;
  poItemId: string;
};

export async function removePurchaseOrderDraftItem(
  _root: unknown,
  { purchaseOrderId, poItemId }: Args,
  context: Context
) {
  const { storeId } = await requireFreshCapability(context, 'canManageInventory');
  if (!purchaseOrderId || !poItemId) throw new Error('Purchase order and item are required');

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const sudoContext = transactionContext.sudo();
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "PurchaseOrder" WHERE "id" = $1 FOR UPDATE',
      purchaseOrderId
    );
    const purchaseOrder = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { id: true, status: true, totalAmount: true, storeId: true },
    });
    if (!purchaseOrder || purchaseOrder.storeId !== storeId) throw new Error('Purchase order not found in active store');
    if (purchaseOrder.status !== 'draft') throw new Error('Only draft purchase orders can remove items');

    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "POItem" WHERE "id" = $1 FOR UPDATE',
      poItemId
    );
    const items = await tx.pOItem.findMany({
      where: { purchaseOrderId },
      select: { id: true, quantity: true, unitCost: true, unitCostCents: true },
      orderBy: { id: 'asc' },
    });
    const item = items.find((candidate) => candidate.id === poItemId);
    if (!item) {
      return {
        success: true,
        purchaseOrderId,
        removedItemId: poItemId,
        itemCount: items.length,
        totalAmount: Number(purchaseOrder.totalAmount || 0),
        reused: true,
      };
    }
    if (items.length <= 1) throw new Error('Purchase order drafts must retain at least one item');

    const remainingItems = items.filter((candidate) => candidate.id !== poItemId);
    const totalAmountCents = remainingItems.reduce(
      (sum, candidate) => sum + candidate.quantity * candidate.unitCostCents,
      0,
    );
    const totalAmount = totalAmountCents / 100;
    await sudoContext.db.POItem.deleteOne({ where: { id: poItemId } });
    await sudoContext.db.PurchaseOrder.updateOne({
      where: { id: purchaseOrderId },
      data: { totalAmount, totalAmountCents },
    });

    return {
      success: true,
      purchaseOrderId,
      removedItemId: poItemId,
      itemCount: remainingItems.length,
      totalAmount,
      reused: false,
    };
  }, { isolationLevel: 'ReadCommitted' as any }));
}
