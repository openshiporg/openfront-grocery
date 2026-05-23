import type { GroceryProduct } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

export type ProductSortOption = 'name' | 'price-asc' | 'price-desc' | 'newest' | 'low-stock';
export type ProductAvailabilityFilter = 'in-stock' | 'all' | 'low-stock';

function mapProduct(product: any): GroceryProduct {
  return {
    ...product,
    name: product.title,
    unit: product.unitOfMeasure,
    department: product.departmentRef,
  };
}

function buildProductWhere(options?: {
  department?: string;
  search?: string;
  availability?: ProductAvailabilityFilter;
  organic?: boolean;
}) {
  const where: Record<string, any> = {
    status: { equals: 'published' },
  };

  if (options?.department) {
    where.departmentRef = { handle: { equals: options.department } };
  }

  if (options?.search?.trim()) {
    const query = options.search.trim();
    where.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { sku: { contains: query, mode: 'insensitive' } },
      { handle: { contains: query, mode: 'insensitive' } },
    ];
  }

  if (options?.organic) {
    where.organicCertified = { equals: true };
  }

  if (options?.availability === 'all') {
    return where;
  }

  where.inStock = { equals: true };

  if (options?.availability === 'low-stock') {
    where.stockQuantity = { lt: 10 };
  }

  return where;
}

function buildProductOrderBy(sort?: ProductSortOption) {
  switch (sort) {
    case 'price-asc':
      return [{ price: 'asc' }];
    case 'price-desc':
      return [{ price: 'desc' }];
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'low-stock':
      return [{ stockQuantity: 'asc' }, { title: 'asc' }];
    case 'name':
    default:
      return [{ title: 'asc' }];
  }
}

export async function getProductsList(options?: {
  department?: string;
  sort?: ProductSortOption | string;
  search?: string;
  availability?: ProductAvailabilityFilter;
  organic?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ products: GroceryProduct[]; count: number }> {
  const {
    department,
    sort = 'name',
    search,
    availability = 'in-stock',
    organic = false,
    limit = 24,
    offset = 0,
  } = options || {};

  try {
    const where = buildProductWhere({ department, search, availability, organic });
    const orderBy = buildProductOrderBy(sort as ProductSortOption);

    const { data, errors } = await storefrontGraphQL<{
      products: any[];
      productsCount: number;
    }>(`
      query GetProducts($where: ProductWhereInput!, $orderBy: [ProductOrderByInput!]!, $take: Int, $skip: Int) {
        products(
          where: $where
          orderBy: $orderBy
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
        productsCount(where: $where)
      }
    `, { where, orderBy, take: limit, skip: offset }, { next: { revalidate: 300 } });

    throwGraphQLErrors(errors);

    const products = (data?.products || []).map(mapProduct);

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
    const { data } = await storefrontGraphQL<{ product: any | null }>(`
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
    `, { handle }, { next: { revalidate: 300 } });
    const product = data?.product;

    if (!product) return null;

    return mapProduct(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

export async function getProductsByIds(
  ids: string[]
): Promise<{ products: GroceryProduct[] }> {
  try {
    if (!ids.length) {
      return { products: [] };
    }

    const { data } = await storefrontGraphQL<{ products: any[] }>(`
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
    `, { ids }, { next: { revalidate: 300 } });
    const products = (data?.products || []).map(mapProduct);

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
    const { products } = await getProductsList({ search: query, limit, offset: 0 });
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
    const { products } = await getProductsList({ sort: 'newest', limit, offset: 0 });
    return { products };
  } catch (error) {
    console.error('Error fetching featured products:', error);
    return { products: [] };
  }
}
