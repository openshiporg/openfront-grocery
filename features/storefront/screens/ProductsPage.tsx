import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getProductsList } from '@/features/storefront/lib/data/products';
import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import { catalogPageHref, catalogTotalPages, parseCatalogPage } from '@/features/storefront/lib/catalogPagination';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import CatalogControls from '@/features/storefront/modules/products/components/catalog-controls';
import type { GroceryProduct, GroceryDepartment } from '@/features/storefront/types';
import { UrbanBadge, UrbanContainer, UrbanMetric, UrbanPageHeader, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';
import { Boxes, PackageSearch } from 'lucide-react';
import Link from 'next/link';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({
    title: 'Products',
    description: 'Browse grocery products across produce, pantry, dairy, freezer, and household departments.',
  });
}

export async function ProductsPage(props: {
  params: Promise<{ countryCode?: string }>;
  searchParams: Promise<{ department?: string; sort?: string; search?: string; availability?: string; organic?: string; page?: string }>;
}) {
  await props.params;
  const searchParams = await props.searchParams;
  const { department, sort, search, availability, organic } = searchParams;
  const pageSize = 24;
  const page = parseCatalogPage(searchParams.page);

  const { products, count }: { products: GroceryProduct[]; count: number } = await getProductsList({
    department,
    sort,
    search,
    availability: availability as any,
    organic: organic === 'true',
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const { departments }: { departments: GroceryDepartment[] } = await getDepartmentsList(0, 20);
  const activeDepartment = departments.find((entry) => entry.handle === department);

  const title = activeDepartment?.name || (search ? `Results for “${search}”` : 'Full catalog');
  const description = activeDepartment?.description || (search ? 'Matching products from today\'s grocery selection.' : 'Search, filter by aisle, and browse in-stock inventory.');
  const totalPages = catalogTotalPages(count, pageSize);
  const pageParams = { department, sort, search, availability, organic };
  if (page > totalPages) redirect(catalogPageHref('/products', pageParams, totalPages));

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Products' }]}
          title={title}
          description={description}
          aside={
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <UrbanMetric label="Matching" value={count} icon={PackageSearch} />
              <UrbanMetric label="Aisles" value={departments.length} icon={Boxes} />
            </div>
          }
        />

        <CatalogControls departments={departments} activeDepartment={department} search={search} sort={sort || 'name'} availability={availability || 'in-stock'} organic={organic === 'true'} />

        {(search || department || availability || organic) && (
          <div className="flex flex-wrap items-center gap-2 border-y border-[var(--sf-rule)] py-3 text-sm">
            {search && <UrbanBadge tone="muted">Search: {search}</UrbanBadge>}
            {activeDepartment && <UrbanBadge tone="muted">Aisle: {activeDepartment.name}</UrbanBadge>}
            {availability && availability !== 'in-stock' && <UrbanBadge tone="blue">{availability.replace('-', ' ')}</UrbanBadge>}
            {organic === 'true' && <UrbanBadge tone="primary">Organic</UrbanBadge>}
            <Link href="/products" className="text-sm font-medium text-[var(--sf-accent)] hover:text-[var(--sf-accent-hover)]">Clear filters</Link>
          </div>
        )}

        <UrbanProductGrid products={products} featuredFirst={!search && !department && page === 1} />

        {totalPages > 1 ? (
          <nav aria-label="Catalog pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sf-rule)] pt-5">
            <Link
              href={catalogPageHref('/products', pageParams, Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              className={`border px-4 py-2 text-sm font-medium ${page <= 1 ? 'pointer-events-none opacity-40' : 'hover:border-[var(--sf-accent)]'}`}
            >
              Previous
            </Link>
            <span className="text-sm text-[var(--sf-ink-muted)]">Page {Math.min(page, totalPages)} of {totalPages}</span>
            <Link
              href={catalogPageHref('/products', pageParams, Math.min(totalPages, page + 1))}
              aria-disabled={page >= totalPages}
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
