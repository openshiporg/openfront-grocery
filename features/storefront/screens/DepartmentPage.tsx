import type { GroceryDepartment, GroceryProduct } from '@/features/storefront/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getDepartmentByHandle, getProductsByDepartment } from '@/features/storefront/lib/data/departments';
import { catalogPageHref, catalogTotalPages, parseCatalogPage } from '@/features/storefront/lib/catalogPagination';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import { Search } from 'lucide-react';
import { UrbanBreadcrumb, UrbanButtonLink, UrbanContainer, UrbanPageShell, UrbanPager } from '@/features/storefront/modules/urban/UrbanPrimitives';

type Props = {
  params: Promise<{ handle: string; countryCode?: string }>;
  searchParams: Promise<{ sortBy?: string; page?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const department: GroceryDepartment | null = await getDepartmentByHandle(params.handle);
  if (!department) notFound();
  return storefrontMetadata({
    title: department.name,
    description: department.description ?? `Shop the ${department.name} department.`,
    canonical: `/departments/${params.handle}`,
  });
}

export async function DepartmentPage(props: Props) {
  const [searchParams, params] = await Promise.all([props.searchParams, props.params]);
  const department: GroceryDepartment | null = await getDepartmentByHandle(params.handle);
  if (!department) notFound();

  const pageSize = 20;
  const page = parseCatalogPage(searchParams.page);
  const { products, totalCount }: { products: GroceryProduct[]; totalCount: number } = await getProductsByDepartment(
    department.handle,
    { sortBy: searchParams.sortBy, page, limit: pageSize },
  );
  const totalPages = catalogTotalPages(totalCount, pageSize);
  const pathname = `/departments/${department.handle}`;
  if (page > totalPages) redirect(catalogPageHref(pathname, { sortBy: searchParams.sortBy }, totalPages));

  const sorts = [['name', 'Name A–Z'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low']] as const;
  const activeSort = searchParams.sortBy || 'name';

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-6 sm:py-8">
        <UrbanBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Aisles', href: '/departments' }, { label: department.name }]} />

        <header className="relative isolate overflow-hidden rounded-[28px] bg-[var(--sf-header)] text-[var(--sf-header-ink)]">
          {department.imageUrl ? <img src={department.imageUrl} alt="" fetchPriority="high" className="absolute inset-0 -z-10 h-full w-full object-cover" /> : null}
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,oklch(18%_0.035_182/0.92)_10%,oklch(18%_0.035_182/0.55)_55%,oklch(18%_0.035_182/0.15))]" />
          <div className="flex min-h-[13rem] flex-col justify-end gap-3 p-6 sm:min-h-[17rem] sm:p-10">
            <h1 className="sf-hero-title max-w-[14ch] text-[clamp(2.25rem,1.4rem+3.2vw,4rem)]">{department.name}</h1>
            <p className="max-w-xl text-[0.9375rem] leading-7 text-[var(--sf-header-ink-muted)] sm:text-base">{department.description || 'Every product in this aisle, including items that are currently sold out.'}</p>
            <p className="text-sm font-semibold tabular-nums">{totalCount} {totalCount === 1 ? 'product' : 'products'}</p>
          </div>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Sort products" className="sf-scroll-row sf-bleed-row sm:mx-0 sm:px-0">
            {sorts.map(([sort, label]) => (
              <Link prefetch={false} key={sort} href={catalogPageHref(pathname, { sortBy: sort }, 1)} aria-current={activeSort === sort ? 'true' : undefined} className="sf-chip">{label}</Link>
            ))}
          </nav>
          <UrbanButtonLink href={`/products?department=${department.handle}&availability=all`} variant="ghost" size="sm" className="self-start sm:self-auto"><Search className="h-4 w-4" aria-hidden="true" />Search & filter this aisle</UrbanButtonLink>
        </div>

        <UrbanProductGrid products={products} featuredFirst={page === 1} />

        {totalPages > 1 ? (
          <div className="border-t border-[var(--sf-rule)]">
            <UrbanPager
              label={`${department.name} product pages`}
              page={page}
              totalPages={totalPages}
              previousHref={catalogPageHref(pathname, { sortBy: searchParams.sortBy }, Math.max(1, page - 1))}
              nextHref={catalogPageHref(pathname, { sortBy: searchParams.sortBy }, Math.min(totalPages, page + 1))}
            />
          </div>
        ) : null}
      </UrbanContainer>
    </UrbanPageShell>
  );
}
