import Link from 'next/link';
import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import { getStore } from '@/features/storefront/lib/data/store';

export default async function UrbanFooter() {
  const [store, { departments }] = await Promise.all([getStore(), getDepartmentsList(0, 8)]);
  const storeName = store.name;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--sf-rule-strong)] bg-[var(--sf-paper-2)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:gap-16">
          <div>
            <p className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold tracking-[-0.02em] text-[var(--sf-ink)]">
              {storeName}
            </p>
            {store.homepageDescription ? (
              <p className="mt-3 max-w-md text-sm leading-6 text-[var(--sf-ink-muted)]">
                {store.homepageDescription}
              </p>
            ) : null}
            <address className="mt-4 not-italic text-sm leading-6 text-[var(--sf-ink-muted)]">
              {store.address ? <p>{store.address}</p> : null}
              {store.contactPhone ? <p><a href={`tel:${store.contactPhone}`} className="hover:text-[var(--sf-accent)]">{store.contactPhone}</a></p> : null}
              {store.contactEmail ? <p><a href={`mailto:${store.contactEmail}`} className="hover:text-[var(--sf-accent)]">{store.contactEmail}</a></p> : null}
            </address>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-ink-faint)]">Shop</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/products" className="text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">All products</Link></li>
                <li><Link href="/departments" className="text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">Departments</Link></li>
                <li><Link href="/deals" className="text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">Specials</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-ink-faint)]">Aisles</p>
              <ul className="mt-3 space-y-2 text-sm">
                {departments.slice(0, 4).map((dept) => (
                  <li key={dept.id}>
                    <Link href={`/departments/${dept.handle}`} className="text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">
                      {dept.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sf-ink-faint)]">Account</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/account" className="text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">Orders</Link></li>
                <li><Link href="/lists" className="text-[var(--sf-ink-muted)] hover:text-[var(--sf-accent)]">Lists</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--sf-rule)] pt-6 text-xs text-[var(--sf-ink-faint)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {storeName}</p>
          <p>Prices and availability reflect the live catalog.</p>
        </div>
      </div>
    </footer>
  );
}
