import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import Link from 'next/link';
import { ExternalLink, Factory, FileText, Mail, Phone, ShoppingCart } from 'lucide-react';
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
  PlatformMetricGrid,
  PlatformPage,
  PlatformSearchParams,
  PlatformStatusBadge,
  PlatformSurface,
  PlatformTabs,
  PlatformToolbar,
  platformButton,
  platformHref,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { formatMoney } from '@/features/platform/lib/format';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import { SupplierCommercialTerms } from '../components/SupplierCommercialTerms';

const PATH = '/dashboard/platform/suppliers';
const rowGrid = 'md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_7rem_7.5rem] md:items-center md:gap-3';
// Delivery days are stored as mon…sun codes.
const weekdayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const weekdayNames: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const termsLabels: Record<string, string> = { net_30: 'Net 30', net_60: 'Net 60', cod: 'Cash on delivery' };

export async function SuppliersPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim();
  const filter = queryValue(params, 'filter') || 'all';
  const sort = queryValue(params, 'sort') || 'name';
  let data: Awaited<ReturnType<typeof platformProjections.suppliers>> = null;
  let loadError: string | null = null;
  // Search, filter and sort run on the server across every supplier.
  try { data = await platformProjections.suppliers(parsePageParam(params.page), 50, q, '', filter, sort); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load suppliers.'; }
  const currencyCode = data?.currencyCode || 'USD';
  const suppliers = data?.suppliers || [];
  const counts = data?.viewCounts;

  return (
    <PlatformPage
      title="Suppliers"
      description="Supplier contacts, payment terms, minimum orders and delivery days."
      actions={<PlatformLinkButton href="/dashboard/platform/purchasing" icon={ShoppingCart}>Open purchasing</PlatformLinkButton>}
    >
      {data && counts ? <PlatformMetricGrid metrics={[
        { label: 'Suppliers', value: counts.all, note: q ? 'Matching your search' : 'In this store' },
        { label: 'Open purchase orders', value: data.openPurchaseOrders, note: 'Not yet received or cancelled', tone: data.openPurchaseOrders ? 'warning' : 'default', href: platformHref('/dashboard/platform/purchasing', {}, { filter: 'open' }) },
        { label: 'Suppliers with open orders', value: counts.open_po, note: q ? 'Matching your search' : 'In this store', href: platformHref(PATH, params, { filter: 'open_po' }) },
        { label: 'No linked products', value: counts.no_products, note: 'Link products to order from this supplier', tone: counts.no_products ? 'warning' : 'default', href: platformHref(PATH, params, { filter: 'no_products' }) },
      ]} /> : null}

      {loadError ? <PlatformErrorState description={loadError} retryHref={PATH} /> : (
        <PlatformSurface
          icon={Factory}
          title="Supplier roster"
          description="Expand a supplier for contacts, commercial terms and next actions."
          tabs={<PlatformTabs path={PATH} params={params} active={filter} label="Supplier state" tabs={[
            { value: 'all', label: 'All', count: counts?.all },
            { value: 'open_po', label: 'Open POs', count: counts?.open_po },
            { value: 'no_products', label: 'No products', count: counts?.no_products, tone: 'attention' },
            { value: 'net_30', label: 'Net 30', count: counts?.net_30 },
            { value: 'net_60', label: 'Net 60', count: counts?.net_60 },
            { value: 'cod', label: 'Cash on delivery', count: counts?.cod },
          ]} />}
        >
          <PlatformToolbar
            path={PATH}
            search={q}
            searchPlaceholder="Supplier, contact, email, phone, or delivery day"
            preserve={{ filter }}
            sort={sort}
            sortOptions={[{ value: 'name', label: 'Name A–Z' }, { value: 'minimum', label: 'Highest minimum' }, { value: 'products', label: 'Most linked products' }]}
            resultCount={data?.pagination.collections.suppliers?.total ?? suppliers.length}
          />
          {suppliers.length === 0 ? (
            <PlatformEmptyState icon={Factory} title="No matching suppliers" description="Reset the filters, or add a supplier." action={<Link href="/dashboard/suppliers/create" className={platformButton('secondary', 'sm')}>Add supplier</Link>} />
          ) : (
            <>
              <PlatformListHeader className={rowGrid}>
                <span>Supplier</span><span>Delivery days</span><span className="text-right">Products</span><span className="text-right">Minimum</span><span className="text-right">Purchase orders</span>
              </PlatformListHeader>
              <PlatformList>
                {suppliers.map((supplier) => {
                  const open = supplier.openPurchaseOrderCount;
                  const days = [...(supplier.deliveryDays || [])].sort((a, b) => weekdayOrder.indexOf(a.toLowerCase()) - weekdayOrder.indexOf(b.toLowerCase()));
                  const dayName = (day: string) => weekdayNames[day.toLowerCase()] || day;
                  return (
                    <PlatformDetails key={supplier.id} summary={
                      <div className={`grid gap-1.5 ${rowGrid}`}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{supplier.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{supplier.contactName || 'No named contact'} · {supplier.email || 'No email'}</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <PlatformCellLabel>Delivery days</PlatformCellLabel>
                          {days.length ? days.map((day) => <PlatformChip key={day}>{dayName(day).slice(0, 3)}</PlatformChip>) : <span className="text-xs text-muted-foreground">Not recorded</span>}
                        </div>
                        <p className={`text-sm tabular-nums md:text-right ${supplier.productCount ? '' : 'text-amber-700 dark:text-amber-400'}`}><PlatformCellLabel>Linked products</PlatformCellLabel>{supplier.productCount}<span className="text-xs text-muted-foreground md:hidden"> products</span></p>
                        <p className="hidden text-sm font-medium tabular-nums md:block md:text-right"><PlatformCellLabel>Minimum order</PlatformCellLabel>{formatMoney(supplier.minimumOrderCents, currencyCode)}</p>
                        <div className="md:flex md:justify-end"><PlatformCellLabel>Purchase orders</PlatformCellLabel><PlatformStatusBadge status={open ? 'processing' : 'active'} label={open ? `${open} open` : 'None open'} /></div>
                      </div>
                    }>
                      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                        <PlatformFacts columns={4} items={[
                          { label: 'Contact', value: supplier.contactName || 'Not recorded' },
                          { label: 'Email', value: supplier.email ? <a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={`mailto:${supplier.email}`}><Mail className="size-3.5" aria-hidden="true" />{supplier.email}</a> : 'Not recorded' },
                          { label: 'Phone', value: supplier.phone ? <a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={`tel:${supplier.phone}`}><Phone className="size-3.5" aria-hidden="true" />{supplier.phone}</a> : 'Not recorded' },
                          { label: 'Payment terms', value: supplier.paymentTerms ? termsLabels[supplier.paymentTerms] || supplier.paymentTerms : 'Not recorded' },
                          { label: 'Minimum order', value: formatMoney(supplier.minimumOrderCents, currencyCode) },
                          { label: 'Delivery days', value: days.map(dayName).join(', ') || 'Not recorded' },
                          { label: 'Linked products', value: supplier.productCount },
                          { label: 'Purchase orders', value: `${supplier.purchaseOrderCount} total · ${open} open` },
                        ]} />
                        <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-xs">
                          <p className="text-xs font-medium text-muted-foreground">Actions</p>
                          <SupplierCommercialTerms supplierId={supplier.id} paymentTerms={supplier.paymentTerms} minimumOrderCents={supplier.minimumOrderCents} currencyCode={currencyCode} />
                          <Link href={platformHref('/dashboard/platform/purchasing', {}, { supplier: supplier.id, filter: 'all' })} className={platformButton('secondary', 'sm', 'justify-start')}><FileText aria-hidden="true" />View purchase orders</Link>
                          <Link href={`/dashboard/suppliers/${supplier.id}`} className={platformButton('ghost', 'sm', 'justify-start')}><ExternalLink aria-hidden="true" />Edit supplier</Link>
                        </div>
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
    </PlatformPage>
  );
}

export default SuppliersPage;
