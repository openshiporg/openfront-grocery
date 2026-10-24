import Link from 'next/link';
import { Store, Truck } from 'lucide-react';
import { getStore } from '../lib/data/store';
import { getCheckoutFulfillmentWindows } from '../lib/data/delivery';
import type { DeliveryWindow } from '../types';
import { MarketModeChoice } from '../modules/market/MarketMode';
import { UrbanContainer, UrbanPageHeader, UrbanPageShell, formatCents, formatMoney, formatSlotDay, formatSlotRange, timezoneLabel } from '../modules/urban/UrbanPrimitives';
import { formatDeliveryArea } from '../lib/marketFormatting';
export const metadata = { title: 'Delivery & pickup', description: 'Explore delivery and pickup availability.' };

function byDay(windows: DeliveryWindow[]) {
  const days = new Map<string, DeliveryWindow[]>();
  for (const window of windows) days.set(window.date, [...(days.get(window.date) || []), window]);
  return [...days.entries()];
}

export default async function FulfillmentPage() {
  const [store, availability] = await Promise.all([getStore(), getCheckoutFulfillmentWindows()]);
  const area = store.deliveryPostalPrefixes || [];
  const minimum = (cents?: number) => cents ? ` Minimum order ${formatCents(cents)} before tax and fees.` : '';
  const deliveryText = area.length ? `Delivers to ${formatDeliveryArea(area)}.${minimum(store.deliveryMinimumCents)}` : 'Delivery is not available right now. Choose pickup instead.';
  const pickupText = `${store.address || 'Contact the store to confirm the pickup location.'}${minimum(store.pickupMinimumCents)}`;
  return <UrbanPageShell><UrbanContainer className="space-y-8 py-8 sm:py-10">
    <UrbanPageHeader title="Groceries, on your schedule." description="The week ahead at a glance. Pick your exact time at checkout — viewing a time here doesn’t reserve it." breadcrumb={[{ label: 'Shop', href: '/products' }, { label: 'Delivery & pickup' }]} />
    <p className="sf-note">Times are shown in {store.timezone ? `${timezoneLabel(store.timezone)} (${store.timezone})` : 'the store’s local timezone'}. Availability can change. Delivery eligibility and fees are confirmed with your postal code at checkout.</p>
    <div className="grid items-start gap-5 lg:grid-cols-2">{(['delivery', 'pickup'] as const).map((mode) => {
      const windows = mode === 'delivery' ? availability.deliveryWindows : availability.pickupWindows;
      const days = byDay(windows).filter(([, entries]) => entries.some((window) => window.available));
      const Icon = mode === 'delivery' ? Truck : Store;
      return <section key={mode} aria-labelledby={`${mode}-times`} className="sf-panel overflow-hidden">
        <div className={`flex items-start gap-4 p-6 sm:p-7 ${mode === 'delivery' ? 'sf-dark' : 'bg-[var(--sf-paper-2)]'}`}>
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${mode === 'delivery' ? 'bg-[var(--sf-header-2)]' : 'bg-[var(--sf-card)] text-[var(--sf-sage)]'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 id={`${mode}-times`} className="sf-subtitle">{mode === 'delivery' ? 'Home delivery' : 'Store pickup'}</h2>
            <p className={`mt-1 text-sm leading-6 ${mode === 'delivery' ? 'text-[var(--sf-header-ink-muted)]' : 'text-[var(--sf-ink-muted)]'}`}>{mode === 'delivery' ? deliveryText : pickupText}</p>
          </div>
        </div>
        <div className="p-6 sm:p-7">
          {days.length ? <ul className="space-y-5">{days.map(([date, entries]) => <li key={date}>
            <p className="mb-2 text-sm font-semibold">{formatSlotDay(date, 'long')}</p>
            <ul className="flex flex-wrap gap-2">{entries.filter((window) => window.available).map((window) => <li key={window.id} className="rounded-[var(--sf-radius-sm)] border border-[var(--sf-rule)] px-3 py-2"><span className="block font-[family-name:var(--sf-font-display)] font-bold tracking-[-0.02em]">{formatSlotRange(window.startTime, window.endTime)}</span><span className="block text-xs text-[var(--sf-ink-faint)]">{window.fee ? `${formatMoney(window.fee)} slot fee` : 'No slot fee'}</span></li>)}</ul>
          </li>)}</ul> : <p className="sf-note">No {mode} times are currently available. Check the other option or <Link href="/support" className="font-semibold underline">contact the store</Link>.</p>}
          <MarketModeChoice mode={mode} className="mt-6 w-full sm:w-auto" />
        </div>
      </section>;
    })}</div>
    <p className="text-sm leading-6 text-[var(--sf-ink-muted)]">Already ordered? <Link href="/account/orders" className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">View your order</Link> for its confirmed details, or <Link href="/order-access" className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">find a guest order</Link>.</p>
  </UrbanContainer></UrbanPageShell>;
}
