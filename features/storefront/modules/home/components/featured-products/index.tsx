import ProductGrid from '@/features/storefront/modules/products/components/product-grid';
import { getFeaturedProducts } from '@/features/storefront/lib/data/products';

export default async function FeaturedProducts() {
  const { products } = await getFeaturedProducts(8);
  return <ProductGrid products={products} />;
}
