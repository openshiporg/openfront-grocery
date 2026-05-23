import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import Link from 'next/link';

const ORDERS_QUERY = gql`
  query GroceryPlatformOrders {
    orders(orderBy: { createdAt: desc }, take: 25) {
      id
      displayId
      email
      status
      deliveryDate
      deliveryTimeWindow
      createdAt
      lineItems {
        id
        quantity
        metadata
      }
    }
    pending: ordersCount(where: { status: { equals: pending } })
    picking: ordersCount(where: { status: { equals: picking } })
    packed: ordersCount(where: { status: { equals: packed } })
    outForDelivery: ordersCount(where: { status: { equals: out_for_delivery } })
    delivered: ordersCount(where: { status: { equals: delivered } })
  }
`;

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export async function OrdersPage() {
  const response = await keystoneClient<any>(ORDERS_QUERY);
  const data = response.success ? response.data : null;
  const orders = data?.orders || [];

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Orders' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Grocery Orders</h1>
      <p className="text-sm text-muted-foreground">
        Workflow-first visibility into incoming grocery orders, fulfillment state, and delivery timing.
      </p>
    </div>
  );

  const metrics = [
    { label: 'Pending', value: data?.pending ?? 0 },
    { label: 'Picking', value: data?.picking ?? 0 },
    { label: 'Packed', value: data?.packed ?? 0 },
    { label: 'Out for Delivery', value: data?.outForDelivery ?? 0 },
    { label: 'Delivered', value: data?.delivered ?? 0 },
  ];

  return (
    <PageContainer title="Orders" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border bg-background p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Recent order queue</h2>
            <p className="text-sm text-muted-foreground">Use this as the high-signal starting point for picking, packing, and dispatch.</p>
          </div>

          {orders.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No grocery orders found yet.</div>
          ) : (
            <div className="divide-y">
              {orders.map((order: any) => (
                <div key={order.id} className="px-4 py-4 md:px-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Order #{order.displayId}</span>
                      <span className="rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {String(order.status).replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{order.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Delivery window: {order.deliveryTimeWindow || '—'} · Scheduled: {formatDate(order.deliveryDate)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{order.lineItems?.length || 0} line items</span>
                    <span className="text-muted-foreground">
                      {(order.lineItems || []).filter((item: any) => item.metadata?.substitutionPreference === 'contact' || item.metadata?.substitutionPreference === 'remove').length} flagged for substitution care
                    </span>
                    <span className="text-muted-foreground">Created {formatDate(order.createdAt)}</span>
                    <Link
                      href={`/dashboard/order/${order.id}`}
                      className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                    >
                      Open model
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

export default OrdersPage;
