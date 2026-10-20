import type { GroceryProduct } from '../../types';
import UrbanProductCard from './UrbanProductCard';
import { UrbanEmptyState } from './UrbanPrimitives';

export default function UrbanProductGrid({ products, layout = 'grid', columns = 'wide' }: { products: GroceryProduct[]; featuredFirst?: boolean; layout?: 'grid' | 'rail'; columns?: 'wide' | 'narrow' }) {
  if (!products?.length) return <UrbanEmptyState title="Nothing on this shelf just yet" actionHref="/products?availability=all" actionLabel="Browse all products">Try a different search or clear your filters to see more groceries.</UrbanEmptyState>;
  if (layout === 'rail') {
    return <ul className="sf-scroll-row sf-bleed-row gap-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
      {products.map((product, index) => <li key={product.id} className="w-[44vw] max-w-[13.5rem] sm:w-[13rem] lg:w-auto lg:max-w-none"><UrbanProductCard product={product} eager={index < 2} /></li>)}
    </ul>;
  }
  return <ul className={`grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 ${columns === 'wide' ? 'lg:grid-cols-4 xl:grid-cols-5' : 'lg:grid-cols-3 xl:grid-cols-4'}`}>
    {products.map((product, index) => <li key={product.id} className="min-w-0"><UrbanProductCard product={product} eager={index < 4} /></li>)}
  </ul>;
}
