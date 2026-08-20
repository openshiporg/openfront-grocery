import type { GroceryDeal } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

type PublicCoupon = {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed' | 'bogo';
  discountValue: number;
  minPurchase: number;
  validTo?: string | null;
  productCategories: string[];
};

export async function getDeals(): Promise<GroceryDeal[]> {
  try {
    const { data, errors } = await storefrontGraphQL<{
      publicGroceryCoupons: PublicCoupon[];
    }>(
      `
        query GetPublicGroceryCoupons {
          publicGroceryCoupons {
            id
            code
            discountType
            discountValue
            minPurchase
            validTo
            productCategories
          }
        }
      `,
      undefined,
      { next: { revalidate: 300 } }
    );
    throwGraphQLErrors(errors);

    return (data?.publicGroceryCoupons || []).map((coupon) => ({
      id: `coupon-${coupon.id}`,
      type: 'coupon' as const,
      discountCode: coupon.code,
      discountValue: coupon.discountValue,
      discountType: coupon.discountType === 'percentage' ? 'percentage' : 'fixed',
      description:
        coupon.productCategories.length > 0
          ? `Valid on ${coupon.productCategories.join(', ')}`
          : 'Savings applied to eligible items at checkout.',
      minimumPurchase: coupon.minPurchase,
      expiresAt: coupon.validTo || undefined,
    }));
  } catch (error) {
    console.error('Error fetching grocery coupons:', error);
    return [];
  }
}

export async function getDealsByCategory(categoryHandle: string): Promise<GroceryDeal[]> {
  const allDeals = await getDeals();
  return allDeals.filter(
    (deal) =>
      !deal.description?.startsWith('Valid on ') ||
      deal.description.toLowerCase().includes(categoryHandle.toLowerCase())
  );
}

export async function getFlashDeals(): Promise<GroceryDeal[]> {
  return [];
}

export async function getCoupons(): Promise<GroceryDeal[]> {
  return getDeals();
}
