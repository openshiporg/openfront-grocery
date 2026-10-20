'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, ListChecks, ShoppingBasket, User } from 'lucide-react';
import { useMarketBasket } from '../market/MarketBasket';

const tabs = [
  { href: '/', label: 'Home', Icon: Home, match: (path: string) => path === '/' },
  { href: '/departments', label: 'Aisles', Icon: LayoutGrid, match: (path: string) => /^\/(departments|products|deals|fulfillment)(\/|$)/.test(path) },
  { href: '/lists', label: 'Lists', Icon: ListChecks, match: (path: string) => /^\/(lists|favorites)(\/|$)/.test(path) },
  { href: '/account', label: 'Account', Icon: User, match: (path: string) => /^\/(account|subscriptions|order|order-access)(\/|$)/.test(path) },
];

/** Thumb-reach navigation for phones and small tablets; hidden from lg up where the header carries it. */
export default function UrbanTabBar() {
  const pathname = usePathname() || '/';
  const { cart, loaded } = useMarketBasket();
  const count = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const basketActive = pathname === '/cart' || pathname.startsWith('/checkout');
  return (
    <nav aria-label="Quick navigation" className="sf-tabbar">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map(({ href, label, Icon, match }) => (
          <Link prefetch={false} key={href} href={href} aria-current={match(pathname) ? 'page' : undefined}>
            <Icon className="h-[1.375rem] w-[1.375rem]" aria-hidden="true" />
            {label}
          </Link>
        ))}
        <Link prefetch={false} href="/cart" aria-current={basketActive ? 'page' : undefined} aria-label={loaded ? `Basket, ${count} ${count === 1 ? 'item' : 'items'}` : 'Basket'}>
          <span className="relative">
            <ShoppingBasket className="h-[1.375rem] w-[1.375rem]" aria-hidden="true" />
            {loaded && count ? <span key={count} aria-hidden="true" className="sf-bump absolute -right-2.5 -top-1.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-[var(--sf-accent)] px-1 text-[0.625rem] font-bold tabular-nums text-[var(--sf-accent-ink)]">{count > 99 ? '99+' : count}</span> : null}
          </span>
          <span aria-hidden="true">Basket</span>
        </Link>
      </div>
    </nav>
  );
}
