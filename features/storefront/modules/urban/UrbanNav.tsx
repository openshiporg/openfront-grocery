import Link from 'next/link';
import { User } from 'lucide-react';
import { getDepartmentsList } from '../../lib/data/departments';
import { getStore } from '../../lib/data/store';
import UrbanMobileMenu from './UrbanMobileMenu';
import { UrbanSearchStrip } from './UrbanPrimitives';
import { MarketBasketLink } from '../market/MarketBasket';
import { MarketModeLink } from '../market/MarketMode';

export default async function UrbanNav() {
  const [store, { departments }] = await Promise.all([getStore(), getDepartmentsList(0, 8).catch(() => ({ departments: [] }))]);
  return <>
    {store.tagline ? <div className="bg-[var(--sf-header)] px-4 py-2 text-center text-xs leading-5 text-[var(--sf-header-ink)]">{store.tagline}</div> : null}
    <header className="sticky top-0 z-40 border-b border-[var(--sf-rule)] bg-[var(--sf-paper)]">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.4fr)_auto] lg:px-8">
        <Link prefetch={false} href="/" className="flex min-w-0 items-center gap-2 font-[family-name:var(--sf-font-display)] text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
          {store.logoUrl ? <img src={store.logoUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" /> : null}
          <span>{store.name}</span>
        </Link>
        <div className="col-span-2 row-start-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1"><UrbanSearchStrip placeholder="What’s on your list?" /></div>
        <div className="col-start-2 row-start-1 flex items-center gap-2 lg:col-start-3">
          <Link prefetch={false} href="/account" aria-label="Your account" className="hidden min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--sf-rule)] sm:inline-flex"><User className="h-5 w-5" aria-hidden="true" /></Link>
          <MarketBasketLink />
          <UrbanMobileMenu departments={departments.map((d) => ({ href: `/departments/${d.handle}`, label: d.name }))} />
        </div>
      </div>
      <div className="border-t border-[var(--sf-rule)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <nav aria-label="Shop" className="sf-scroll-row min-w-0 text-sm font-medium">
            <Link prefetch={false} href="/products" className="inline-flex min-h-11 items-center pr-3">Shop all</Link>
            <Link prefetch={false} href="/departments" className="inline-flex min-h-11 items-center px-2">Aisles</Link>
            <Link prefetch={false} href="/deals" className="inline-flex min-h-11 items-center px-2 text-[var(--sf-accent)]">Specials</Link>
            <Link prefetch={false} href="/lists" className="hidden min-h-11 items-center px-2 md:inline-flex">My lists</Link>
          </nav>
          <div className="shrink-0"><MarketModeLink /></div>
        </div>
      </div>
    </header>
  </>;
}
