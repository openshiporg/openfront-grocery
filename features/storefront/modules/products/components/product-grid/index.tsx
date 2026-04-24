import type { GroceryProduct } from '@/features/storefront/types';
import ProductCardGrocery from '../product-card-grocery';

interface ProductGridProps {
  products: GroceryProduct[];
}

export default function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-emerald-900/15 bg-[linear-gradient(180deg,rgba(247,251,245,0.95),rgba(252,249,243,0.95))] px-6 py-14 text-center shadow-[0_20px_45px_-40px_rgba(18,56,34,0.6)]">
        <span className="mb-4 block text-5xl">🥕</span>
        <h3 className="text-xl font-semibold text-zinc-950">No groceries matched that search</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
          Try a broader department, a simpler search term, or come back later when this aisle is restocked.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {products.map((product) => (
        <ProductCardGrocery key={product.id} product={product} />
      ))}
    </div>
  );
}
