import type { GroceryProduct } from '../../types';
import UrbanProductCard from './UrbanProductCard';
import { UrbanEmptyState } from './UrbanPrimitives';

export default function UrbanProductGrid({ products }: { products: GroceryProduct[]; featuredFirst?: boolean }) {
  if (!products?.length) return <UrbanEmptyState title="Nothing on this shelf just yet" actionHref="/products?availability=all" actionLabel="Browse all products">Try a different search or clear your filters to see more groceries.</UrbanEmptyState>;
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 sm:gap-4">{products.map((product) => <UrbanProductCard key={product.id} product={product} />)}</div>;
}
