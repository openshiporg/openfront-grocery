import type { Metadata } from 'next';
import { Ticket } from 'lucide-react';
import { getDeals } from '../lib/data/deals';
import { getProductsList } from '../lib/data/products';
import { storefrontMetadata } from '../lib/metadata';
import UrbanProductGrid from '../modules/urban/UrbanProductGrid';
import { DealTicket } from '../modules/market/MarketCouponCode';
import { UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanPageHeader, UrbanPageShell, UrbanSectionTitle } from '../modules/urban/UrbanPrimitives';
export function generateMetadata(): Metadata { return storefrontMetadata({ title: 'Specials', description: 'Browse sale prices, current grocery offers and coupon terms.' }); }
export async function DealsPage() {
  const [deals, { products: saleProducts }] = await Promise.all([getDeals(), getProductsList({ availability: 'on-sale', sort: 'name', limit: 100, offset: 0 })]);
  // Coupon-linked products first, then everything with a sale price.
  const products = [...new Map([...deals.filter((deal) => deal.product).map((deal) => deal.product!), ...saleProducts].map((product) => [product.id, product])).values()];
  return <UrbanPageShell><UrbanContainer className="space-y-10 py-8 sm:py-10">
    <UrbanPageHeader breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Specials' }]} title="Specials" description="Sale prices and current offers from the store. Coupon eligibility is confirmed against your basket before you pay." />
    {products.length ? <section aria-labelledby="deal-products"><UrbanSectionTitle id="deal-products" title="On sale" /><UrbanProductGrid products={products} /></section> : null}
    {deals.length ? <section aria-labelledby="deal-coupons"><UrbanSectionTitle id="deal-coupons" title="Coupons" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{deals.map((deal) => <DealTicket key={deal.id} deal={deal} />)}</div></section> : products.length ? null : <UrbanEmptyState icon={Ticket} title="No specials right now" actionHref="/products" actionLabel="Shop groceries">Check back here for the next sale or coupon.</UrbanEmptyState>}
    <UrbanButtonLink href="/products" variant="ghost">Browse all groceries</UrbanButtonLink>
  </UrbanContainer></UrbanPageShell>;
}
