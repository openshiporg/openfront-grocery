'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { retrieveCart } from '@/features/storefront/lib/data/cart';

export default function CartButton() {
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadCart = async () => {
      const cart = await retrieveCart();
      if (mounted) {
        setItemCount(cart?.itemCount || 0);
      }
    };

    loadCart();

    const handleCartUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setItemCount(detail?.itemCount || 0);
    };

    window.addEventListener('cartUpdated', handleCartUpdate as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('cartUpdated', handleCartUpdate as EventListener);
    };
  }, []);

  return (
    <Link
      href="/cart"
      className="inline-flex items-center gap-3 rounded-full border border-emerald-950/10 bg-white/90 px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm shadow-emerald-950/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/30 hover:bg-white"
      data-testid="nav-cart-link"
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="21" r="1" />
          <circle cx="19" cy="21" r="1" />
          <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </svg>
        {itemCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-700 px-1.5 text-[11px] font-semibold text-white">
            {itemCount}
          </span>
        )}
      </span>
      <span>{itemCount > 0 ? `Cart · ${itemCount}` : 'Cart'}</span>
    </Link>
  );
}
