'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Bike, ChevronRight, Info, Leaf, MapPin, Pencil, ShoppingCart, X } from 'lucide-react';
import type { GroceryCartItem } from '../../types';
import { formatMoney } from '../../lib/marketFormatting';
import { clearCart, updateSubstitutionPreference } from '../../lib/data/cart';
import { useMarketBasket } from '../market/MarketBasket';
import { BasketDrawer } from '../market/MarketBasketDrawer';
import { RigelModeToggle, RigelSlotHeading, RigelSlotList, relativeDay, shortSlotLabel, useRigelFulfillment } from './RigelFulfillment';
import { DepartmentIcon } from './departmentIcon';

const RAIL_KEY = 'grocery_cart_rail';

type Chrome = {
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
  storeAddress?: string;
  shopperAddress?: string | null;
  deliveryArea?: string | null;
  departments: Array<{ id: string; name: string; handle: string }>;
};
const ChromeContext = createContext<Chrome | null>(null);

export function RigelChromeProvider({ children, storeAddress, shopperAddress, deliveryArea, departments }: { children: ReactNode; storeAddress?: string; shopperAddress?: string | null; deliveryArea?: string | null; departments: Chrome['departments'] }) {
  const [railOpen, setRailOpenState] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(RAIL_KEY) === 'closed') setRailOpenState(false); } catch { /* optional */ } }, []);
  const setRailOpen = (open: boolean) => {
    setRailOpenState(open);
    try { localStorage.setItem(RAIL_KEY, open ? 'open' : 'closed'); } catch { /* optional */ }
  };
  return <ChromeContext.Provider value={{ railOpen, setRailOpen, storeAddress, shopperAddress, deliveryArea, departments }}>{children}</ChromeContext.Provider>;
}

function useChrome() {
  const value = useContext(ChromeContext);
  if (!value) throw new Error('Rigel chrome requires RigelChromeProvider');
  return value;
}

function itemCount(items?: GroceryCartItem[]) {
  return items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
}

/** Header cart button: toggles the cart rail where it fits (xl and up), otherwise opens the basket drawer. */
export function RigelCartButton() {
  const { cart, loaded, loadError, reload } = useMarketBasket();
  const { railOpen, setRailOpen } = useChrome();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const count = itemCount(cart?.items);
  const drawerEnabled = pathname !== '/cart' && !pathname?.startsWith('/checkout');
  return <>
    <Link
      prefetch={false}
      href="/cart"
      onClick={(event) => {
        if (!drawerEnabled || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        if (loadError) reload();
        const rail = document.querySelector('[data-rigel-rail]');
        if (rail && window.matchMedia('(min-width: 1280px)').matches) setRailOpen(!railOpen);
        else setDrawer(true);
      }}
      aria-haspopup={drawerEnabled ? 'dialog' : undefined}
      aria-label={loaded ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--sf-header)] pl-4 pr-2 text-[0.9375rem] font-medium text-[var(--sf-header-ink)] transition-colors hover:bg-[var(--sf-header-2)]"
    >
      <ShoppingCart className="h-5 w-5" aria-hidden="true" />
      <span aria-hidden="true">Cart</span>
      <span key={count} aria-hidden="true" className={`grid h-6 min-w-6 place-items-center rounded-full bg-[var(--sf-header-ink)] px-1.5 text-xs font-bold tabular-nums text-[var(--sf-header)] ${count ? 'sf-bump' : ''}`}>{loaded ? count : '·'}</span>
    </Link>
    {drawerEnabled ? <BasketDrawer open={drawer} onClose={() => setDrawer(false)} /> : null}
  </>;
}

