import Link from 'next/link';
import { LogOut, User } from 'lucide-react';
import { signOutShopper } from '@/features/storefront/modules/account/auth/actions';
import type { GroceryDepartment, GroceryStore, GroceryUser } from '../../types';
import UrbanMobileMenu from '../urban/UrbanMobileMenu';
import { UrbanStoreLogo } from '../urban/UrbanStoreLogo';
import { UrbanSearchStrip } from '../urban/UrbanPrimitives';
import { RigelCartButton } from './RigelChrome';

/** One light bar: mark, a wide search, sign-in and the dark cart pill. On phones the mark is centred. */
export default function RigelHeader({ store, user, departments }: { store: GroceryStore; user: GroceryUser | null; departments: GroceryDepartment[] }) {
  const logo = { name: store.name, logoUrl: store.logoUrl, logoIcon: store.logoIcon, logoColor: store.logoColor };
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--sf-rule)] bg-[var(--sf-card)]">
      <div className="flex h-[3.75rem] items-center gap-3 px-3 sm:px-5 lg:h-[5.75rem] lg:gap-8 lg:px-8">
        <UrbanMobileMenu signedIn={Boolean(user)} storeName={store.name} logoUrl={store.logoUrl} logoIcon={store.logoIcon} logoColor={store.logoColor} departments={departments.map((d) => ({ href: `/departments/${d.handle}`, label: d.name }))} />
        <Link prefetch={false} href="/" aria-label={`${store.name} home`} className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2.5 lg:w-[15rem] lg:flex-none lg:justify-start">
          <UrbanStoreLogo {...logo} />
          <span className="truncate text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--sf-accent-hover)] lg:text-[1.5rem] lg:text-[var(--sf-ink)]">{store.name}</span>
        </Link>
        <div className="hidden min-w-0 flex-1 md:block"><UrbanSearchStrip placeholder="Search products, brands, etc." /></div>
        <nav aria-label="Your shopping" className="flex shrink-0 items-center gap-1 lg:gap-3">
          <Link prefetch={false} href={user ? '/account' : '/account/sign-in'} aria-label={user ? 'Your account' : 'Sign in'} className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2.5 text-[0.9375rem] font-medium hover:bg-[var(--sf-paper-2)]">
            <User className="h-5 w-5" aria-hidden="true" /><span className="hidden lg:inline">{user ? (user.firstName || 'Account') : 'Sign in'}</span>
          </Link>
          {user ? <form action={signOutShopper} className="hidden xl:block"><button type="submit" aria-label="Sign out" className="grid h-11 w-11 place-items-center rounded-full text-[var(--sf-ink-muted)] hover:bg-[var(--sf-paper-2)]"><LogOut className="h-5 w-5" aria-hidden="true" /></button></form> : null}
          <div className="hidden lg:block"><RigelCartButton /></div>
        </nav>
      </div>
    </header>
  );
}
