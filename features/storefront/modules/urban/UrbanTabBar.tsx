'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleUser, House, NotebookText, Search, ShoppingCart } from 'lucide-react';
import { useMarketBasket } from '../market/MarketBasket';

const tabs = [
  { href: '/', label: 'Home', Icon: House, match: (path: string) => path === '/' },
  { href: '/products', label: 'Shop', Icon: Search, match: (path: string) => /^\/(departments|products|deals|fulfillment|lists|favorites)(\/|$)/.test(path) },
  { href: '/account/orders', label: 'Orders', Icon: NotebookText, match: (path: string) => /^\/(account\/orders|order|order-access|subscriptions)(\/|$)/.test(path) },
];

/** Thumb-reach navigation for phones and small tablets; hidden from lg up where the header and sidebar carry it. */
export default function UrbanTabBar() {
  const pathname = usePathname() || '/';
  const { cart, loaded } = useMarketBasket();
  const count = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const cartActive = pathname === '/cart' || pathname.startsWith('/checkout');
  const accountActive = /^\/account(\/|$)/.test(pathname) && !pathname.startsWith('/account/orders');
  return (
    <nav aria-label="Quick navigation" className="sf-tabbar">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link prefetch={false} key={href} href={href} aria-current={active ? 'page' : undefined}>
              <Icon className={`h-6 w-6 ${active && label === 'Home' ? 'fill-current' : ''}`} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        <Link prefetch={false} href="/cart" aria-current={cartActive ? 'page' : undefined} aria-label={loaded ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}>
          <span className="relative">
            <ShoppingCart className="h-6 w-6" aria-hidden="true" />
            {loaded && count ? <span key={count} aria-hidden="true" className="sf-bump absolute -right-2.5 -top-1.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-[var(--sf-accent)] px-1 text-[0.625rem] font-bold tabular-nums text-[var(--sf-accent-ink)]">{count > 99 ? '99+' : count}</span> : null}
          </span>
          <span aria-hidden="true">Cart</span>
        </Link>
        <Link prefetch={false} href="/account" aria-current={accountActive ? 'page' : undefined}>
          <CircleUser className="h-6 w-6" aria-hidden="true" />
          Account
        </Link>
      </div>
    </nav>
  );
}
