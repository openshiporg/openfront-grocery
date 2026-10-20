import type { Context } from '.keystone/types';

import { publicError } from '../lib/publicError';
import { publicStore } from '../lib/storeScope';

/**
 * Saves a published product to the signed-in shopper's favorites. FavoriteProduct.productRef is
 * not client-writable, so this trusted path validates the product and links it; saving twice
 * returns the existing favorite.
 */
export async function saveFavoriteProduct(_root: unknown, { productId }: { productId: string }, context: Context) {
  const userId = context.session?.itemId;
  if (!userId) throw publicError('Sign in to save favorites.', 'UNAUTHENTICATED');
  const store = await publicStore(context);
  return context.transaction(async (tx: any) => {
    await tx.prisma.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-favorite'), hashtext($1))", `${userId}:${productId}`);
    const [user, product] = await Promise.all([
      tx.prisma.user.findUnique({ where: { id: userId }, select: { storeId: true, privacyErasedAt: true } }),
      tx.prisma.product.findUnique({ where: { id: String(productId || '') }, select: { id: true, title: true, status: true, storeId: true } }),
    ]);
    if (!user || user.privacyErasedAt || user.storeId !== store.id) throw publicError('Sign in to save favorites.', 'UNAUTHENTICATED');
    if (!product || product.storeId !== store.id || product.status !== 'published') throw publicError('This product is not available to save.');
    const existing = await tx.prisma.favoriteProduct.findFirst({ where: { userId, productRefId: product.id }, select: { id: true } });
    if (existing) return { id: existing.id, productId: product.id, reused: true };
    const favorite = await tx.sudo().db.FavoriteProduct.createOne({ data: { user: { connect: { id: userId } }, product: product.title, productRef: { connect: { id: product.id } } } });
    return { id: favorite.id, productId: product.id, reused: false };
  });
}
