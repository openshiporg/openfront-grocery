import type { GroceryProduct } from '@/features/storefront/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Barcode, Leaf, Package, Snowflake, Truck } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getProductByHandle } from '@/features/storefront/lib/data/products';
import { getShoppingLists } from '@/features/storefront/lib/data/lists';
import { getUser } from '@/features/storefront/lib/data/user';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import ProductActions from '@/features/storefront/modules/products/components/product-actions';
import { UrbanBadge, UrbanContainer, UrbanMetric, UrbanPageShell, UrbanProductArtwork, formatMoney, formatUnit, UrbanPageHeader } from '@/features/storefront/modules/urban/UrbanPrimitives';

type Props = {
  params: Promise<{ slug: string; countryCode?: string }>;
};

function plainDescription(description: unknown) {
  if (typeof description === 'string') return description;
  if (!description) return '';
  return 'Fresh grocery item from today\'s market selection.';
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const product: GroceryProduct | null = await getProductByHandle(params.slug);
  if (!product) notFound();
  return storefrontMetadata({
    title: product.name,
    description: plainDescription(product.description) || `${product.name} - Grocery product detail.`,
    canonical: `/products/${params.slug}`,
  });
}

export async function ProductPage(props: Props) {
  const params = await props.params;
  const [product, user, shoppingLists] = await Promise.all([
    getProductByHandle(params.slug),
    getUser(),
    getShoppingLists(),
  ]);

  if (!product) notFound();

  const description = plainDescription(product.description);
  const hasSavings = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[
            { label: 'Home', href: '/' },
            { label: 'Products', href: '/products' },
            { label: product.name },
          ]}
          title={product.name}
          description={description || undefined}
        />

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="overflow-hidden border border-[var(--sf-rule-strong)] bg-[var(--sf-paper-3)]">
            <div className="aspect-[5/4]">
              <UrbanProductArtwork product={product} className="h-full w-full" priorityLabel={product.department?.name} />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap gap-2">
              {product.department?.name ? <UrbanBadge tone="muted">{product.department.name}</UrbanBadge> : null}
              {product.organicCertified ? <UrbanBadge><Leaf className="h-3 w-3" /> Organic</UrbanBadge> : null}
              {product.isPerishable ? <UrbanBadge tone="blue"><Snowflake className="h-3 w-3" /> Chilled</UrbanBadge> : null}
              {!product.inStock ? <UrbanBadge tone="danger">Out of stock</UrbanBadge> : <UrbanBadge tone="primary">In stock</UrbanBadge>}
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-4 border-y border-[var(--sf-rule)] py-5">
              <p className="font-[family-name:var(--sf-font-display)] text-4xl font-semibold tracking-[-0.02em] text-[var(--sf-ink)]">{formatMoney(product.price)}</p>
              <p className="pb-1 text-sm text-[var(--sf-ink-muted)]">per {formatUnit(product.unit)}</p>
              {hasSavings ? <p className="pb-1 text-sm text-[var(--sf-ink-faint)] line-through">{formatMoney(product.compareAtPrice)}</p> : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <UrbanMetric label="On hand" value={product.stockQuantity ?? 0} icon={Package} />
              <UrbanMetric label="Unit" value={formatUnit(product.unit)} icon={Package} />
              <UrbanMetric label="SKU" value={product.sku || '—'} icon={Barcode} />
            </div>

            <ProductActions product={product} lists={shoppingLists} isSignedIn={Boolean(user)} />

            <p className="mt-6 flex items-start gap-2 border-t border-[var(--sf-rule)] pt-4 text-sm leading-6 text-[var(--sf-ink-muted)]">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sf-sage)]" />
              Available for delivery, curbside pickup, and saved lists.
            </p>
          </div>
        </section>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
