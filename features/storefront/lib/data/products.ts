import type { GroceryProduct } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

export type ProductSortOption = 'name' | 'price-asc' | 'price-desc' | 'newest' | 'low-stock';
export type ProductAvailabilityFilter = 'in-stock' | 'all' | 'low-stock';

type PublicCatalogProduct = {
  id: string;
  title: string;
  handle: string;
  description?: unknown;
  sku: string;
  price?: number | null;
  compareAtPrice?: number | null;
  unitOfMeasure?: string | null;
  pricingMethod?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  isPerishable: boolean;
  shelfLife?: number | null;
  organicCertified: boolean;
  allergens: string[];
  department?: { id: string; name: string; handle: string; isActive: boolean } | null;
  inStock: boolean;
  stockQuantity: number;
  backInStockRequested: boolean;
};

const PUBLIC_PRODUCT_FIELDS = `
  id
  title
  handle
  description
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
  department { id name handle isActive }
  inStock
  stockQuantity
  backInStockRequested
`;

function mapProduct(product: PublicCatalogProduct): GroceryProduct {
  return {
    ...product,
    name: product.title,
    price: Number(product.price || 0),
    compareAtPrice: product.compareAtPrice ?? undefined,
    unit: product.unitOfMeasure || undefined,
    imageUrl: product.imageUrl || undefined,
    thumbnailUrl: product.thumbnailUrl || undefined,
    department: product.department || undefined,
  };
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
  const take = Math.min(100, Math.max(1, Math.trunc(limit)));
  const skip = Math.max(0, Math.trunc(offset));
  const { data, errors } = await storefrontGraphQL<{
    publicGroceryProducts: { products: PublicCatalogProduct[]; totalCount: number };
  }>(`
    query GetPublicGroceryProducts(
      $department: String
      $search: String
      $availability: String
      $organic: Boolean
      $sort: String
      $take: Int
      $skip: Int
    ) {
      publicGroceryProducts(
        department: $department
        search: $search
        availability: $availability
        organic: $organic
        sort: $sort
        take: $take
        skip: $skip
      ) {
        products { ${PUBLIC_PRODUCT_FIELDS} }
        totalCount
      }
    }
  `, { department, search, availability, organic, sort, take, skip }, { cache: 'no-store' });
  throwGraphQLErrors(errors);
  if (!data?.publicGroceryProducts) throw new Error('Public catalog did not return an authoritative response');
  return {
    products: data.publicGroceryProducts.products.map(mapProduct),
    count: data.publicGroceryProducts.totalCount,
  };
}

export async function getProductByHandle(handle: string): Promise<GroceryProduct | null> {
  const { data, errors } = await storefrontGraphQL<{ publicGroceryProduct: PublicCatalogProduct | null }>(`
    query GetPublicGroceryProduct($handle: String!) {
      publicGroceryProduct(handle: $handle) { ${PUBLIC_PRODUCT_FIELDS} }
    }
  `, { handle }, { cache: 'no-store' });
  throwGraphQLErrors(errors);
  return data?.publicGroceryProduct ? mapProduct(data.publicGroceryProduct) : null;
}

export async function getProductsByIds(ids: string[]): Promise<{ products: GroceryProduct[] }> {
  if (!ids.length) return { products: [] };
  const { data, errors } = await storefrontGraphQL<{
    publicGroceryProducts: { products: PublicCatalogProduct[] };
  }>(`
    query GetPublicGroceryProductsById($ids: [ID!], $take: Int) {
      publicGroceryProducts(ids: $ids, availability: "all", take: $take) {
        products { ${PUBLIC_PRODUCT_FIELDS} }
      }
    }
  `, { ids: ids.slice(0, 100), take: Math.min(ids.length, 100) }, { cache: 'no-store' });
  throwGraphQLErrors(errors);
  return { products: (data?.publicGroceryProducts.products || []).map(mapProduct) };
}

export async function searchProducts(query: string, options?: { limit?: number }) {
  const { products } = await getProductsList({ search: query, limit: options?.limit || 10, offset: 0 });
  return { products };
}

export async function getFeaturedProducts(limit: number = 8) {
  const { products } = await getProductsList({ sort: 'newest', limit, offset: 0 });
  return { products };
}

export async function requestBackInStockAlert(productId: string) {
  const { data, errors } = await storefrontGraphQL<{
    requestGroceryBackInStockAlert: {
      requested: boolean;
      reused: boolean;
      productId: string;
      message: string;
    };
  }>(`
    mutation RequestGroceryBackInStockAlert($productId: ID!) {
      requestGroceryBackInStockAlert(productId: $productId) {
        requested
        reused
        productId
        message
      }
    }
  `, { productId }, { cache: 'no-store' });
  throwGraphQLErrors(errors);
  if (!data?.requestGroceryBackInStockAlert) throw new Error('Back-in-stock alert was not confirmed');
  return data.requestGroceryBackInStockAlert;
}
