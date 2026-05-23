import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, PackageSearch, RadioTower, SlidersHorizontal } from 'lucide-react';

import { getProductsList } from '@/features/storefront/lib/data/products';
import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import CatalogControls from '@/features/storefront/modules/products/components/catalog-controls';
import type { GroceryProduct, GroceryDepartment } from '@/features/storefront/types';
import { UrbanBadge, UrbanContainer, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Inventory | Openfront Grocery',
    description: 'Browse fast urban grocery inventory across produce, pantry, dairy, prepared foods, frozen, household, and more.',
  };
}

export async function ProductsPage(props: {
  params: Promise<{ countryCode?: string }>;
  searchParams: Promise<{ department?: string; sort?: string; search?: string; availability?: string; organic?: string }>;
}) {
  await props.params;
  const searchParams = await props.searchParams;
  const { department, sort, search, availability, organic } = searchParams;

  const { products, count }: { products: GroceryProduct[]; count: number } = await getProductsList({
    department,
    sort,
    search,
    availability: availability as any,
    organic: organic === 'true',
    limit: 24,
    offset: 0,
  });

  const { departments }: { departments: GroceryDepartment[] } = await getDepartmentsList(0, 20);
  const activeDepartment = departments.find((entry) => entry.handle === department);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-6">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Inventory</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <UrbanPanel className="relative overflow-hidden p-5 sm:p-8 lg:p-10">
            <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(135deg,transparent,#ff6b00_45%,transparent)] opacity-10 lg:block" />
            <div className="relative z-10 max-w-4xl">
              <UrbanBadge tone="orange"><PackageSearch className="h-3 w-3" /> Inventory terminal</UrbanBadge>
              <UrbanHeadline className="mt-5">{activeDepartment?.name || (search ? `Search: ${search}` : 'Browse every sector')}</UrbanHeadline>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">
                {activeDepartment?.description || (search ? 'Matching live catalog signals across SKU, name, and handle.' : 'Filter fast-moving grocery inventory by aisle, stock state, organic certification, unit price, and low-stock signals.')}
              </p>
            </div>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Live items" value={count} icon={RadioTower} />
            <UrbanMetric label="Aisle sectors" value={departments.length} icon={Boxes} />
          </div>
        </section>

        <CatalogControls departments={departments} activeDepartment={department} search={search} sort={sort || 'name'} availability={availability || 'in-stock'} organic={organic === 'true'} />

        {(search || department || availability || organic) && (
          <div className="flex flex-wrap items-center gap-2 border border-[#5a4136] bg-[#1e2020] p-3 text-sm text-[#e2bfb0]">
            <UrbanBadge tone="muted"><SlidersHorizontal className="h-3 w-3" /> Active filters</UrbanBadge>
            {search && <UrbanBadge>Search: {search}</UrbanBadge>}
            {activeDepartment && <UrbanBadge>Department: {activeDepartment.name}</UrbanBadge>}
            {availability && <UrbanBadge tone="blue">Availability: {availability.replace('-', ' ')}</UrbanBadge>}
            {organic === 'true' && <UrbanBadge tone="orange">Organic only</UrbanBadge>}
            <Link href="/products" className="font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#ffb693] hover:text-[#ff6b00]">Clear all</Link>
          </div>
        )}

        <UrbanProductGrid products={products} featuredFirst={!search && !department} />
      </UrbanContainer>
    </UrbanPageShell>
  );
}
