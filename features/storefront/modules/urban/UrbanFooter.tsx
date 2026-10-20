import Link from 'next/link';
import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import { getStore } from '@/features/storefront/lib/data/store';
import { UrbanStoreLogo } from './UrbanStoreLogo';

const groups = [
  { title: 'Shop', links: [['/products', 'All groceries'], ['/departments', 'Aisles'], ['/deals', 'Specials'], ['/fulfillment', 'Delivery & pickup']] },
  { title: 'Your shopping', links: [['/account/orders', 'Orders'], ['/lists', 'Lists'], ['/favorites', 'Favorites'], ['/subscriptions', 'Recurring & rewards']] },
  { title: 'Help', links: [['/support', 'Help & contact'], ['/order-access', 'Find a guest order'], ['/policies', 'How orders work'], ['/account/privacy', 'Privacy']] },
] as const;

export default async function UrbanFooter() {
  const [store, { departments }] = await Promise.all([getStore(), getDepartmentsList(0, 8).catch(() => ({ departments: [] }))]);
  const year = new Date().getFullYear();
  const link = 'inline-flex min-h-9 items-center text-[var(--sf-header-ink-muted)] transition-colors hover:text-[var(--sf-header-ink)]';

  return (
    <footer className="sf-dark mt-auto">
      <div className="mx-auto max-w-[84rem] px-4 pb-8 pt-14 sm:px-6 lg:px-8 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20">
          <div className="min-w-0">
            <div className="flex items-start gap-2.5">
              <UrbanStoreLogo name={store.name} logoUrl={store.logoUrl} logoIcon={store.logoIcon} logoColor={store.logoColor} />
              <p className="min-w-0 font-[family-name:var(--sf-font-display)] text-[clamp(2.75rem,1.5rem+5vw,5.5rem)] font-bold leading-[0.9] tracking-[-0.05em] [overflow-wrap:anywhere]">{store.name}</p>
            </div>
            {store.homepageDescription ? <p className="mt-5 max-w-md text-[0.9375rem] leading-7 text-[var(--sf-header-ink-muted)]">{store.homepageDescription}</p> : null}
            <address className="mt-6 grid gap-1 text-[0.9375rem] not-italic leading-7">
              {store.address ? <span>{store.address}</span> : null}
              {store.contactPhone ? <a href={`tel:${store.contactPhone}`} className="w-fit underline decoration-[var(--sf-header-ink-muted)] underline-offset-4 hover:decoration-[var(--sf-header-ink)]">{store.contactPhone}</a> : null}
              {store.contactEmail ? <a href={`mailto:${store.contactEmail}`} className="w-fit underline decoration-[var(--sf-header-ink-muted)] underline-offset-4 hover:decoration-[var(--sf-header-ink)]">{store.contactEmail}</a> : null}
            </address>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 text-sm sm:grid-cols-3">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 font-semibold text-[var(--sf-header-ink)]">{group.title}</p>
                <ul>{group.links.map(([href, label]) => <li key={href}><Link prefetch={false} href={href} className={link}>{label}</Link></li>)}</ul>
              </div>
            ))}
            {departments.length ? (
              <div className="col-span-2 sm:col-span-3">
                <p className="mb-2 font-semibold text-[var(--sf-header-ink)]">Aisles</p>
                <ul className="flex flex-wrap gap-x-5">{departments.map((department) => <li key={department.id}><Link prefetch={false} href={`/departments/${department.handle}`} className={link}>{department.name}</Link></li>)}</ul>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-[var(--sf-header-2)] pt-6 text-xs text-[var(--sf-header-ink-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {store.name}</p>
          <p>Prices, availability and fees are confirmed at checkout.</p>
        </div>
      </div>
    </footer>
  );
}
