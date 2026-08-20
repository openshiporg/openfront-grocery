import type { Context } from '.keystone/types';

export type SellableInventoryLot = {
  id?: string;
  expirationDate: Date | string;
  quantityRemaining: number | null;
  store?: { id?: string | null } | null;
};

export type SellableProductInventory = {
  id: string;
  title?: string | null;
  stockQuantity?: number | null;
  store?: { id?: string | null } | null;
  inventoryLots?: SellableInventoryLot[] | null;
};

export type SellableStoreProduct = SellableProductInventory & Record<string, any> & {
  sellableQuantity: number;
  stockQuantity: number;
  inStock: boolean;
};

export function deriveSellableQuantity(
  product: SellableProductInventory,
  storeId: string,
  now = new Date(),
) {
  if (product.store?.id !== storeId) return 0;
  const unexpiredLotQuantity = (product.inventoryLots || []).reduce((total, lot) => {
    if (lot.store?.id !== storeId) return total;
    const remaining = Math.max(0, Math.trunc(Number(lot.quantityRemaining || 0)));
    const expiresAt = new Date(lot.expirationDate).getTime();
    return remaining > 0 && Number.isFinite(expiresAt) && expiresAt > now.getTime()
      ? total + remaining
      : total;
  }, 0);
  return unexpiredLotQuantity;
}

export function sellableInventoryMessage(productName: string, sellableQuantity: number) {
  return sellableQuantity > 0
    ? `Only ${sellableQuantity} ${sellableQuantity === 1 ? 'unit is' : 'units are'} currently available for ${productName}`
    : `${productName} is out of stock because no unexpired inventory is available. Remove it from your basket or request a back-in-stock alert.`;
}

export function assertSellableQuantity(
  product: SellableProductInventory,
  storeId: string,
  requestedQuantity: number,
  now = new Date(),
) {
  const sellableQuantity = deriveSellableQuantity(product, storeId, now);
  if (sellableQuantity < requestedQuantity) {
    throw new Error(sellableInventoryMessage(product.title || 'Product', sellableQuantity));
  }
  return sellableQuantity;
}

export function planSellableLotAllocation<T extends SellableInventoryLot>(
  lots: T[],
  storeId: string,
  requestedQuantity: number,
  productName: string,
  now = new Date(),
) {
  let remaining = requestedQuantity;
  const allocations: Array<{ lot: T; quantity: number }> = [];
  const candidates = [...lots]
    .filter((lot) => lot.store?.id === storeId
      && Number(lot.quantityRemaining || 0) > 0
      && new Date(lot.expirationDate).getTime() > now.getTime())
    .sort((left, right) =>
      new Date(left.expirationDate).getTime() - new Date(right.expirationDate).getTime()
      || String(left.id || '').localeCompare(String(right.id || '')));
  for (const lot of candidates) {
    if (remaining === 0) break;
    const quantity = Math.min(remaining, Math.trunc(Number(lot.quantityRemaining || 0)));
    allocations.push({ lot, quantity });
    remaining -= quantity;
  }
  if (remaining > 0) {
    const sellableQuantity = requestedQuantity - remaining;
    throw new Error(sellableInventoryMessage(productName, sellableQuantity));
  }
  return allocations;
}

export async function requireSellableStoreProduct(
  context: Context,
  productId: string,
  storeId: string,
  now = new Date(),
): Promise<SellableStoreProduct> {
  const product = await context.sudo().query.Product.findOne({
    where: { id: productId },
    query: `
      id title handle sku status store { id } price priceCents costPrice costPriceCents
      department imageUrl thumbnailUrl pricingMethod unitOfMeasure
      inventoryLots { expirationDate quantityRemaining store { id } }
    `,
  });
  if (!product || product.store?.id !== storeId) throw new Error('Product is not available in the active store');
  if (product.status !== 'published') throw new Error('Product is not available for public checkout');
  const sellableQuantity = deriveSellableQuantity(product as SellableProductInventory, storeId, now);
  return {
    ...product,
    sellableQuantity,
    stockQuantity: sellableQuantity,
    inStock: sellableQuantity > 0,
  } as SellableStoreProduct;
}
