import type { GroceryProduct } from '@/features/storefront/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Barcode, Leaf, Package, RadioTower, Snowflake, Truck } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getProductByHandle } from '@/features/storefront/lib/data/products';
import { getShoppingLists } from '@/features/storefront/lib/data/lists';
import { getUser } from '@/features/storefront/lib/data/user';
import ProductActions from '@/features/storefront/modules/products/components/product-actions';
import { UrbanBadge, UrbanContainer, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel, formatMoney, formatUnit, productImage } from '@/features/storefront/modules/urban/UrbanPrimitives';

type Props = {
  params: Promise<{ slug: string; countryCode?: string }>;
};

function plainDescription(description: unknown) {
  if (typeof description === 'string') return description;
  if (!description) return '';
  return 'Fresh grocery item connected to live Urban Express inventory.';
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const product: GroceryProduct | null = await getProductByHandle(params.slug);
  if (!product) notFound();
  return {
    title: `${product.name} | Urban Express`,
    description: plainDescription(product.description) || `${product.name} - Fresh from our store.`,
    alternates: { canonical: `/products/${params.slug}` },
  };
}

export async function ProductPage(props: Props) {
  const params = await props.params;
  const [product, user, shoppingLists] = await Promise.all([
    getProductByHandle(params.slug),
    getUser(),
    getShoppingLists(),
  ]);

  if (!product) notFound();

  const image = productImage(product);
  const description = plainDescription(product.description);
  const hasSavings = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <Link href="/products" className="hover:text-[#ffb693]">Inventory</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">{product.name}</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-2">
          <UrbanPanel className="relative min-h-[520px] overflow-hidden bg-[#282a2b]">
            {image ? <img src={image} alt={product.name} className="h-full min-h-[520px] w-full object-cover opacity-80 mix-blend-luminosity" /> : <div className="flex h-full min-h-[520px] items-center justify-center"><Package className="h-20 w-20 text-[#ffb693]/50" /></div>}
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              {product.organicCertified ? <UrbanBadge><Leaf className="h-3 w-3" /> Organic</UrbanBadge> : null}
              {product.isPerishable ? <UrbanBadge tone="blue"><Snowflake className="h-3 w-3" /> Cold chain</UrbanBadge> : null}
              {!product.inStock ? <UrbanBadge tone="danger">Out of stock</UrbanBadge> : <UrbanBadge tone="orange">Live stock</UrbanBadge>}
            </div>
          </UrbanPanel>

          <UrbanPanel className="p-5 sm:p-8">
            <p className="font-market-label text-xs font-black uppercase tracking-[0.22em] text-[#ffb693]">{product.department?.name || 'Urban supply'}</p>
            <UrbanHeadline className="mt-3">{product.name}</UrbanHeadline>
            <p className="mt-5 text-sm leading-7 text-[#e2bfb0]">{description || 'Live grocery inventory staged for quick delivery, pickup, and substitution-aware fulfillment.'}</p>

            <div className="mt-6 border-y border-[#5a4136] py-5">
              <div className="flex flex-wrap items-end gap-4">
                <div className="font-market-label text-6xl font-black tracking-[-0.06em] text-[#ffb693]">{formatMoney(product.price)}</div>
                <div className="pb-2 font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">/ {formatUnit(product.unit)}</div>
                {hasSavings ? <div className="pb-2 text-sm text-[#e2bfb0] line-through">{formatMoney(product.compareAtPrice)}</div> : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <UrbanMetric label="Stock" value={product.stockQuantity ?? 0} icon={RadioTower} />
              <UrbanMetric label="Unit" value={formatUnit(product.unit)} icon={Package} />
              <UrbanMetric label="SKU" value={product.sku || 'Live'} icon={Barcode} />
            </div>

            <ProductActions product={product} lists={shoppingLists} isSignedIn={Boolean(user)} />

            <div className="mt-5 flex items-center gap-2 border border-[#5a4136] bg-[#282a2b] p-3 text-sm text-[#e2bfb0]">
              <Truck className="h-4 w-4 text-[#ffb693]" /> Eligible for express delivery, curbside pickup, and picker substitution rules.
            </div>
          </UrbanPanel>
        </section>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
