import type { Metadata } from 'next';
import { getDeals } from '../lib/data/deals';
import { storefrontMetadata } from '../lib/metadata';
import UrbanProductGrid from '../modules/urban/UrbanProductGrid';
import MarketCouponCode from '../modules/market/MarketCouponCode';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanPageHeader, UrbanPageShell, UrbanSectionTitle, formatMoney } from '../modules/urban/UrbanPrimitives';
export function generateMetadata(): Metadata { return storefrontMetadata({ title: 'Specials', description: 'Browse current grocery offers and coupon terms.' }); }
export async function DealsPage() {
  const deals = await getDeals();
  const products = [...new Map(deals.filter((deal) => deal.product).map((deal) => [deal.product!.id, deal.product!])).values()];
  return <UrbanPageShell><UrbanContainer className="space-y-8 py-8"><UrbanPageHeader breadcrumb={[{ label: 'Shop', href: '/products' }, { label: 'Specials' }]} title="A little more for your basket." description="Explore the current offers. Review the terms, then enter a code at checkout to confirm eligible savings." />
    {deals.length ? <section aria-label="Current offers" className="grid gap-4 md:grid-cols-2">{deals.map((deal) => <article key={deal.id} className="sf-panel bg-[var(--sf-paper-2)] p-5 sm:p-6"><UrbanBadge tone="orange">{deal.type === 'coupon' ? 'Coupon offer' : 'Special'}</UrbanBadge><h2 className="mt-4 font-[family-name:var(--sf-font-display)] text-3xl font-semibold">{deal.discountType === 'percentage' ? `${deal.discountValue}% off` : deal.discountType === 'bogo' ? 'Buy one, get one offer' : `${formatMoney(deal.discountValue)} off`}</h2><p className="mt-2 text-sm leading-6 text-[var(--sf-ink-muted)]">{deal.description || 'Eligibility is checked against your basket at checkout.'}</p><dl className="mt-4 space-y-2 text-sm"><div><dt className="inline font-semibold">Minimum purchase: </dt><dd className="inline">{deal.minimumPurchase ? formatMoney(deal.minimumPurchase) : 'No minimum listed'}</dd></div><div><dt className="inline font-semibold">Valid until: </dt><dd className="inline">{deal.expiresAt ? new Date(deal.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'No end date listed'}</dd></div></dl>{deal.discountCode ? <MarketCouponCode code={deal.discountCode} /> : null}</article>)}</section> : <UrbanEmptyState title="No offers right now" actionHref="/products" actionLabel="Shop groceries">Your everyday groceries are still on the shelves. Check back here for the next offer.</UrbanEmptyState>}
    {products.length ? <section><UrbanSectionTitle title="Products on special" /><UrbanProductGrid products={products} /></section> : null}<UrbanButtonLink href="/products" variant="ghost">Browse all groceries</UrbanButtonLink>
  </UrbanContainer></UrbanPageShell>;
}
