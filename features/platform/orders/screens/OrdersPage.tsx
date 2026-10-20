import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, ExternalLink, Flag, ScanSearch, ShoppingBasket, Truck } from 'lucide-react';
import {
  PlatformChip,
  PlatformDetails,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformFacts,
  PlatformList,
  PlatformListHeader,
  PlatformMetricGrid,
  PlatformPage,
  PlatformSearchParams,
  PlatformStatusBadge,
  PlatformSubsection,
  PlatformSurface,
  PlatformTabs,
  PlatformToolbar,
  PlatformWorkflowNav,
  humanize,
  platformButton,
  platformHref,
  platformTable,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { PlatformPager } from '@/features/platform/components/PlatformPageLinks';
import { TaskButton } from '@/features/platform/components/TaskButton';
import { formatDateTime, formatFulfillmentPromise, formatMoney, formatRelative } from '@/features/platform/lib/format';
import { platformProjections, type GroceryPlatformOrder } from '@/features/platform/lib/platformProjections';
import { advanceOrderTask, reconcileCheckoutTask } from '@/features/platform/lib/taskActions';
import { OrderAfterSalesActions } from '@/features/platform/orders/components/OrderAfterSalesActions';
import { orderFinancialDisplay } from '@/features/platform/orders/lib/orderFinancials';
import { orderPageHref } from '@/features/platform/orders/lib/orderPagination';

const PATH = '/dashboard/platform/orders';
const SUBSTITUTION_LABELS: Record<string, string> = { best_match: 'Allow a suitable substitute', call_me: 'Contact customer first', refund: 'Leave out and refund' };

function metadata(order: GroceryPlatformOrder) {
  return (order.metadata || {}) as Record<string, unknown>;
}

function needsPaymentAttention(order: GroceryPlatformOrder) {
  return order.payments.some((payment) => payment.status === 'failed' || payment.refunds.some((refund) => refund.reconciliationDeadLetterAt));
}

function substitutionFlags(order: GroceryPlatformOrder) {
  return order.lineItems.filter((item) => ['contact', 'remove'].includes(String(((item.metadata || {}) as Record<string, unknown>).substitutionPreference || ''))).length;
}

const rowGrid = 'md:grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_4.5rem_7.5rem_7rem] md:items-center md:gap-3';

export async function OrdersPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const parsedPage = Number.parseInt(queryValue(params, 'page') || '1', 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const q = queryValue(params, 'q').trim();
  const orderId = queryValue(params, 'order').trim();
  const filter = queryValue(params, 'filter') || (orderId ? 'all' : 'active');
  const sort = queryValue(params, 'sort') || 'newest';

  // Search, tab and sort are applied by the server before paging, so every
  // matching order is reachable and counts describe the same set.
  let data: Awaited<ReturnType<typeof platformProjections.orders>> = null;
  let loadError: string | null = null;
  try {
    data = await platformProjections.orders(page, 50, { search: q, view: filter, sort, orderId });
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load orders.';
  }
  const storeCurrencyCode = data?.currencyCode || 'USD';
  if (data && page > data.totalPages) redirect(orderPageHref(data.totalPages, params));

  const orders = data?.orders || [];
  const sales = data?.salesSummary;
  const viewCounts = data?.viewCounts || {};
  const totalPages = data?.totalPages || 1;

  return (
    <PlatformPage
      title="Orders"
      description="Manage grocery orders."
      actions={<>
        <PlatformWorkflowNav current="orders" />
        <TaskButton label="Recover checkouts" pendingLabel="Scanning…" successLabel="Recovery scan complete" onRun={reconcileCheckoutTask} icon={<ScanSearch aria-hidden="true" />} />
      </>}
    >
      {loadError || !data ? <PlatformErrorState description={loadError || 'Orders are unavailable.'} retryHref={PATH} /> : <>
      <PlatformMetricGrid metrics={[
        { label: 'Active orders', value: viewCounts.active ?? 0, note: `${data.pending} waiting · ${data.picking} picking`, href: platformHref(PATH, params, { filter: 'active' }) },
        { label: 'Packed', value: data.packed, note: `${data.outForDelivery} out for delivery`, href: platformHref(PATH, params, { filter: 'packed' }) },
        { label: 'Estimate less refunds · 30d', value: formatMoney(sales?.thirtyDayNetCents, storeCurrencyCode), note: `${sales?.thirtyDayOrders || 0} orders · avg basket ${formatMoney(sales?.averageBasketCents, storeCurrencyCode)}` },
        { label: 'Needs payment attention', value: viewCounts.attention ?? 0, note: 'Failed payments or refunds needing review', tone: viewCounts.attention ? 'critical' : 'default', href: platformHref(PATH, params, { filter: 'attention' }) },
      ]} />

      {(
        <PlatformSurface
          title="Order queue"
          description="Expand a row for lines, totals and actions."
          tabs={<PlatformTabs path={PATH} params={params} active={filter} label="Order status" tabs={[
            { value: 'active', label: 'Active', count: viewCounts.active },
            { value: 'pending', label: 'Pending', count: viewCounts.pending },
            { value: 'picking', label: 'Picking', count: viewCounts.picking },
            { value: 'packed', label: 'Packed', count: viewCounts.packed },
            { value: 'out_for_delivery', label: 'Out for delivery', count: viewCounts.out_for_delivery },
            { value: 'exceptions', label: 'Delivery exceptions', count: viewCounts.exceptions, tone: 'attention' },
            { value: 'delivered', label: 'Delivered', count: viewCounts.delivered },
            { value: 'cancelled', label: 'Cancelled', count: viewCounts.cancelled },
            { value: 'attention', label: 'Payment attention', count: viewCounts.attention, tone: 'attention' },
            { value: 'all', label: 'All', count: viewCounts.all },
          ]} />}
        >
          <PlatformToolbar
            path={PATH}
            search={q}
            searchPlaceholder="Order number, email, product or SKU"
            preserve={{ filter }}
            sort={sort}
            sortOptions={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'status', label: 'Status' }, { value: 'value', label: 'Highest total' }]}
            resultCount={data.totalOrders}
            resultLabel="matching orders"
          />

          {orders.length === 0 ? (
            <PlatformEmptyState
              icon={ClipboardList}
              title={q || filter !== 'all' ? 'No matching orders' : 'No orders yet'}
              description={q || filter !== 'all' ? 'No orders match this tab and search. Try All or clear the search.' : 'Completed checkouts will enter this queue.'}
              action={q || filter !== 'all' ? <Link href={platformHref(PATH, {}, { filter: 'all' })} className={platformButton('secondary', 'sm')}>Show all orders</Link> : undefined}
            />
          ) : (
            <>
              <PlatformListHeader className={rowGrid}>
                <span>Order</span><span>Customer · window</span><span className="text-right">Lines</span><span className="text-right">Total</span><span className="text-right">Placed</span>
              </PlatformListHeader>
              <PlatformList>
                {orders.map((order) => <OrderRow key={order.id} order={order} timeZone={data?.timezone} canRefund={Boolean(data?.actorCanRefund)} />)}
              </PlatformList>
            </>
          )}

          <PlatformPager
            page={data?.page || page}
            totalPages={totalPages}
            hrefFor={(target) => orderPageHref(target, params)}
            label="Order pages"
            summary={<>Page {data.page || page} of {totalPages} · {data.totalOrders} matching orders</>}
          />
        </PlatformSurface>
      )}
      </>}
    </PlatformPage>
  );
}

