import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import { getDeliveryWindows, getPickupWindows } from '@/features/storefront/lib/data/delivery';
import { getProductsList } from '@/features/storefront/lib/data/products';
import { getStore } from '@/features/storefront/lib/data/store';
import type { GroceryDepartment, GroceryProduct } from '@/features/storefront/types';
import {
  UrbanBadge,
  UrbanButtonLink,
  UrbanContainer,
  UrbanLead,
  UrbanSearchStrip,
  formatMoney,
  productImage,
} from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  return {
    title: store.name,
    description: store.homepageDescription,
  };
}

function BoardRow({ product, index }: { product: GroceryProduct; index: number }) {
  return (
    <Link
      href={`/products/${product.handle}`}
      className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--sf-rule)] py-3 transition hover:bg-[var(--sf-paper-2)] sm:grid-cols-[2.5rem_minmax(0,1fr)_8rem_5rem]"
    >
      <span className="font-[family-name:var(--sf-font-display)] text-sm text-[var(--sf-ink-faint)]">{String(index + 1).padStart(2, '0')}</span>
      <div className="min-w-0">
        <p className="truncate font-medium text-[var(--sf-ink)] group-hover:text-[var(--sf-accent)]">{product.name}</p>
        <p className="truncate text-xs text-[var(--sf-ink-muted)]">
          {product.department?.name || 'Market'}
          {product.unit ? ` · ${product.unit.replace(/^unit_/, '').replace(/_/g, ' ')}` : ''}
          {product.organicCertified ? ' · Organic' : ''}
        </p>
      </div>
      <span className="hidden text-right text-sm text-[var(--sf-ink-muted)] sm:block">
        {product.inStock ? 'In stock' : 'Unavailable'}
      </span>
      <span className="text-right font-[family-name:var(--sf-font-display)] text-lg font-semibold text-[var(--sf-ink)]">
        {formatMoney(product.price)}
      </span>
    </Link>
  );
}

