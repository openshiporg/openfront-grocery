import type { GroceryDepartment, GroceryProduct } from '@/features/storefront/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getDepartmentByHandle, getProductsByDepartment } from '@/features/storefront/lib/data/departments';
import { catalogPageHref, catalogTotalPages, parseCatalogPage } from '@/features/storefront/lib/catalogPagination';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import { UrbanButtonLink, UrbanContainer, UrbanPageHeader, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';

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

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[
            { label: 'Home', href: '/' },
            { label: 'Departments', href: '/departments' },
            { label: department.name },
          ]}
          title={department.name}
          description={department.description || 'Browse all products from this aisle, including out-of-stock items.'}

        />

        {department.imageUrl ? (
          <div className="h-32 overflow-hidden rounded-lg border sm:h-44 border-[var(--sf-rule-strong)] bg-[var(--sf-paper-3)]">
            <img src={department.imageUrl} alt={`${department.name} department`} className="h-full w-full object-cover" />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sf-rule)] pb-4">
          <UrbanButtonLink href={`/products?department=${department.handle}&availability=all`} variant="ghost">Search this aisle</UrbanButtonLink>
          <div className="flex flex-wrap gap-2">
            {['name', 'price-asc', 'price-desc'].map((sort) => (
              <Link
                prefetch={false}
                key={sort}
                href={catalogPageHref(pathname, { sortBy: sort }, 1)}
                aria-current={searchParams.sortBy === sort || (!searchParams.sortBy && sort === 'name') ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium transition ${searchParams.sortBy === sort || (!searchParams.sortBy && sort === 'name') ? 'border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white' : 'border-[var(--sf-rule)] text-[var(--sf-ink-muted)] hover:border-[var(--sf-accent)]'}`}
              >
                {{name: 'Name A–Z', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low'}[sort]}
              </Link>
            ))}
          </div>
        </div>

        <p className="text-sm text-[var(--sf-ink-muted)]">{totalCount} products in this aisle</p>
        <UrbanProductGrid products={products} featuredFirst={page === 1} />

        {totalPages > 1 ? (
          <nav aria-label={`${department.name} product pages`} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sf-rule)] pt-5">
            <Link
              prefetch={false}
              href={catalogPageHref(pathname, { sortBy: searchParams.sortBy }, Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : undefined}
              className={`border px-4 py-2 text-sm font-medium ${page <= 1 ? 'pointer-events-none opacity-40' : 'hover:border-[var(--sf-accent)]'}`}
            >
              Previous
            </Link>
            <span className="text-sm text-[var(--sf-ink-muted)]">Page {page} of {totalPages}</span>
            <Link
              prefetch={false}
              href={catalogPageHref(pathname, { sortBy: searchParams.sortBy }, Math.min(totalPages, page + 1))}
              aria-disabled={page >= totalPages}
              tabIndex={page >= totalPages ? -1 : undefined}
              className={`border px-4 py-2 text-sm font-medium ${page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:border-[var(--sf-accent)]'}`}
            >
              Next
            </Link>
          </nav>
        ) : null}
      </UrbanContainer>
    </UrbanPageShell>
  );
}
