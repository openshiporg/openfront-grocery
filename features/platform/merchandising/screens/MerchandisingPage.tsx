import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import Link from 'next/link';
import { FolderPlus, LayoutGrid, Package, Snowflake, Tag, TicketPercent } from 'lucide-react';
import { ProductInformationForm } from '../components/ProductInformationForm';
import { CatalogImportPanel } from '../components/CatalogImportPanel';
import { DepartmentForm } from '../components/DepartmentForm';
import {
  PlatformChip,
  PlatformDetails,
  PlatformDisclosure,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformFacts,
  PlatformLinkButton,
  PlatformMeter,
  PlatformMetricGrid,
  PlatformPage,
  PlatformSearchParams,
  PlatformStatusBadge,
  PlatformSurface,
  PlatformTabs,
  PlatformToolbar,
  humanize,
  platformHref,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import { TaskButton } from '@/features/platform/components/TaskButton';
import { formatDate, formatMoney } from '@/features/platform/lib/format';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { updateCouponTask } from '@/features/platform/lib/taskActions';

const PATH = '/dashboard/platform/merchandising';

/** Redemption window at request time; this server screen renders once per request. */
function couponWindow(coupon: { validFrom?: string | null; validTo?: string | null }, now = Date.now()) {
  if (coupon.validTo && new Date(coupon.validTo).getTime() < now) return 'expired';
  if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now) return 'scheduled';
  return 'open';
}

