'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Leaf, Search, SlidersHorizontal } from 'lucide-react';
import { UrbanButton, UrbanSelect, UrbanTextInput } from '../../../urban/UrbanPrimitives';
type Props = { departments: Array<{ id: string; name: string; handle: string }>; activeDepartment?: string; search?: string; sort?: string; availability?: string; organic?: boolean };
export default function CatalogControls({ departments, activeDepartment, search = '', sort = 'name', availability = 'in-stock', organic = false }: Props) {
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(search), [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => { setSearchValue(search); }, [search]);
  function update(key: string, value?: string | boolean) {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('page');
    if (value === undefined || value === '' || value === false || value === 'in-stock') params.delete(key); else params.set(key, String(value));
    start(() => router.push(`${pathname}${params.size ? `?${params}` : ''}`));
  }
  return <section aria-label="Filter products" aria-busy={pending} className="rounded-lg border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-3 sm:p-4">
    <div className="flex items-end gap-2"><form role="search" onSubmit={(event) => { event.preventDefault(); update('search', searchValue.trim()); }} className="min-w-0 flex-1"><label htmlFor="catalog-search" className="mb-2 block text-xs font-semibold text-[var(--sf-ink-muted)]">Search this selection</label><div className="flex min-w-0 border border-[var(--sf-rule-strong)]"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sf-ink-muted)]" aria-hidden="true" /><UrbanTextInput id="catalog-search" type="search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Bananas, oat milk, olive oil…" className="border-0 pl-9" /></div><UrbanButton type="submit" disabled={pending} className="shrink-0 rounded-none border-0">Go</UrbanButton></div></form><button type="button" aria-expanded={filtersOpen} aria-controls="catalog-filter-options" onClick={() => setFiltersOpen((value) => !value)} className="flex h-11 items-center gap-1 rounded border border-[var(--sf-rule-strong)] px-3 text-xs font-semibold sm:hidden"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Filters{organic || availability !== 'in-stock' || sort !== 'name' ? ' •' : ''}</button></div>
    <div id="catalog-filter-options" className={`${filtersOpen ? 'grid' : 'hidden'} mt-3 gap-3 sm:grid sm:grid-cols-3 sm:items-end`}>
      <label className="sf-label">Sort<UrbanSelect value={sort} disabled={pending} onChange={(event) => update('sort', event.target.value)}><option value="name">Name A–Z</option><option value="price-asc">Price low to high</option><option value="price-desc">Price high to low</option><option value="newest">Newest</option><option value="low-stock">Low stock first</option></UrbanSelect></label>
      <label className="sf-label">Availability<UrbanSelect value={availability} disabled={pending} onChange={(event) => update('availability', event.target.value)}><option value="in-stock">In stock</option><option value="low-stock">Low stock</option><option value="all">All products</option></UrbanSelect></label>
      <label className="flex min-h-11 items-center gap-2 rounded border border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] px-3 text-sm"><input type="checkbox" checked={organic} disabled={pending} onChange={(event) => update('organic', event.target.checked)} className="h-4 w-4 accent-[var(--sf-accent)]" /><Leaf className="h-4 w-4 text-[var(--sf-sage)]" aria-hidden="true" />Organic</label>
    </div>
    <nav aria-label="Filter by aisle" className="sf-scroll-row mt-3">{[{ id: 'all', handle: '', name: 'All aisles' }, ...departments].map((department) => <button key={department.id} type="button" disabled={pending} aria-pressed={(activeDepartment || '') === department.handle} onClick={() => update('department', department.handle)} className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium ${(activeDepartment || '') === department.handle ? 'border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white' : 'border-[var(--sf-rule)] bg-[var(--sf-paper)] text-[var(--sf-ink-muted)]'}`}>{department.name}</button>)}</nav>
    <p role="status" className="text-xs text-[var(--sf-ink-muted)]">{pending ? 'Updating products…' : ''}</p>
  </section>;
}
