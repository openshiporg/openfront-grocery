import Link from 'next/link';
import { getStore } from '../lib/data/store';
import { getCheckoutFulfillmentWindows } from '../lib/data/delivery';
import { MarketModeChoice } from '../modules/market/MarketMode';
import { UrbanBadge, UrbanContainer, UrbanPageHeader, UrbanPageShell, formatMoney } from '../modules/urban/UrbanPrimitives';
export const metadata = { title: 'Delivery & pickup', description: 'Explore delivery and pickup availability.' };
export default async function FulfillmentPage() {
  const [store, availability] = await Promise.all([getStore(), getCheckoutFulfillmentWindows()]);
  return <UrbanPageShell><UrbanContainer className="space-y-6 py-8"><UrbanPageHeader title="Groceries, on your schedule." description="Explore the next available times, then choose your exact slot at checkout." breadcrumb={[{ label: 'Shop', href: '/products' }, { label: 'Delivery & pickup' }]} />
    <p className="sf-note">Times are shown in {store.timezone || 'the store’s local timezone'}. Availability can change; viewing a time does not reserve it. Delivery eligibility and fees are confirmed with your postal code at checkout.</p>
    <div className="grid items-start gap-5 md:grid-cols-2">{(['delivery', 'pickup'] as const).map((mode) => { const windows = mode === 'delivery' ? availability.deliveryWindows : availability.pickupWindows; return <section key={mode} className="sf-panel p-5 sm:p-6"><UrbanBadge tone={mode === 'delivery' ? 'blue' : 'primary'}>{mode === 'delivery' ? 'To your door' : 'At the store'}</UrbanBadge><h2 className="mt-3 font-[family-name:var(--sf-font-display)] text-3xl font-semibold">{mode === 'delivery' ? 'Home delivery' : 'Store pickup'}</h2><p className="mt-3 text-sm leading-6 text-[var(--sf-ink-muted)]">{mode === 'delivery' ? 'Choose a delivery window and share any access instructions when you check out.' : store.address || 'Contact the store to confirm the pickup location.'}</p>
      <ul className="my-5 divide-y divide-[var(--sf-rule)]">{windows.filter((window) => window.available).slice(0, 8).map((window) => <li key={window.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm"><span><span className="block font-medium">{new Date(`${window.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="mt-1 block text-xs">{window.startTime}–{window.endTime}</span></span><span className="text-xs text-[var(--sf-ink-muted)]">{window.fee ? `${formatMoney(window.fee)} slot fee` : 'No slot fee'}</span></li>)}</ul>
      {!windows.some((window) => window.available) ? <p className="sf-note mb-4">No {mode} times are currently available. Check the other option or <Link href="/support" className="underline">contact the store</Link>.</p> : null}<MarketModeChoice mode={mode} />
    </section>; })}</div><p className="text-sm leading-6 text-[var(--sf-ink-muted)]">Already ordered? <Link href="/account/orders" className="underline">View your order</Link> for its confirmed details, or <Link href="/order-access" className="underline">find a guest order</Link>.</p>
  </UrbanContainer></UrbanPageShell>;
}
