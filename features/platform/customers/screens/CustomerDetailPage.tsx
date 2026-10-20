import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { PlatformErrorState, PlatformFacts, PlatformPage, PlatformStatusBadge, PlatformSurface, platformButton } from '@/features/platform/components/PlatformPrimitives';
import { formatDate, formatMoney } from '@/features/platform/lib/format';
import { keystoneClient } from '@/features/platform/lib/platformClient';

type CustomerDetail = {
  id: string; name: string; email: string; createdAt: string | null; privacyErasedAt: string | null;
  orderCount: number; shoppingListCount: number; addressCount: number;
  recentOrders: Array<{ id: string; displayId: number; status: string; totalCents: number; currencyCode: string; createdAt: string | null }>;
};

/** One shopper's account and recent orders, for staff who manage customers in this store. */
export async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await keystoneClient<{ groceryPlatformCustomer: CustomerDetail | null }>(
    'query($id:ID!){groceryPlatformCustomer(id:$id){id name email createdAt privacyErasedAt orderCount shoppingListCount addressCount recentOrders{id displayId status totalCents currencyCode createdAt}}}',
    { id }, { cache: 'no-store' },
  );
  if (!response.success) return <PlatformPage title="Customer" breadcrumb="Customer"><PlatformErrorState description={response.error || 'This customer could not be loaded.'} retryHref={`/dashboard/platform/customers/${encodeURIComponent(id)}`} /></PlatformPage>;
  const customer = response.data?.groceryPlatformCustomer;
  if (!customer) notFound();
  return <PlatformPage title={customer.name || customer.email} breadcrumb="Customer" description={customer.email}
    actions={<Link href={`/dashboard/platform/orders?q=${encodeURIComponent(customer.email)}&filter=all`} className={platformButton('secondary', 'md')}><ClipboardList aria-hidden="true" />All orders</Link>}>
    <PlatformSurface title="Account">
      <div className="p-4 md:p-5">
        <PlatformFacts columns={4} items={[
          { label: 'Joined', value: customer.createdAt ? formatDate(customer.createdAt) : 'Not recorded' },
          { label: 'Orders', value: customer.orderCount },
          { label: 'Shopping lists', value: customer.shoppingListCount },
          { label: 'Saved addresses', value: customer.addressCount },
          ...(customer.privacyErasedAt ? [{ label: 'Privacy', value: `Erased ${formatDate(customer.privacyErasedAt)}`, wide: true }] : []),
        ]} />
      </div>
    </PlatformSurface>
    <PlatformSurface title="Recent orders" description={customer.orderCount > customer.recentOrders.length ? `The latest ${customer.recentOrders.length} of ${customer.orderCount}.` : undefined}>
      {customer.recentOrders.length ? <ul className="divide-y">{customer.recentOrders.map((order) => <li key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm md:px-5">
        <Link href={`/dashboard/platform/orders?order=${encodeURIComponent(order.id)}&filter=all`} className="font-semibold underline-offset-4 hover:underline">#{order.displayId}</Link>
        <PlatformStatusBadge status={order.status} />
        <span className="ml-auto tabular-nums">{formatMoney(order.totalCents, order.currencyCode)}</span>
        <span className="text-xs text-muted-foreground">{order.createdAt ? formatDate(order.createdAt) : ''}</span>
      </li>)}</ul> : <p className="px-4 py-6 text-sm text-muted-foreground md:px-5">No orders yet.</p>}
    </PlatformSurface>
  </PlatformPage>;
}

export default CustomerDetailPage;
