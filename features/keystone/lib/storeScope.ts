import type { Context } from '.keystone/types';

export const JUNIPER_STORE_ID = 'store_juniper';

export async function requireSessionStore(context: Context) {
  if (!context.session?.itemId) throw new Error('Store-scoped operation requires authentication');
  const user = await context.prisma.user.findUnique({
    where: { id: context.session.itemId },
    select: { storeId: true, store: { select: { id: true, code: true, name: true, isActive: true, timezone: true, currencyCode: true } } },
  });
  if (!user?.storeId || !user.store?.isActive) throw new Error('Active store scope is required');
  return user.store;
}

export async function publicStore(context: Context) {
  const publicStoreId = process.env.PUBLIC_STORE_ID || JUNIPER_STORE_ID;
  const store = await context.prisma.store.findFirst({ where: { id: publicStoreId, isActive: true } });
  if (!store) throw new Error('No active grocery store is configured');
  return store;
}
