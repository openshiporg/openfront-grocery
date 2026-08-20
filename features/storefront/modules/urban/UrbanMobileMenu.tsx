'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

type NavLink = { href: string; label: string };

/**
 * Client-side mobile navigation drawer for the storefront nav. Renders the
 * menu button and a slide-down panel of department + account links. Designed
 * to be composed inside the server-rendered UrbanNav so the link list stays
 * sourced from real department data fetched on the server.
 */
export default function UrbanMobileMenu({
  departments,
}: {
  departments: NavLink[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="urban-mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="p-2.5 text-[var(--sf-ink)] transition hover:text-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)] lg:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open ? (
        <div
          id="urban-mobile-menu"
          className="border-t border-[var(--sf-rule)] bg-[var(--sf-paper)] lg:hidden"
        >
          <nav className="mx-auto max-w-6xl px-4 py-4 sm:px-6" aria-label="Mobile">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-ink-faint)]">Aisles</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {departments.map((dept) => (
                <li key={dept.href}>
                  <Link
                    href={dept.href}
                    onClick={() => setOpen(false)}
                    className="block py-2 text-sm font-medium text-[var(--sf-ink)] transition hover:text-[var(--sf-accent)]"
                  >
                    {dept.label}
                  </Link>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-ink-faint)]">Shop</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <li><Link href="/products" onClick={() => setOpen(false)} className="py-2 text-sm text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">All products</Link></li>
              <li><Link href="/departments" onClick={() => setOpen(false)} className="py-2 text-sm text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">All aisles</Link></li>
              <li><Link href="/deals" onClick={() => setOpen(false)} className="py-2 text-sm text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">Specials</Link></li>
              <li><Link href="/cart" onClick={() => setOpen(false)} className="py-2 text-sm text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">Basket</Link></li>
              <li><Link href="/account" onClick={() => setOpen(false)} className="py-2 text-sm text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">Account</Link></li>
            </ul>
          </nav>
        </div>
      ) : null}
    </>
  );
}
