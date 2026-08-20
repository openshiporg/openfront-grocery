'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Leaf, Search } from 'lucide-react';

import { UrbanBadge, UrbanButton, UrbanSelect, UrbanTextInput } from '@/features/storefront/modules/urban/UrbanPrimitives';
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
    <section className="border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px_160px_auto] lg:items-end">
        <form onSubmit={submitSearch} className="space-y-2">
          <label htmlFor="catalog-search" className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">Search</label>
          <div className="flex min-w-0 border border-[var(--sf-rule-strong)]">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sf-ink-faint)]" />
              <UrbanTextInput id="catalog-search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Bananas, oat milk, olive oil…" className="border-0 pl-9 focus-visible:outline-none" />
            </div>
            <UrbanButton type="submit" disabled={isPending} className="shrink-0 rounded-none border-0 border-l border-[var(--sf-rule-strong)]">Go</UrbanButton>
          </div>
        </form>

        <label className="space-y-2 text-sm">
          <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">Sort</span>
          <UrbanSelect value={sort} onChange={(event) => updateParam('sort', event.target.value)}>
            <option value="name">Name A–Z</option>
            <option value="price-asc">Price low to high</option>
            <option value="price-desc">Price high to low</option>
            <option value="newest">Newest</option>
            <option value="low-stock">Low stock first</option>
          </UrbanSelect>
        </label>

        <label className="space-y-2 text-sm">
          <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">Stock</span>
          <UrbanSelect value={availability} onChange={(event) => updateParam('availability', event.target.value)}>
            <option value="in-stock">In stock</option>
            <option value="low-stock">Low stock</option>
            <option value="all">All products</option>
          </UrbanSelect>
        </label>

        <label className="flex h-11 items-center gap-2 border border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] px-3 text-sm font-medium">
          <input type="checkbox" checked={organic} onChange={(event) => updateParam('organic', event.target.checked)} className="h-4 w-4 accent-[var(--sf-accent)]" />
          <Leaf className="h-4 w-4 text-[var(--sf-sage)]" /> Organic
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => updateParam('department', '')} className={`border px-3 py-1.5 text-sm font-medium transition ${!activeDepartment ? 'border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white' : 'border-[var(--sf-rule)] bg-[var(--sf-paper)] text-[var(--sf-ink-muted)] hover:border-[var(--sf-accent)]'}`}>
          All aisles
        </button>
        {departments.map((dept) => (
          <button key={dept.id} type="button" onClick={() => updateParam('department', dept.handle)} className={`border px-3 py-1.5 text-sm font-medium transition ${activeDepartment === dept.handle ? 'border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white' : 'border-[var(--sf-rule)] bg-[var(--sf-paper)] text-[var(--sf-ink-muted)] hover:border-[var(--sf-accent)]'}`}>
            {dept.name}
          </button>
        ))}
      </div>
      {isPending ? <p className="mt-2 text-xs text-[var(--sf-ink-faint)]">Updating catalog…</p> : null}
    </section>
  );
}
