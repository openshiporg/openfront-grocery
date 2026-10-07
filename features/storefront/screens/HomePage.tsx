import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ListChecks, ShoppingBag } from 'lucide-react';
import { getDepartmentsList } from '../lib/data/departments';
import { getProductsList } from '../lib/data/products';
import { getStore } from '../lib/data/store';
import UrbanProductGrid from '../modules/urban/UrbanProductGrid';
import UrbanDepartmentCard from '../modules/urban/UrbanDepartmentCard';
import { UrbanButtonLink, UrbanContainer, UrbanPageShell, UrbanSectionTitle } from '../modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  return { title: store.name, description: store.homepageDescription };
}

export async function HomePage(props: { params: Promise<{ countryCode?: string }> }) {
  await props.params;
  const [store, { departments }, { products }] = await Promise.all([
    getStore(), getDepartmentsList(0, 8), getProductsList({ limit: 12, offset: 0, availability: 'in-stock' }),
  ]);
  const featuredAisle = departments.find((department) => department.imageUrl);
  return <UrbanPageShell>
    <UrbanContainer className="py-5 sm:py-8">
      <section className="grid overflow-hidden rounded-xl border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] md:grid-cols-2">
        <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-[var(--sf-sage)]">Your everyday grocery shop</p>
          <h1 className="sf-hero-title">{store.homepageTitle || 'Good food. Everyday essentials.'}</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-[var(--sf-ink-muted)] sm:text-base">{store.homepageDescription || 'Fill your basket with the groceries you love, then choose delivery or pickup at checkout.'}</p>
          <div className="mt-6 flex flex-wrap gap-3"><UrbanButtonLink href="/products">Start shopping <ArrowRight className="h-4 w-4" aria-hidden="true" /></UrbanButtonLink><UrbanButtonLink href="/deals" variant="ghost">Shop specials</UrbanButtonLink></div>
        </div>
        <Link prefetch={false} href={featuredAisle ? `/departments/${featuredAisle.handle}` : '/departments'} className="relative block min-h-52 md:min-h-80">
          <img src={featuredAisle?.imageUrl || '/images/produce-market.jpg'} alt={featuredAisle ? `Shop ${featuredAisle.name}` : 'Browse grocery aisles'} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 rounded-md bg-[var(--sf-paper)] px-4 py-3 text-sm font-semibold">{featuredAisle?.name || 'Explore the aisles'}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></span>
        </Link>
      </section>
      <nav aria-label="Make shopping easier" className="mt-4 grid divide-y divide-[var(--sf-rule)] rounded-lg border border-[var(--sf-rule)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[{ href: '/fulfillment', Icon: CalendarDays, title: 'Delivery or pickup', text: 'Find a time that works for you' }, { href: '/lists', Icon: ListChecks, title: 'A list for every shop', text: 'Save your usuals for next time' }, { href: '/account/orders', Icon: ShoppingBag, title: 'Your orders, together', text: 'Track an order or shop it again' }].map(({ href, Icon, title, text }) => <Link prefetch={false} key={href} href={href} className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 shrink-0 text-[var(--sf-sage)]" aria-hidden="true" /><span><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-xs text-[var(--sf-ink-muted)]">{text}</span></span></Link>)}
      </nav>
    </UrbanContainer>
    <UrbanContainer className="space-y-10 pb-12 sm:space-y-12">
      {departments.length ? <section><UrbanSectionTitle title="Shop your aisles" actionHref="/departments" actionLabel="All aisles" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{departments.slice(0, 4).map((department) => <UrbanDepartmentCard key={department.id} department={department} />)}</div></section> : null}
      <section><UrbanSectionTitle title="Ready for your basket" actionHref="/products" actionLabel="Shop all">Groceries currently in stock. Add a little, or stock up for the week.</UrbanSectionTitle><UrbanProductGrid products={products} /></section>
      <section className="flex flex-col items-start justify-between gap-5 rounded-lg bg-[var(--sf-header)] p-6 text-[var(--sf-header-ink)] sm:flex-row sm:items-center sm:p-8"><div><h2 className="font-[family-name:var(--sf-font-display)] text-2xl">Make the next shop a little easier.</h2><p className="mt-2 text-sm leading-6">Keep a shopping list, revisit your orders, and manage your regular groceries.</p></div><Link prefetch={false} href="/lists" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-[var(--sf-paper)] px-5 py-3 text-sm font-semibold text-[var(--sf-ink)]">Open my lists <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></section>
    </UrbanContainer>
  </UrbanPageShell>;
}