function formatWindowLabel(date: string, start: string, end: string) {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${start}–${end}`;
}

export async function HomePage(props: { params: Promise<{ countryCode?: string }> }) {
  await props.params;
  const [store, departmentsResult, productsResult, deliveryResult, pickupResult] = await Promise.all([
    getStore(),
    getDepartmentsList(0, 8),
    getProductsList({ limit: 12, offset: 0, availability: 'in-stock' as any }),
    getDeliveryWindows(),
    getPickupWindows(),
  ]);

  const departments: GroceryDepartment[] = departmentsResult.departments || [];
  const products: GroceryProduct[] = productsResult.products || [];
  const heroProduct = products[0];
  const boardProducts = products.slice(0, 8);
  const storeName = store.name;
  const heroTitle = store.homepageTitle || store.name;
  const heroDescription = store.homepageDescription;

  const nextDelivery = deliveryResult.windows.find((w) => w.available);
  const nextPickup = pickupResult.windows.find((w) => w.available);

  return (
    <div className="flex-grow">
      <section className="border-b border-[var(--sf-rule)] bg-[var(--sf-paper-2)]">
        <UrbanContainer className="py-10 sm:py-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sf-sage)]">{storeName}</p>
              <h1 className="mt-3 max-w-2xl font-[family-name:var(--sf-font-display)] text-[length:var(--sf-text-display)] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--sf-ink)] [overflow-wrap:anywhere]">
                {heroTitle}
              </h1>
              {heroDescription ? <UrbanLead className="mt-4">{heroDescription}</UrbanLead> : null}
              <div className="mt-6 max-w-xl">
                <UrbanSearchStrip placeholder="Search tomatoes, oat milk, olive oil…" />
              </div>
            </div>

            <div className="grid gap-px border border-[var(--sf-rule-strong)] bg-[var(--sf-rule)] sm:grid-cols-2">
              <div className="bg-[var(--sf-paper)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">Delivery</p>
                <p className="mt-2 text-sm leading-6 text-[var(--sf-ink)]">
                  {nextDelivery
                    ? formatWindowLabel(nextDelivery.date, nextDelivery.startTime, nextDelivery.endTime)
                    : 'Check checkout for open windows'}
                </p>
              </div>
              <div className="bg-[var(--sf-paper)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">Pickup</p>
                <p className="mt-2 text-sm leading-6 text-[var(--sf-ink)]">
                  {nextPickup
                    ? formatWindowLabel(nextPickup.date, nextPickup.startTime, nextPickup.endTime)
                    : 'Check checkout for open windows'}
                </p>
              </div>
            </div>
          </div>
        </UrbanContainer>
      </section>

      <UrbanContainer className="py-10 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="min-w-0">
            <div className="flex items-end justify-between gap-4 border-b border-[var(--sf-rule-strong)] pb-3">
              <div>
                <h2 className="font-[family-name:var(--sf-font-display)] text-[length:var(--sf-text-title)] font-semibold tracking-[-0.02em] text-[var(--sf-ink)]">
                  Market board
                </h2>
                <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">In-stock picks from today&apos;s catalog</p>
              </div>
              <Link href="/products" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--sf-accent)] hover:text-[var(--sf-accent-hover)]">
                Full catalog <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-1">
              {boardProducts.length > 0 ? (
                boardProducts.map((product, index) => <BoardRow key={product.id} product={product} index={index} />)
              ) : (
                <p className="py-8 text-sm text-[var(--sf-ink-muted)]">No in-stock products yet. Browse departments to explore the catalog.</p>
              )}
            </div>
          </section>

          <aside className="min-w-0 space-y-8">
            {heroProduct ? (
              <Link href={`/products/${heroProduct.handle}`} className="group block overflow-hidden border border-[var(--sf-rule-strong)]">
                <div className="aspect-[4/3] bg-[var(--sf-paper-3)]">
                  {productImage(heroProduct) ? (
                    <img
                      src={productImage(heroProduct)!}
                      alt={heroProduct.name}
                      className="h-full w-full object-cover transition duration-[var(--sf-dur-normal)] group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-end p-4">
                      <p className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold text-[var(--sf-ink)]">{heroProduct.name}</p>
                    </div>
                  )}
                </div>
                <div className="border-t border-[var(--sf-rule)] bg-[var(--sf-paper)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">Featured</p>
                      <p className="mt-1 truncate font-[family-name:var(--sf-font-display)] text-xl font-semibold text-[var(--sf-ink)]">{heroProduct.name}</p>
                    </div>
                    <span className="shrink-0 font-[family-name:var(--sf-font-display)] text-xl font-semibold">{formatMoney(heroProduct.price)}</span>
                  </div>
                </div>
              </Link>
            ) : null}

            <section>
              <h2 className="border-b border-[var(--sf-rule)] pb-2 font-[family-name:var(--sf-font-display)] text-xl font-semibold text-[var(--sf-ink)]">
                Aisles
              </h2>
              <ol className="mt-2 divide-y divide-[var(--sf-rule)]">
                {departments.map((department, index) => (
                  <li key={department.id}>
                    <Link
                      href={`/departments/${department.handle}`}
                      className="flex items-center justify-between gap-3 py-3 text-sm transition hover:bg-[var(--sf-paper-2)]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="w-6 shrink-0 font-[family-name:var(--sf-font-display)] text-[var(--sf-ink-faint)]">{index + 1}</span>
                        <span className="truncate font-medium text-[var(--sf-ink)]">{department.name}</span>
                      </span>
                      <span className="shrink-0 text-[var(--sf-ink-faint)]">{department.productsCount ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              <UrbanButtonLink href="/departments" variant="ghost" className="mt-4 w-full sm:w-auto">
                View all departments
              </UrbanButtonLink>
            </section>
          </aside>
        </div>
      </UrbanContainer>

      {products.length > 4 ? (
        <section className="border-t border-[var(--sf-rule)] bg-[var(--sf-paper-2)]">
          <UrbanContainer className="py-10">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-[family-name:var(--sf-font-display)] text-[length:var(--sf-text-title)] font-semibold tracking-[-0.02em] text-[var(--sf-ink)]">
                  More from the shelves
                </h2>
                <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">{products.length} items in today&apos;s selection</p>
              </div>
              <Link href="/deals" className="text-sm font-medium text-[var(--sf-accent)] hover:text-[var(--sf-accent-hover)]">
                See specials
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-px border border-[var(--sf-rule)] bg-[var(--sf-rule)] sm:grid-cols-3 lg:grid-cols-4">
              {products.slice(4, 12).map((product) => (
                <Link
                  key={product.id}
                  href={`/products/${product.handle}`}
                  className="group flex min-w-0 flex-col bg-[var(--sf-paper)] p-3 transition hover:bg-[var(--sf-paper-2)]"
                >
                  <div className="aspect-square overflow-hidden bg-[var(--sf-paper-3)]">
                    {productImage(product) ? (
                      <img src={productImage(product)!} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-end p-2">
                        <UrbanBadge tone="muted">{product.department?.name || 'Item'}</UrbanBadge>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium text-[var(--sf-ink)] group-hover:text-[var(--sf-accent)]">{product.name}</p>
                  <p className="mt-1 font-[family-name:var(--sf-font-display)] text-base font-semibold">{formatMoney(product.price)}</p>
                </Link>
              ))}
            </div>
          </UrbanContainer>
        </section>
      ) : null}
    </div>
  );
}
