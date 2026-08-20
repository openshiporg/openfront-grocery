import type { GroceryProduct } from '@/features/storefront/types';
import UrbanProductCard from './UrbanProductCard';
import { UrbanEmptyState } from './UrbanPrimitives';

export default function UrbanProductGrid({ products, featuredFirst = false }: { products: GroceryProduct[]; featuredFirst?: boolean }) {
  if (!products?.length) {
    return (
      <UrbanEmptyState title="No products match this search">
        Try another aisle, search phrase, or browse the full catalog.
      </UrbanEmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
      {products.map((product, index) => (
        <div key={product.id} className={featuredFirst && index === 0 ? 'min-[480px]:col-span-2 xl:col-span-2' : ''}>
          <UrbanProductCard product={product} featured={featuredFirst && index === 0} />
        </div>
      ))}
    </div>
  );
}
