import type { GroceryDeal } from '../../types';
import { storefrontGraphQL } from './graphql';

export async function getDeals(): Promise<GroceryDeal[]> {
  try {
    const now = new Date().toISOString();
    const { data } = await storefrontGraphQL<{ discounts: any[] }>(`
      query GetDeals($now: DateTime!) {
        discounts(
          where: {
            isActive: { equals: true }
            startsAt: { lte: $now }
            OR: [
              { endsAt: { gte: $now } }
              { endsAt: { equals: null } }
            ]
          }
          orderBy: { priority: desc }
        ) {
          id
          code
          description
          type
          value
          minimumPurchase
          startsAt
          endsAt
          usageLimit
          usageCount
          products {
            id
            title
            handle
            price
            compareAtPrice
            imageUrl
            thumbnailUrl
            unitOfMeasure
            departmentRef {
              id
              name
              handle
            }
          }
          categories {
            id
            name
            handle
          }
        }
      }
    `, { now }, { next: { revalidate: 300 } });
    const discounts = data?.discounts || [];

    // Transform discounts to GroceryDeal format
    const deals: GroceryDeal[] = discounts.flatMap((discount: any) => {
      if (discount.products && discount.products.length > 0) {
        return discount.products.map((product: any) => ({
          id: `${discount.id}-${product.id}`,
          type: discount.type === 'percentage' ? 'weekly' : 'coupon',
          discountCode: discount.code,
          discountValue: discount.value,
          discountType: discount.type,
          description: discount.description,
          expiresAt: discount.endsAt,
          product: {
            id: product.id,
            name: product.title,
            handle: product.handle,
            sku: product.sku || '',
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            imageUrl: product.imageUrl || product.thumbnailUrl,
            inStock: true,
            stockQuantity: 100,
            isPerishable: false,
            unit: product.unitOfMeasure,
            department: product.departmentRef,
          },
        }));
      }
      return [];
    });

    return deals;
  } catch (error) {
    console.error('Error fetching deals:', error);
    return [];
  }
}

export async function getDealsByCategory(categoryHandle: string): Promise<GroceryDeal[]> {
  try {
    const allDeals = await getDeals();
    return allDeals.filter(
      (deal) => deal.product?.department?.handle === categoryHandle
    );
  } catch (error) {
    console.error('Error fetching deals by category:', error);
    return [];
  }
}

export async function getFlashDeals(): Promise<GroceryDeal[]> {
  try {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const { data } = await storefrontGraphQL<{ discounts: any[] }>(`
      query GetFlashDeals($now: DateTime!, $endOfDay: DateTime!) {
        discounts(
          where: {
            isActive: { equals: true }
            startsAt: { lte: $now }
            endsAt: { lte: $endOfDay }
          }
          orderBy: { endsAt: asc }
          take: 10
        ) {
          id
          code
          description
          type
          value
          endsAt
          products {
            id
            title
            handle
            price
            compareAtPrice
            imageUrl
            thumbnailUrl
            unitOfMeasure
          }
        }
      }
    `, { now: now.toISOString(), endOfDay: endOfDay.toISOString() }, { cache: 'no-store' });
    const discounts = data?.discounts || [];

    return discounts.flatMap((discount: any) =>
      (discount.products || []).map((product: any) => ({
        id: `flash-${discount.id}-${product.id}`,
        type: 'flash' as const,
        discountCode: discount.code,
        discountValue: discount.value,
        discountType: discount.type,
        description: discount.description,
        expiresAt: discount.endsAt,
        product: {
          id: product.id,
          name: product.title,
          handle: product.handle,
          sku: '',
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          imageUrl: product.imageUrl || product.thumbnailUrl,
          inStock: true,
          stockQuantity: 100,
          isPerishable: false,
          unit: product.unitOfMeasure,
        },
      }))
    );
  } catch (error) {
    console.error('Error fetching flash deals:', error);
    return [];
  }
}

export async function getCoupons(): Promise<GroceryDeal[]> {
  try {
    const now = new Date().toISOString();
    const { data } = await storefrontGraphQL<{ discounts: any[] }>(`
      query GetCoupons($now: DateTime!) {
        discounts(
          where: {
            isActive: { equals: true }
            type: { equals: "fixed" }
            startsAt: { lte: $now }
            OR: [
              { endsAt: { gte: $now } }
              { endsAt: { equals: null } }
            ]
          }
          orderBy: { value: desc }
        ) {
          id
          code
          description
          type
          value
          minimumPurchase
          endsAt
          categories {
            id
            name
            handle
          }
        }
      }
    `, { now }, { next: { revalidate: 300 } });
    const discounts = data?.discounts || [];

    return discounts.map((discount: any) => ({
      id: `coupon-${discount.id}`,
      type: 'coupon' as const,
      discountCode: discount.code,
      discountValue: discount.value,
      discountType: discount.type,
      description: discount.description,
      minimumPurchase: discount.minimumPurchase,
      expiresAt: discount.endsAt,
      categories: discount.categories,
    }));
  } catch (error) {
    console.error('Error fetching coupons:', error);
    return [];
  }
}
