import type { Metadata } from 'next';
import Link from 'next/link';

import { getProductsList } from '@/features/storefront/lib/data/products';
import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import ProductGrid from '@/features/storefront/modules/products/components/product-grid';
import type { GroceryProduct, GroceryDepartment } from '@/features/storefront/types';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'All Products | Openfront Grocery',
    description: 'Browse our full selection of fresh groceries - produce, meat, dairy, bakery, and more.',
  };
}

export async function ProductsPage(props: {
  params: Promise<{ countryCode?: string }>;
  searchParams: Promise<{ department?: string; sort?: string; search?: string }>;
}) {
  await props.params;
  const searchParams = await props.searchParams;
  const { department, sort, search } = searchParams;

  const { products, count }: { products: GroceryProduct[]; count: number } = await getProductsList({
    department,
    sort,
    search,
    limit: 24,
    offset: 0,
  });

  const { departments }: { departments: GroceryDepartment[] } = await getDepartmentsList(0, 20);
  const activeDepartment = departments.find((entry) => entry.handle === department);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
      <nav className="mb-6 text-sm text-zinc-600">
        <Link href="/" className="hover:text-zinc-950">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-950">Catalog</span>
      </nav>

      <section className="overflow-hidden rounded-[2rem] border border-emerald-950/8 bg-[linear-gradient(135deg,rgba(247,251,245,0.98),rgba(255,248,235,0.94))] p-6 shadow-[0_28px_60px_-45px_rgba(18,56,34,0.7)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-700/80">Grocery catalog</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">
              {activeDepartment?.name || (search ? `Search results for “${search}”` : 'Browse all products')}
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-700">
              {activeDepartment?.description ||
                (search
                  ? 'Results are matched against product names and SKU terms so shoppers can move quickly from intent to basket.'
                  : 'Browse the catalog the way a store operator thinks about it: by department, stock reality, and grocery-friendly units.')}
            </p>
          </div>
          <div className="rounded-full border border-emerald-950/8 bg-white/75 px-4 py-2 text-sm font-medium text-zinc-700">
            {count} item{count === 1 ? '' : 's'}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-emerald-950/8 bg-white/88 p-4 shadow-[0_20px_45px_-42px_rgba(18,56,34,0.6)] sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/products"
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                !department ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
              }`}
            >
              All departments
            </Link>
            {departments.map((dept) => (
              <Link
                key={dept.id}
                href={`/products?department=${dept.handle}`}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  department === dept.handle
                    ? 'bg-emerald-700 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                {dept.name}
              </Link>
            ))}
          </div>
          {(search || department) && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <span className="font-medium text-zinc-900">Active filters:</span>
              {search && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-950">Search: {search}</span>}
              {activeDepartment && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-950">
                  Department: {activeDepartment.name}
                </span>
              )}
              <Link href="/products" className="text-emerald-700 hover:text-emerald-900 hover:underline">
                Clear filters
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="mt-6">
        <ProductGrid products={products} />
      </div>
    </div>
  );
}
