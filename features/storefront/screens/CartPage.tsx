import { Metadata } from 'next';
import Link from 'next/link';

import { retrieveCart } from '@/features/storefront/lib/data/cart';
import { getUser } from '@/features/storefront/lib/data/user';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanCart from '@/features/storefront/modules/urban/UrbanCart';
import { UrbanContainer, UrbanEmptyState, UrbanPageHeader, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';

export const metadata: Metadata = storefrontMetadata({
  title: 'Basket',
  description: 'Review your grocery basket before checkout.',
});

export async function CartPage() {
  const [cart, user] = await Promise.all([retrieveCart({ throwOnError: true }), getUser()]);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-6 py-7 sm:space-y-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Basket' }]}
          title="Your basket"
          description="Check quantities and picking preferences, then choose a delivery or pickup time at checkout."
        />
        <UrbanCart cart={cart} user={user} />
      </UrbanContainer>
    </UrbanPageShell>
  );
}

export function CartLoading() {
  return (
    <UrbanPageShell>
      <UrbanContainer className="py-8">
        <p role="status" className="sr-only">Loading basket…</p>
        <div aria-hidden="true" className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
          <div className="space-y-5">{[0, 1, 2].map((key) => <div key={key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[6rem_minmax(0,1fr)]"><div className="sf-skeleton aspect-square" /><div className="space-y-2 pt-1"><div className="sf-skeleton h-4 w-2/3" /><div className="sf-skeleton h-3 w-1/3" /><div className="sf-skeleton h-9 w-[7.5rem] rounded-full" /></div></div>)}</div>
          <div className="sf-skeleton h-80" />
        </div>
      </UrbanContainer>
    </UrbanPageShell>
  );
}

export function CartNotFound() {
  return (
    <UrbanPageShell>
      <UrbanContainer className="py-8">
        <h1 className="sr-only">Basket not found</h1>
        <UrbanEmptyState title="We couldn’t find that basket" actionHref="/products" actionLabel="Start a new basket">
          It may have been checked out already. <Link href="/account/orders" className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">Check your orders</Link> or start shopping again.
        </UrbanEmptyState>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
