import type { Context } from '.keystone/types';
import { publicStore } from '../lib/storeScope';

export async function getPublicGroceryCoupons(
  _root: unknown,
  _args: unknown,
  context: Context
) {
  const now = new Date().toISOString();
  const store = await publicStore(context);
  const coupons = await context.sudo().query.Coupon.findMany({
    where: {
      AND: [
        { isActive: { equals: true } },
        { store: { id: { equals: store.id } } },
        {
          OR: [
            { validFrom: { equals: null } },
            { validFrom: { lte: now } },
          ],
        },
        {
          OR: [
            { validTo: { equals: null } },
            { validTo: { gte: now } },
          ],
        },
      ],
    },
    query: `
      id
      code
      discountType
      discountValue
      minPurchase
      maxUses
      currentUses
      validTo
      productCategories
    `,
    orderBy: [{ validTo: 'asc' }, { code: 'asc' }],
  });

  return coupons.flatMap((coupon: any) => {
    const maxUses = Number(coupon.maxUses || 0);
    const currentUses = Number(coupon.currentUses || 0);
    if (maxUses > 0 && currentUses >= maxUses) return [];

    return [{
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue || 0,
      minPurchase: coupon.minPurchase || 0,
      validTo: coupon.validTo || null,
      productCategories: Array.isArray(coupon.productCategories)
        ? coupon.productCategories.filter((item: unknown) => typeof item === 'string')
        : [],
    }];
  });
}
