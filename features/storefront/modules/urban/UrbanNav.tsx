import Link from 'next/link';
import { ListChecks, LogOut, User } from 'lucide-react';
import { signOutShopper } from '@/features/storefront/modules/account/auth/actions';
import { getDepartmentsList } from '../../lib/data/departments';
import { getStore } from '../../lib/data/store';
import { getUser } from '../../lib/data/user';
import UrbanMobileMenu from './UrbanMobileMenu';
import { UrbanSearchStrip } from './UrbanPrimitives';
import { MarketBasketLink } from '../market/MarketBasket';
import { MarketModeLink } from '../market/MarketMode';
import { UrbanStoreLogo, type UrbanStoreLogoProps } from './UrbanStoreLogo';

function StoreMark(props: UrbanStoreLogoProps) {
  return (
    <Link prefetch={false} href="/" className="flex min-h-11 min-w-0 items-center gap-2.5" aria-label={`${props.name} home`}>
      <UrbanStoreLogo {...props} />
      <span className="truncate font-[family-name:var(--sf-font-display)] text-[1.2rem] font-bold leading-none tracking-[-0.035em] sm:text-[1.4rem]">{props.name}</span>
    </Link>
  );
}

export default async function UrbanNav() {
  const [store, { departments }, user] = await Promise.all([getStore(), getDepartmentsList(0, 8).catch(() => ({ departments: [] })), getUser()]);
  const iconLink = 'h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-[var(--sf-ink)] transition-colors hover:bg-[var(--sf-paper-2)]';
  return <>
    <div className="sf-dark">
      <div className="mx-auto flex max-w-[84rem] items-center justify-between gap-4 px-4 py-2 text-[0.8125rem] sm:px-6 lg:px-8">
        <p className="min-w-0 truncate text-[var(--sf-header-ink-muted)]">{store.tagline || (store.address ? `Shopping at ${store.address}` : `Shopping at ${store.name}`)}</p>
        <nav aria-label="Store services" className="hidden shrink-0 items-center gap-5 font-medium md:flex">
          <MarketModeLink tone="dark" />
          <Link prefetch={false} href="/order-access" className="inline-flex min-h-8 items-center hover:underline hover:underline-offset-4">Find an order</Link>
          <Link prefetch={false} href="/support" className="inline-flex min-h-8 items-center hover:underline hover:underline-offset-4">Help</Link>
        </nav>
      </div>
    </div>
    <header className="sticky top-0 z-40 border-b border-[var(--sf-rule)] bg-[color-mix(in_oklch,var(--sf-paper)_98%,transparent)] backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex max-w-[84rem] items-center gap-2 px-4 py-2.5 sm:gap-4 sm:px-6 lg:px-8 lg:py-3">
        <UrbanMobileMenu signedIn={Boolean(user)} storeName={store.name} logoUrl={store.logoUrl} logoIcon={store.logoIcon} logoColor={store.logoColor} departments={departments.map((d) => ({ href: `/departments/${d.handle}`, label: d.name }))} />
        <div className="min-w-0 flex-1 md:flex-none lg:w-[15rem]"><StoreMark name={store.name} logoUrl={store.logoUrl} logoIcon={store.logoIcon} logoColor={store.logoColor} /></div>
        <div className="hidden min-w-0 flex-1 md:block"><UrbanSearchStrip placeholder="Search bananas, oat milk, sourdough…" /></div>
        <nav aria-label="Your shopping" className="flex shrink-0 items-center gap-1">
          <Link prefetch={false} href="/lists" className={`${iconLink} hidden lg:inline-flex`}><ListChecks className="h-5 w-5" aria-hidden="true" />Lists</Link>
          <Link prefetch={false} href={user ? '/account' : '/account/sign-in'} aria-label={user ? 'Your account' : 'Sign in'} className={`${iconLink} inline-flex`}><User className="h-5 w-5" aria-hidden="true" /><span className="hidden xl:inline">{user ? 'Account' : 'Sign in'}</span></Link>
          {user ? <form action={signOutShopper} className="hidden lg:block"><button type="submit" className={`${iconLink} inline-flex`}><LogOut className="h-5 w-5" aria-hidden="true" /><span className="hidden xl:inline">Sign out</span><span className="sr-only xl:hidden">Sign out</span></button></form> : null}
          <div className="hidden lg:block"><MarketBasketLink /></div>
        </nav>
      </div>
      <div className="px-4 pb-3 sm:px-6 md:hidden"><UrbanSearchStrip placeholder="What’s on your list?" /></div>
      <div className="hidden border-t border-[var(--sf-rule)] md:block">
        <div className="mx-auto flex max-w-[84rem] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <nav aria-label="Aisles" className="sf-scroll-row min-w-0 items-center text-sm font-semibold">
            <Link prefetch={false} href="/products" className="inline-flex min-h-11 items-center rounded-full px-3 hover:bg-[var(--sf-paper-2)]">Shop all</Link>
            {departments.map((department) => (
              <Link prefetch={false} key={department.id} href={`/departments/${department.handle}`} className="inline-flex min-h-11 items-center rounded-full px-3 text-[var(--sf-ink-muted)] hover:bg-[var(--sf-paper-2)] hover:text-[var(--sf-ink)]">{department.name}</Link>
            ))}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--sf-rule-strong)]" />
            <Link prefetch={false} href="/deals" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[var(--sf-accent)] hover:bg-[var(--sf-accent-soft)]"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--sf-accent)]" />Specials</Link>
          </nav>
          <div className="shrink-0 md:hidden lg:block"><Link prefetch={false} href="/departments" className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-[var(--sf-rule-strong)] decoration-2 underline-offset-[6px] hover:decoration-[var(--sf-ink)]">All aisles</Link></div>
        </div>
      </div>
    </header>
  </>;
}
