'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Leaf, Search, SlidersHorizontal } from 'lucide-react';

import { UrbanBadge, UrbanButton, UrbanPanel, UrbanSelect, UrbanTextInput } from '@/features/storefront/modules/urban/UrbanPrimitives';

interface CatalogControlsProps {
  departments: Array<{ id: string; name: string; handle: string }>;
  activeDepartment?: string;
  search?: string;
  sort?: string;
  availability?: string;
  organic?: boolean;
}

export default function CatalogControls({
  departments,
  activeDepartment,
  search = '',
  sort = 'name',
  availability = 'in-stock',
  organic = false,
}: CatalogControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);
  const [isPending, startTransition] = useTransition();

  const updateParam = (key: string, value?: string | boolean) => {
    const params = new URLSearchParams(searchParams?.toString() || '');

    if (value === undefined || value === '' || value === false || value === 'in-stock') {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }

    startTransition(() => {
      router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
    });
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    updateParam('search', searchValue.trim());
  };

  return (
    <UrbanPanel className="mt-6">
      <div className="border-b border-[#5a4136] bg-[#1a1c1c] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <UrbanBadge tone="muted"><SlidersHorizontal className="h-3 w-3" /> Inventory filters</UrbanBadge>
          {isPending ? <span className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#ffb693]">Updating signal…</span> : null}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_190px_190px_auto] lg:items-end">
          <form onSubmit={submitSearch} className="space-y-2">
            <label htmlFor="catalog-search" className="font-market-label text-xs font-black uppercase tracking-[0.18em] text-[#e2bfb0]">
              Search inventory
            </label>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#e2bfb0]" />
                <UrbanTextInput
                  id="catalog-search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search bananas, oat milk, rice, SKU..."
                  className="pl-10"
                />
              </div>
              <UrbanButton type="submit" disabled={isPending}>Search</UrbanButton>
            </div>
          </form>

          <label className="space-y-2 text-sm">
            <span className="block font-market-label text-xs font-black uppercase tracking-[0.18em] text-[#e2bfb0]">Sort</span>
            <UrbanSelect value={sort} onChange={(event) => updateParam('sort', event.target.value)}>
              <option value="name">Name A-Z</option>
              <option value="price-asc">Price low to high</option>
              <option value="price-desc">Price high to low</option>
              <option value="newest">Newest</option>
              <option value="low-stock">Low stock first</option>
            </UrbanSelect>
          </label>

          <label className="space-y-2 text-sm">
            <span className="block font-market-label text-xs font-black uppercase tracking-[0.18em] text-[#e2bfb0]">Availability</span>
            <UrbanSelect value={availability} onChange={(event) => updateParam('availability', event.target.value)}>
              <option value="in-stock">In stock only</option>
              <option value="low-stock">Low stock</option>
              <option value="all">All products</option>
            </UrbanSelect>
          </label>

          <label className="inline-flex h-[46px] items-center gap-2 border border-[#5a4136] bg-[#282a2b] px-4 py-3 font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#e2e2e2]">
            <input
              type="checkbox"
              checked={organic}
              onChange={(event) => updateParam('organic', event.target.checked)}
              className="h-4 w-4 border-[#5a4136] bg-[#1e2020] text-[#ffb693]"
            />
            <Leaf className="h-4 w-4 text-[#ffb693]" /> Organic
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => updateParam('department', '')}
            className={`px-4 py-2 font-market-label text-xs font-black uppercase tracking-[0.14em] transition ${
              !activeDepartment ? 'bg-[#ffb693] text-[#561f00]' : 'border border-[#5a4136] bg-[#282a2b] text-[#e2bfb0] hover:border-[#ffb693] hover:text-[#ffb693]'
            }`}
          >
            All sectors
          </button>
          {departments.map((dept) => (
            <button
              key={dept.id}
              type="button"
              onClick={() => updateParam('department', dept.handle)}
              className={`px-4 py-2 font-market-label text-xs font-black uppercase tracking-[0.14em] transition ${
                activeDepartment === dept.handle ? 'bg-[#ffb693] text-[#561f00]' : 'border border-[#5a4136] bg-[#282a2b] text-[#e2bfb0] hover:border-[#ffb693] hover:text-[#ffb693]'
              }`}
            >
              {dept.name}
            </button>
          ))}
        </div>
      </div>
    </UrbanPanel>
  );
}
