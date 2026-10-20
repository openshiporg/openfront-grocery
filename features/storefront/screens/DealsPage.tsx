import type { Metadata } from 'next';
import { Ticket } from 'lucide-react';
import { getDeals } from '../lib/data/deals';
import { storefrontMetadata } from '../lib/metadata';
import UrbanProductGrid from '../modules/urban/UrbanProductGrid';
import { DealTicket } from '../modules/market/MarketCouponCode';
import { UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanPageHeader, UrbanPageShell, UrbanSectionTitle } from '../modules/urban/UrbanPrimitives';
export function generateMetadata(): Metadata { return storefrontMetadata({ title: 'Specials', description: 'Browse current grocery offers and coupon terms.' }); }
export async function DealsPage() {
  const deals = await getDeals();
  const products = [...new Map(deals.filter((deal) => deal.product).map((deal) => [deal.product!.id, deal.product!])).values()];
  return <UrbanPageShell><UrbanContainer className="space-y-10 py-8 sm:py-10">
    <UrbanPageHeader breadcrumb={[{ label: 'Shop', href: '/products' }, { label: 'Specials' }]} title="Clip a coupon." description="Current offers from the store. Copy a code, or use it at checkout — eligibility is confirmed against your basket before you pay." />
    {deals.length ? <section aria-label="Current offers" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{deals.map((deal) => <DealTicket key={deal.id} deal={deal} />)}</section> : <UrbanEmptyState icon={Ticket} title="No coupons right now" actionHref="/products" actionLabel="Shop groceries">Your everyday groceries are still on the shelves. Check back here for the next offer.</UrbanEmptyState>}
    {products.length ? <section aria-labelledby="deal-products"><UrbanSectionTitle id="deal-products" title="Products on special" /><UrbanProductGrid products={products} /></section> : null}
    <UrbanButtonLink href="/products" variant="ghost">Browse all groceries</UrbanButtonLink>
  </UrbanContainer></UrbanPageShell>;
}
