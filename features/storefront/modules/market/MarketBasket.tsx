'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ShoppingBasket } from 'lucide-react';
import { formatMoney } from '../../lib/marketFormatting';
import { BasketDrawer } from './MarketBasketDrawer';
import { addToCart, forgetGuestCartSession, hasGuestCartSession, mergeGuestCart, removeFromCart, retrieveCart, setCartShopperIdentity, updateCartItem } from '../../lib/data/cart';
import type { GroceryCart } from '../../types';

type BasketState = {
  cart: GroceryCart | null;
  loaded: boolean;
  busy: boolean;
  /** The first authoritative basket read failed; nothing is known about the basket yet. */
  loadError: string | null;
  /** A guest basket from before sign-in could not be moved into the account yet. */
  mergeError: string | null;
  reload: () => void;
  retryMerge: () => void;
  keepAccountBasket: () => void;
  runExclusive: (work: () => Promise<void>) => Promise<void>;
  change: (productId: string, delta: number) => Promise<void>;
};
const BasketContext = createContext<BasketState | null>(null);

/**
 * Basket state for the storefront. `identity` is the server-derived shopper
 * ("guest" or the signed-in user id): when it changes the previous shopper's
 * basket is cleared at once and responses started under the old identity are
 * discarded.
 */
export function MarketBasketProvider({ identity, children }: { identity: string; children: ReactNode }) {
  const [cart, setCart] = useState<GroceryCart | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cartRef = useRef<GroceryCart | null>(null);
  const epoch = useRef(0);
  const lock = useRef(false);
  const [readKey, setReadKey] = useState(`${identity}:${attempt}`);
  setCartShopperIdentity(identity);
  // A new shopper (or a deliberate retry) starts from an unknown basket at once.
  if (readKey !== `${identity}:${attempt}`) {
    setReadKey(`${identity}:${attempt}`);
    setCart(null); setLoaded(false); setLoadError(null);
  }

  useEffect(() => {
    let live = true;
    const current = ++epoch.current;
    cartRef.current = null;
    const accept = (next: GroceryCart | null) => {
      if (!live || epoch.current !== current) return;
      cartRef.current = next; setCart(next); setLoaded(true); setLoadError(null);
    };
    const receive = (event: Event) => {
      const next = (event as CustomEvent<GroceryCart | null>).detail;
      // A failed request must not erase the last confirmed basket, and a
      // response for a basket other than this shopper's confirmed one is stale.
      if (!next || !cartRef.current || next.id !== cartRef.current.id) return;
      accept(next);
    };
    const completed = (event: Event) => {
      if (cartRef.current?.id === (event as CustomEvent<string>).detail) { cartRef.current = null; setCart(null); setLoaded(false); }
      void retrieveCart({ throwOnError: true }).then(accept).catch(() => { /* The completed basket is gone; wait for the next confirmed response. */ });
    };
    async function load() {
      if (identity !== 'guest' && hasGuestCartSession()) {
        const merged = await mergeGuestCart();
        if (!live || epoch.current !== current) return;
        setMergeError(merged.error);
        if (merged.cart) { accept(merged.cart); return; }
      } else {
        setMergeError(null);
      }
      try {
        accept(await retrieveCart({ throwOnError: true }));
      } catch {
        if (live && epoch.current === current) setLoadError('Your basket could not be loaded.');
      }
    }
    window.addEventListener('cartUpdated', receive);
    window.addEventListener('checkoutCompleted', completed);
    void load();
    return () => { live = false; window.removeEventListener('cartUpdated', receive); window.removeEventListener('checkoutCompleted', completed); };
  }, [identity, attempt]);

  async function runExclusive(work: () => Promise<void>) {
    if (lock.current) throw new Error('Please wait for your basket to finish updating.');
    const started = epoch.current;
    lock.current = true; setBusy(true);
    try { await work(); }
    finally {
      const confirmed = await retrieveCart();
      if (confirmed && epoch.current === started) { cartRef.current = confirmed; setCart(confirmed); setLoaded(true); }
      lock.current = false; setBusy(false);
    }
  }
  async function change(productId: string, delta: number) {
    const started = epoch.current;
    await runExclusive(async () => {
      const current = cartRef.current?.items.find((item) => item.product.id === productId);
      const next = delta > 0
        ? await addToCart(productId, delta)
        : current && current.quantity + delta > 0
          ? await updateCartItem(current.id, current.quantity + delta)
          : current ? await removeFromCart(current.id) : null;
      if (!next) throw new Error('Your basket could not be updated. Check availability and try again.');
      if (epoch.current !== started) return;
      cartRef.current = next; setCart(next); setLoaded(true);
    });
  }
  const value: BasketState = {
    cart, loaded, busy, loadError, mergeError, change, runExclusive,
    reload: () => setAttempt((n) => n + 1),
    retryMerge: () => setAttempt((n) => n + 1),
    keepAccountBasket: () => { forgetGuestCartSession(); setMergeError(null); },
  };
  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useMarketBasket() {
  const value = useContext(BasketContext);
  if (!value) throw new Error('Shopping controls require MarketBasketProvider');
  return value;
}

export function MarketBasketLink() {
  const { cart, loaded, loadError, reload } = useMarketBasket();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const count = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  // The full basket and checkout pages already show every line; navigate there instead of overlaying them.
  const drawerEnabled = pathname !== '/cart' && !pathname?.startsWith('/checkout');
  return <>
    <Link
      prefetch={false}
      href="/cart"
      onClick={(event) => {
        if (!drawerEnabled || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        // Opening the basket after a failed first read tries again.
        if (loadError) reload();
        setOpen(true);
      }}
      aria-haspopup={drawerEnabled ? 'dialog' : undefined}
      className="relative inline-flex h-11 items-center gap-2 rounded-full bg-[var(--sf-ink)] pl-4 pr-1.5 text-sm font-semibold text-[var(--sf-paper)] transition-colors hover:bg-[var(--sf-header-2)]"
      aria-label={loaded ? `Basket, ${count} ${count === 1 ? 'item' : 'items'}${cart?.items.length ? `, ${formatMoney(cart.subtotal)}` : ''}` : 'Basket'}
    >
      <ShoppingBasket className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{loaded && cart?.items.length ? formatMoney(cart.subtotal) : 'Basket'}</span>
      <span key={count} aria-hidden="true" className={`grid h-8 min-w-8 place-items-center rounded-full px-2 text-[0.8125rem] tabular-nums ${count ? 'sf-bump bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]' : 'bg-[var(--sf-header-2)] text-[var(--sf-header-ink)]'}`}>{loaded ? count : '·'}</span>
    </Link>
    {drawerEnabled ? <BasketDrawer open={open} onClose={() => setOpen(false)} /> : null}
  </>;
}
