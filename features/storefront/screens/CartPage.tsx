import { Metadata } from 'next';
import Link from 'next/link';
import { ShoppingBasket } from 'lucide-react';

import { retrieveCart } from '@/features/storefront/lib/data/cart';
import { getUser } from '@/features/storefront/lib/data/user';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanCart from '@/features/storefront/modules/urban/UrbanCart';
import { UrbanContainer, UrbanMetric, UrbanPageHeader, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';

export const metadata: Metadata = storefrontMetadata({
  title: 'Basket',
  description: 'Review your grocery basket before checkout.',
});

export async function CartPage() {
  const [cart, user] = await Promise.all([retrieveCart(), getUser()]);
  const lineCount = cart?.items?.length ?? 0;

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Basket' }]}
          title="Your basket"
          description="Confirm quantities and substitution preferences before checkout."
          aside={<UrbanMetric label="Line items" value={lineCount} icon={ShoppingBasket} />}
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
        <p className="border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-8 text-[var(--sf-ink-muted)]">Loading basket…</p>
      </UrbanContainer>
    </UrbanPageShell>
  );
}

export function CartNotFound() {
  return (
    <UrbanPageShell>
      <UrbanContainer className="py-8">
        <div className="border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-8 text-center">
          <h1 className="font-[family-name:var(--sf-font-display)] text-3xl font-semibold text-[var(--sf-ink)]">Cart missing</h1>
          <Link href="/" className="mt-4 inline-block text-[var(--sf-accent)]">Go home</Link>
        </div>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
