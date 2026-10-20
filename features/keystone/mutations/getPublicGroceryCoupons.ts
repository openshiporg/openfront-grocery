import type { Context } from '.keystone/types';
import { publicStore } from '../lib/storeScope';

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Store-wide offers anyone may see. Rewards issued to one customer (loyalty
 * redemptions) are private to that customer and never appear here; they are
 * returned only by the owner's loyalty projection. Each offer carries the
 * exclusions checkout enforces, so its card states the real terms.
 */
export async function getPublicGroceryCoupons(
  _root: unknown,
  _args: unknown,
  context: Context
) {
  const now = new Date();
  const store = await publicStore(context);
  const coupons = await context.prisma.coupon.findMany({
    where: {
      storeId: store.id,
      isActive: true,
      from_LoyaltyRedemption_coupon: { none: {} },
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      ],
    },
    select: { id: true, code: true, discountType: true, discountValue: true, discountValueCents: true, minPurchaseCents: true, maxUses: true, currentUses: true, validTo: true, productCategories: true, excludedProducts: true },
    orderBy: [{ validTo: 'asc' }, { code: 'asc' }],
    take: 100,
  });
  const live = coupons.filter((coupon) => !(Number(coupon.maxUses || 0) > 0 && Number(coupon.currentUses || 0) >= Number(coupon.maxUses || 0)));
  const excludedIds = [...new Set(live.flatMap((coupon) => stringArray(coupon.excludedProducts)))].slice(0, 500);
  const excludedProducts = excludedIds.length
    ? await context.prisma.product.findMany({ where: { id: { in: excludedIds }, storeId: store.id, status: 'published' }, select: { id: true, title: true } })
    : [];
  const titles = new Map(excludedProducts.map((product) => [product.id, product.title]));

  return live.map((coupon) => ({
    id: coupon.id,
    code: coupon.code.trim().toUpperCase(),
    discountType: coupon.discountType,
    // Percentage offers carry their percentage; fixed offers their authoritative cents.
    discountValue: coupon.discountType === 'percentage' ? Number(coupon.discountValue || 0) : Number(coupon.discountValueCents || 0) / 100,
    minPurchase: Number(coupon.minPurchaseCents || 0) / 100,
    validTo: coupon.validTo ? coupon.validTo.toISOString() : null,
    productCategories: stringArray(coupon.productCategories),
    excludedProductNames: stringArray(coupon.excludedProducts).map((id) => titles.get(id)).filter((title): title is string => Boolean(title)),
  }));
}
