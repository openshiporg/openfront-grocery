import { Suspense } from 'react';
import Link from 'next/link';

import CartButton from '@/features/storefront/modules/layout/components/cart-button';
import Logo from '@/features/storefront/modules/layout/components/logo';
import SearchBar from '@/features/storefront/modules/layout/components/search-bar';

const primaryLinks = [
  { href: '/departments/produce', label: 'Produce' },
  { href: '/departments/dairy', label: 'Dairy & Eggs' },
  { href: '/departments/meat-seafood', label: 'Meat & Seafood' },
  { href: '/departments/pantry', label: 'Pantry' },
  { href: '/deals', label: 'Deals' },
];

export default async function Nav() {
  return (
    <div className="sticky top-0 inset-x-0 z-50 border-b border-emerald-950/8 bg-[rgba(250,248,243,0.92)] backdrop-blur-xl supports-[backdrop-filter]:bg-[rgba(250,248,243,0.86)]">
      <div className="border-b border-emerald-950/6 bg-[linear-gradient(90deg,rgba(238,247,236,0.9),rgba(250,248,243,0.7),rgba(254,240,214,0.8))]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-emerald-900/75 sm:px-6">
          <span>Fresh-picked staples for neighborhood delivery</span>
          <span className="hidden md:inline">Pickup windows and delivery slots update in real time</span>
        </div>
      </div>

      <header className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:gap-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <Logo />
              <div className="hidden xl:flex flex-col leading-tight text-sm text-zinc-600">
                <span className="font-medium text-zinc-900">Neighborhood grocery for fast fulfillment</span>
                <span>Fresh produce, curbside pickup, and reliable delivery windows</span>
              </div>
            </div>

            <div className="hidden lg:block flex-1 max-w-xl">
              <SearchBar />
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/account"
                className="hidden md:inline-flex items-center rounded-full border border-transparent px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-emerald-900/10 hover:bg-white/80 hover:text-zinc-950"
              >
                Account
              </Link>
              <Suspense
                fallback={
                  <Link
                    className="inline-flex items-center rounded-full border border-emerald-950/10 bg-white/90 px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm shadow-emerald-950/5"
                    href="/cart"
                    data-testid="nav-cart-link"
                  >
                    Cart
                  </Link>
                }
              >
                <CartButton />
              </Suspense>
            </div>
          </div>

          <div className="lg:hidden">
            <SearchBar />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-emerald-950/8 bg-white/75 px-3 py-3 shadow-[0_20px_45px_-38px_rgba(18,56,34,0.65)] sm:px-4">
            <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-700">
              {primaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-3 py-2 transition-colors hover:bg-emerald-50 hover:text-emerald-900"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-900">Free delivery over $35</span>
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-950">Curbside in under 2 hours</span>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
