import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import {
  PlatformDetails,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformMetricGrid,
  PlatformSearchParams,
  PlatformStatusBadge,
  PlatformSurface,
  PlatformToolbar,
  PlatformTruthNotice,
  humanize,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { TaskButton } from '@/features/platform/components/TaskButton';
import { platformProjections, type GroceryPlatformOrder } from '@/features/platform/lib/platformProjections';
import { advanceOrderTask, reconcileCheckoutTask } from '@/features/platform/lib/taskActions';
import { OrderAfterSalesActions } from '@/features/platform/orders/components/OrderAfterSalesActions';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatCents(value = 0, currencyCode = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(value / 100);
}

function metadata(order: GroceryPlatformOrder) {
  return (order.metadata || {}) as Record<string, unknown>;
}

export async function OrdersPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const parsedPage = Number.parseInt(queryValue(params, 'page') || '1', 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const q = queryValue(params, 'q').trim().toLowerCase();
  const filter = queryValue(params, 'filter') || 'active';
  const sort = queryValue(params, 'sort') || 'newest';

  let data: Awaited<ReturnType<typeof platformProjections.orders>> = null;
  let loadError: string | null = null;
  try {
    data = await platformProjections.orders(page, 50);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load orders.';
  }
  const storeCurrencyCode = data?.currencyCode || 'USD';
  if (data && page > data.totalPages) redirect(`/dashboard/platform/orders?page=${data.totalPages}`);

  const orders = [...(data?.orders || [])]
    .filter((order) => !q || String(order.displayId).includes(q) || order.email.toLowerCase().includes(q) || order.lineItems.some((item) => item.id.toLowerCase().includes(q)))
    .filter((order) => filter === 'all' || (filter === 'active' ? !['delivered', 'cancelled', 'canceled'].includes(order.status) : order.status === filter))
    .sort((a, b) => {
      if (sort === 'oldest') return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      if (sort === 'status') return a.status.localeCompare(b.status);
      if (sort === 'value') return b.payments.reduce((sum, payment) => sum + payment.amountCents, 0) - a.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Orders' },
  ];
  const sales = data?.salesSummary;
  const activeOrders = (data?.pending || 0) + (data?.picking || 0) + (data?.packed || 0) + (data?.outForDelivery || 0);
  const attentionCount = (data?.orders || []).filter((order) => order.payments.some((payment) => payment.status === 'failed' || payment.refunds.some((refund) => refund.reconciliationDeadLetterAt))).length;

  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Order queue</h1><p className="mt-1 text-sm text-muted-foreground">Move paid grocery orders through fulfillment, inspect immutable evidence, and handle bounded refunds or whole-order cancellation.</p></div>;

  return (
    <PageContainer title="Orders" header={header} breadcrumbs={breadcrumbs}>
      <div className="space-y-5 px-4 pb-8 md:px-6">
        <PlatformMetricGrid metrics={[
          { label: 'Active orders', value: activeOrders, note: `${data?.pending || 0} waiting · ${data?.picking || 0} picking` },
          { label: 'Packed', value: data?.packed || 0, note: `${data?.outForDelivery || 0} out for delivery` },
          { label: 'Net · 30 days', value: formatCents(sales?.thirtyDayNetCents, storeCurrencyCode), note: `${sales?.thirtyDayOrders || 0} orders in cohort` },
          { label: 'Needs payment attention', value: attentionCount, note: 'Failed payments or dead-letter refunds', tone: attentionCount ? 'critical' : 'default' },
        ]} />

        <PlatformTruthNotice title="After-sales boundary">
          Refunds operate against payment evidence. Cancellation is whole-order only and requires settled money to be fully refunded first. Item-level returns and line-level tax or coupon allocation are not implemented.
        </PlatformTruthNotice>

        <PlatformToolbar
          search={q}
          searchPlaceholder="Order number, customer email, or line ID"
          filter={filter}
          filterLabel="Queue"
          filterOptions={[
            { value: 'active', label: 'Active work' }, { value: 'all', label: 'All statuses' }, { value: 'pending', label: 'Pending' },
            { value: 'picking', label: 'Picking' }, { value: 'packed', label: 'Packed' }, { value: 'out_for_delivery', label: 'Out for delivery' },
            { value: 'delivered', label: 'Delivered' }, { value: 'cancelled', label: 'Cancelled' },
          ]}
          sort={sort}
          sortOptions={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'status', label: 'Status' }, { value: 'value', label: 'Highest payment value' }]}
          resultCount={orders.length}
        />

        {loadError ? <PlatformErrorState description={loadError} /> : (
          <PlatformSurface
            title="Orders"
            description={`Showing the current bounded page (${data?.pageSize || 50} maximum). Expand an order for line, payment, refund, and workflow evidence.`}
            action={<TaskButton label="Recover checkouts" pendingLabel="Scanning…" successLabel="Recovery scan complete" onRun={reconcileCheckoutTask} />}
          >
            {orders.length === 0 ? <PlatformEmptyState title={q || filter !== 'all' ? 'No matching orders' : 'No orders yet'} description={q || filter !== 'all' ? 'Change or reset the current-page filters.' : 'New completed checkouts will enter this queue.'} /> : (
              <div className="divide-y">
                {orders.map((order) => {
                  const orderMeta = metadata(order);
                  const fulfillmentMethod = orderMeta.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';
                  const paymentTotal = order.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
                  const flaggedLines = order.lineItems.filter((item) => {
                    const itemMeta = (item.metadata || {}) as Record<string, unknown>;
                    return ['contact', 'remove'].includes(String(itemMeta.substitutionPreference || ''));
                  }).length;
                  return (
                    <PlatformDetails
                      key={order.id}
                      className="bg-background open:bg-muted/10"
                      summary={
                        <div className="grid min-w-0 gap-3 px-4 py-4 hover:bg-muted/30 md:px-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)_auto] lg:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">#{order.displayId}</span><PlatformStatusBadge status={order.status} /><span className="text-xs capitalize text-muted-foreground">{fulfillmentMethod}</span></div>
                            <p className="mt-1 truncate text-sm text-muted-foreground">{order.email}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4 lg:grid-cols-2">
                            <span><strong className="block text-sm font-medium text-foreground">{order.lineItems.length}</strong>lines</span>
                            <span><strong className="block text-sm font-medium text-foreground">{formatCents(paymentTotal)}</strong>payment evidence</span>
                            <span><strong className="block text-sm font-medium text-foreground">{flaggedLines}</strong>substitution flags</span>
                            <span><strong className="block text-sm font-medium text-foreground">{humanize(order.deliveryTimeWindow)}</strong>window</span>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground group-open:hidden">Expand details</span>
                        </div>
                      }
                    >
                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,.7fr)]">
                        <div className="space-y-4">
                          <div className="grid gap-3 text-sm sm:grid-cols-3">
                            <div><p className="text-xs text-muted-foreground">Placed</p><p className="mt-1 font-medium">{formatDate(order.createdAt)}</p></div>
                            <div><p className="text-xs text-muted-foreground">Scheduled</p><p className="mt-1 font-medium">{formatDate(order.deliveryDate)}</p></div>
                            <div><p className="text-xs text-muted-foreground">Preference</p><p className="mt-1 font-medium">{humanize(order.substitutionPreference)}</p></div>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold">Grocery lines</h3>
                            <div className="mt-2 overflow-x-auto rounded-lg border">
                              <table className="w-full min-w-[38rem] text-left text-sm">
                                <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Product snapshot</th><th className="px-3 py-2 font-medium">SKU</th><th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Unit</th><th className="px-3 py-2 font-medium">Substitution</th></tr></thead>
                                <tbody className="divide-y">{order.lineItems.map((item) => { const itemMeta = (item.metadata || {}) as Record<string, unknown>; return <tr key={item.id}><td className="px-3 py-2 font-medium">{item.title || `Line …${item.id.slice(-8)}`}</td><td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.sku || '—'}</td><td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td><td className="px-3 py-2 text-right tabular-nums">{formatCents(item.unitPriceCents, order.currencyCode)}</td><td className="px-3 py-2 capitalize text-muted-foreground">{humanize(String(itemMeta.substitutionPreference || 'none'))}</td></tr>; })}</tbody>
                              </table>
                            </div>
                          </div>
                          <div className="rounded-lg border bg-background p-3">
                            <h3 className="text-sm font-semibold">Order totals</h3>
                            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-5"><div><dt className="text-xs text-muted-foreground">Subtotal</dt><dd className="font-medium tabular-nums">{formatCents(order.subtotalCents, order.currencyCode)}</dd></div><div><dt className="text-xs text-muted-foreground">Discount</dt><dd className="font-medium tabular-nums">−{formatCents(order.discountCents, order.currencyCode)}</dd></div><div><dt className="text-xs text-muted-foreground">Tax</dt><dd className="font-medium tabular-nums">{formatCents(order.taxCents, order.currencyCode)}</dd></div><div><dt className="text-xs text-muted-foreground">Delivery fee</dt><dd className="font-medium tabular-nums">{formatCents(order.deliveryFeeCents, order.currencyCode)}</dd></div><div><dt className="text-xs text-muted-foreground">Total</dt><dd className="font-semibold tabular-nums">{formatCents(order.totalCents, order.currencyCode)}</dd></div></dl>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {order.status === 'pending' ? <TaskButton variant="primary" label="Start picking" onRun={advanceOrderTask.bind(null, order.id, 'picking')} /> : null}
                            {order.status === 'picking' ? <TaskButton variant="primary" label="Mark packed" onRun={advanceOrderTask.bind(null, order.id, 'packed')} /> : null}
                            {order.status === 'packed' && fulfillmentMethod === 'pickup' && !orderMeta.readyForPickup ? <TaskButton variant="primary" label="Mark ready for pickup" onRun={advanceOrderTask.bind(null, order.id, 'ready_for_pickup')} /> : null}
                            {order.status === 'packed' && fulfillmentMethod === 'delivery' ? <Link className="inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/dashboard/platform/delivery">Assign in Delivery</Link> : null}
                            <Link className="inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/orders/${order.id}`}>Open diagnostic model</Link>
                          </div>
                        </div>
                        <OrderAfterSalesActions orderId={order.id} orderStatus={order.status} payments={order.payments || []} currencyCode={order.currencyCode} />
                      </div>
                    </PlatformDetails>
                  );
                })}
              </div>
            )}
            {(data?.totalPages || 1) > 1 ? (
              <nav aria-label="Order pages" className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between md:px-5">
                <Link aria-disabled={page <= 1} className={page <= 1 ? 'pointer-events-none opacity-40' : 'font-medium'} href={page <= 2 ? '/dashboard/platform/orders' : `/dashboard/platform/orders?page=${page - 1}`}>Previous page</Link>
                <span className="text-center text-muted-foreground">Page {data?.page || page} of {data?.totalPages || 1} · {data?.totalOrders || 0} total</span>
                <Link aria-disabled={page >= (data?.totalPages || 1)} className={page >= (data?.totalPages || 1) ? 'pointer-events-none opacity-40' : 'font-medium'} href={`/dashboard/platform/orders?page=${page + 1}`}>Next page</Link>
              </nav>
            ) : null}
          </PlatformSurface>
        )}
      </div>
    </PageContainer>
  );
}

export default OrdersPage;