export async function MerchandisingPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim();
  const filter = queryValue(params, 'filter') || 'all';
  const sort = queryValue(params, 'sort') || 'sort_order';
  let data: Awaited<ReturnType<typeof platformProjections.merchandising>> = null;
  let loadError: string | null = null;
  // Search, views and sort run on the server; departments and coupons page independently of each other's results.
  try { data = await platformProjections.merchandising(parsePageParam(params.page), 50, q, '', filter, sort); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load merchandising.'; }
  const currencyCode = data?.currencyCode || 'USD';
  const coupons = data?.coupons || [];
  const departments = data?.departments || [];
  const counts = data?.viewCounts;
  const isExhausted = (coupon: (typeof coupons)[number]) => coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses;
  const isExpired = (coupon: (typeof coupons)[number]) => couponWindow(coupon) === 'expired';
  const isScheduled = (coupon: (typeof coupons)[number]) => couponWindow(coupon) === 'scheduled';
  const couponView = ['active', 'inactive', 'exhausted'].includes(filter);
  const showDepartments = !couponView;
  const showCoupons = filter !== 'departments_inactive';
  const discountLabel = (coupon: (typeof coupons)[number]) => coupon.discountType === 'percentage' ? `${coupon.discountValue || 0}% off`
    : coupon.discountType === 'bogo' ? 'Buy one, get one'
    : coupon.discountType === 'fixed' ? `${formatMoney(coupon.discountValueCents, currencyCode)} off`
    : humanize(coupon.discountType);

  return (
    <PlatformPage
      title="Merchandising"
      description="Departments, coupons, product information and catalog imports."
      actions={<PlatformLinkButton href="/dashboard/platform/products" icon={Package}>Products</PlatformLinkButton>}
    >
      {counts ? <PlatformMetricGrid metrics={[
        { label: 'Active departments', value: counts.departments - counts.departments_inactive, note: `${counts.departments_inactive} hidden from the shop`, tone: counts.departments_inactive ? 'warning' : 'default', href: counts.departments_inactive ? platformHref(PATH, params, { filter: 'departments_inactive' }) : undefined },
        { label: 'Coupons', value: counts.coupons, note: q ? 'Matching your search' : 'All coupons' },
        { label: 'Active coupons', value: counts.active, note: 'Shoppers can use one coupon per order', href: platformHref(PATH, params, { filter: 'active' }) },
        { label: 'Used up', value: counts.exhausted, note: 'Reached their use limit', tone: counts.exhausted ? 'warning' : 'default', href: platformHref(PATH, params, { filter: 'exhausted' }) },
      ]} /> : null}

      {data ? (
        <PlatformDisclosure icon={FolderPlus} title="Add a department" description="Departments group products into aisles in the shop.">
          <DepartmentForm />
        </PlatformDisclosure>
      ) : null}

      {loadError ? <PlatformErrorState description={loadError} retryHref={PATH} /> : (
        <PlatformSurface
          icon={Tag}
          title="Departments and coupons"
          description="Expand a department to edit it, or a coupon to pause or activate it."
          tabs={<PlatformTabs path={PATH} params={params} active={filter} label="Merchandising view" tabs={[
            { value: 'all', label: 'Everything', count: counts ? counts.departments + counts.coupons : undefined },
            { value: 'active', label: 'Active coupons', count: counts?.active },
            { value: 'inactive', label: 'Inactive coupons', count: counts?.inactive },
            { value: 'exhausted', label: 'Used up', count: counts?.exhausted, tone: 'attention' },
            { value: 'departments_inactive', label: 'Hidden departments', count: counts?.departments_inactive, tone: 'attention' },
          ]} />}
        >
          <PlatformToolbar
            path={PATH}
            search={q}
            searchPlaceholder="Department, handle, coupon code, or department a coupon applies to"
            preserve={{ filter }}
            sort={sort}
            sortOptions={[{ value: 'sort_order', label: 'Display order / code' }, { value: 'name', label: 'Name A–Z' }, { value: 'products', label: 'Most products' }, { value: 'usage', label: 'Most coupon uses' }, { value: 'expiry', label: 'Coupon expiry soonest' }]}
            resultCount={(showDepartments ? data?.pagination.collections.departments?.total ?? 0 : 0) + (showCoupons ? data?.pagination.collections.coupons?.total ?? 0 : 0)}
          />
          <div className={`grid ${showDepartments && showCoupons ? 'xl:grid-cols-2 xl:divide-x' : ''}`}>
            {showDepartments ? (
              <section aria-label="Departments" className="min-w-0">
                <h3 className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:px-5"><LayoutGrid className="size-3.5" aria-hidden="true" />Departments <span className="tabular-nums">· {data?.pagination.collections.departments?.total ?? departments.length}</span></h3>
                {departments.length === 0 ? <PlatformEmptyState compact icon={LayoutGrid} title="No matching departments" description="Reset the current filters." /> : (
                  <div className="divide-y">
                    {departments.map((department) => (
                      <PlatformDetails key={department.id} summary={
                        <div className="flex items-center gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-background text-xs font-semibold tabular-nums text-muted-foreground" aria-label={`Display order ${department.sortOrder ?? 0}`}>{department.sortOrder ?? 0}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">{department.name}</p>
                              {department.isActive ? null : <PlatformStatusBadge status="inactive" label="Hidden" />}
                            </div>
                            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span className="font-mono">/{department.handle}</span>{department.temperatureZone ? <PlatformChip icon={Snowflake} className="capitalize">{humanize(department.temperatureZone)}</PlatformChip> : null}{department.requiredLicenses.length ? <PlatformChip>Requires {department.requiredLicenses.map(humanize).join(', ')} license</PlatformChip> : null}</p>
                          </div>
                          <p className="text-right text-sm font-semibold tabular-nums">{department.productCount}<span className="block text-xs font-normal text-muted-foreground">products</span></p>
                        </div>
                      }>
                        <DepartmentForm department={department} />
                      </PlatformDetails>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
            {showCoupons ? (
              <section aria-label="Coupons" className="min-w-0 border-t xl:border-t-0">
                <h3 className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:px-5"><TicketPercent className="size-3.5" aria-hidden="true" />Coupons <span className="tabular-nums">· {data?.pagination.collections.coupons?.total ?? coupons.length}</span></h3>
                {coupons.length === 0 ? <PlatformEmptyState compact icon={TicketPercent} title="No matching coupons" description="Reset the current filters." /> : (
                  <div className="divide-y">
                    {coupons.map((coupon) => {
                      const atLimit = isExhausted(coupon);
                      return (
                        <PlatformDetails key={coupon.id} summary={
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md border border-dashed bg-background px-1.5 py-0.5 font-mono text-sm font-semibold">{coupon.code}</span>
                                <PlatformStatusBadge status={atLimit ? 'failed' : !coupon.isActive ? 'inactive' : isExpired(coupon) ? 'expired' : isScheduled(coupon) ? 'pending' : 'active'} label={atLimit ? 'Use limit reached' : !coupon.isActive ? 'Paused' : isExpired(coupon) ? 'Expired' : isScheduled(coupon) ? 'Scheduled' : 'Active'} />
                                {!coupon.categoryRestrictionValid ? <PlatformStatusBadge status="failed" label="Needs repair" /> : null}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">Minimum {formatMoney(coupon.minPurchaseCents, currencyCode)} · until {formatDate(coupon.validTo, 'no end date')}</p>
                            </div>
                            <div className="w-24 shrink-0 text-right">
                              <p className="text-sm font-semibold tabular-nums">{discountLabel(coupon)}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">{coupon.currentUses}/{coupon.maxUses || '∞'} uses</p>
                            </div>
                          </div>
                        }>
                          <div className="space-y-4">
                            {coupon.maxUses > 0 ? <div className="max-w-xs"><p className="mb-1 text-xs text-muted-foreground tabular-nums">{coupon.currentUses} of {coupon.maxUses} uses</p><PlatformMeter value={coupon.currentUses} max={coupon.maxUses} label="Coupon usage" /></div> : null}
                            <PlatformFacts columns={2} items={[
                              { label: 'Valid from', value: formatDate(coupon.validFrom, 'No date') },
                              { label: 'Valid to', value: formatDate(coupon.validTo, 'No date') },
                              { label: 'Applies to departments', value: !coupon.categoryRestrictionValid ? <span className="text-destructive">Unreadable department list — shoppers can’t use this coupon until it’s fixed</span> : coupon.productCategories?.length ? coupon.productCategories.join(', ') : 'All departments', wide: true },
                            ]} />
                            {!coupon.categoryRestrictionValid ? <p className="text-xs text-muted-foreground"><Link className="font-medium underline underline-offset-2" href={`/dashboard/coupons/${encodeURIComponent(coupon.id)}`}>Fix the department list</Link> as a list of department handles, for example [&quot;produce&quot;, &quot;dairy&quot;].</p> : null}
                            <TaskButton variant={coupon.isActive ? 'secondary' : 'primary'} size="md" label={coupon.isActive ? 'Pause coupon' : 'Activate coupon'} successLabel={coupon.isActive ? 'Coupon paused' : 'Coupon activated'} onRun={updateCouponTask.bind(null, coupon.id, !coupon.isActive)} />
                          </div>
                        </PlatformDetails>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </div>
          <PlatformPageLinks pagination={data?.pagination} path={PATH} searchParams={params} />
        </PlatformSurface>
      )}

      <ProductInformationForm />
      <CatalogImportPanel />
    </PlatformPage>
  );
}

export default MerchandisingPage;
