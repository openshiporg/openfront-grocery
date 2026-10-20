import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getProductsList } from '@/features/storefront/lib/data/products';
import { getAllDepartments } from '@/features/storefront/lib/data/departments';
import { catalogPageHref, catalogTotalPages, parseCatalogPage } from '@/features/storefront/lib/catalogPagination';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import CatalogControls from '@/features/storefront/modules/products/components/catalog-controls';
import type { GroceryProduct, GroceryDepartment } from '@/features/storefront/types';
import { UrbanContainer, UrbanPageHeader, UrbanPageShell, UrbanPager } from '@/features/storefront/modules/urban/UrbanPrimitives';

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
    availability: availability === 'all' || availability === 'low-stock' ? availability : 'in-stock',
    organic: organic === 'true',
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  // Filters offer every active aisle, so the last aisle is as reachable as the first.
  const { departments }: { departments: GroceryDepartment[] } = await getAllDepartments();
  const activeDepartment = departments.find((entry) => entry.handle === department);

  const title = activeDepartment?.name || (search ? `“${search}”` : 'Shop groceries');
  const description = activeDepartment?.description || (search ? 'Matching products from today\'s grocery selection.' : 'Every aisle in one place. Filter by aisle, narrow to organic, or include items that are sold out.');
  const totalPages = catalogTotalPages(count, pageSize);
  const pageParams = { department, sort, search, availability, organic };
  if (page > totalPages) redirect(catalogPageHref('/products', pageParams, totalPages));

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-7 py-7 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Shop', href: activeDepartment || search ? '/products' : undefined }, ...(activeDepartment ? [{ label: activeDepartment.name }] : search ? [{ label: 'Search' }] : [])]}
          title={title}
          description={description}
          aside={<p role="status" className="text-sm tabular-nums text-[var(--sf-ink-muted)]">{count} {count === 1 ? 'product' : 'products'}{count ? ` · showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)}` : ''}</p>}
        />

        <CatalogControls departments={departments} activeDepartment={department} search={search} sort={sort || 'name'} availability={availability || 'in-stock'} organic={organic === 'true'}>
          <UrbanProductGrid products={products} columns="narrow" />
          {totalPages > 1 ? (
            <div className="mt-10 border-t border-[var(--sf-rule)]">
              <UrbanPager
                label="Catalog pages"
                page={Math.min(page, totalPages)}
                totalPages={totalPages}
                previousHref={catalogPageHref('/products', pageParams, Math.max(1, page - 1))}
                nextHref={catalogPageHref('/products', pageParams, Math.min(totalPages, page + 1))}
              />
            </div>
          ) : null}
        </CatalogControls>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
