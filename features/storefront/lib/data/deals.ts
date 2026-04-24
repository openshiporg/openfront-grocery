import type { GroceryDeal } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

export async function getDeals(): Promise<GroceryDeal[]> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetDeals {
            discounts(
              where: {
                isActive: { equals: true }
                startsAt: { lte: "${new Date().toISOString()}" }
                OR: [
                  { endsAt: { gte: "${new Date().toISOString()}" } }
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
        `,
      }),
      next: { revalidate: 300 },
    });

    const { data } = await response.json();
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

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetFlashDeals {
            discounts(
              where: {
                isActive: { equals: true }
                startsAt: { lte: "${now.toISOString()}" }
                endsAt: { lte: "${endOfDay.toISOString()}" }
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
        `,
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
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
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetCoupons {
            discounts(
              where: {
                isActive: { equals: true }
                type: { equals: "fixed" }
                startsAt: { lte: "${new Date().toISOString()}" }
                OR: [
                  { endsAt: { gte: "${new Date().toISOString()}" } }
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
        `,
      }),
      next: { revalidate: 300 },
    });

    const { data } = await response.json();
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
