import Link from 'next/link';
import { Search, ShoppingBasket, User } from 'lucide-react';

import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import { getStore } from '@/features/storefront/lib/data/store';
import UrbanMobileMenu from './UrbanMobileMenu';

export default async function UrbanNav() {
  const [store, { departments }] = await Promise.all([getStore(), getDepartmentsList(0, 6)]);
  const storeName = store.name;
  const mobileDepartments = [
    ...departments.map((d) => ({ href: `/departments/${d.handle}`, label: d.name })),
    { href: '/departments', label: 'All aisles' },
  ];

  return (
    <>
      <div className="bg-[var(--sf-header)] text-[var(--sf-header-ink)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 text-xs sm:px-6 lg:px-8">
          {store.tagline ? <p className="text-[var(--sf-header-ink)]/80">{store.tagline}</p> : <span aria-hidden="true" />}
          <div className="hidden items-center gap-4 sm:flex">
            <Link href="/deals" className="transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-header-ink)]">
              Weekly specials
            </Link>
            <Link href="/account" className="transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-header-ink)]">
              Account
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-[var(--sf-rule-strong)] bg-[var(--sf-paper)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="min-w-0 font-[family-name:var(--sf-font-display)] text-xl font-semibold tracking-[-0.02em] text-[var(--sf-ink)] sm:text-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sf-focus)]"
          >
            {storeName}
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Departments">
            {departments.map((department) => (
              <Link
                key={department.id}
                href={`/departments/${department.handle}`}
                className="whitespace-nowrap px-3 py-2 text-sm font-medium text-[var(--sf-ink-muted)] transition hover:text-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)]"
              >
                {department.name}
              </Link>
            ))}
            <Link
              href="/departments"
              className="whitespace-nowrap px-3 py-2 text-sm font-medium text-[var(--sf-ink-faint)] transition hover:text-[var(--sf-accent)]"
            >
              All aisles
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/products"
              aria-label="Search products"
              className="p-2.5 text-[var(--sf-ink)] transition hover:text-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)]"
            >
              <Search className="h-5 w-5" />
            </Link>
            <Link
              href="/cart"
              aria-label="Basket"
              className="p-2.5 text-[var(--sf-ink)] transition hover:text-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)]"
            >
              <ShoppingBasket className="h-5 w-5" />
            </Link>
            <Link
              href="/account"
              aria-label="Account"
              className="hidden p-2.5 text-[var(--sf-ink)] transition hover:text-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)] sm:block"
            >
              <User className="h-5 w-5" />
            </Link>
            <UrbanMobileMenu departments={mobileDepartments} />
          </div>
        </div>
      </header>
    </>
  );
}
