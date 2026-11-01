import type { GroceryProduct } from '../../types';
import UrbanProductCard from './UrbanProductCard';
import { UrbanEmptyState } from './UrbanPrimitives';

/** Dense quick-add grid. Columns follow the width the grid actually gets (container query), so it stays dense beside the sidebar and cart rail. */
export default function UrbanProductGrid({ products, layout = 'grid' }: { products: GroceryProduct[]; featuredFirst?: boolean; layout?: 'grid' | 'rail'; columns?: 'wide' | 'narrow' }) {
  if (!products?.length) return <UrbanEmptyState title="Nothing on this shelf just yet" actionHref="/products?availability=all" actionLabel="Browse all products">Try a different search or clear your filters to see more groceries.</UrbanEmptyState>;
  if (layout === 'rail') {
    return <ul className="sf-scroll-row sf-bleed-row gap-2.5 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
      {products.map((product, index) => <li key={product.id} className="w-[40vw] max-w-[12rem] sm:w-[11rem] lg:w-auto lg:max-w-none"><UrbanProductCard product={product} eager={index < 2} /></li>)}
    </ul>;
  }
  return <div className="@container">
    <ul className="grid grid-cols-3 gap-2 @[18rem]:gap-2.5 @max-[22rem]:grid-cols-2 @2xl:grid-cols-4 @3xl:grid-cols-5 @5xl:grid-cols-6 @5xl:gap-3">
      {products.map((product, index) => <li key={product.id} className="min-w-0"><UrbanProductCard product={product} eager={index < 6} /></li>)}
    </ul>
  </div>;
}
