import type { GroceryProduct } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

export async function getProductsList(options?: {
  department?: string;
  sort?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ products: GroceryProduct[]; count: number }> {
  const { department, sort, search, limit = 24, offset = 0 } = options || {};

  try {
    // Build where clause
    const whereConditions: string[] = [
      'inStock: { equals: true }',
      'status: { equals: published }',
    ];

    if (department) {
      whereConditions.push(`departmentRef: { handle: { equals: "${department}" } }`);
    }

    if (search) {
      whereConditions.push(`OR: [
        { title: { contains: "${search}", mode: insensitive } }
        { sku: { contains: "${search}", mode: insensitive } }
      ]`);
    }

    // Build order by clause
    let orderBy = '{ createdAt: desc }';
    if (sort === 'price-asc') {
      orderBy = '{ price: asc }';
    } else if (sort === 'price-desc') {
      orderBy = '{ price: desc }';
    } else if (sort === 'name') {
      orderBy = '{ title: asc }';
    } else if (sort === 'newest') {
      orderBy = '{ createdAt: desc }';
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetProducts($take: Int, $skip: Int) {
            products(
              where: { ${whereConditions.join(', ')} }
              orderBy: ${orderBy}
              take: $take
              skip: $skip
            ) {
              id
              title
              handle
              sku
              price
              compareAtPrice
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
            productsCount(where: { ${whereConditions.join(', ')} })
          }
        `,
        variables: { take: limit, skip: offset },
      }),
      next: { revalidate: 300 },
    });

    const { data } = await response.json();

    const products = (data?.products || []).map((p: any) => ({
      ...p,
      name: p.title,
      unit: p.unitOfMeasure,
      department: p.departmentRef,
    }));

    return {
      products,
      count: data?.productsCount || products.length,
    };
  } catch (error) {
    console.error('Error fetching products list:', error);
    return { products: [], count: 0 };
  }
}

export async function getProductByHandle(
  handle: string
): Promise<GroceryProduct | null> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetProduct($handle: String!) {
            product(where: { handle: $handle }) {
              id
              title
              handle
              description {
                document
              }
              sku
              price
              compareAtPrice
              unitOfMeasure
              pricingMethod
              imageUrl
              thumbnailUrl
              isPerishable
              shelfLife
              organicCertified
              allergens
              inStock
              stockQuantity
              departmentRef {
                id
                name
                handle
              }
              supplier {
                id
                name
              }
            }
          }
        `,
        variables: { handle },
      }),
      next: { revalidate: 300 },
    });

    const { data } = await response.json();
    const product = data?.product;

    if (!product) return null;

    // Map to GroceryProduct type
    return {
      ...product,
      name: product.title,
      unit: product.unitOfMeasure,
      department: product.departmentRef,
    };
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

export async function getProductsByIds(
  ids: string[]
): Promise<{ products: GroceryProduct[] }> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetProductsByIds($ids: [ID!]) {
            products(where: { id: { in: $ids } }) {
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
          }
        `,
        variables: { ids },
      }),
      next: { revalidate: 300 },
    });

    const { data } = await response.json();

    // Map API response to GroceryProduct type
    const products = (data?.products || []).map((p: any) => ({
      ...p,
      name: p.title,
      unit: p.unitOfMeasure,
      department: p.departmentRef,
    }));

    return { products };
  } catch (error) {
    console.error('Error fetching products by IDs:', error);
    return { products: [] };
  }
}

export async function searchProducts(
  query: string,
  options?: { limit?: number }
): Promise<{ products: GroceryProduct[] }> {
  const { limit = 10 } = options || {};

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query SearchProducts($query: String!, $take: Int) {
            products(
              where: {
                OR: [
                  { title: { contains: $query, mode: insensitive } }
                  { sku: { contains: $query, mode: insensitive } }
                  { handle: { contains: $query, mode: insensitive } }
                ]
                inStock: { equals: true }
                status: { equals: published }
              }
              take: $take
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
          }
        `,
        variables: { query, take: limit },
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();

    // Map API response to GroceryProduct type
    const products = (data?.products || []).map((p: any) => ({
      ...p,
      name: p.title,
      unit: p.unitOfMeasure,
      department: p.departmentRef,
    }));

    return { products };
  } catch (error) {
    console.error('Error searching products:', error);
    return { products: [] };
  }
}

// Get featured/popular products for homepage
export async function getFeaturedProducts(
  limit: number = 8
): Promise<{ products: GroceryProduct[] }> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetFeaturedProducts($take: Int) {
            products(
              where: {
                inStock: { equals: true }
                status: { equals: published }
              }
              take: $take
              orderBy: { createdAt: desc }
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
          }
        `,
        variables: { take: limit },
      }),
      next: { revalidate: 300 },
    });

    const { data } = await response.json();

    // Map API response to GroceryProduct type
    const products = (data?.products || []).map((p: any) => ({
      ...p,
      name: p.title,
      unit: p.unitOfMeasure,
      department: p.departmentRef,
    }));

    return { products };
  } catch (error) {
    console.error('Error fetching featured products:', error);
    return { products: [] };
  }
}
