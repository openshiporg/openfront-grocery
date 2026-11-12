import type { Metadata } from 'next';
import Link from 'next/link';
import { RigelModeToggle, RigelSlotHeading, RigelSlotList } from '../modules/rigel/RigelFulfillment';
import { notFound } from 'next/navigation';
import { getProductByHandle } from '../lib/data/products';
import { getShoppingLists } from '../lib/data/lists';
import { getUser } from '../lib/data/user';
import { storefrontMetadata } from '../lib/metadata';
import ProductActions from '../modules/products/components/product-actions';
import { ArrowRight, Leaf } from 'lucide-react';
import { UrbanBreadcrumb, UrbanContainer, UrbanPageShell, UrbanPrice, UrbanProductArtwork, formatMoney, perUnitLabel } from '../modules/urban/UrbanPrimitives';

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
function siteOrigin() {
  try { return process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : null; } catch { return null; }
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductByHandle(slug);
  if (!product) notFound();
  const description = plainDescription(product.description) || `Shop ${product.name}.`;
  const image = product.imageUrl || product.thumbnailUrl;
  const origin = siteOrigin();
  return {
    ...storefrontMetadata({ title: product.name, description, canonical: `/products/${slug}` }),
    // Same shape as E-commerce's product metadata; image URLs are made absolute against the store origin.
    openGraph: {
      title: product.name,
      description,
      ...(origin ? { url: new URL(`/products/${slug}`, origin).toString() } : {}),
      images: image && (origin || /^https?:\/\//.test(image)) ? [new URL(image, origin || undefined).toString()] : [],
    },
  };
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
      <UrbanBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Shop', href: '/products' }, ...(product.department ? [{ label: product.department.name, href: `/departments/${product.department.handle}` }] : []), { label: product.name }]} />
      <section className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        <div className="relative overflow-hidden rounded-[var(--sf-radius-lg)] bg-[var(--sf-paper-3)] md:sticky md:top-[calc(var(--sf-header-offset)+1rem)]">
          <div className="aspect-square"><UrbanProductArtwork product={product} eager className="mix-blend-multiply" /></div>
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            {product.organicCertified ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sf-card)] px-3 py-1.5 text-xs font-bold text-[var(--sf-sage)] shadow-[var(--sf-shadow-1)]"><Leaf className="h-3.5 w-3.5" aria-hidden="true" />Organic</span> : null}
            {product.isPerishable ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sf-card)] px-3 py-1.5 text-xs font-bold text-[var(--sf-info)] shadow-[var(--sf-shadow-1)]">Perishable</span> : null}
          </div>
        </div>
        <div className="min-w-0">
          {product.department ? <Link prefetch={false} href={`/departments/${product.department.handle}`} className="sf-eyebrow inline-flex min-h-11 items-center hover:underline">{product.department.name}</Link> : null}
          <h1 className="sf-title mt-1">{product.name}</h1>
          {product.variantLabel ? <p className="mt-2 text-[0.9375rem] text-[var(--sf-ink-muted)]">{product.variantLabel}{product.variantOf ? <> · <Link prefetch={false} href={`/products/${product.variantOf.handle}`} className="font-semibold underline underline-offset-4">View {product.variantOf.title}</Link></> : null}</p> : null}

          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <UrbanPrice value={product.price} className="text-[2rem] text-[var(--sf-accent-hover)]" />
            <span className="text-[0.9375rem] text-[var(--sf-ink-muted)]">{perUnitLabel(product.unit)}{measured ? ' · estimated' : ''}</span>
            {hasSavings ? <span className="ml-1 rounded-full bg-[var(--sf-tag)] px-2.5 py-0.5 text-[0.8125rem] font-semibold text-[var(--sf-tag-ink)]">Save {formatMoney(product.compareAtPrice! - product.price)} <span className="sf-was font-normal">{formatMoney(product.compareAtPrice)}</span></span> : null}
          </div>
          <p className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${product.inStock ? 'text-[var(--sf-sage)]' : 'text-[var(--sf-danger)]'}`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${product.inStock ? 'bg-[var(--sf-sage)]' : 'bg-[var(--sf-danger)]'}`} />{product.inStock ? 'In stock' : 'Out of stock'}</p>
          {measured ? <p className="sf-note mt-4">Priced by {product.pricingMethod}. Basket quantities request whole units; the final price uses the amount actually picked. A higher total requires your approval before another authorization.</p> : null}

          <ProductActions product={product} lists={shoppingLists} isSignedIn={Boolean(user)} />

          <div className="mt-6 grid gap-3 rounded-[var(--sf-radius-lg)] bg-[var(--sf-card)] p-4 shadow-[var(--sf-shadow-1)] lg:hidden">
            <RigelModeToggle />
            <RigelSlotHeading />
            <RigelSlotList name="product-window" limit={2} compact />
            <Link prefetch={false} href="/fulfillment" className="inline-flex min-h-11 items-center gap-1 text-[0.8125rem] text-[var(--sf-accent-hover)] underline underline-offset-2">All delivery &amp; pickup times <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
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
