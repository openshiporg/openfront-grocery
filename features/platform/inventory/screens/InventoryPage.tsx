import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import Link from 'next/link';
import { InventorySafetyPanel } from '../components/InventorySafetyPanel';
import { CaseConversionPanel } from '../components/CaseConversionPanel';
import { inventoryLotDisplayState } from '../lib/inventoryLotDisplayState';
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
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { adjustInventoryFormTask } from '@/features/platform/lib/taskActions';

function dateLabel(value?: string | null) { return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : '—'; }

export async function InventoryPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim().toLowerCase();
  const filter = queryValue(params, 'filter') || 'attention';
  const sort = queryValue(params, 'sort') || 'expiry';
  let data: Awaited<ReturnType<typeof platformProjections.inventory>> = null;
  let loadError: string | null = null;
  try { data = await platformProjections.inventory(Number(params.page || 1), Number(params.pageSize || 50), String(params.search || params.q || ""), String(params.status || "")); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load inventory.'; }
  const lots = [...(data?.inventoryLots || [])]
    .filter((lot) => !q || lot.lotNumber.toLowerCase().includes(q) || lot.product?.title.toLowerCase().includes(q) || lot.supplier?.name.toLowerCase().includes(q) || lot.location?.toLowerCase().includes(q))
    .filter((lot) => filter === 'all' || (filter === 'attention' ? lot.isExpired || lot.isExpiringSoon || lot.quantityRemaining === 0 : filter === 'expired' ? lot.isExpired : filter === 'expiring' ? lot.isExpiringSoon : filter === 'empty' ? lot.quantityRemaining === 0 : true))
    .sort((a, b) => sort === 'product' ? (a.product?.title || '').localeCompare(b.product?.title || '') : sort === 'quantity' ? a.quantityRemaining - b.quantityRemaining : new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime());
  const products = data?.products || [];
  const lowStock = products.filter((product) => typeof product.stockQuantity === 'number' && typeof product.lowStockThreshold === 'number' && product.stockQuantity <= product.lowStockThreshold);
  const expired = (data?.inventoryLots || []).filter((lot) => lot.isExpired);
  const expiring = (data?.inventoryLots || []).filter((lot) => lot.isExpiringSoon);
  const mismatch = products.filter((product) => Number(product.stockQuantity || 0) !== product.recordedStockQuantity);
  const eligibleOnHandNow = products.reduce((sum, product) => sum + Number(product.stockQuantity || 0), 0);

  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Inventory' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Inventory</h1><p className="mt-1 text-sm text-muted-foreground">Review current eligible on-hand, triage expiry, and reconcile it with the reporting cache.</p></div>;

  return <PageContainer title="Inventory" header={header} breadcrumbs={breadcrumbs}>
    <div className="space-y-5 px-4 pb-8 md:px-6">
      <PlatformPageLinks pagination={data?.pagination} path="/dashboard/platform/inventory" searchParams={params} />
    {data ? <PlatformMetricGrid metrics={[
        { label: 'Eligible on-hand now (shown products)', value: eligibleOnHandNow, note: 'Available + accepted lots with positive balance and expiry after now.' },
        { label: 'Low-stock products (shown)', value: lowStock.length, note: 'Current eligible on-hand at or below configured threshold', tone: lowStock.length ? 'warning' : 'default' },
        { label: 'Expiring within 7 days (shown lots)', value: expiring.length, note: `${expired.length} expired lots among shown lots`, tone: expired.length ? 'critical' : expiring.length ? 'warning' : 'default' },
        { label: 'Cache mismatches (shown)', value: mismatch.length, note: 'Current eligible on-hand vs recorded product count', tone: mismatch.length ? 'warning' : 'default' },
      ]} /> : null}
      <PlatformTruthNotice title="Inventory authority">Eligible on-hand is an as-of-now view of available, accepted lots with positive, unexpired balances—not available-to-promise (ATP) through a future delivery or pickup promise. These values and low-stock signals cover only the products/lots shown on this page; use pagination above to review the rest. This screen does not provide a store-wide replenishment recommendation or create purchase orders. Checkout rechecks lots through the selected promise end.</PlatformTruthNotice>
      <InventorySafetyPanel lots={data?.inventoryLots || []} />
      <CaseConversionPanel lots={data?.inventoryLots || []} />
      <div className="grid gap-5 xl:grid-cols-[minmax(17rem,.7fr)_minmax(0,1.3fr)]">
        <PlatformSurface title="Product watchlist (shown products)" description="Low-stock, demand, and cache signals for products on this page only; review other pages for the rest of the catalog.">
          {loadError ? <p className="px-4 py-3 text-sm text-muted-foreground">Product watchlist unavailable while inventory data is unavailable.</p> : products.length === 0 ? <PlatformEmptyState title="No products on this page" description="No catalog products match this page or search." /> : <div className="divide-y">{products.filter((product) => lowStock.includes(product) || product.activeBackInStockAlerts > 0 || mismatch.includes(product)).map((product) => <div key={product.id} className="px-4 py-3 md:px-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{product.title}</p><p className="text-xs text-muted-foreground">{product.sku || 'No SKU'} · {product.department || 'Unassigned'}</p></div><PlatformStatusBadge status={Number(product.stockQuantity || 0) > 0 ? 'active' : 'failed'} label={`${Number(product.stockQuantity || 0)} eligible now`} /></div><dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted-foreground">Recorded</dt><dd className="font-medium tabular-nums">{product.recordedStockQuantity}</dd></div><div><dt className="text-muted-foreground">Threshold</dt><dd className="font-medium tabular-nums">{product.lowStockThreshold ?? '—'}</dd></div><div><dt className="text-muted-foreground">Alerts</dt><dd className="font-medium tabular-nums">{product.activeBackInStockAlerts}</dd></div></dl></div>)}</div>}
          {products.length > 0 && products.every((product) => !lowStock.includes(product) && !product.activeBackInStockAlerts && !mismatch.includes(product)) ? <PlatformEmptyState title="No product exceptions on this page" description="No low-stock, cache-mismatch, or active back-in-stock signal among the products shown here." /> : null}
        </PlatformSurface>

        <div className="space-y-4">
          {data ? <PlatformToolbar search={q} searchPlaceholder="Product, lot, supplier, or location" filter={filter} filterLabel="Lot state" filterOptions={[{ value: 'attention', label: 'Needs attention' }, { value: 'all', label: 'All lots' }, { value: 'expiring', label: 'Expiring within 7 days' }, { value: 'expired', label: 'Expired' }, { value: 'empty', label: 'Empty' }]} sort={sort} sortOptions={[{ value: 'expiry', label: 'Expiry soonest' }, { value: 'quantity', label: 'Lowest quantity' }, { value: 'product', label: 'Product A–Z' }]} resultCount={lots.length} /> : null}
          {loadError ? <PlatformErrorState description={loadError} /> : <PlatformSurface title="Inventory lots" description="Expand a lot to enter a stock-unit target count with audited reason and note." action={<Link href="/dashboard/platform/purchasing" className="inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Receive inventory</Link>}>
            {lots.length === 0 ? <PlatformEmptyState title="No matching lots" description="Reset filters or receive a future-dated lot through Purchasing." /> : <div className="divide-y">{lots.map((lot) => {
              const state = inventoryLotDisplayState(lot);
              return <PlatformDetails key={lot.id} summary={<div className="grid gap-2 px-4 py-4 hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center md:px-5"><div className="min-w-0"><p className="truncate font-medium">{lot.product?.title || 'Unknown product'}</p><p className="truncate text-xs text-muted-foreground">Lot {lot.lotNumber} · {lot.location || 'No location'}</p></div><PlatformStatusBadge status={state.status} label={state.label} /><div className="text-left sm:text-right"><p className="font-semibold tabular-nums">{lot.quantityRemaining} / {lot.quantity}</p><p className="text-xs text-muted-foreground">{lot.isExpired ? 'Expired' : 'Expires'} {dateLabel(lot.expirationDate)}</p></div></div>}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,.7fr)_minmax(18rem,1.3fr)]"><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Supplier</dt><dd className="mt-1 font-medium">{lot.supplier?.name || 'Unknown'}</dd></div><div><dt className="text-xs text-muted-foreground">Location</dt><dd className="mt-1 font-medium">{lot.location || 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Received quantity</dt><dd className="mt-1 font-medium tabular-nums">{lot.quantity}</dd></div><div><dt className="text-xs text-muted-foreground">Remaining</dt><dd className="mt-1 font-medium tabular-nums">{lot.quantityRemaining}</dd></div></dl>
                  <form action={adjustInventoryFormTask} className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2"><input type="hidden" name="inventoryLotId" value={lot.id} /><label className="grid gap-1 text-xs font-medium text-muted-foreground">Target count<input name="targetQuantityRemaining" required type="number" step="0.001" min={0} max={lot.quantity} defaultValue={lot.quantityRemaining} className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Reason<select name="reason" className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="damage">Damage</option><option value="spoilage">Spoilage</option><option value="correction">Correction</option></select></label><label className="grid gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">Evidence note<input name="note" maxLength={500} placeholder="Optional observed condition or count note" className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><button type="submit" className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-2">Save target count</button></form>
                </div>
              </PlatformDetails>;
            })}</div>}
          </PlatformSurface>}
        </div>
      </div>
    </div>
  </PageContainer>;
}

export default InventoryPage;
