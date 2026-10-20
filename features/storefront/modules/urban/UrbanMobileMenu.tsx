'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { signOutShopper } from '@/features/storefront/modules/account/auth/actions';
import { UrbanStoreLogo, type UrbanStoreLogoProps } from './UrbanStoreLogo';

type NavLink = { href: string; label: string };

const groups: Array<{ title: string; links: NavLink[] }> = [
  { title: 'Shop', links: [{ href: '/products', label: 'Shop all groceries' }, { href: '/deals', label: 'Specials & coupons' }, { href: '/departments', label: 'Every aisle' }, { href: '/fulfillment', label: 'Delivery & pickup times' }] },
  { title: 'Your shopping', links: [{ href: '/lists', label: 'Shopping lists' }, { href: '/favorites', label: 'Favorites' }, { href: '/subscriptions', label: 'Recurring & rewards' }, { href: '/account/orders', label: 'Your orders' }, { href: '/account', label: 'Account' }] },
  { title: 'Help', links: [{ href: '/order-access', label: 'Find a guest order' }, { href: '/support', label: 'Help & contact' }, { href: '/policies', label: 'How orders work' }] },
];

export default function UrbanMobileMenu({ departments, storeName, logoUrl, logoIcon, logoColor, signedIn = false }: { departments: NavLink[]; storeName?: string; signedIn?: boolean } & Omit<UrbanStoreLogoProps, 'name'>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  function close() { dialog.current?.close(); }
  // The menu never stays modal across a sign-in/sign-out or a route change.
  useEffect(() => { dialog.current?.close(); }, [signedIn, pathname]);
  const link = 'flex min-h-11 items-center rounded-[var(--sf-radius-sm)] px-3 text-[0.9375rem] font-medium hover:bg-[var(--sf-paper-2)]';
  return <>
    <button
      type="button"
      aria-label="Open shopping menu"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls="market-menu"
      onClick={() => { dialog.current?.showModal(); setOpen(true); }}
      className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--sf-paper-2)] lg:hidden"
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
    <dialog
      ref={dialog}
      id="market-menu"
      aria-labelledby="market-menu-title"
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="sf-sheet sf-sheet-left"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--sf-rule)] px-5 py-3">
        <h2 id="market-menu-title" className="flex min-w-0 items-center gap-2.5 text-xl font-bold"><UrbanStoreLogo name={storeName || 'Menu'} logoUrl={logoUrl} logoIcon={logoIcon} logoColor={logoColor} /><span className="truncate">{storeName || 'Menu'}</span></h2>
        <button type="button" onClick={close} autoFocus aria-label="Close shopping menu" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--sf-paper-2)]"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <nav aria-label="Shopping menu" className="flex-1 space-y-6 overflow-y-auto px-2 py-4">
        {departments.length ? (
          <div>
            <p className="px-3 pb-2 text-xs font-semibold text-[var(--sf-ink-faint)]">Aisles</p>
            <div className="grid grid-cols-2 gap-1">
              {departments.map((item) => <Link prefetch={false} key={item.href} href={item.href} onClick={close} className={link}>{item.label}</Link>)}
            </div>
          </div>
        ) : null}
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-2 text-xs font-semibold text-[var(--sf-ink-faint)]">{group.title}</p>
            {group.links.map((item) => <Link prefetch={false} key={item.href} href={item.href} onClick={close} className={link}>{item.label}</Link>)}
            {group.title === 'Your shopping' ? (signedIn
              ? <form action={signOutShopper} onSubmit={close}><button type="submit" className={`${link} w-full gap-2 text-left`}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button></form>
              : <><Link prefetch={false} href="/account/sign-in" onClick={close} className={link}>Sign in</Link><Link prefetch={false} href="/account/register" onClick={close} className={link}>Create an account</Link></>) : null}
          </div>
        ))}
      </nav>
    </dialog>
  </>;
}
