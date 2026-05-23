import type { GroceryDepartment, GroceryProduct } from '@/features/storefront/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, PackageSearch, SlidersHorizontal, Thermometer } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getDepartmentByHandle, getProductsByDepartment } from '@/features/storefront/lib/data/departments';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel } from '@/features/storefront/modules/urban/UrbanPrimitives';

type Props = {
  params: Promise<{ handle: string; countryCode?: string }>;
  searchParams: Promise<{ sortBy?: string; page?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const department: GroceryDepartment | null = await getDepartmentByHandle(params.handle);
  if (!department) notFound();
  return {
    title: `${department.name} | Urban Express`,
    description: department.description ?? `Shop the ${department.name} department in Urban Express.`,
    alternates: { canonical: `/departments/${params.handle}` },
  };
}

export async function DepartmentPage(props: Props) {
  const [searchParams, params] = await Promise.all([props.searchParams, props.params]);
  const department: GroceryDepartment | null = await getDepartmentByHandle(params.handle);
  if (!department) notFound();

  const { products, totalCount }: { products: GroceryProduct[]; totalCount: number } = await getProductsByDepartment(
    department.handle,
    { sortBy: searchParams.sortBy, page: searchParams.page ? parseInt(searchParams.page) : 1 },
  );

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <Link href="/departments" className="hover:text-[#ffb693]">Aisles</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">{department.name}</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <UrbanPanel className="relative overflow-hidden p-5 sm:p-8 lg:p-10">
            <div className="absolute right-0 top-0 h-full w-1/3 bg-[linear-gradient(135deg,transparent,#ff6b00_45%,transparent)] opacity-10" />
            <div className="relative z-10 max-w-4xl">
              <UrbanBadge tone="orange"><PackageSearch className="h-3 w-3" /> Aisle sector</UrbanBadge>
              <UrbanHeadline className="mt-5">{department.name}</UrbanHeadline>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">{department.description || 'Fast-moving grocery inventory, picker-ready and organized for urban route speed.'}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <UrbanButtonLink href={`/products?department=${department.handle}`}>Open inventory</UrbanButtonLink>
                <UrbanButtonLink href="/departments" variant="ghost">All sectors</UrbanButtonLink>
              </div>
            </div>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Items in sector" value={totalCount} icon={Boxes} />
            <UrbanMetric label="Temp zone" value={department.temperatureZone || 'Aisle'} icon={Thermometer} />
            <UrbanMetric label="Sort mode" value={searchParams.sortBy || 'name'} icon={SlidersHorizontal} />
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#5a4136] pb-3">
            <div>
              <p className="font-market-label text-xs font-black uppercase tracking-[0.22em] text-[#ffb693]">Live product feed</p>
              <h2 className="mt-1 font-market-label text-4xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">Picker-ready stock</h2>
            </div>
            <div className="flex gap-2">
              {['name', 'price-asc', 'price-desc', 'low-stock'].map((sort) => (
                <Link key={sort} href={`/departments/${department.handle}?sortBy=${sort}`} className={`border px-3 py-2 font-market-label text-xs font-black uppercase tracking-[0.14em] ${searchParams.sortBy === sort || (!searchParams.sortBy && sort === 'name') ? 'border-[#ffb693] bg-[#ffb693] text-[#561f00]' : 'border-[#5a4136] bg-[#282a2b] text-[#e2bfb0]'}`}>
                  {sort.replace('-', ' ')}
                </Link>
              ))}
            </div>
          </div>
          <UrbanProductGrid products={products} featuredFirst />
        </section>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
