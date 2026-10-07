'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ShoppingBasket } from 'lucide-react';
import { addToCart, removeFromCart, retrieveCart, updateCartItem } from '../../lib/data/cart';
import type { GroceryCart } from '../../types';

type BasketState = {
  cart: GroceryCart | null;
  loaded: boolean;
  busy: boolean;
  runExclusive: (work: () => Promise<void>) => Promise<void>;
  change: (productId: string, delta: number) => Promise<void>;
};
const BasketContext = createContext<BasketState | null>(null);

export function MarketBasketProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<GroceryCart | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const cartRef = useRef<GroceryCart | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    let revision = 0;
    const receive = (event: Event) => {
      const next = (event as CustomEvent<GroceryCart | null>).detail;
      // A failed request must not erase the last confirmed basket.
      if (!next) return;
      revision += 1;
      cartRef.current = next; setCart(next); setLoaded(true);
    };
    const completed = (event: Event) => {
      if (cartRef.current?.id === (event as CustomEvent<string>).detail) { cartRef.current = null; setCart(null); setLoaded(false); }
      revision += 1;
      const expected = revision;
      void retrieveCart({ throwOnError: true }).then((next) => {
        if (live && revision === expected) { cartRef.current = next; setCart(next); setLoaded(true); }
      }).catch(() => { /* The completed basket is gone; wait for the next confirmed response. */ });
    };
    window.addEventListener('cartUpdated', receive);
    window.addEventListener('checkoutCompleted', completed);
    void retrieveCart({ throwOnError: true }).then((next) => {
      if (live && revision === 0) { cartRef.current = next; setCart(next); setLoaded(true); }
    }).catch(() => { /* Keep the count unknown on a failed read. */ });
    return () => { live = false; window.removeEventListener('cartUpdated', receive); window.removeEventListener('checkoutCompleted', completed); };
  }, []);

  async function runExclusive(work: () => Promise<void>) {
    if (lock.current) throw new Error('Please wait for your basket to finish updating.');
    lock.current = true; setBusy(true);
    try { await work(); }
    finally {
      const confirmed = await retrieveCart();
      if (confirmed) { cartRef.current = confirmed; setCart(confirmed); setLoaded(true); }
      lock.current = false; setBusy(false);
    }
  }
  async function change(productId: string, delta: number) {
    await runExclusive(async () => {
      const current = cartRef.current?.items.find((item) => item.product.id === productId);
      const next = delta > 0
        ? await addToCart(productId, delta)
        : current && current.quantity + delta > 0
          ? await updateCartItem(current.id, current.quantity + delta)
          : current ? await removeFromCart(current.id) : null;
      if (!next) throw new Error('Your basket could not be updated. Check availability and try again.');
      cartRef.current = next; setCart(next); setLoaded(true);
    });
  }
  return <BasketContext.Provider value={{ cart, loaded, busy, change, runExclusive }}>{children}</BasketContext.Provider>;
}

export function useMarketBasket() {
  const value = useContext(BasketContext);
  if (!value) throw new Error('Shopping controls require MarketBasketProvider');
  return value;
}

export function MarketBasketLink() {
  const { cart, loaded } = useMarketBasket();
  const count = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  return <Link prefetch={false} href="/cart" className="relative inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--sf-header)] px-3 text-sm font-semibold text-[var(--sf-header-ink)]" aria-label={loaded ? `Basket, ${count} items` : 'Basket'}>
    <ShoppingBasket className="h-5 w-5 shrink-0" aria-hidden="true" /><span className="hidden sm:inline">Basket</span>
    {loaded ? <span aria-hidden="true" className="min-w-5 text-center tabular-nums">{count}</span> : null}
  </Link>;
}
