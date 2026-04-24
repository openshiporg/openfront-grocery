import type { GroceryDepartment, GroceryProduct } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

export async function getDepartmentsList(
  offset: number = 0,
  limit: number = 10
): Promise<{ departments: GroceryDepartment[] }> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetDepartments($take: Int, $skip: Int) {
            departments(
              take: $take
              skip: $skip
              orderBy: [{ sortOrder: asc }, { name: asc }]
              where: { isActive: { equals: true } }
            ) {
              id
              name
              handle
              description
              imageUrl
              sortOrder
              isActive
              temperatureZone
              productsCount
            }
          }
        `,
        variables: { take: limit, skip: offset },
      }),
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    const { data } = await response.json();
    return { departments: data?.departments || [] };
  } catch (error) {
    console.error('Error fetching departments:', error);
    return { departments: [] };
  }
}

export async function getDepartmentByHandle(
  handle: string
): Promise<GroceryDepartment | null> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetDepartment($handle: String!) {
            departments(where: { handle: { equals: $handle } }) {
              id
              name
              handle
              description
              imageUrl
              sortOrder
              isActive
            }
          }
        `,
        variables: { handle },
      }),
      next: { revalidate: 3600 },
    });

    const { data } = await response.json();
    return data?.departments?.[0] || null;
  } catch (error) {
    console.error('Error fetching department:', error);
    return null;
  }
}

export async function getProductsByDepartment(
  departmentHandle: string,
  options?: { sortBy?: string; page?: number; limit?: number }
): Promise<{ products: GroceryProduct[]; totalCount: number }> {
  const { sortBy = 'title', page = 1, limit = 20 } = options || {};
  const skip = (page - 1) * limit;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetProductsByDepartment($handle: String!, $take: Int, $skip: Int) {
            products(
              where: {
                departmentRef: { handle: { equals: $handle } }
                inStock: { equals: true }
                status: { equals: published }
              }
              take: $take
              skip: $skip
              orderBy: { title: asc }
            ) {
              id
              title
              handle
              sku
              price
              unitOfMeasure
              pricingMethod
              imageUrl
              thumbnailUrl
              isPerishable
              inStock
              stockQuantity
              organicCertified
              departmentRef {
                id
                name
                handle
              }
            }
            productsCount(
              where: {
                departmentRef: { handle: { equals: $handle } }
                inStock: { equals: true }
                status: { equals: published }
              }
            )
          }
        `,
        variables: { handle: departmentHandle, take: limit, skip },
      }),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    const { data } = await response.json();

    // Map API response to GroceryProduct type
    const products = (data?.products || []).map((p: any) => ({
      ...p,
      name: p.title, // Map title to name for backwards compatibility
      unit: p.unitOfMeasure,
      department: p.departmentRef,
    }));

    return {
      products,
      totalCount: data?.productsCount || 0
    };
  } catch (error) {
    console.error('Error fetching products by department:', error);
    return { products: [], totalCount: 0 };
  }
}
