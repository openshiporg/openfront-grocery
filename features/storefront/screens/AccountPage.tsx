import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Heart, ListChecks, LogOut, Package, Repeat, Store, Truck } from 'lucide-react';
import { signOutShopper } from '@/features/storefront/modules/account/auth/actions';
import { ShopperAuthShell } from '../modules/account/auth/ShopperAuthShell';
import { ShopperPasswordForm, ShopperSignInForm } from '../modules/account/auth/ShopperAuthForms';
import { signInDescription } from './ShopperSignInPage';
import { getUser } from '../lib/data/user';
import { getOrderHistory } from '../lib/data/orders';
import { storefrontMetadata } from '../lib/metadata';
import type { GroceryOrder } from '../types';
import { NotificationChoices } from '../modules/notifications/NotificationChoices';
import MarketAccountNav from '../modules/market/MarketAccountNav';
import { ReorderButton } from '../modules/account/ReorderButton';
import { ProfileForm } from '../modules/account/ProfileForm';
import { AddressBook } from '../modules/account/AddressBook';
import { getSavedAddresses } from '../lib/data/addresses';
import { UrbanBadge, UrbanButton, UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanPageShell, UrbanPager, formatCents, statusLabel } from '../modules/urban/UrbanPrimitives';

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
export async function AddressesPage() {
  return <AccountContent section="addresses" />;
}

