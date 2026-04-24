import type { GroceryStore } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

export async function getStore(): Promise<GroceryStore | null> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetStoreMeta {
            departments(
              where: { isActive: { equals: true } }
              orderBy: { sortOrder: asc }
              take: 1
            ) {
              id
            }
            products(
              where: {
                inStock: { equals: true }
                status: { equals: published }
              }
              take: 4
            ) {
              id
            }
          }
        `,
      }),
      next: { revalidate: 300 },
    });

    const { data } = await response.json();
    const activeDepartmentCount = data?.departments?.length || 0;
    const featuredProductCount = data?.products?.length || 0;

    return {
      id: 'default',
      name: 'Openfront Grocery',
      homepageTitle: 'Fresh groceries delivered with less chaos',
      homepageDescription:
        activeDepartmentCount > 0
          ? `Shop ${activeDepartmentCount}+ active departments with fulfillment-aware catalog data and ${featuredProductCount} featured in-stock items.`
          : 'Quality produce, meats, dairy, and pantry essentials at your fingertips.',
      logoUrl: '/logo.svg',
    };
  } catch (error) {
    console.error('Error fetching store:', error);
    return {
      id: 'default',
      name: 'Openfront Grocery',
      homepageTitle: 'Fresh groceries delivered with less chaos',
      homepageDescription: 'Quality produce, meats, dairy, and pantry essentials at your fingertips.',
      logoUrl: '/logo.svg',
    };
  }
}
