import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, History, Plus, Repeat, ShoppingCart } from 'lucide-react';
import { getDepartmentsList } from '../lib/data/departments';
import { getProductsList } from '../lib/data/products';
import { getStore } from '../lib/data/store';
import { getDeals } from '../lib/data/deals';
import UrbanProductGrid from '../modules/urban/UrbanProductGrid';
import UrbanDepartmentCard from '../modules/urban/UrbanDepartmentCard';
import { DealTicket } from '../modules/market/MarketCouponCode';
import { RigelModeToggle, RigelPhonePickers } from '../modules/rigel/RigelFulfillment';
import { RigelPromoBanner } from '../modules/rigel/RigelChrome';
import { DepartmentIcon } from '../modules/rigel/departmentIcon';
import { UrbanSectionTitle, formatMoney } from '../modules/urban/UrbanPrimitives';
import type { GroceryDeal } from '../types';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  return { title: store.name, description: store.homepageDescription };
}

function promoHeadline(deal: GroceryDeal) {
  if (deal.discountType === 'percentage') return `${deal.discountValue}% off`;
  if (deal.discountType === 'bogo') return 'Buy one, get one';
  return `${formatMoney(deal.discountValue).replace(/\.00$/, '')} off`;
}

export async function HomePage(props: { params: Promise<{ countryCode?: string }> }) {
  await props.params;
  const [store, { departments }, { products }, deals] = await Promise.all([
    getStore(),
    getDepartmentsList(0, 12),
    getProductsList({ limit: 18, offset: 0, availability: 'in-stock' }),
    getDeals().catch(() => []),
  ]);
  const promo = deals.find((deal) => deal.discountCode);
  const shelves = departments.filter((department) => department.imageUrl).slice(0, 4);

  return <div id="storefront-main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
    <h1 className="sr-only">{store.homepageTitle || `Shop ${store.name}`}</h1>
    {promo ? (
      <div className="hidden lg:block">
        <RigelPromoBanner id={promo.id}><span className="font-medium">{promoHeadline(promo)}</span> with code <span className="font-[family-name:var(--sf-font-mono)] font-semibold">{promo.discountCode}</span>{promo.description ? ` · ${promo.description.replace(/\.$/, '')}.` : '.'} <Link prefetch={false} href="/deals" className="font-medium text-[var(--sf-accent-hover)] underline underline-offset-4">Details</Link></RigelPromoBanner>
      </div>
    ) : null}

    {/* Phone: fulfillment first, like the app. */}
    <section aria-label="Delivery or pickup" className="grid gap-3 px-3 pt-3 sm:px-5 lg:hidden">
      <RigelModeToggle variant="phone" />
      <RigelPhonePickers />
    </section>

    <div className="px-3 pb-10 pt-4 sm:px-5 lg:px-6 lg:pt-6 xl:px-7">
      {shelves.length ? (
        <nav aria-label="Featured aisles" className="mb-6 hidden lg:block">
          <ul className="grid grid-cols-4 gap-4">{shelves.map((department) => <li key={department.id}><UrbanDepartmentCard department={department} loading="eager" /></li>)}</ul>
        </nav>
      ) : null}

      <nav aria-label="Shop by" className="sf-scroll-row sf-bleed-row -mx-3 mb-4 gap-2 px-3 sm:-mx-5 sm:px-5 lg:mx-0 lg:mb-5 lg:px-0">
        <Link prefetch={false} href="/" aria-current="page" className="rg-chip rg-chip-phone lg:hidden"><ShoppingCart className="h-4 w-4" aria-hidden="true" />All</Link>
        <Link prefetch={false} href="/products" data-active="" className="rg-chip hidden lg:inline-flex">Popular</Link>
        <Link prefetch={false} href="/deals" className="rg-chip hidden lg:inline-flex">On sale</Link>
        <Link prefetch={false} href="/products?organic=true" className="rg-chip hidden lg:inline-flex">Organic</Link>
        {departments.map((department, index) => {
          return <Link prefetch={false} key={department.id} href={`/departments/${department.handle}`} className="rg-chip pl-1.5 lg:pl-4">
            <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--sf-paper-3)] lg:hidden">
              {department.imageUrl ? <img src={department.imageUrl} alt="" width={24} height={24} loading={index < 4 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" /> : <DepartmentIcon department={department} className="h-4 w-4 text-[var(--sf-ink-muted)]" />}
            </span>
            {department.name}
          </Link>;
        })}
        <Link prefetch={false} href="/departments" aria-label="Every aisle" className="hidden h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--sf-accent)] hover:bg-[var(--sf-accent-soft)] lg:grid"><Plus className="h-6 w-6" aria-hidden="true" /></Link>
      </nav>

      <section aria-labelledby="home-shelf">
        <h2 id="home-shelf" className="mb-2.5 text-[1.0625rem] font-medium lg:sr-only">Shop all</h2>
        <UrbanProductGrid products={products} />
        <div className="mt-5 flex justify-center">
          <Link prefetch={false} href="/products" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--sf-rule-strong)] bg-[var(--sf-card)] px-5 text-[0.9375rem] font-medium hover:border-[var(--sf-ink)]">Shop all groceries <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </section>

      {deals.length ? (
        <section aria-labelledby="home-deals" className="mt-12">
          <UrbanSectionTitle id="home-deals" title="Coupons" actionHref="/deals" actionLabel="All specials">Enter a code at checkout; eligibility is checked against your cart.</UrbanSectionTitle>
          <div className="grid gap-3 @container md:grid-cols-2 2xl:grid-cols-3">{deals.slice(0, 3).map((deal) => <DealTicket key={deal.id} deal={deal} />)}</div>
        </section>
      ) : null}

      <section aria-label="Shop again" className="mt-12 grid gap-3 md:grid-cols-3">
        {[
          { href: '/lists', Icon: ShoppingCart, title: 'Shop from your list', text: 'Send everything unchecked to your cart.' },
          { href: '/account/orders', Icon: History, title: 'Buy it again', text: 'Add a past order at today’s prices.' },
          { href: '/subscriptions', Icon: Repeat, title: 'Recurring orders', text: 'Your regulars on a schedule.' },
        ].map(({ href, Icon, title, text }) => (
          <Link prefetch={false} key={href} href={href} className="group flex items-center gap-3.5 rounded-[var(--sf-radius-lg)] bg-[var(--sf-paper-2)] p-4 transition-colors hover:bg-[var(--sf-paper-3)]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--sf-card)] text-[var(--sf-accent)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[0.9375rem] font-medium">{title}</span><span className="block text-[0.8125rem] text-[var(--sf-ink-muted)]">{text}</span></span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--sf-ink-faint)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ))}
      </section>
    </div>
  </div>;
}
