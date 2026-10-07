import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformDetails, PlatformEmptyState, PlatformErrorState, PlatformMetricGrid, PlatformSearchParams, PlatformStatusBadge, PlatformSurface, PlatformToolbar, PlatformTruthNotice, queryValue } from '@/features/platform/components/PlatformPrimitives';
import { TaskButton } from '@/features/platform/components/TaskButton';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { transitionPurchaseOrderTask } from '@/features/platform/lib/taskActions';
import { ReceivePurchaseOrderForm } from '../components/ReceivePurchaseOrderForm';
import { SupplierSettlementPanel } from '../components/SupplierSettlementPanel';
import { CreatePurchaseOrderForm } from '../components/CreatePurchaseOrderForm';

function dateLabel(value?: string | null) { return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : '—'; }
function money(cents = 0, currencyCode = 'USD') { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(cents / 100); }

export async function PurchasingPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim().toLowerCase();
  const filter = queryValue(params, 'filter') || 'open';
  const sort = queryValue(params, 'sort') || 'newest';
  let data: Awaited<ReturnType<typeof platformProjections.purchasing>> = null;
  let supplierOptions: Array<{ id: string; name: string }> | null = null;
  let inventoryData: Awaited<ReturnType<typeof platformProjections.inventory>> = null;
  let loadError: string | null = null;
  const [purchasingResult, supplierOptionsResult, inventoryResult] = await Promise.allSettled([
    platformProjections.purchasing(Number(params.page || 1), Number(params.pageSize || 50), String(params.search || params.q || ''), String(params.status || '')),
    platformProjections.purchasingOptions('supplier'),
    platformProjections.inventory(),
  ]);
  if (purchasingResult.status === 'fulfilled' && purchasingResult.value) data = purchasingResult.value;
  else loadError = purchasingResult.status === 'rejected' && purchasingResult.reason instanceof Error ? purchasingResult.reason.message : 'Unable to load purchasing.';
  if (supplierOptionsResult.status === 'fulfilled' && supplierOptionsResult.value) {
    supplierOptions = supplierOptionsResult.value.flatMap(({ id, name }) => name ? [{ id, name }] : []);
  }
  if (inventoryResult.status === 'fulfilled') inventoryData = inventoryResult.value;
  const currencyCode = data?.currencyCode || 'USD';
  const all = data?.purchaseOrders || [];
  const orders = [...all]
    .filter((order) => !q || order.poNumber.toLowerCase().includes(q) || order.supplier?.name.toLowerCase().includes(q) || order.items.some((item) => item.productTitle.toLowerCase().includes(q) || item.productSku.toLowerCase().includes(q)))
    .filter((order) => filter === 'all' || (filter === 'open' ? !['received', 'cancelled'].includes(order.status || '') : order.status === filter))
    .sort((a, b) => sort === 'eta' ? String(a.expectedDeliveryDate || '9999').localeCompare(String(b.expectedDeliveryDate || '9999')) : sort === 'value' ? Number(b.totalAmountCents || 0) - Number(a.totalAmountCents || 0) : sort === 'oldest' ? a.orderDate.localeCompare(b.orderDate) : b.orderDate.localeCompare(a.orderDate));
  const open = all.filter((order) => !['received', 'cancelled'].includes(order.status || ''));
  const due = open.filter((order) => order.isDueSoon);
  const unitsOpen = open.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + Math.max(0, item.quantity - (item.quantityReceived || 0)), 0), 0);
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Purchasing' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Purchasing & receiving</h1><p className="mt-1 text-sm text-muted-foreground">Create cent-exact drafts, move purchase orders through bounded states, and receive future-dated lots.</p></div>;

  return <PageContainer title="Purchasing" header={header} breadcrumbs={breadcrumbs}><div className="space-y-5 px-4 pb-8 md:px-6">
    <PlatformPageLinks pagination={data?.pagination} path="/dashboard/platform/purchasing" searchParams={params} />
    {data ? <PlatformMetricGrid metrics={[{ label: 'Open purchase orders (shown)', value: open.length, note: 'Draft through confirmed among shown POs' }, { label: 'Expected within 3 days (shown)', value: due.length, note: 'Shown open POs; includes overdue ETA', tone: due.length ? 'warning' : 'default' }, { label: 'Units still expected (shown)', value: unitsOpen, note: 'Outstanding quantity among shown open POs' }, { label: 'Open committed value (shown)', value: money(open.reduce((sum, order) => sum + Number(order.totalAmountCents || 0), 0), currencyCode), note: 'Shown open PO line snapshots in cents' }]} /> : null}
    <PlatformTruthNotice title="Manual replenishment boundary">Purchase orders are operator-created. Product search selects catalog items but does not calculate a reorder quantity; draft quantities and unit costs are entered by the operator. Inventory low-stock signals cover only products shown on that page, and this screen provides no store-wide replenishment recommendation.</PlatformTruthNotice>
    <PlatformTruthNotice title="Receiving boundary">Receiving retains supplier batch, inspection and purchase-order provenance. Supplier invoices match these receipts; discrepancies, claims, credits and external settlement retain separate evidence.</PlatformTruthNotice>
    {data && (supplierOptions === null || inventoryData === null) ? <PlatformErrorState title="Draft options unavailable" description="The purchase-order list remains available, but draft creation is disabled because supplier or inventory options could not be loaded." /> : null}
    {data && supplierOptions && inventoryData && (supplierOptions.length === 0 || inventoryData.products.length === 0) ? <p role="status" className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">A purchase-order draft requires at least one supplier and one product in this store.</p> : null}
    {data && supplierOptions && inventoryData && supplierOptions.length > 0 && inventoryData.products.length > 0 ? <PlatformDetails className="rounded-xl border bg-background" summary={<div className="flex items-center justify-between gap-4 px-4 py-4 md:px-5"><div><p className="font-semibold">Create purchase order draft</p><p className="mt-1 text-sm text-muted-foreground">Start one real supplier/product line with an operator-entered unit cost.</p></div><span className="text-xs font-medium text-muted-foreground">Open form</span></div>}><CreatePurchaseOrderForm suppliers={supplierOptions} products={inventoryData.products.map((product) => ({ id: product.id, title: product.title }))} /></PlatformDetails> : null}
    <SupplierSettlementPanel currencyCode={currencyCode} />
    {data ? <PlatformToolbar search={q} searchPlaceholder="PO number, supplier, product, or SKU" filter={filter} filterLabel="PO state" filterOptions={[{ value: 'open', label: 'Open workflow' }, { value: 'all', label: 'All purchase orders' }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'confirmed', label: 'Confirmed / receiving' }, { value: 'received', label: 'Received' }, { value: 'cancelled', label: 'Cancelled' }]} sort={sort} sortOptions={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'eta', label: 'ETA soonest' }, { value: 'value', label: 'Highest value' }]} resultCount={orders.length} /> : null}
    {loadError ? <PlatformErrorState description={loadError} /> : <PlatformSurface title="Purchase orders" description="Expand a PO for immutable supplier/product snapshots, cumulative receiving progress, and valid next steps.">
      {orders.length === 0 ? <PlatformEmptyState title="No matching purchase orders" description="Reset filters or create the first draft." /> : <div className="divide-y">{orders.map((order) => {
        const ordered = order.items.reduce((sum, item) => sum + item.quantity, 0);
        const received = order.items.reduce((sum, item) => sum + (item.quantityReceived || 0), 0);
        return <PlatformDetails key={order.id} summary={<div className="grid gap-3 px-4 py-4 hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center md:px-5"><div className="min-w-0"><p className="font-semibold">{order.poNumber}</p><p className="truncate text-sm text-muted-foreground">{order.supplier?.name || 'Supplier unavailable'} · ETA {dateLabel(order.expectedDeliveryDate)}</p></div><PlatformStatusBadge status={order.status} /><div className="text-left sm:text-right"><p className="font-semibold tabular-nums">{money(order.totalAmountCents || 0, currencyCode)}</p><p className="text-xs text-muted-foreground">{received}/{ordered} units received</p></div></div>}>
          <div className="space-y-5"><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Product snapshot</th><th className="px-3 py-2 font-medium">SKU</th><th className="px-3 py-2 text-right font-medium">Ordered</th><th className="px-3 py-2 text-right font-medium">Received</th><th className="px-3 py-2 text-right font-medium">Unit cost</th></tr></thead><tbody className="divide-y">{order.items.map((item) => <tr key={item.id}><td className="px-3 py-2 font-medium">{item.productTitle || `Item …${item.id.slice(-6)}`}</td><td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.productSku || '—'}</td><td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td><td className="px-3 py-2 text-right tabular-nums">{item.quantityReceived || 0}</td><td className="px-3 py-2 text-right tabular-nums">{money(item.unitCostCents || 0, currencyCode)}</td></tr>)}</tbody></table></div>
            {order.notes ? <div className="rounded-lg border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">PO note</p><p className="mt-1 text-sm">{order.notes}</p></div> : null}
            <div className="flex flex-wrap gap-2">{order.status === 'draft' ? <TaskButton variant="primary" label="Send purchase order" successLabel="Purchase order sent" onRun={transitionPurchaseOrderTask.bind(null, order.id, 'sent')} /> : null}{order.status === 'sent' ? <TaskButton variant="primary" label="Confirm purchase order" successLabel="Purchase order confirmed" onRun={transitionPurchaseOrderTask.bind(null, order.id, 'confirmed')} /> : null}</div>
            {order.status === 'confirmed' ? <ReceivePurchaseOrderForm order={order} /> : null}
          </div>
        </PlatformDetails>;
      })}</div>}
    </PlatformSurface>}
  </div></PageContainer>;
}

export default PurchasingPage;