function OrderRow({ order }: { order: GroceryOrder }) {
  const pickup = order.fulfillmentMethod === 'pickup';
  const Icon = pickup ? Store : Truck;
  const exception = order.status === 'cancelled' || order.status.includes('failed') || order.status.includes('refused');
  return <li className="sf-panel grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
    <div className="flex min-w-0 gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--sf-paper-2)] text-[var(--sf-sage)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold tracking-[-0.02em]"><Link className="hover:underline hover:underline-offset-4" href={`/order/${order.id}`}>Order #{order.orderNumber}</Link></h3>
          <UrbanBadge tone={exception ? 'danger' : order.status === 'delivered' ? 'muted' : 'primary'}>{pickup && order.status === 'delivered' ? 'Picked up' : statusLabel(order.status)}</UrbanBadge>
        </div>
        <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {order.items.length} product{order.items.length === 1 ? '' : 's'} · {pickup ? 'Pickup' : 'Delivery'}</p>
        <Link href={`/order/${order.id}`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-semibold underline decoration-[var(--sf-rule-strong)] decoration-2 underline-offset-4 hover:decoration-[var(--sf-ink)]">View order & receipt</Link>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sf-rule)] pt-4 sm:block sm:space-y-2 sm:border-0 sm:pt-0 sm:text-right">
      <p><span className="block font-[family-name:var(--sf-font-display)] text-2xl font-bold tabular-nums tracking-[-0.03em]">{formatCents(order.total, order.currencyCode)}</span><span className="text-xs text-[var(--sf-ink-faint)]">{order.receiptStage === 'final' ? 'Final total' : order.receiptStage === 'proposed' ? 'Proposed total' : 'Order estimate'}</span></p>
      <ReorderButton orderId={order.id} />
    </div>
  </li>;
}

async function AccountContent({ searchParams, section }: Props & { section: 'overview' | 'orders' | 'profile' | 'addresses' }) {
  const user = await getUser();
  const path = section === 'overview' ? '/account' : `/account/${section}`;
  const heading = section === 'orders' ? 'Your orders' : section === 'profile' ? 'Profile & preferences' : section === 'addresses' ? 'Saved addresses' : 'Your account';
  // Signed out, the account pages are the storefront sign-in (E-commerce account @login pattern).
  if (!user) return <ShopperAuthShell active="sign-in" from={path} title={section === 'overview' ? 'Sign in to your account' : heading} description={signInDescription(path)}>
    <ShopperSignInForm from={path} />
  </ShopperAuthShell>;
  const params = await searchParams;
  const savedAddresses = section === 'addresses' ? await getSavedAddresses() : null;
  const history = section === 'overview' || section === 'orders' ? await getOrderHistory(section === 'orders' ? Number(params?.page) : 1, section === 'overview' ? 3 : 10) : null;
  const pages = history ? Math.max(1, Math.ceil(history.total / history.pageSize)) : 1;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return <UrbanPageShell><UrbanContainer className="sf-account-page space-y-7 py-8 sm:py-10">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="sf-title">{section === 'overview' ? `Good to see you${user.firstName ? `, ${user.firstName}` : ''}.` : heading}</h1>
        <p className="sf-copy mt-2">{section === 'orders' ? 'Every grocery run, all in one place. Open an order for its receipt and latest progress.' : section === 'profile' ? 'The details and updates that make shopping yours.' : section === 'addresses' ? 'Delivery addresses you can pick at checkout.' : user.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {section === 'overview' ? <UrbanButtonLink href="/products" variant="dark">Start a new basket <ArrowRight className="h-4 w-4" aria-hidden="true" /></UrbanButtonLink> : null}
        <form action={signOutShopper}><UrbanButton type="submit" variant="ghost"><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</UrbanButton></form>
      </div>
    </header>
    <MarketAccountNav active={section} />
    {section === 'addresses' && savedAddresses ? <AddressBook initialAddresses={savedAddresses.addresses} loadError={savedAddresses.error} /> : section === 'profile' ? <div className="grid items-start gap-5 lg:grid-cols-2"><div className="space-y-5"><ProfileForm name={name} email={user.email} /><ShopperPasswordForm /></div><NotificationChoices /></div> : <>
      {section === 'overview' ? (
        <nav aria-label="Account shortcuts" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { href: '/account/orders', Icon: Package, title: 'Orders', text: history && !history.error ? `${history.total} placed` : 'Receipts & progress' },
            { href: '/lists', Icon: ListChecks, title: 'Shopping lists', text: 'Your reusable runs' },
            { href: '/favorites', Icon: Heart, title: 'Favorites', text: 'Saved products' },
            { href: '/subscriptions', Icon: Repeat, title: 'Recurring & rewards', text: 'Schedules & points' },
          ].map(({ href, Icon, title, text }) => (
            <Link prefetch={false} key={href} href={href} className="group flex flex-col gap-6 rounded-[var(--sf-radius-lg)] bg-[var(--sf-paper-2)] p-4 transition-colors hover:bg-[var(--sf-paper-3)] sm:p-5">
              <Icon className="h-5 w-5 text-[var(--sf-sage)]" aria-hidden="true" />
              <span><span className="block font-semibold">{title}</span><span className="text-sm text-[var(--sf-ink-muted)]">{text}</span></span>
            </Link>
          ))}
        </nav>
      ) : null}
      <section aria-labelledby="account-orders-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="account-orders-title" className="sf-subtitle">{section === 'overview' ? 'Recent grocery runs' : 'Order history'}</h2>
          {section === 'overview' ? <Link className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold underline decoration-[var(--sf-rule-strong)] decoration-2 underline-offset-[6px]" href="/account/orders">All orders <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link> : history && !history.error ? <p className="text-sm text-[var(--sf-ink-muted)]">{history.total} order{history.total === 1 ? '' : 's'}</p> : null}
        </div>
        {history?.error ? <div className="sf-panel space-y-3 p-5" role="alert"><p>We couldn’t load your orders. {history.error}</p><UrbanButtonLink href={path} variant="ghost">Try again</UrbanButtonLink></div> : !history?.orders.length ? <UrbanEmptyState icon={Package} title={history?.page && history.page > 1 ? 'No orders on this page' : 'Your first grocery run awaits'} actionHref={history?.page && history.page > 1 ? '/account/orders' : '/products'} actionLabel={history?.page && history.page > 1 ? 'Back to first page' : 'Explore the shop'}>Your placed orders will appear here, with fulfillment details and a receipt.</UrbanEmptyState> : <ul className="grid gap-3">{history.orders.map((order) => <OrderRow key={order.id} order={order} />)}</ul>}
        {section === 'orders' && history && !history.error && pages > 1 ? <UrbanPager label="Order history pages" page={history.page} totalPages={pages} previousHref={`/account/orders?page=${history.page - 1}`} nextHref={`/account/orders?page=${history.page + 1}`} /> : null}
      </section>
    </>}
  </UrbanContainer></UrbanPageShell>;
}
