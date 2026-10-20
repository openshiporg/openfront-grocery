'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Leaf, Search, SlidersHorizontal, X } from 'lucide-react';
import { UrbanButton, UrbanSelect } from '../../../urban/UrbanPrimitives';

type Props = {
  departments: Array<{ id: string; name: string; handle: string }>;
  activeDepartment?: string;
  search?: string;
  sort?: string;
  availability?: string;
  organic?: boolean;
  /** Server-rendered results; the controls frame them without owning catalog data. */
  children?: ReactNode;
};

const sorts = [['name', 'Name A–Z'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['newest', 'Newest'], ['low-stock', 'Low stock first']] as const;
const availabilities = [['in-stock', 'In stock'], ['low-stock', 'Low stock'], ['all', 'Everything, incl. sold out']] as const;

export default function CatalogControls({ departments, activeDepartment, search = '', sort = 'name', availability = 'in-stock', organic = false, children }: Props) {
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);
  const [pending, start] = useTransition();
  const sheet = useRef<HTMLDialogElement>(null);
  useEffect(() => { setSearchValue(search); }, [search]);
  function update(key: string, value?: string | boolean) {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('page');
    if (value === undefined || value === '' || value === false || value === 'in-stock') params.delete(key); else params.set(key, String(value));
    start(() => router.push(`${pathname}${params.size ? `?${params}` : ''}`));
  }
  const refinements = (organic ? 1 : 0) + (availability !== 'in-stock' ? 1 : 0) + (sort !== 'name' ? 1 : 0);
  const activeAisle = departments.find((department) => department.handle === activeDepartment);

  const filterFields = (idPrefix: string) => <div className="space-y-6">
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Show</legend>
      <div className="grid gap-1">
        {availabilities.map(([value, label]) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--sf-radius-sm)] px-2 text-sm hover:bg-[var(--sf-paper-2)]">
            <input type="radio" name={`${idPrefix}-availability`} value={value} checked={availability === value} disabled={pending} onChange={() => update('availability', value)} className="sf-check" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-sage-light)] px-3 text-sm font-semibold text-[var(--sf-sage)]">
      <span className="inline-flex items-center gap-2"><Leaf className="h-4 w-4" aria-hidden="true" />Organic only</span>
      <input type="checkbox" role="switch" checked={organic} disabled={pending} onChange={(event) => update('organic', event.target.checked)} className="sf-check" />
    </label>
    <label className="sf-label">Sort by
      <UrbanSelect value={sort} disabled={pending} onChange={(event) => update('sort', event.target.value)}>
        {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </UrbanSelect>
    </label>
  </div>;

  return <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-12" aria-busy={pending}>
    <aside aria-label="Filter products" className="hidden lg:sticky lg:top-[calc(var(--sf-header-offset)+1rem)] lg:block">
      <nav aria-label="Filter by aisle">
        <p className="mb-2 text-sm font-semibold">Aisles</p>
        <ul className="grid gap-0.5">
          {[{ id: 'all', handle: '', name: 'All aisles' }, ...departments].map((department) => {
            const current = (activeDepartment || '') === department.handle;
            return <li key={department.id}><button type="button" disabled={pending} aria-pressed={current} onClick={() => update('department', department.handle)} className={`flex min-h-10 w-full items-center rounded-[var(--sf-radius-sm)] px-3 text-left text-sm transition-colors ${current ? 'bg-[var(--sf-ink)] font-semibold text-[var(--sf-paper)]' : 'text-[var(--sf-ink-muted)] hover:bg-[var(--sf-paper-2)] hover:text-[var(--sf-ink)]'}`}>{department.name}</button></li>;
          })}
        </ul>
      </nav>
      <div className="mt-8 border-t border-[var(--sf-rule)] pt-6">{filterFields('desktop')}</div>
    </aside>

    <div className="min-w-0 space-y-5">
      <div className="flex items-center gap-2">
        <form role="search" onSubmit={(event) => { event.preventDefault(); update('search', searchValue.trim()); }} className="relative min-w-0 flex-1">
          <label htmlFor="catalog-search" className="sr-only">Search this selection</label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sf-ink-faint)]" aria-hidden="true" />
          <input id="catalog-search" type="search" enterKeyHint="search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder={activeAisle ? `Search ${activeAisle.name}` : 'Bananas, oat milk, olive oil…'} className="sf-field rounded-full pl-10 pr-20" />
          <UrbanButton type="submit" size="sm" variant="dark" disabled={pending} className="absolute right-1.5 top-1/2 -translate-y-1/2">Go</UrbanButton>
        </form>
        <button type="button" onClick={() => sheet.current?.showModal()} aria-haspopup="dialog" className="relative inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-inset ring-[var(--sf-rule-strong)] lg:hidden">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Filters</span>
          {refinements ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--sf-accent)] px-1 text-[0.6875rem] font-bold text-[var(--sf-accent-ink)]" aria-label={`${refinements} filters applied`}>{refinements}</span> : null}
        </button>
      </div>

      <nav aria-label="Filter by aisle" className="sf-scroll-row sf-bleed-row lg:hidden">
        {[{ id: 'all', handle: '', name: 'All aisles' }, ...departments].map((department) => <button key={department.id} type="button" disabled={pending} aria-pressed={(activeDepartment || '') === department.handle} onClick={() => update('department', department.handle)} className="sf-chip">{department.name}</button>)}
      </nav>

      {(search || activeAisle || organic || availability !== 'in-stock') ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {search ? <button type="button" disabled={pending} onClick={() => update('search', '')} aria-label={`Remove search “${search}”`} className="sf-chip bg-[var(--sf-paper-2)]">“{search}”<X className="h-3.5 w-3.5" aria-hidden="true" /></button> : null}
          {activeAisle ? <button type="button" disabled={pending} onClick={() => update('department', '')} aria-label={`Remove aisle filter ${activeAisle.name}`} className="sf-chip bg-[var(--sf-paper-2)]">{activeAisle.name}<X className="h-3.5 w-3.5" aria-hidden="true" /></button> : null}
          {availability !== 'in-stock' ? <button type="button" disabled={pending} onClick={() => update('availability', 'in-stock')} aria-label="Show in-stock products only" className="sf-chip bg-[var(--sf-paper-2)]">{availabilities.find(([value]) => value === availability)?.[1] || availability}<X className="h-3.5 w-3.5" aria-hidden="true" /></button> : null}
          {organic ? <button type="button" disabled={pending} onClick={() => update('organic', false)} aria-label="Remove organic filter" className="sf-chip bg-[var(--sf-paper-2)]">Organic<X className="h-3.5 w-3.5" aria-hidden="true" /></button> : null}
          <Link prefetch={false} href={pathname || '/products'} className="ml-1 inline-flex min-h-10 items-center text-sm font-semibold underline underline-offset-4">Clear all</Link>
        </div>
      ) : null}

      <p role="status" className="sr-only">{pending ? 'Updating products…' : ''}</p>
      <div className={`transition-opacity duration-[var(--sf-dur-normal)] ${pending ? 'opacity-50' : ''}`}>{children}</div>
    </div>

    <dialog ref={sheet} aria-labelledby="catalog-filters-title" className="sf-sheet sf-sheet-bottom" onClick={(event) => { if (event.target === event.currentTarget) sheet.current?.close(); }}>
      <div className="flex items-center justify-between border-b border-[var(--sf-rule)] px-5 py-3">
        <h2 id="catalog-filters-title" className="text-lg font-bold">Filters & sort</h2>
        <button type="button" autoFocus onClick={() => sheet.current?.close()} aria-label="Close filters" className="-mr-2 grid h-11 w-11 place-items-center rounded-full hover:bg-[var(--sf-paper-2)]"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">{filterFields('sheet')}</div>
      <div className="border-t border-[var(--sf-rule)] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"><UrbanButton type="button" variant="dark" className="w-full" onClick={() => sheet.current?.close()}>{pending ? 'Updating…' : 'Show results'}</UrbanButton></div>
    </dialog>
  </div>;
}