function OrderRow({ order, timeZone, canRefund }: { order: GroceryPlatformOrder; timeZone?: string; canRefund: boolean }) {
  const orderMeta = metadata(order);
  const financial = orderFinancialDisplay(order);
  const fulfillmentMethod = orderMeta.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';
  const paymentTotal = order.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const flaggedLines = substitutionFlags(order);
  const attention = needsPaymentAttention(order);
  const MethodIcon = fulfillmentMethod === 'pickup' ? ShoppingBasket : Truck;

  return (
    <PlatformDetails
      summary={
        <div className={`grid gap-1.5 ${rowGrid}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold tabular-nums">#{order.displayId}</span>
            <PlatformStatusBadge status={order.status} />
            <PlatformChip icon={MethodIcon} className="capitalize">{fulfillmentMethod}</PlatformChip>
            {attention ? <PlatformChip icon={Flag} className="border-destructive/30 text-destructive">Payment</PlatformChip> : null}
          </div>
          <div className="min-w-0 text-sm">
            <p className="truncate">{order.email}</p>
            <p className="truncate text-xs text-muted-foreground">{formatFulfillmentPromise(order, timeZone)}</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground md:block md:text-right">
            <span className="text-sm font-medium text-foreground tabular-nums">{order.lineItems.length}<span className="font-normal text-muted-foreground md:hidden"> lines</span></span>
            {flaggedLines ? <span className="block text-amber-700 dark:text-amber-400">{flaggedLines} flagged</span> : null}
          </div>
          <div className="hidden text-right md:block">
            <p className="text-sm font-semibold tabular-nums">{formatMoney(financial.totalCents, order.currencyCode)}</p>
            <p className="text-xs text-muted-foreground">{financial.stage === 'finalized' ? 'Final sale' : financial.stage === 'estimate' ? 'Estimate' : 'Picked · pending'}</p>
          </div>
          <p className="hidden text-right text-xs text-muted-foreground md:block" title={formatDateTime(order.createdAt)}>{formatRelative(order.createdAt)}</p>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <PlatformFacts columns={4} items={[
            { label: 'Placed', value: formatDateTime(order.createdAt) },
            { label: fulfillmentMethod === 'pickup' ? 'Pickup window' : 'Delivery window', value: formatFulfillmentPromise(order, timeZone) },
            { label: 'If items are unavailable', value: order.substitutionPreference ? SUBSTITUTION_LABELS[order.substitutionPreference] || humanize(order.substitutionPreference) : 'Not recorded' },
            { label: 'Payments', value: formatMoney(paymentTotal, order.currencyCode) },
          ]} />

          <PlatformSubsection title="Requested grocery lines" description="Estimate rates are checkout snapshots. Picked actuals appear once recorded in Pick & pack.">
            <div className={platformTable.wrap}>
              <table className={`${platformTable.table} min-w-[46rem]`}>
                <thead className={platformTable.head}>
                  <tr>
                    <th className={platformTable.th}>Product</th>
                    <th className={platformTable.thNumeric}>Qty</th>
                    <th className={platformTable.thNumeric}>Estimate rate</th>
                    <th className={platformTable.th}>Replacement</th>
                    <th className={platformTable.th}>Picked actual</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lineItems.map((item) => {
                    const itemMeta = (item.metadata || {}) as Record<string, unknown>;
                    const actual = item.fulfillment;
                    return (
                      <tr key={item.id} className={platformTable.row}>
                        <td className={platformTable.td}>
                          <p className="font-medium">{item.title || `Line …${item.id.slice(-8)}`}</p>
                          <p className={platformTable.mono}>{item.sku || 'No SKU'}</p>
                        </td>
                        <td className={platformTable.tdNumeric}>{item.quantity}</td>
                        <td className={platformTable.tdNumeric}>{formatMoney(item.unitPriceCents, order.currencyCode)}</td>
                        <td className={`${platformTable.tdMuted} capitalize`}>{humanize(String(itemMeta.substitutionPreference || 'none'))}</td>
                        <td className={platformTable.td}>
                          {actual ? (
                            <div className="text-xs">
                              <PlatformStatusBadge status={actual.resolution === 'picked' ? 'completed' : actual.resolution === 'short' ? 'partially_refunded' : 'confirmed'} label={humanize(actual.resolution)} />
                              <p className="mt-1 text-muted-foreground">{actual.productTitle} · {actual.quantityMilli / 1000} {actual.unitOfMeasure} · {formatMoney(actual.subtotalCents, order.currencyCode)}</p>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">Not recorded</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </PlatformSubsection>

          <div className="rounded-lg border bg-background p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{financial.title}</h3>
              <PlatformStatusBadge status={financial.stage === 'finalized' ? 'finalized' : financial.stage === 'estimate' ? 'draft' : 'requires_customer_authorization'} label={financial.stage === 'finalized' ? 'Settled amount' : financial.stage === 'estimate' ? 'Estimate' : financial.stage === 'authorization' ? 'Needs authorization' : 'Settlement pending'} />
            </div>
            {financial.stage !== 'estimate' ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Checkout estimate {formatMoney(financial.checkoutEstimateCents, order.currencyCode)}. {financial.stage === 'finalized' ? 'This finalized picked sale total is the settled amount.' : financial.stage === 'authorization' ? 'Customer authorization is required before this picked sale can be settled.' : 'Picked actuals are recorded; payment reconciliation must finish before packing.'}
              </p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
              {[
                ['Subtotal', formatMoney(financial.subtotalCents, order.currencyCode)],
                ['Discount', `−${formatMoney(financial.discountCents, order.currencyCode)}`],
                ['Tax', formatMoney(financial.taxCents, order.currencyCode)],
                ['Delivery fee', formatMoney(financial.deliveryFeeCents, order.currencyCode)],
              ].map(([label, value]) => (
                <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>
              ))}
              <div className="col-span-2 border-t pt-2 sm:col-span-1 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4"><dt className="text-xs text-muted-foreground">Total</dt><dd className="text-base font-semibold tabular-nums">{formatMoney(financial.totalCents, order.currencyCode)}</dd></div>
            </dl>
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-lg border bg-background p-4 shadow-xs">
            <p className="text-xs font-medium text-muted-foreground">Next step</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {order.status === 'pending' ? <TaskButton variant="primary" size="md" label="Start picking" onRun={advanceOrderTask.bind(null, order.id, 'picking')} /> : null}
              {order.status === 'picking' ? <TaskButton variant="primary" size="md" label="Mark packed" onRun={advanceOrderTask.bind(null, order.id, 'packed')} /> : null}
              {order.status === 'packed' && fulfillmentMethod === 'pickup' && !orderMeta.readyForPickup ? <TaskButton variant="primary" size="md" label="Mark ready for pickup" onRun={advanceOrderTask.bind(null, order.id, 'ready_for_pickup')} /> : null}
              {order.status === 'packed' && fulfillmentMethod === 'delivery' ? <Link className={platformButton('primary', 'md')} href="/dashboard/platform/delivery"><Truck aria-hidden="true" />Assign in Delivery</Link> : null}
              {order.status === 'packed' && fulfillmentMethod === 'pickup' && orderMeta.readyForPickup ? <Link className={platformButton('secondary', 'md')} href="/dashboard/platform/pickup"><ShoppingBasket aria-hidden="true" />Open pickup queue</Link> : null}
              {['out_for_delivery', 'delivered', 'cancelled', 'canceled'].includes(order.status) ? <p className="text-sm text-muted-foreground">No fulfillment step is pending for this order.</p> : null}
            </div>
            <Link className={`${platformButton('ghost', 'sm')} mt-3 -ml-2.5`} href={`/dashboard/orders/${order.id}`}><ExternalLink aria-hidden="true" />View order</Link>
          </div>
          <OrderAfterSalesActions orderId={order.id} orderStatus={order.status} payments={order.payments || []} currencyCode={order.currencyCode} canRefund={canRefund} canCancel />
        </aside>
      </div>
    </PlatformDetails>
  );
}

export default OrdersPage;