/** Sidebar + content + cart rail, used by the shopping pages. */
export function RigelFrame({ children }: { children: ReactNode }) {
  const { railOpen, departments } = useChrome();
  return (
    <div className="rg-frame" data-rail={railOpen ? 'on' : 'off'}>
      <aside aria-label="Departments and delivery" className="rg-sidebar hidden lg:block"><RigelSidebar departments={departments} /></aside>
      <div className="flex min-w-0 flex-col">{children}</div>
      {railOpen ? <div data-rigel-rail className="hidden xl:block"><RigelCartRail /></div> : null}
    </div>
  );
}

export function RigelSidebar({ departments }: { departments: Array<{ id: string; name: string; handle: string }> }) {
  const pathname = usePathname() || '/';
  const { storeAddress, shopperAddress } = useChrome();
  const { mode, windows, today } = useRigelFulfillment();
  const next = windows?.find((entry) => entry.available);
  const sameDay = Boolean(next && today && next.date === today);
  const address = mode === 'pickup' ? storeAddress : shopperAddress || storeAddress;
  return (
    <div className="flex min-h-full flex-col gap-6 px-4 pb-6 pt-5">
      {address ? (
        <Link prefetch={false} href={mode === 'pickup' || !shopperAddress ? '/fulfillment' : '/account/addresses'} className="flex min-h-9 items-start gap-2 text-[0.8125rem] font-medium leading-5 hover:underline hover:underline-offset-4">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0"><span className="sr-only">{mode === 'pickup' ? 'Pickup from ' : shopperAddress ? 'Delivering to ' : 'Shopping at '}</span>{address}</span>
        </Link>
      ) : null}
      <RigelModeToggle />
      <nav aria-label="Departments">
        <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-[0.02em] text-[var(--sf-ink-muted)]">Departments</p>
        <ul className="-mx-4 grid gap-0.5">
          {departments.map((department) => {
            const href = `/departments/${department.handle}`;
            const current = pathname === href;
            return (
              <li key={department.id}>
                <Link prefetch={false} href={href} aria-current={current ? 'page' : undefined} className={`relative mr-3 flex min-h-8 items-center gap-2.5 rounded-r-[var(--sf-radius-md)] pl-6 pr-3 text-[0.8125rem] transition-colors ${current ? 'bg-[var(--sf-accent-soft)] font-semibold text-[var(--sf-accent-hover)] before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--sf-accent)]' : 'text-[var(--sf-ink)] hover:bg-[var(--sf-paper-2)]'}`}>
                  <DepartmentIcon department={department} className={`h-4 w-4 shrink-0 ${current ? '' : 'text-[var(--sf-ink-muted)]'}`} />
                  <span className="truncate">{department.name}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link prefetch={false} href="/deals" aria-current={pathname === '/deals' ? 'page' : undefined} className="mr-3 flex min-h-8 items-center gap-2.5 rounded-r-[var(--sf-radius-md)] pl-6 pr-3 text-[0.8125rem] text-[var(--sf-ink)] hover:bg-[var(--sf-paper-2)]">
              <Leaf className="h-4 w-4 shrink-0 text-[var(--sf-ink-muted)]" aria-hidden="true" />Specials
            </Link>
          </li>
        </ul>
      </nav>
      {next ? (
        <Link prefetch={false} href="/fulfillment" className="group flex items-center gap-3 rounded-[var(--sf-radius-lg)] bg-[var(--sf-paper-2)] p-4 transition-colors hover:bg-[var(--sf-paper-3)]">
          <Bike className="h-7 w-7 shrink-0 text-[var(--sf-accent)]" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[0.8125rem] leading-5">
            <span className="block font-medium">{sameDay ? `Same-day ${mode}` : `Next ${mode}`}</span>
            <span className="block text-[var(--sf-ink-muted)]">{relativeDay(next.date, today)} · {shortSlotLabel(next)}</span>
            <span className="block text-[var(--sf-accent-hover)] underline underline-offset-2">All {mode} times</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}
      <div className="grid gap-2.5">
        <RigelSlotHeading />
        <RigelSlotList name="sidebar-window" />
      </div>
    </div>
  );
}

const SWAP_ORDER = ['allow', 'contact', 'remove'] as const;
const SWAP_LABEL = { allow: 'Swap', contact: 'Ask me', remove: 'Skip' } as const;
const SWAP_HINT = { allow: 'Best substitute', contact: 'Contact me first', remove: 'Leave it out' } as const;

function RailLine({ item }: { item: GroceryCartItem }) {
  const { busy, runExclusive } = useMarketBasket();
  const preference = item.substitutionPreference || 'allow';
  const next = SWAP_ORDER[(SWAP_ORDER.indexOf(preference) + 1) % SWAP_ORDER.length];
  const image = item.product.imageUrl || item.product.thumbnailUrl;
  const unit = item.product.unit && item.product.unit !== 'each' ? `(Per ${item.product.unit === 'lb' ? 'Pound' : item.product.unit})` : null;
  return (
    <li className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto_auto] items-start gap-x-2.5 py-2">
      <Link prefetch={false} href={`/products/${item.product.handle}`} className="block aspect-square overflow-hidden rounded-[var(--sf-radius-sm)] bg-[var(--sf-paper-3)]">
        {image ? <img src={image} alt="" loading="lazy" className="h-full w-full object-cover mix-blend-multiply" /> : null}
      </Link>
      <div className="min-w-0 pt-0.5">
        <Link prefetch={false} href={`/products/${item.product.handle}`} className="line-clamp-2 text-[0.8125rem] font-medium leading-[1.15rem] hover:underline">{item.product.name}</Link>
        {unit ? <p className="text-[0.75rem] text-[var(--sf-ink-muted)]">{unit}</p> : null}
        {!item.product.inStock ? <p className="text-xs font-semibold text-[var(--sf-danger)]">Unavailable — review in cart</p> : null}
      </div>
      <span className="mt-2 grid h-6 min-w-7 place-items-center rounded-[6px] border border-[var(--sf-rule)] px-1 text-[0.75rem] tabular-nums" aria-label={`Quantity ${item.quantity}`}>x{item.quantity}</span>
      <div className="flex flex-col items-end pt-0.5">
        <span className="text-[0.875rem] font-semibold tabular-nums">{formatMoney(item.subtotal)}</span>
        <button
          type="button"
          disabled={busy}
          title={`If unavailable: ${SWAP_HINT[preference]}`}
          aria-label={`If ${item.product.name} is unavailable: ${SWAP_HINT[preference]}. Change to ${SWAP_HINT[next]}`}
          onClick={() => void runExclusive(async () => { await updateSubstitutionPreference(item.id, next); }).catch(() => undefined)}
          className="inline-flex min-h-6 items-center gap-1 text-[0.75rem] text-[var(--sf-accent-hover)] hover:underline disabled:opacity-50"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />{SWAP_LABEL[preference]}
        </button>
      </div>
    </li>
  );
}

function substitutionSummary(items: GroceryCartItem[]) {
  const values = new Set(items.map((item) => item.substitutionPreference || 'allow'));
  if (values.size > 1) return 'Set per item. Use Swap on each line to choose what happens if it’s unavailable.';
  const only = [...values][0];
  if (only === 'contact') return 'Contact me. We’ll reach out before substituting anything that’s unavailable.';
  if (only === 'remove') return 'Not allowed. Unavailable items are left out and not charged.';
  return 'Allowed. We’ll pick a suitable substitute if your items aren’t available.';
}

export function RigelCartRail() {
  const { cart, loaded, busy, loadError, reload, runExclusive } = useMarketBasket();
  const { setRailOpen, shopperAddress, storeAddress, deliveryArea } = useChrome();
  const { mode, checkoutHref } = useRigelFulfillment();
  const [error, setError] = useState('');
  const items = cart?.items || [];
  const needsReview = items.some((item) => !item.product.inStock);
  const address = mode === 'pickup' ? storeAddress : shopperAddress;
  return (
    <section aria-labelledby="rail-title" className="rg-rail">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 id="rail-title" className="text-[1.375rem] font-medium">Cart</h2>
        <div className="flex items-center gap-1">
          {items.length ? <button type="button" disabled={busy} onClick={() => { setError(''); void runExclusive(async () => { if (!(await clearCart({ preserveSession: true }))) throw new Error('Your cart could not be cleared.'); }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Your cart could not be cleared.')); }} className="inline-flex min-h-9 items-center px-2 text-[0.875rem] text-[var(--sf-accent-hover)] underline underline-offset-4 disabled:opacity-50">Clear</button> : null}
          <button type="button" onClick={() => setRailOpen(false)} aria-label="Hide cart" className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--sf-paper-2)]"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5" aria-busy={busy}>
        <RigelModeToggle variant="rail" />
        <p className="mt-3 flex items-baseline gap-2 text-[0.8125rem] leading-5">
          <span className="min-w-0">{address || (deliveryArea ? `Delivers to ${deliveryArea}` : 'Add your address at checkout')}</span>
          <Link prefetch={false} href={mode === 'pickup' ? '/fulfillment' : shopperAddress ? '/account/addresses' : '/fulfillment'} className="shrink-0 text-[var(--sf-accent-hover)] underline underline-offset-2">{mode === 'pickup' || shopperAddress ? 'Edit' : 'Details'}</Link>
        </p>
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[0.8125rem] text-[var(--sf-ink-muted)]">{mode === 'pickup' ? 'Pickup' : 'Delivery'} <Info className="h-3.5 w-3.5" aria-hidden="true" /></p>
          <RigelSlotList name="rail-window" compact />
        </div>
        {!loaded && loadError ? (
          <div role="alert" className="py-8 text-center text-sm">
            <p className="font-medium">We couldn’t load your cart.</p>
            <button type="button" onClick={reload} className="mt-2 font-medium text-[var(--sf-accent-hover)] underline underline-offset-4">Try again</button>
          </div>
        ) : !loaded ? (
          <div className="space-y-2 py-4" aria-hidden="true">{[0, 1, 2].map((key) => <div key={key} className="sf-skeleton h-12" />)}</div>
        ) : !items.length ? (
          <div className="py-8 text-center">
            <ShoppingCart className="mx-auto h-7 w-7 text-[var(--sf-ink-faint)]" aria-hidden="true" />
            <p className="mt-2 text-[0.9375rem] font-medium">Your cart is empty</p>
            <p className="mt-1 text-[0.8125rem] text-[var(--sf-ink-muted)]">Tap + on any item to add it.</p>
          </div>
        ) : (
          <>
            <ul className="mt-3">{items.map((item) => <RailLine key={item.id} item={item} />)}</ul>
            <div className="mt-2 border-t border-[var(--sf-rule)] py-3">
              <p className="flex items-center justify-between text-[0.8125rem] font-medium">Substitution preferences <Link prefetch={false} href="/cart" className="font-normal text-[var(--sf-accent-hover)] underline underline-offset-2">Edit</Link></p>
              <p className="mt-1 text-[0.75rem] leading-[1.1rem] text-[var(--sf-ink-muted)]">{substitutionSummary(items)}</p>
            </div>
          </>
        )}
        {error ? <p role="alert" className="pb-2 text-[0.8125rem] text-[var(--sf-danger)]">{error}</p> : null}
      </div>
      {loaded && items.length ? (
        <div className="px-4 pb-4 pt-1">
          {needsReview || busy ? (
            <span aria-disabled="true" className="flex min-h-14 items-center justify-center rounded-full bg-[var(--sf-paper-3)] px-5 text-[0.9375rem] font-medium text-[var(--sf-ink-muted)]">{busy ? 'Updating…' : 'Resolve unavailable items in your cart'}</span>
          ) : (
            <Link prefetch={false} href={checkoutHref} className="flex min-h-14 items-center gap-3 rounded-full bg-[var(--sf-header)] pl-6 pr-5 text-[var(--sf-header-ink)] shadow-[var(--sf-shadow-2)] transition-colors hover:bg-[var(--sf-header-2)]">
              <span className="flex-1 text-[1.0625rem] font-medium">Checkout</span>
              <span className="text-right leading-tight"><span className="block text-[1.0625rem] font-medium tabular-nums">{formatMoney(cart?.subtotal)}</span><span className="block text-xs text-[var(--sf-header-ink-muted)]">Est. taxes &amp; fees</span></span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Phone and tablet: the running total above the tab bar, with the substitution policy beneath it. */
export function RigelPhoneCartBar() {
  const { cart, loaded } = useMarketBasket();
  const { checkoutHref } = useRigelFulfillment();
  const pathname = usePathname() || '/';
  const items = cart?.items || [];
  if (!loaded || !items.length || pathname === '/cart' || pathname.startsWith('/checkout')) return null;
  const count = itemCount(items);
  const needsReview = items.some((item) => !item.product.inStock);
  return <>
    <div aria-hidden="true" className="h-[9.5rem] lg:hidden" />
    <div className="fixed inset-x-0 z-40 px-3 lg:hidden" style={{ bottom: 'calc(var(--sf-tabbar-height) + 0.5rem)' }}>
      <div className="mx-auto max-w-lg overflow-hidden rounded-[22px] bg-[var(--sf-card)] shadow-[0_10px_36px_-10px_oklch(23%_0.012_160/0.35),0_0_0_1px_oklch(23%_0.012_160/0.06)]">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <ShoppingCart className="h-6 w-6 shrink-0 text-[var(--sf-accent)]" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-[1.0625rem]"><span>{count} {count === 1 ? 'item' : 'items'}</span> <span className="font-semibold tabular-nums text-[var(--sf-accent-hover)]">{formatMoney(cart?.subtotal)}</span></p>
          <Link prefetch={false} href={needsReview ? '/cart' : checkoutHref} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--sf-accent)] px-4 text-[0.9375rem] font-medium text-[var(--sf-accent-ink)] hover:bg-[var(--sf-accent-hover)]">
            {needsReview ? 'Review cart' : 'Go to checkout'}<ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <Link prefetch={false} href="/cart" className="flex items-start gap-3 border-t border-[var(--sf-rule)] px-4 py-2.5">
          <Leaf className="mt-0.5 h-5 w-5 shrink-0 fill-[var(--sf-accent)] text-[var(--sf-accent)]" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[0.9375rem] font-medium">Substitutions</span>
            <span className="block truncate text-[0.75rem] text-[var(--sf-ink-muted)]">{substitutionSummary(items)}</span>
          </span>
        </Link>
      </div>
    </div>
  </>;
}

/** A store coupon announced above the aisles; dismissal is remembered in this browser. */
export function RigelPromoBanner({ id, children }: { id: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { if (localStorage.getItem(`grocery_promo_${id}`) === 'hidden') setHidden(true); } catch { /* optional */ } }, [id]);
  if (hidden) return null;
  return (
    <div className="flex min-h-12 items-center justify-center gap-3 bg-[var(--sf-accent-soft)] px-4 py-2 text-center text-[0.9375rem]">
      <p className="min-w-0">{children}</p>
      <button type="button" aria-label="Dismiss offer" onClick={() => { setHidden(true); try { localStorage.setItem(`grocery_promo_${id}`, 'hidden'); } catch { /* optional */ } }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--sf-accent-hover)] hover:bg-[var(--sf-card)]"><X className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  );
}

const FRAMED = /^\/($|products(\/|$)|departments(\/|$)|deals(\/|$)|favorites(\/|$)|lists(\/|$))/;

/** Shopping pages get the sidebar + cart rail frame; account, cart and checkout pages stay full width. */
export function RigelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  return FRAMED.test(pathname) ? <RigelFrame>{children}</RigelFrame> : <>{children}</>;
}
