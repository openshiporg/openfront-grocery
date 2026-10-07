import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '../lib/data/user';
import { getOrderHistory } from '../lib/data/orders';
import { storefrontMetadata } from '../lib/metadata';
import { NotificationChoices } from '../modules/notifications/NotificationChoices';
import MarketAccountNav from '../modules/market/MarketAccountNav';
import { ReorderButton } from '../modules/account/ReorderButton';
import { ProfileForm } from '../modules/account/ProfileForm';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanPageShell, formatCents, statusLabel } from '../modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({ title: 'Your account', description: 'Find your grocery orders, shop your favorites again, and manage your details.' });
}

type Props = { searchParams?: Promise<{ page?: string }> };

export async function AccountPage({ searchParams }: Props) {
  return <AccountContent searchParams={searchParams} section="overview" />;
}
export async function OrderHistoryPage({ searchParams }: Props) {
  return <AccountContent searchParams={searchParams} section="orders" />;
}
export async function ProfilePage() {
  return <AccountContent section="profile" />;
}

async function AccountContent({ searchParams, section }: Props & { section: 'overview' | 'orders' | 'profile' }) {
  const user = await getUser();
  const path = section === 'overview' ? '/account' : `/account/${section}`;
  if (!user) return <UrbanPageShell><UrbanContainer className="space-y-6 py-10"><header><p className="sf-eyebrow">Your neighborhood shop</p><h1 className="sf-title mt-2">{section === 'orders' ? 'Your orders' : section === 'profile' ? 'Profile & preferences' : 'Your account'}</h1></header><UrbanEmptyState title="Your next grocery run starts here" actionHref={`/dashboard/signin?from=${encodeURIComponent(path)}`} actionLabel="Sign in to your account">See past orders, shop them again, and keep your details up to date. Ordered as a guest? <Link href="/order-access" className="underline">Find your order with an access link.</Link></UrbanEmptyState></UrbanContainer></UrbanPageShell>;
  const params = await searchParams;
  const history = section !== 'profile' ? await getOrderHistory(section === 'orders' ? Number(params?.page) : 1, section === 'overview' ? 3 : 10) : null;
  const pages = history ? Math.max(1, Math.ceil(history.total / history.pageSize)) : 1;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return <UrbanPageShell><UrbanContainer className="sf-account-page space-y-7 py-8 sm:py-10">
    <header className="border-b border-[var(--sf-rule)] pb-6"><p className="sf-eyebrow">Your neighborhood shop</p><h1 className="sf-title mt-2">{section === 'orders' ? 'Your orders' : section === 'profile' ? 'Profile & preferences' : `Good to see you${user.firstName ? `, ${user.firstName}` : ''}.`}</h1><p className="sf-copy mt-3">{section === 'orders' ? 'Every grocery run, all in one place. Open an order for its receipt and latest progress.' : section === 'profile' ? 'The details and updates that make shopping yours.' : 'Pick up where you left off, or plan your next basket.'}</p></header>
    <MarketAccountNav active={section} />
    {section === 'profile' ? <div className="grid items-start gap-6 lg:grid-cols-2"><ProfileForm name={name} email={user.email} /><NotificationChoices /></div> : <>
      {section === 'overview' ? <div className="grid gap-5 md:grid-cols-2"><section className="sf-panel p-5 sm:p-7"><p className="sf-eyebrow">The next shop</p><h2 className="mt-2 font-[family-name:var(--sf-font-display)] text-2xl font-semibold">Make room for your favorites.</h2><p className="sf-copy my-3">Build a list for the week, or add the familiar essentials from a past order.</p><UrbanButtonLink href="/lists" variant="ghost">Open shopping lists</UrbanButtonLink></section><section className="sf-panel p-5 sm:p-7"><p className="sf-eyebrow">At your service</p><h2 className="mt-2 font-[family-name:var(--sf-font-display)] text-2xl font-semibold">A little help with your order.</h2><p className="sf-copy my-3">Find an order, review what was picked, or get in touch with the shop.</p><UrbanButtonLink href="/support" variant="ghost">Contact the shop</UrbanButtonLink></section></div> : null}
      <section aria-labelledby="account-orders-title"><div className="mb-2 flex flex-wrap items-center justify-between gap-3"><h2 id="account-orders-title" className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">{section === 'overview' ? 'Recent grocery runs' : 'Order history'}</h2>{section === 'overview' ? <Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href="/account/orders">View all orders</Link> : history && !history.error ? <p className="sf-copy">{history.total} order{history.total === 1 ? '' : 's'}</p> : null}</div>
        {history?.error ? <div className="sf-panel space-y-3 p-5" role="alert"><p>We couldn’t load your orders. {history.error}</p><UrbanButtonLink href={path} variant="ghost">Try again</UrbanButtonLink></div> : !history?.orders.length ? <UrbanEmptyState title={history?.page && history.page > 1 ? 'No orders on this page' : 'Your first grocery run awaits'} actionHref={history?.page && history.page > 1 ? '/account/orders' : '/products'} actionLabel={history?.page && history.page > 1 ? 'Back to first page' : 'Explore the shop'}>Your placed orders will appear here, with fulfillment details and a receipt.</UrbanEmptyState> : <div className="divide-y divide-[var(--sf-rule)] border-y border-[var(--sf-rule)]">{history.orders.map(order => <article key={order.id} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div><div className="flex flex-wrap items-center gap-3"><h3 className="font-[family-name:var(--sf-font-display)] text-xl font-semibold"><Link className="underline-offset-4 hover:underline" href={`/order/${order.id}`}>Order #{order.orderNumber}</Link></h3><UrbanBadge tone={order.status === 'cancelled' || order.status.includes('failed') ? 'danger' : 'primary'}>{order.fulfillmentMethod === 'pickup' && order.status === 'delivered' ? 'Picked up' : statusLabel(order.status)}</UrbanBadge></div><p className="sf-copy mt-2">{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {order.items.length} product{order.items.length === 1 ? '' : 's'} · {order.fulfillmentMethod === 'pickup' ? 'Pickup' : 'Delivery'}</p><Link href={`/order/${order.id}`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-[var(--sf-accent)] underline underline-offset-4">View order & receipt</Link></div>
          <div className="space-y-3 sm:text-right"><p className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">{formatCents(order.total)}<span className="ml-2 font-sans text-xs font-normal text-[var(--sf-ink-muted)]">{order.receiptStage === 'final' ? 'Final total' : order.receiptStage === 'proposed' ? 'Proposed total' : 'Order estimate'}</span></p><ReorderButton orderId={order.id} /></div>
        </article>)}</div>}
        {section === 'orders' && history && !history.error && pages > 1 ? <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Order history pages">{history.page > 1 ? <UrbanButtonLink href={`/account/orders?page=${history.page - 1}`} variant="ghost">Previous</UrbanButtonLink> : <span />}<p className="text-sm">Page {history.page} of {pages}</p>{history.page < pages ? <UrbanButtonLink href={`/account/orders?page=${history.page + 1}`} variant="ghost">Next</UrbanButtonLink> : null}</nav> : null}
      </section>
    </>}
  </UrbanContainer></UrbanPageShell>;
}
