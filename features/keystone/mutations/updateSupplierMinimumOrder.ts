import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';

export async function updateSupplierMinimumOrder(_root: unknown, { supplierId, minimumOrderCents }: { supplierId: string; minimumOrderCents: number }, context: Context) {
  await requireFreshCapability(context, 'canManageSuppliers');
  const store = await requireSessionStore(context);
  if (!Number.isInteger(minimumOrderCents) || minimumOrderCents < 0) throw new Error('Minimum order must be a non-negative integer number of cents');
  return context.transaction(async (transactionContext) => {
    const supplier = await transactionContext.prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, storeId: true } });
    if (!supplier || supplier.storeId !== store.id) throw new Error('Supplier not found in active store');
    const updated = await transactionContext.prisma.supplier.update({ where: { id: supplier.id }, data: { minimumOrderCents, minimumOrder: minimumOrderCents / 100 }, select: { id: true, minimumOrder: true, minimumOrderCents: true } });
    return { success: true, ...updated };
  });
}
