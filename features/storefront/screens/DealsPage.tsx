import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgePercent, Target } from 'lucide-react';

import { getDeals } from '@/features/storefront/lib/data/deals';
import type { GroceryDeal } from '@/features/storefront/types';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanMetric, UrbanPageHeader, UrbanPageShell, UrbanSectionTitle, formatMoney } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({
    title: 'Specials',
    description: 'Browse grocery deals, coupons, flash markdowns, and specials.',
  });
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
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Specials' }]}
          title="Weekly specials"
          description="Coupons and markdowns linked to live catalog products and prices."
          aside={
            <div className="space-y-3">
              <UrbanMetric label="Active deals" value={deals.length} icon={Target} />
              <UrbanMetric label="Coupons" value={coupons.length} icon={BadgePercent} />
            </div>
          }
        />

        <section className="space-y-0">
          {(coupons.length ? coupons : deals).map((deal) => (
            <article key={deal.id} className="border-b border-[var(--sf-rule)] py-6 first:border-t first:border-[var(--sf-rule)]">
              <div className="flex flex-wrap items-center gap-2">
                <UrbanBadge tone={deal.type === 'flash' ? 'orange' : 'blue'}>{deal.type}</UrbanBadge>
                {deal.discountCode ? <UrbanBadge tone="muted">Code {deal.discountCode}</UrbanBadge> : null}
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-[family-name:var(--sf-font-display)] text-3xl font-semibold tracking-[-0.02em] text-[var(--sf-ink)]">{dealLabel(deal)}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--sf-ink-muted)]">
                    {deal.description || (deal.product ? `Special on ${deal.product.name}` : 'Savings applied at checkout.')}
                  </p>
                </div>
                {deal.product ? (
                  <Link href={`/products/${deal.product.handle}`} className="text-sm font-medium text-[var(--sf-accent)] hover:text-[var(--sf-accent-hover)]">
                    View product →
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
          {deals.length === 0 ? <p className="py-8 text-sm text-[var(--sf-ink-muted)]">No active specials right now. Check back soon or browse the full catalog.</p> : null}
        </section>

        {products.length > 0 ? (
          <section>
            <UrbanSectionTitle title="Deal products" actionHref="/products" actionLabel="Full catalog">
              Products currently tied to active specials.
            </UrbanSectionTitle>
            <UrbanProductGrid products={products} />
          </section>
        ) : null}

        <UrbanButtonLink href="/products" variant="ghost">Browse all products</UrbanButtonLink>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
