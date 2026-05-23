import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgePercent, Clock, Target, Zap } from 'lucide-react';

import { getDeals } from '@/features/storefront/lib/data/deals';
import type { GroceryDeal } from '@/features/storefront/types';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel, UrbanSectionTitle, formatMoney } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Deals | Urban Express',
    description: 'Urban Express live grocery deals, coupons, flash markdowns, and specials.',
  };
}

function dealLabel(deal: GroceryDeal) {
  return deal.discountType === 'percentage' ? `${deal.discountValue}% off` : `${formatMoney(deal.discountValue)} off`;
}

export async function DealsPage() {
  const deals: GroceryDeal[] = await getDeals();
  const products = deals.filter((deal) => deal.product).map((deal) => deal.product!);
  const coupons = deals.filter((deal) => deal.type === 'coupon');
  const flash = deals.filter((deal) => deal.type === 'flash');

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Deals</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <UrbanPanel className="relative overflow-hidden p-5 sm:p-8 lg:p-10">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle,#ff6b00_0,transparent_55%)] opacity-20" />
            <div className="relative z-10">
              <UrbanBadge tone="orange"><BadgePercent className="h-3 w-3" /> Deal protocol</UrbanBadge>
              <UrbanHeadline className="mt-5">Markdowns moving fast.</UrbanHeadline>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">Live specials stay connected to real product inventory so offers remain shoppable, fulfillable, and checkout-ready.</p>
              <div className="mt-6"><UrbanButtonLink href="/products">Shop inventory</UrbanButtonLink></div>
            </div>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Active deals" value={deals.length} icon={Target} />
            <UrbanMetric label="Coupons" value={coupons.length} icon={BadgePercent} />
            <UrbanMetric label="Flash" value={flash.length || 'Live'} icon={Zap} />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {(coupons.length ? coupons : deals.slice(0, 3)).map((deal) => (
            <UrbanPanel key={deal.id} className="border-dashed p-5">
              <UrbanBadge tone={deal.type === 'flash' ? 'danger' : 'blue'}>{deal.type}</UrbanBadge>
              <h2 className="mt-4 font-market-label text-5xl font-black uppercase tracking-[-0.06em] text-[#ffb693]">{dealLabel(deal)}</h2>
              <p className="mt-2 text-sm leading-6 text-[#e2bfb0]">{deal.description || (deal.product ? `Special on ${deal.product.name}` : 'Digital grocery savings available at checkout.')}</p>
              {deal.discountCode ? <p className="mt-4 border border-[#5a4136] bg-[#282a2b] px-3 py-2 font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2e2e2]">Code {deal.discountCode}</p> : null}
            </UrbanPanel>
          ))}
        </section>

        <section>
          <UrbanSectionTitle eyebrow="Product deals" title="Specials with stock behind them" actionHref="/products" actionLabel="All inventory">
            The product grid below uses deal-linked products from the Openfront catalog, not locked demo inventory.
          </UrbanSectionTitle>
          <UrbanProductGrid products={products} featuredFirst />
        </section>

        <UrbanPanel className="grid gap-4 p-5 md:grid-cols-3">
          {['Clip digital coupons before checkout', 'Watch flash deals before midnight', 'Build lists from recurring specials'].map((tip) => (
            <div key={tip} className="flex items-center gap-3 border border-[#5a4136] bg-[#282a2b] p-4">
              <Clock className="h-5 w-5 text-[#ffb693]" />
              <p className="font-market-label text-sm font-black uppercase tracking-[0.12em] text-[#e2e2e2]">{tip}</p>
            </div>
          ))}
        </UrbanPanel>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
