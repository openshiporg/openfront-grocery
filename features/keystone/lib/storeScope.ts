import type { Context } from '.keystone/types';

export const JUNIPER_STORE_ID = 'store_juniper';

export async function requireSessionStore(context: Context) {
  if (!context.session?.itemId) throw new Error('Store-scoped operation requires authentication');
  const user = await (context.prisma as any).user.findUnique({
    where: { id: context.session.itemId },
    select: { privacyErasedAt: true, storeId: true, store: { select: { id: true, code: true, name: true, isActive: true, timezone: true, currencyCode: true } } },
  });
  if (user?.privacyErasedAt) throw new Error('This account has completed an erasure request');
  if (!user?.storeId || !user.store?.isActive) throw new Error('Active store scope is required');
  return user.store;
}

export async function publicStore(context: Context) {
  const publicStoreId = process.env.PUBLIC_STORE_ID || JUNIPER_STORE_ID;
  const store = await context.prisma.store.findFirst({ where: { id: publicStoreId, isActive: true } });
  if (!store) throw new Error('No active grocery store is configured');
  return store;
}

/**
 * Inside a transaction: share-lock the signed-in account row and re-check that
 * it is not erased and still belongs to an active Store. Customer erasure takes
 * this row FOR UPDATE first, so an operation holding the share lock either
 * commits before the erasure or sees the erased account and stops — it can
 * never recreate customer data afterwards. Take this lock before any cart/list
 * row lock to keep one lock order with erasure.
 */
export async function lockCurrentCustomer(transactionContext: Context) {
  const userId = transactionContext.session?.itemId;
  if (!userId) throw new Error('Store-scoped operation requires authentication');
  const rows = await transactionContext.prisma.$queryRawUnsafe<Array<{ storeId: string | null; privacyErasedAt: Date | null }>>(
    'SELECT "store" AS "storeId", "privacyErasedAt" FROM "User" WHERE "id" = $1 FOR SHARE',
    userId,
  );
  const user = rows[0];
  if (!user) throw new Error('Store-scoped operation requires authentication');
  if (user.privacyErasedAt) throw new Error('This account has completed an erasure request');
  const store = user.storeId
    ? await transactionContext.prisma.store.findUnique({ where: { id: user.storeId }, select: { id: true, isActive: true } })
    : null;
  if (!store?.isActive) throw new Error('Active store scope is required');
  return store;
}
