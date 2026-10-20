import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import { Boxes, PackagePlus, TrendingDown } from 'lucide-react';
import { InventorySafetyPanel } from '../components/InventorySafetyPanel';
import { CaseConversionPanel } from '../components/CaseConversionPanel';
import { inventoryLotDisplayState } from '../lib/inventoryLotDisplayState';
import {
  PlatformCellLabel,
  PlatformChip,
  PlatformDetails,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformFacts,
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
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { formatDate, formatRelative } from '@/features/platform/lib/format';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import { InventoryAdjustmentForm } from '../components/InventoryAdjustmentForm';

const PATH = '/dashboard/platform/inventory';
const rowGrid = 'md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_8.5rem_7.5rem] md:items-center md:gap-3';
const unitLabel = (unit?: string | null) => unit || 'each';

export async function InventoryPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim();
  const filter = queryValue(params, 'filter') || 'attention';
  const sort = queryValue(params, 'sort') || 'expiry';
  let data: Awaited<ReturnType<typeof platformProjections.inventory>> = null;
  let loadError: string | null = null;
  // Search, lot state and sort run on the server across every lot in the store.
  try { data = await platformProjections.inventory(parsePageParam(params.page), 50, q, '', filter, sort); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load inventory.'; }
  const lots = data?.inventoryLots || [];
  const lotCounts = data?.lotViewCounts;
  const products = data?.products || [];
  const lowStock = products.filter((product) => typeof product.stockQuantity === 'number' && typeof product.lowStockThreshold === 'number' && product.stockQuantity <= product.lowStockThreshold);
  const mismatch = products.filter((product) => Number(product.stockQuantity || 0) !== product.recordedStockQuantity);
  // Products are sold by different units (each, lb, L), so stock is counted per product, never summed across units.
  const stockedProducts = products.filter((product) => Number(product.stockQuantity || 0) > 0);
  const watchlist = products.filter((product) => lowStock.includes(product) || product.activeBackInStockAlerts > 0 || mismatch.includes(product));
  const scopeNote = q ? 'Matching your search' : 'All lots';

  return (
    <PlatformPage
      title="Inventory"
      description="Review stock, expiry and count corrections."
      actions={<PlatformLinkButton href="/dashboard/platform/purchasing" icon={PackagePlus}>Receive inventory</PlatformLinkButton>}
    >
      {data && lotCounts ? <PlatformMetricGrid metrics={[
        { label: 'Products in stock', value: stockedProducts.length, note: `Of ${products.length} products on this page` },
        { label: 'Low-stock products', value: lowStock.length, note: 'At or below threshold on this page', tone: lowStock.length ? 'warning' : 'default' },
        { label: 'Expiring within 7 days', value: lotCounts.expiring, note: `${lotCounts.expired} expired · ${scopeNote}`, tone: lotCounts.expired ? 'critical' : lotCounts.expiring ? 'warning' : 'default', href: platformHref(PATH, params, { filter: lotCounts.expired ? 'expired' : 'expiring'}) },
        { label: 'Held or expired stock', value: mismatch.length, note: 'Products on this page with stock that can’t be sold', tone: mismatch.length ? 'warning' : 'default', href: lotCounts.expired ? platformHref(PATH, params, { filter: 'expired'}) : undefined },
      ]} /> : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {loadError ? <PlatformErrorState description={loadError} retryHref={PATH} /> : (
          <PlatformSurface
            icon={Boxes}
            title="Inventory lots"
            description="Expand a lot to correct its counted quantity."
            tabs={<PlatformTabs path={PATH} params={params} active={filter} label="Lot state" tabs={[
              { value: 'attention', label: 'Needs attention', count: lotCounts?.attention, tone: 'attention' },
              { value: 'expiring', label: 'Expiring', count: lotCounts?.expiring },
              { value: 'expired', label: 'Expired', count: lotCounts?.expired },
              { value: 'empty', label: 'Empty', count: lotCounts?.empty },
              { value: 'all', label: 'All lots', count: lotCounts?.all },
            ]} />}
          >
            <PlatformToolbar
              path={PATH}
              search={q}
              searchPlaceholder="Product, lot, supplier, or location"
              preserve={{ filter }}
              sort={sort}
              sortOptions={[{ value: 'expiry', label: 'Expiry soonest' }, { value: 'quantity', label: 'Lowest quantity' }, { value: 'product', label: 'Product A–Z' }]}
              resultCount={data?.pagination.collections.inventoryLots?.total ?? lots.length}
            />
            {lots.length === 0 ? (
              <PlatformEmptyState
                icon={Boxes}
                title={filter === 'attention' && !q ? 'No lots need attention' : 'No matching lots'}
                description={filter === 'attention' && !q ? 'No lot is expired, expiring within 7 days, or empty.' : 'Reset filters, or receive stock through Purchasing.'}
                action={<PlatformLinkButton href={platformHref(PATH, {}, { filter: 'all' })} size="sm">Show all lots</PlatformLinkButton>}
              />
            ) : (
              <>
                <PlatformListHeader className={rowGrid}>
                  <span>Product · lot</span><span>State</span><span>Remaining</span><span className="text-right">Expiry</span>
                </PlatformListHeader>
                <PlatformList>
                  {lots.map((lot) => {
                    const state = inventoryLotDisplayState(lot);
                    const unit = unitLabel(lot.product?.unitOfMeasure);
                    return (
                      <PlatformDetails key={lot.id} summary={
                        <div className={`grid gap-1.5 ${rowGrid}`}>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{lot.product?.title || 'Unknown product'}</p>
                            <p className="truncate text-xs text-muted-foreground"><span className="font-mono">{lot.lotNumber}</span> · {lot.location || 'No location'}</p>
                          </div>
                          <div><PlatformCellLabel>State</PlatformCellLabel><PlatformStatusBadge status={state.status} label={state.label} /></div>
                          <div className="flex items-center gap-2 md:block">
                            <p className="text-sm font-semibold tabular-nums"><PlatformCellLabel>Remaining of received</PlatformCellLabel>{lot.quantityRemaining} <span className="font-normal text-muted-foreground">/ {lot.quantity} {unit}</span></p>
                            <div className="w-24 md:mt-1 md:w-full"><PlatformMeter value={lot.quantityRemaining} max={lot.quantity} tone="neutral" label="Remaining of received" /></div>
                          </div>
                          <p className={`text-xs md:text-right ${lot.isExpired ? 'font-medium text-destructive' : lot.isExpiringSoon ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`} title={formatDate(lot.expirationDate)}>
                            {lot.isExpired ? 'Expired ' : 'Expires '}{formatRelative(lot.expirationDate)}
                          </p>
                        </div>
                      }>
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
                          <PlatformFacts columns={2} items={[
                            { label: 'Supplier', value: lot.supplier?.name || 'Unknown' },
                            { label: 'Location', value: lot.location || 'Not recorded' },
                            { label: 'Received quantity', value: <span className="tabular-nums">{lot.quantity} {unit}</span> },
                            { label: 'Remaining', value: <span className="tabular-nums">{lot.quantityRemaining} {unit}</span> },
                            { label: 'Expiration', value: formatDate(lot.expirationDate) },
                            { label: 'Safety · condition', value: <span className="capitalize">{(lot.safetyStatus || 'unknown').replaceAll('_', ' ')} · {(lot.conditionStatus || 'unknown').replaceAll('_', ' ')}</span> },
                          ]} />
                          <InventoryAdjustmentForm lotId={lot.id} quantity={lot.quantity} quantityRemaining={lot.quantityRemaining} unit={unit} />
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

        <PlatformSurface icon={TrendingDown} title="Product watchlist" count={watchlist.length} description="Low stock, back-in-stock requests and stock that can’t be sold, for products on this page.">
          {loadError ? (
            <p className="px-4 py-4 text-sm text-muted-foreground md:px-5">Unavailable while inventory data is unavailable.</p>
          ) : products.length === 0 ? (
            <PlatformEmptyState compact title="No products on this page" description="No catalog products match this page or search." />
          ) : watchlist.length === 0 ? (
            <PlatformEmptyState compact title="No product exceptions" description="No low stock, unsellable stock or back-in-stock requests among products shown here." />
          ) : (
            <div className="divide-y">
              {watchlist.map((product) => {
                const eligible = Number(product.stockQuantity || 0);
                return (
                  <div key={product.id} className="space-y-2 px-4 py-3 md:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{product.title}</p>
                        <p className="truncate text-xs text-muted-foreground"><span className="font-mono">{product.sku || 'No SKU'}</span> · {product.department || 'Unassigned'}</p>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${eligible > 0 ? '' : 'text-destructive'}`}>{eligible} <span className="font-normal text-muted-foreground">{unitLabel(product.unitOfMeasure)}</span></span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {lowStock.includes(product) ? <PlatformChip className="border-amber-500/30 text-amber-800 dark:text-amber-300">Low · threshold {product.lowStockThreshold}</PlatformChip> : null}
                      {mismatch.includes(product) ? <PlatformChip>Recorded {product.recordedStockQuantity} {unitLabel(product.unitOfMeasure)}</PlatformChip> : null}
                      {product.activeBackInStockAlerts ? <PlatformChip className="border-blue-500/30 text-blue-700 dark:text-blue-300">{product.activeBackInStockAlerts} alerts</PlatformChip> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PlatformSurface>
      </div>

      <InventorySafetyPanel lots={lots} />
      <CaseConversionPanel lots={lots} />
    </PlatformPage>
  );
}

export default InventoryPage;
