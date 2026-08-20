import type { Context } from '.keystone/types';
import { requireSellableStoreProduct, type SellableStoreProduct } from './sellableInventory';

export async function requireStoreProduct(
  context: Context,
  productId: string,
  storeId: string,
  options: { publishedOnly?: boolean } = {},
): Promise<SellableStoreProduct> {
  if (options.publishedOnly === false) {
    throw new Error('Storefront product authority requires a published product');
  }
  return requireSellableStoreProduct(context, productId, storeId);
}

export function assertProductStore(product: { store?: { id?: string } | null }, storeId: string) {
  if (product.store?.id !== storeId) throw new Error('Related product must belong to the active store');
}
