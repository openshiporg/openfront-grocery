import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ClipboardList, History, Repeat, Store, Truck } from 'lucide-react';
import { getDepartmentsList } from '../lib/data/departments';
import { getProductsList } from '../lib/data/products';
import { getStore } from '../lib/data/store';
import { getCheckoutFulfillmentWindows } from '../lib/data/delivery';
import { getDeals } from '../lib/data/deals';
import { formatDeliveryArea } from '../lib/marketFormatting';
import type { DeliveryWindow } from '../types';
import UrbanProductGrid from '../modules/urban/UrbanProductGrid';
import UrbanDepartmentCard from '../modules/urban/UrbanDepartmentCard';
import { DealTicket } from '../modules/market/MarketCouponCode';
import { MarketModeChoice } from '../modules/market/MarketMode';
import { UrbanContainer, UrbanPageShell, UrbanSectionTitle, formatMoney, formatSlotDay, formatSlotRange, timezoneLabel } from '../modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  return { title: store.name, description: store.homepageDescription };
}

function storeToday(timezone?: string) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return null; }
}

function relativeDay(date: string, today: string | null) {
  if (today && date === today) return 'Today';
  if (today) {
    const next = new Date(`${today}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    if (date === tomorrow) return 'Tomorrow';
  }
  return formatSlotDay(date);
}

function NextSlot({ mode, window, today }: { mode: 'delivery' | 'pickup'; window?: DeliveryWindow; today: string | null }) {
  const Icon = mode === 'delivery' ? Truck : Store;
  return (
    <li className="flex items-center gap-3.5 py-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--sf-header-2)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium text-[var(--sf-header-ink-muted)]">{mode === 'delivery' ? 'Delivery' : 'Pickup'}</p>
        {window ? (
          <p className="truncate font-[family-name:var(--sf-font-display)] text-lg font-bold tracking-[-0.02em]">{relativeDay(window.date, today)} · {formatSlotRange(window.startTime, window.endTime)}</p>
        ) : (
          <p className="text-[0.9375rem] font-semibold">No open times this week</p>
        )}
      </div>
      {window ? <span className="shrink-0 rounded-full bg-[var(--sf-tag)] px-2.5 py-1 text-xs font-bold text-[var(--sf-tag-ink)]">{window.fee ? `${formatMoney(window.fee)} slot` : 'No slot fee'}</span> : null}
    </li>
  );
}

export async function HomePage(props: { params: Promise<{ countryCode?: string }> }) {
  await props.params;
  const [store, { departments }, { products }, availability, deals] = await Promise.all([
    getStore(),
    getDepartmentsList(0, 8),
    getProductsList({ limit: 10, offset: 0, availability: 'in-stock' }),
    // The board is a convenience preview; checkout re-reads authoritative availability.
    getCheckoutFulfillmentWindows().catch(() => null),
    getDeals().catch(() => []),
  ]);
  const today = storeToday(store.timezone);
  const nextDelivery = availability?.deliveryWindows.find((window) => window.available);
  const nextPickup = availability?.pickupWindows.find((window) => window.available);
  const featuredAisle = departments.find((department) => department.imageUrl);

  return <UrbanPageShell>
    <UrbanContainer className="pt-4 sm:pt-6 lg:pt-8">
      <section aria-labelledby="home-title" className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-4">
        <div className="relative flex flex-col justify-between overflow-hidden rounded-[28px] bg-[var(--sf-paper-2)] p-6 sm:p-10 lg:min-h-[30rem] lg:p-12">
          <div>
            <p className="sf-eyebrow">{store.name}</p>
            <h1 id="home-title" className="sf-hero-title mt-3 max-w-[11ch]">{store.homepageTitle || 'Good food, picked for you.'}</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[var(--sf-ink-muted)] sm:text-lg">{store.homepageDescription || 'Fill your basket with the groceries you love, then choose delivery or pickup at checkout.'}</p>
          </div>
          <div className="mt-8 max-w-xl">
            <div className="flex flex-wrap gap-2.5"><MarketModeChoice mode="delivery" /><MarketModeChoice mode="pickup" variant="light" /></div>
            {departments.length ? (
              <nav aria-label="Popular aisles" className="mt-6 flex flex-wrap gap-2 border-t border-[var(--sf-rule)] pt-5">
                {departments.slice(0, 5).map((department) => <Link prefetch={false} key={department.id} href={`/departments/${department.handle}`} className="sf-chip">{department.name}</Link>)}
                <Link prefetch={false} href="/deals" className="sf-chip border-transparent bg-[var(--sf-tag)] text-[var(--sf-tag-ink)] hover:text-[var(--sf-tag-ink)]">Specials</Link>
              </nav>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[minmax(0,1fr)_auto] lg:gap-4">
          <Link prefetch={false} href={featuredAisle ? `/departments/${featuredAisle.handle}` : '/departments'} className="group relative isolate block min-h-[13rem] overflow-hidden rounded-[28px] bg-[var(--sf-header)] text-[var(--sf-header-ink)]">
            <img src={featuredAisle?.imageUrl || '/images/produce-market.jpg'} alt="" fetchPriority="high" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[var(--sf-dur-slow)] ease-[var(--sf-ease-out)] group-hover:scale-[1.03]" />
            <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,oklch(18%_0.035_182/0.8),transparent_60%)]" />
            <span className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-3">
              <span><span className="block text-[0.8125rem] font-medium text-[var(--sf-header-ink-muted)]">Shop the aisle</span><span className="block font-[family-name:var(--sf-font-display)] text-2xl font-bold tracking-[-0.03em]">{featuredAisle?.name || 'Every aisle'}</span></span>
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--sf-card)] text-[var(--sf-ink)] transition-transform duration-[var(--sf-dur-fast)] group-hover:translate-x-0.5"><ArrowRight className="h-5 w-5" /></span>
            </span>
          </Link>
          <section aria-labelledby="next-times-title" className="sf-dark rounded-[28px] px-5 pb-4 pt-5 sm:px-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="next-times-title" className="text-lg font-bold">Next available times</h2>
              <span className="text-xs text-[var(--sf-header-ink-muted)]">{timezoneLabel(store.timezone)}</span>
            </div>
            {availability ? (
              <ul className="mt-1 divide-y divide-[var(--sf-header-2)]">
                <NextSlot mode="delivery" window={nextDelivery} today={today} />
                <NextSlot mode="pickup" window={nextPickup} today={today} />
              </ul>
            ) : (
              <p className="py-4 text-sm leading-6 text-[var(--sf-header-ink-muted)]">Times couldn’t be loaded right now. You’ll choose an available time at checkout.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sf-header-2)] pt-3">
              <p className="text-xs text-[var(--sf-header-ink-muted)]">{store.deliveryPostalPrefixes?.length ? `Delivers to ${formatDeliveryArea(store.deliveryPostalPrefixes, 3)}. ` : ''}Viewing a time doesn’t reserve it.</p>
              <Link prefetch={false} href="/fulfillment" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold underline decoration-[var(--sf-header-ink-muted)] underline-offset-4 hover:decoration-[var(--sf-header-ink)]">All times <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          </section>
        </div>
      </section>
    </UrbanContainer>

    <UrbanContainer className="space-y-14 py-12 sm:space-y-20 sm:py-16">
      {departments.length ? (
        <section aria-labelledby="home-aisles">
          <UrbanSectionTitle id="home-aisles" title="Shop by aisle" actionHref="/departments" actionLabel="Every aisle" />
          <ul className="sf-scroll-row sf-bleed-row gap-3 sm:gap-4 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0">
            {departments.slice(0, 6).map((department) => <li key={department.id} className="w-[38vw] max-w-[12rem] sm:w-[11rem] lg:w-auto lg:max-w-none"><UrbanDepartmentCard department={department} /></li>)}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="home-shelf">
        <UrbanSectionTitle id="home-shelf" title="On the shelf today" actionHref="/products" actionLabel="Shop all groceries">In stock and ready to pick. Prices are confirmed again at checkout.</UrbanSectionTitle>
        <UrbanProductGrid products={products} />
      </section>

      {deals.length ? (
        <section aria-labelledby="home-deals">
          <UrbanSectionTitle id="home-deals" title="Clip a coupon" actionHref="/deals" actionLabel="All specials">Enter a code at checkout; eligibility is checked against your basket.</UrbanSectionTitle>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{deals.slice(0, 3).map((deal) => <DealTicket key={deal.id} deal={deal} />)}</div>
        </section>
      ) : null}

      <section aria-labelledby="home-routine" className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-4">
        <Link prefetch={false} href="/lists" className="sf-notepad group relative flex min-h-[15rem] flex-col justify-between overflow-hidden p-6 pt-10 sm:p-8 sm:pt-12">
          <div className="relative">
            <ClipboardList className="h-6 w-6 text-[var(--sf-accent)]" aria-hidden="true" />
            <h2 id="home-routine" className="mt-4 text-[1.75rem] font-bold leading-tight tracking-[-0.03em]">Shop from your list</h2>
            <p className="mt-2 max-w-sm text-[0.9375rem] leading-7 text-[var(--sf-ink-muted)]">Keep the usuals on a reusable list, tick things off, and send everything unchecked to your basket at once.</p>
          </div>
          <span className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold">Open my lists <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
        </Link>
        <div className="grid gap-3 md:gap-4">
          {[
            { href: '/account/orders', Icon: History, title: 'Shop a past order again', text: 'Add a previous basket at today’s prices.' },
            { href: '/subscriptions', Icon: Repeat, title: 'Recurring baskets & rewards', text: 'Prepare your regulars on a schedule; you approve each checkout.' },
          ].map(({ href, Icon, title, text }) => (
            <Link prefetch={false} key={href} href={href} className="group flex items-center gap-4 rounded-[var(--sf-radius-lg)] bg-[var(--sf-paper-2)] p-5 transition-colors hover:bg-[var(--sf-paper-3)] sm:p-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--sf-card)] text-[var(--sf-sage)] shadow-[var(--sf-shadow-1)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="mt-0.5 block text-sm leading-6 text-[var(--sf-ink-muted)]">{text}</span></span>
              <ArrowRight className="h-5 w-5 shrink-0 text-[var(--sf-ink-faint)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </UrbanContainer>
  </UrbanPageShell>;
}
