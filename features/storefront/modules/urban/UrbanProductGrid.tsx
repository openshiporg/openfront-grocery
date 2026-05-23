import type { GroceryProduct } from '@/features/storefront/types';
import UrbanProductCard from './UrbanProductCard';
import { UrbanPanel } from './UrbanPrimitives';
import { PackageSearch } from 'lucide-react';

export default function UrbanProductGrid({ products, featuredFirst = false }: { products: GroceryProduct[]; featuredFirst?: boolean }) {
  if (!products?.length) {
    return (
      <UrbanPanel className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
        <PackageSearch className="h-10 w-10 text-[#ffb693]" />
        <h3 className="mt-5 font-market-label text-3xl font-black uppercase tracking-[-0.03em] text-[#e2e2e2]">No inventory signal</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#e2bfb0]">Try a different aisle, stock state, or search term.</p>
      </UrbanPanel>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product, index) => (
        <div key={product.id} className={featuredFirst && index === 0 ? 'lg:col-span-2 lg:row-span-2' : ''}>
          <UrbanProductCard product={product} featured={featuredFirst && index === 0} />
        </div>
      ))}
    </div>
  );
}
