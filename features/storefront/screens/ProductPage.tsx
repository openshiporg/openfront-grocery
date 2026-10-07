import type { GroceryProduct } from '../types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductByHandle } from '../lib/data/products';
import { getShoppingLists } from '../lib/data/lists';
import { getUser } from '../lib/data/user';
import { storefrontMetadata } from '../lib/metadata';
import ProductActions from '../modules/products/components/product-actions';
import { UrbanBadge, UrbanBreadcrumb, UrbanContainer, UrbanPageShell, UrbanProductArtwork, formatMoney, formatUnit } from '../modules/urban/UrbanPrimitives';

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
  return <UrbanPageShell><UrbanContainer className="space-y-6 py-6 sm:py-8">
    <UrbanBreadcrumb items={[{ label: 'Shop', href: '/products' }, ...(product.department ? [{ label: product.department.name, href: `/departments/${product.department.handle}` }] : []), { label: product.name }]} />
    <section className="grid items-start gap-6 md:grid-cols-2 lg:gap-10">
      <div className="overflow-hidden rounded-xl border border-[var(--sf-rule)] bg-[var(--sf-paper-3)]"><div className="aspect-square"><UrbanProductArtwork product={product} /></div></div>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap gap-2">{product.organicCertified ? <UrbanBadge>Organic</UrbanBadge> : null}{product.isPerishable ? <UrbanBadge tone="blue">Perishable</UrbanBadge> : null}<UrbanBadge tone={product.inStock ? 'primary' : 'danger'}>{product.inStock ? 'In stock' : 'Out of stock'}</UrbanBadge></div>
        <h1 className="font-[family-name:var(--sf-font-display)] text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>
        {product.variantLabel ? <p className="mt-2 text-sm text-[var(--sf-ink-muted)]">{product.variantLabel}{product.variantOf ? <> · <Link prefetch={false} href={`/products/${product.variantOf.handle}`} className="underline">View {product.variantOf.title}</Link></> : null}</p> : null}
        <div className="mt-5 flex flex-wrap items-baseline gap-3"><p className="text-3xl font-semibold tabular-nums">{formatMoney(product.price)}</p><span className="text-sm text-[var(--sf-ink-muted)]">per {formatUnit(product.unit)}</span>{hasSavings ? <del className="text-sm text-[var(--sf-ink-muted)]">{formatMoney(product.compareAtPrice)}</del> : null}</div>
        {measured ? <p className="sf-note mt-4">Priced by {product.pricingMethod}. Basket quantities request whole units; the final price uses the amount actually picked. A higher total requires your approval before another authorization.</p> : null}
        <ProductActions product={product} lists={shoppingLists} isSignedIn={Boolean(user)} />
        <Link prefetch={false} href="/fulfillment" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-[var(--sf-accent)] underline">View delivery and pickup times</Link>
      </div>
    </section>
    <section className="grid gap-6 border-t border-[var(--sf-rule)] py-6 md:grid-cols-2">
      <div><h2 className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">About this product</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-[var(--sf-ink-muted)]">{plainDescription(product.description) || 'A description has not been provided for this product.'}</p>{product.sku ? <p className="mt-4 text-xs text-[var(--sf-ink-muted)]">Product code: {product.sku}</p> : null}</div>
      <div className="space-y-5"><div><h2 className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">Ingredients & product information</h2><p className="mt-3 text-sm leading-6"><strong>Listed allergens:</strong> {product.allergens?.length ? product.allergens.map((value) => value.replaceAll('_', ' ')).join(', ') : 'Not provided. An empty listing does not mean allergen-free.'}</p></div>
        {product.nutrition && Object.keys(product.nutrition).length ? <dl className="divide-y divide-[var(--sf-rule)] text-sm">{Object.entries(product.nutrition).map(([key, value]) => <div key={key} className="flex justify-between gap-5 py-2"><dt>{key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</dt><dd className="text-right">{String(value)}</dd></div>)}</dl> : <p className="text-sm text-[var(--sf-ink-muted)]">Nutrition details have not been provided.</p>}
        {product.informationSource ? <p className="text-xs text-[var(--sf-ink-muted)]">Information source: {product.informationSource}</p> : null}<p className="text-xs leading-6 text-[var(--sf-ink-muted)]">Check the product packaging for the current ingredients and allergen information. <Link prefetch={false} href="/support" className="underline">Contact the store</Link> with product questions.</p>
      </div>
    </section>
  </UrbanContainer></UrbanPageShell>;
}
