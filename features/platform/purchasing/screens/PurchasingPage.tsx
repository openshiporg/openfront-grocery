import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import { ClipboardList, Factory, FilePlus2, Send } from 'lucide-react';
import {
  PlatformCellLabel,
  PlatformChip,
  PlatformDetails,
  PlatformDisclosure,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformFeedback,
  PlatformLinkButton,
  PlatformList,
  PlatformListHeader,
  PlatformMeter,
  PlatformMetricGrid,
  PlatformPage,
  PlatformSearchParams,
  PlatformStatusBadge,
  PlatformSurface,
  PlatformTabs,
  PlatformToolbar,
  platformHref,
  platformTable,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { TaskButton } from '@/features/platform/components/TaskButton';
import { formatDate, formatMoney } from '@/features/platform/lib/format';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { transitionPurchaseOrderTask } from '@/features/platform/lib/taskActions';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import { ReceivePurchaseOrderForm } from '../components/ReceivePurchaseOrderForm';
import { SupplierSettlementPanel } from '../components/SupplierSettlementPanel';
import { CreatePurchaseOrderForm } from '../components/CreatePurchaseOrderForm';

const PATH = '/dashboard/platform/purchasing';
const openStatus = (status?: string | null) => !['received', 'cancelled'].includes(status || '');
const rowGrid = 'md:grid md:grid-cols-[minmax(0,1.3fr)_7.5rem_8rem_9rem_7.5rem] md:items-center md:gap-3';

export async function PurchasingPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim();
  const filter = queryValue(params, 'filter') || 'open';
  const sort = queryValue(params, 'sort') || 'newest';
  const supplierId = queryValue(params, 'supplier').trim();
  let data: Awaited<ReturnType<typeof platformProjections.purchasing>> = null;
  let supplierOptions: Array<{ id: string; name: string }> | null = null;
  let productOptions: Array<{ id: string; title: string }> | null = null;
  let loadError: string | null = null;
  // Search, status, supplier and sort run on the server across every purchase order.
  const [purchasingResult, supplierOptionsResult, productOptionsResult] = await Promise.allSettled([
    platformProjections.purchasing(parsePageParam(params.page), 50, q, '', filter, sort, supplierId),
    platformProjections.purchasingOptions('supplier'),
    platformProjections.purchasingOptions('product'),
  ]);
  if (purchasingResult.status === 'fulfilled' && purchasingResult.value) data = purchasingResult.value;
  else loadError = purchasingResult.status === 'rejected' && purchasingResult.reason instanceof Error ? purchasingResult.reason.message : 'Unable to load purchasing.';
  if (supplierOptionsResult.status === 'fulfilled' && supplierOptionsResult.value) {
    supplierOptions = supplierOptionsResult.value.flatMap(({ id, name }) => name ? [{ id, name }] : []);
  }
  if (productOptionsResult.status === 'fulfilled' && productOptionsResult.value) {
    productOptions = productOptionsResult.value.flatMap(({ id, title }) => title ? [{ id, title }] : []);
  }
  const currencyCode = data?.currencyCode || 'USD';
  const orders = data?.purchaseOrders || [];
  const counts = data?.statusCounts || {};
  const supplierName = supplierId ? orders.find((order) => order.supplier?.id === supplierId)?.supplier?.name || supplierOptions?.find((supplier) => supplier.id === supplierId)?.name : null;
  const draftReady = Boolean(data && supplierOptions && productOptions && supplierOptions.length > 0 && productOptions.length > 0);

  return (
    <PlatformPage
      title="Purchasing & receiving"
      breadcrumb="Purchasing"
      description="Create purchase orders, receive stock and match supplier invoices."
      actions={<PlatformLinkButton href="/dashboard/platform/suppliers" icon={Factory}>Suppliers</PlatformLinkButton>}
    >
      {data ? <PlatformMetricGrid metrics={[
        { label: 'Open purchase orders', value: counts.open ?? 0, note: supplierName ? supplierName : q ? 'Matching your search' : 'Draft, sent or confirmed', href: platformHref(PATH, params, { filter: 'open' }) },
        { label: 'Expected within 3 days', value: data.dueSoonCount, note: 'Open orders, including overdue', tone: data.dueSoonCount ? 'warning' : 'default' },
        { label: 'Awaiting supplier confirmation', value: counts.sent ?? 0, note: 'Sent, not yet confirmed', href: platformHref(PATH, params, { filter: 'sent' }) },
        { label: 'Open order value', value: formatMoney(data.openCommittedCents, currencyCode), note: 'Draft, sent and confirmed orders' },
      ]} /> : null}

      {data && (supplierOptions === null || productOptions === null) ? <PlatformErrorState title="Can’t create drafts right now" description="Supplier or product options could not be loaded. The purchase order list is still available." /> : null}
      {data && supplierOptions && productOptions && !draftReady ? <PlatformFeedback tone="info">Add at least one supplier and one product before creating a purchase order.</PlatformFeedback> : null}
      {draftReady && supplierOptions && productOptions ? (
        <PlatformDisclosure id="create-po" icon={FilePlus2} title="Create purchase order" description="Choose a supplier, add product lines with quantities and unit costs, then send it from the list below." defaultOpen={(counts.all ?? 0) === 0}>
          <CreatePurchaseOrderForm suppliers={supplierOptions} products={productOptions} currencyCode={currencyCode} />
        </PlatformDisclosure>
      ) : null}

      {loadError ? <PlatformErrorState description={loadError} retryHref={PATH} /> : (
        <PlatformSurface
          icon={ClipboardList}
          title="Purchase orders"
          description="Expand a purchase order for its lines, receiving progress and next step."
          tabs={<PlatformTabs path={PATH} params={params} active={filter} label="Purchase order state" tabs={[
            { value: 'open', label: 'Open', count: counts.open },
            { value: 'draft', label: 'Draft', count: counts.draft },
            { value: 'sent', label: 'Sent', count: counts.sent },
            { value: 'confirmed', label: 'Receiving', count: counts.confirmed },
            { value: 'received', label: 'Received', count: counts.received },
            { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
            { value: 'all', label: 'All', count: counts.all },
          ]} />}
        >
          {supplierId ? (
            <PlatformFeedback tone="info">
              Showing purchase orders from {supplierName || 'one supplier'}. <a className="font-medium underline underline-offset-2" href={platformHref(PATH, params, { supplier: null })}>Show all suppliers</a>
            </PlatformFeedback>
          ) : null}
          <PlatformToolbar
            path={PATH}
            search={q}
            searchPlaceholder="PO number, supplier, product, or SKU"
            preserve={{ filter, supplier: supplierId }}
            sort={sort}
            sortOptions={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'eta', label: 'ETA soonest' }, { value: 'value', label: 'Highest value' }]}
            resultCount={data?.pagination.collections.purchaseOrders?.total ?? orders.length}
          />
          {orders.length === 0 ? (
            <PlatformEmptyState icon={ClipboardList} title="No matching purchase orders" description={(counts.all ?? 0) > 0 ? 'Nothing matches the current tab or search.' : 'Create the first purchase order above to start receiving stock.'} />
          ) : (
            <>
              <PlatformListHeader className={rowGrid}>
                <span>Purchase order</span><span>Status</span><span>ETA</span><span>Received</span><span className="text-right">Value</span>
              </PlatformListHeader>
              <PlatformList>
                {orders.map((order) => {
                  const ordered = order.items.reduce((sum, item) => sum + item.quantity, 0);
                  const received = order.items.reduce((sum, item) => sum + (item.quantityReceived || 0), 0);
                  const dueSoon = order.isDueSoon && openStatus(order.status);
                  return (
                    <PlatformDetails key={order.id} summary={
                      <div className={`grid gap-1.5 ${rowGrid}`}>
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold">{order.poNumber}</p>
                          <p className="truncate text-xs text-muted-foreground">{order.supplier?.name || 'Supplier unavailable'} · {order.items.length} lines · ordered {formatDate(order.orderDate)}</p>
                        </div>
                        <div><PlatformCellLabel>Status</PlatformCellLabel><PlatformStatusBadge status={order.status} label={order.status === 'confirmed' ? 'Receiving' : undefined} /></div>
                        <p className={`text-xs ${dueSoon ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}><PlatformCellLabel>Expected</PlatformCellLabel>{dueSoon ? 'Due soon · ' : ''}{formatDate(order.expectedDeliveryDate, 'No ETA')}</p>
                        <div className="flex items-center gap-2">
                          <div className="w-20 md:flex-1"><PlatformMeter value={received} max={ordered} tone="positive" label="Units received" /></div>
                          <span className="text-xs text-muted-foreground tabular-nums"><PlatformCellLabel>Received</PlatformCellLabel>{received}/{ordered}</span>
                        </div>
                        <p className="text-sm font-semibold tabular-nums md:text-right"><PlatformCellLabel>Value</PlatformCellLabel>{formatMoney(order.totalAmountCents || 0, currencyCode)}</p>
                      </div>
                    }>
                      <div className="space-y-5">
                        <div className={platformTable.wrap}>
                          <table className={`${platformTable.table} min-w-[40rem]`}>
                            <thead className={platformTable.head}>
                              <tr><th className={platformTable.th}>Product snapshot</th><th className={platformTable.thNumeric}>Ordered</th><th className={platformTable.thNumeric}>Received</th><th className={platformTable.thNumeric}>Unit cost</th><th className={platformTable.thNumeric}>Line total</th></tr>
                            </thead>
                            <tbody>
                              {order.items.map((item) => (
                                <tr key={item.id} className={platformTable.row}>
                                  <td className={platformTable.td}><p className="font-medium">{item.productTitle || `Item …${item.id.slice(-6)}`}</p><p className={platformTable.mono}>{item.productSku || 'No SKU'}</p></td>
                                  <td className={platformTable.tdNumeric}>{item.quantity}</td>
                                  <td className={platformTable.tdNumeric}><span className={(item.quantityReceived || 0) >= item.quantity ? 'text-emerald-700 dark:text-emerald-400' : ''}>{item.quantityReceived || 0}</span></td>
                                  <td className={platformTable.tdNumeric}>{formatMoney(item.unitCostCents || 0, currencyCode)}</td>
                                  <td className={platformTable.tdNumeric}>{formatMoney((item.unitCostCents || 0) * item.quantity, currencyCode)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {order.notes ? <div className="rounded-lg border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">PO note</p><p className="mt-1 text-sm">{order.notes}</p></div> : null}
                        {openStatus(order.status) ? (
                          <div className="flex flex-wrap items-start gap-3 rounded-lg border bg-background p-3 shadow-xs">
                            <PlatformChip>Next step</PlatformChip>
                            {order.status === 'draft' ? <TaskButton variant="primary" size="md" label="Send purchase order" successLabel="Purchase order sent" icon={<Send aria-hidden="true" />} onRun={transitionPurchaseOrderTask.bind(null, order.id, 'sent')} /> : null}
                            {order.status === 'sent' ? <TaskButton variant="primary" size="md" label="Confirm purchase order" successLabel="Purchase order confirmed" onRun={transitionPurchaseOrderTask.bind(null, order.id, 'confirmed')} /> : null}
                            {received === 0 ? <TaskButton variant="destructive" size="md" label="Cancel purchase order" successLabel="Purchase order cancelled" confirmPrompt={`Cancel ${order.poNumber}? This can’t be undone.`} confirmLabel="Cancel order" onRun={transitionPurchaseOrderTask.bind(null, order.id, 'cancelled')} /> : null}
                            <p className="basis-full text-xs text-muted-foreground">{order.status === 'draft' ? 'Sending queues the order to be emailed to the supplier; check Communications for delivery.' : order.status === 'sent' ? 'Confirm once the supplier has accepted. Goods that arrive before confirmation can be received below.' : 'Receive deliveries below as they arrive.'}{received > 0 ? ' Orders with received stock can’t be cancelled.' : ''}</p>
                          </div>
                        ) : null}
                        {order.status === 'confirmed' || order.status === 'sent' ? <ReceivePurchaseOrderForm order={order} awaitingConfirmation={order.status === 'sent'} /> : null}
                      </div>
                    </PlatformDetails>
                  );
                })}
              </PlatformList>
            </>
          )}
          <PlatformPageLinks pagination={data?.pagination} path={PATH} searchParams={params} />
        </PlatformSurface>
      )}

      <SupplierSettlementPanel currencyCode={currencyCode} />
    </PlatformPage>
  );
}

export default PurchasingPage;
