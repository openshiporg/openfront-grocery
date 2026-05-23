import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgePercent, CalendarDays, Package, Repeat2, SlidersHorizontal } from 'lucide-react';

import { getSubscriptions } from '@/features/storefront/lib/data/subscriptions';
import { getProductsByIds } from '@/features/storefront/lib/data/products';
import type { GroceryProduct, GrocerySubscription } from '@/features/storefront/types';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel, formatMoney, productImage } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Subscriptions | Urban Express',
    description: 'Manage Urban Express grocery subscriptions and auto-replenishment orders.',
  };
}

function SubscriptionTile({ subscription }: { subscription: GrocerySubscription }) {
  const product = subscription.productDetails;
  return (
    <UrbanPanel className="overflow-hidden">
      <div className="aspect-[4/3] bg-[#282a2b]">
        {product ? <img src={productImage(product)!} alt={product.name} className="h-full w-full object-cover opacity-80 mix-blend-luminosity" /> : <div className="flex h-full items-center justify-center"><Package className="h-10 w-10 text-[#ffb693]" /></div>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-market-label text-2xl font-black uppercase leading-none tracking-[-0.03em] text-[#e2e2e2]">{product?.name || subscription.product}</h3>
          <UrbanBadge tone={subscription.isActive ? 'orange' : 'muted'}>{subscription.pausedUntil ? 'Paused' : subscription.isActive ? 'Active' : 'Off'}</UrbanBadge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-[#e2bfb0]">
          <span>Qty {subscription.quantity}</span>
          <span>{subscription.frequency}</span>
          <span>{subscription.discount}% off</span>
          <span>{new Date(subscription.nextDeliveryDate).toLocaleDateString()}</span>
        </div>
        {product ? <p className="mt-4 font-market-label text-3xl font-black text-[#ffb693]">{formatMoney(product.price)}</p> : null}
      </div>
    </UrbanPanel>
  );
}

export async function SubscriptionsPage() {
  const subscriptions: GrocerySubscription[] = await getSubscriptions();
  const { products } = await getProductsByIds(subscriptions.map((sub) => sub.product));
  const withProducts = subscriptions.map((sub) => ({ ...sub, productDetails: products.find((p: GroceryProduct) => p.id === sub.product) }));

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Subscriptions</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <UrbanPanel className="p-5 sm:p-8">
            <UrbanBadge tone="orange"><Repeat2 className="h-3 w-3" /> Auto replenishment</UrbanBadge>
            <UrbanHeadline className="mt-5">Staples on schedule.</UrbanHeadline>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">Turn frequent grocery needs into recurring deliveries with product data from the Openfront catalog.</p>
            <div className="mt-6"><UrbanButtonLink href="/products">Find subscription products</UrbanButtonLink></div>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Subscriptions" value={subscriptions.length} icon={Repeat2} />
            <UrbanMetric label="Savings" value="10%" icon={BadgePercent} />
            <UrbanMetric label="Flexible" value="Skip" icon={SlidersHorizontal} />
          </div>
        </section>

        {withProducts.length === 0 ? (
          <UrbanEmptyState title="No subscriptions yet" actionHref="/products" actionLabel="Browse products">Start a recurring run for groceries you buy regularly.</UrbanEmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {withProducts.map((subscription) => <SubscriptionTile key={subscription.id} subscription={subscription} />)}
          </div>
        )}

        <UrbanPanel className="grid gap-4 p-5 md:grid-cols-4">
          {[
            ['Choose products', Package],
            ['Set frequency', CalendarDays],
            ['Save automatically', BadgePercent],
            ['Stay flexible', SlidersHorizontal],
          ].map(([label, Icon]) => (
            <div key={String(label)} className="border border-[#5a4136] bg-[#282a2b] p-4 text-center">
              <Icon className="mx-auto h-6 w-6 text-[#ffb693]" />
              <p className="mt-3 font-market-label text-sm font-black uppercase tracking-[0.14em] text-[#e2e2e2]">{String(label)}</p>
            </div>
          ))}
        </UrbanPanel>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
