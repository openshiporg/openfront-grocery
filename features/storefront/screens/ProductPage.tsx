import type { GroceryProduct } from '../types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductByHandle } from '../lib/data/products';
import { getShoppingLists } from '../lib/data/lists';
import { getUser } from '../lib/data/user';
import { storefrontMetadata } from '../lib/metadata';
import ProductActions from '../modules/products/components/product-actions';
import { ArrowRight, Leaf, Truck } from 'lucide-react';
import { UrbanBreadcrumb, UrbanContainer, UrbanPageShell, UrbanPrice, UrbanProductArtwork, formatMoney, formatUnit } from '../modules/urban/UrbanPrimitives';

type Props = { params: Promise<{ slug: string; countryCode?: string }> };
function plainDescription(description: unknown): string {
  if (typeof description === 'string') return description;
  if (Array.isArray(description)) return description.map(plainDescription).filter(Boolean).join(' ');
  if (description && typeof description === 'object') {
    const node = description as { text?: unknown; children?: unknown; document?: unknown };
    return plainDescription(node.text || node.children || node.document);
  }
  return '';
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductByHandle(slug);
  if (!product) notFound();
  return storefrontMetadata({ title: product.name, description: plainDescription(product.description) || `Shop ${product.name}.`, canonical: `/products/${slug}` });
}
export async function ProductPage(props: Props) {
  const { slug } = await props.params;
  const [product, user, shoppingLists] = await Promise.all([getProductByHandle(slug), getUser(), getShoppingLists()]);
  if (!product) notFound();
  const measured = ['weight', 'volume'].includes(product.pricingMethod || '');
  const hasSavings = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
  const description = plainDescription(product.description);
  const nutrition = product.nutrition && Object.keys(product.nutrition).length ? Object.entries(product.nutrition) : null;
  return <UrbanPageShell><UrbanContainer className="space-y-10 py-6 sm:space-y-16 sm:py-8">
    <div className="space-y-5">
      <UrbanBreadcrumb items={[{ label: 'Shop', href: '/products' }, ...(product.department ? [{ label: product.department.name, href: `/departments/${product.department.handle}` }] : []), { label: product.name }]} />
      <section className="grid items-start gap-7 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
        <div className="relative overflow-hidden rounded-[28px] bg-[var(--sf-paper-3)] md:sticky md:top-[calc(var(--sf-header-offset)+1rem)]">
          <div className="aspect-square"><UrbanProductArtwork product={product} eager /></div>
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            {product.organicCertified ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sf-card)] px-3 py-1.5 text-xs font-bold text-[var(--sf-sage)] shadow-[var(--sf-shadow-1)]"><Leaf className="h-3.5 w-3.5" aria-hidden="true" />Organic</span> : null}
            {product.isPerishable ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sf-card)] px-3 py-1.5 text-xs font-bold text-[var(--sf-info)] shadow-[var(--sf-shadow-1)]">Perishable</span> : null}
          </div>
        </div>
        <div className="min-w-0">
          {product.department ? <Link prefetch={false} href={`/departments/${product.department.handle}`} className="sf-eyebrow inline-flex min-h-8 items-center hover:underline">{product.department.name}</Link> : null}
          <h1 className="sf-title mt-1">{product.name}</h1>
          {product.variantLabel ? <p className="mt-2 text-[0.9375rem] text-[var(--sf-ink-muted)]">{product.variantLabel}{product.variantOf ? <> · <Link prefetch={false} href={`/products/${product.variantOf.handle}`} className="font-semibold underline underline-offset-4">View {product.variantOf.title}</Link></> : null}</p> : null}

          <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-2">
            <span className={hasSavings ? 'sf-price-tag px-3 py-2' : ''}><UrbanPrice value={product.price} className="text-[2.75rem]" /></span>
            <div className="pb-1">
              <p className="text-sm font-semibold">per {formatUnit(product.unit)}{measured ? ' · estimated' : ''}</p>
              {hasSavings ? <p className="text-sm text-[var(--sf-ink-muted)]"><span className="sf-was">{formatMoney(product.compareAtPrice)}</span> · you save {formatMoney(product.compareAtPrice! - product.price)}</p> : null}
            </div>
          </div>
          <p className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${product.inStock ? 'text-[var(--sf-sage)]' : 'text-[var(--sf-danger)]'}`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${product.inStock ? 'bg-[var(--sf-sage)]' : 'bg-[var(--sf-danger)]'}`} />{product.inStock ? 'In stock' : 'Out of stock'}</p>
          {measured ? <p className="sf-note mt-4">Priced by {product.pricingMethod}. Basket quantities request whole units; the final price uses the amount actually picked. A higher total requires your approval before another authorization.</p> : null}

          <ProductActions product={product} lists={shoppingLists} isSignedIn={Boolean(user)} />

          <Link prefetch={false} href="/fulfillment" className="group mt-6 flex items-center gap-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-2)] p-4 transition-colors hover:bg-[var(--sf-paper-3)]">
            <Truck className="h-5 w-5 shrink-0 text-[var(--sf-sage)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm"><span className="block font-semibold">Delivery or pickup</span><span className="text-[var(--sf-ink-muted)]">See the next available times — you choose at checkout.</span></span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>

    <section className="grid items-start gap-10 border-t border-[var(--sf-rule)] pt-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
      <div className="min-w-0 space-y-10">
        <div>
          <h2 className="sf-subtitle">About this product</h2>
          <p className="mt-3 max-w-2xl whitespace-pre-line text-[0.9375rem] leading-7 text-[var(--sf-ink-muted)]">{description || 'A description has not been provided for this product.'}</p>
          {product.sku ? <p className="mt-4 text-xs text-[var(--sf-ink-faint)]">Product code <span className="sf-mono font-medium text-[var(--sf-ink-muted)]">{product.sku}</span></p> : null}
        </div>
        <div>
          <h2 className="sf-subtitle">Allergens & ingredients</h2>
          {product.allergens?.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Listed allergens">{product.allergens.map((value) => <li key={value} className="rounded-full bg-[var(--sf-warn-bg)] px-3 py-1.5 text-sm font-semibold capitalize text-[var(--sf-warn)]">{value.replaceAll('_', ' ')}</li>)}</ul>
          ) : <p className="mt-3 text-[0.9375rem] text-[var(--sf-ink-muted)]">No allergens listed. An empty listing does not mean allergen-free.</p>}
          {product.informationSource ? <p className="mt-4 text-xs text-[var(--sf-ink-faint)]">Information source: {product.informationSource}</p> : null}
          <p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--sf-ink-faint)]">Check the product packaging for current ingredients and allergen information. <Link prefetch={false} href="/support" className="underline">Contact the store</Link> with product questions.</p>
        </div>
      </div>
      {nutrition ? (
        <aside aria-labelledby="nutrition-title" className="sf-nutrition">
          <h3 id="nutrition-title">Nutrition Facts</h3>
          <p className="py-1.5 text-xs">As provided by the store. Check packaging for serving details.</p>
          <dl className="border-t-[4px] border-[var(--sf-ink)]">{nutrition.map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</dt><dd className="tabular-nums">{String(value)}</dd></div>)}</dl>
        </aside>
      ) : (
        <aside className="sf-note">Nutrition details have not been provided for this product.</aside>
      )}
    </section>
  </UrbanContainer></UrbanPageShell>;
}
