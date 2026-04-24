import type { GroceryDepartment, GroceryProduct } from '@/features/storefront/types';
import Link from 'next/link';
import ProductGrid from '@/features/storefront/modules/products/components/product-grid';
import RefinementList from './refinement-list';
import Pagination from './pagination';

interface DepartmentTemplateProps {
  department: GroceryDepartment;
  products: GroceryProduct[];
  sortBy?: string;
  page?: string;
  countryCode?: string;
  totalProducts?: number;
}

export default function DepartmentTemplate({
  department,
  products,
  page,
  totalProducts,
}: DepartmentTemplateProps) {
  const currentPage = page ? parseInt(page) : 1;
  const totalPages = totalProducts ? Math.ceil(totalProducts / 20) : 1;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
      <nav className="mb-6 flex items-center text-sm text-zinc-600">
        <Link href="/" className="hover:text-emerald-700">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/products" className="hover:text-emerald-700">Catalog</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-zinc-950">{department.name}</span>
      </nav>

      <section className="overflow-hidden rounded-[2rem] border border-emerald-950/8 bg-[linear-gradient(135deg,rgba(245,251,243,0.98),rgba(255,248,235,0.94))] shadow-[0_28px_60px_-45px_rgba(18,56,34,0.7)]">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
          <div className="max-w-2xl">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-700/80">Department</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">{department.name}</h1>
            {department.description && (
              <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-700">{department.description}</p>
            )}
            <div className="mt-6 inline-flex rounded-full border border-emerald-950/8 bg-white/75 px-4 py-2 text-sm font-medium text-zinc-700">
              {products.length} products{totalProducts && totalProducts > products.length ? ` shown · ${totalProducts} total` : ''}
            </div>
          </div>
          <div className="overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/80 shadow-[0_20px_40px_-36px_rgba(18,56,34,0.7)]">
            {department.imageUrl ? (
              <img src={department.imageUrl} alt={department.name} className="h-56 w-full object-cover lg:h-full" />
            ) : (
              <div className="flex h-56 items-center justify-center text-6xl lg:h-full">🥕</div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[1.5rem] border border-emerald-950/8 bg-white/88 p-4 shadow-[0_20px_45px_-42px_rgba(18,56,34,0.6)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-900">Filter and sort this aisle</p>
            <p className="text-xs text-zinc-500">Surface the right products for the basket you are building.</p>
          </div>
          <RefinementList />
        </div>
      </section>

      <div className="mt-6">
        <ProductGrid products={products} />
      </div>

      {totalPages > 1 && (
        <div className="mt-8">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath={`/departments/${department.handle}`}
          />
        </div>
      )}
    </div>
  );
}
