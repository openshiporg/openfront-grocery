import Link from 'next/link';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformDetails, PlatformEmptyState, PlatformErrorState, PlatformMetricGrid, PlatformSearchParams, PlatformStatusBadge, PlatformSurface, PlatformToolbar, PlatformTruthNotice, queryValue } from '@/features/platform/components/PlatformPrimitives';
import { TaskButton } from '@/features/platform/components/TaskButton';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { updateSupplierTask } from '@/features/platform/lib/taskActions';

function money(cents = 0, currencyCode = 'USD') { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(cents / 100); }

export async function SuppliersPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim().toLowerCase();
  const filter = queryValue(params, 'filter') || 'all';
  const sort = queryValue(params, 'sort') || 'name';
  let data: Awaited<ReturnType<typeof platformProjections.suppliers>> = null;
  let loadError: string | null = null;
  try { data = await platformProjections.suppliers(); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load suppliers.'; }
  const currencyCode = data?.currencyCode || 'USD';
  const all = data?.suppliers || [];
  const suppliers = [...all]
    .filter((supplier) => !q || [supplier.name, supplier.contactName, supplier.email, supplier.phone, ...(supplier.deliveryDays || [])].some((value) => value?.toLowerCase().includes(q)))
    .filter((supplier) => filter === 'all' || (filter === 'open_po' ? supplier.purchaseOrders.some((po) => !['received', 'cancelled'].includes(po.status || '')) : filter === 'no_products' ? supplier.products.length === 0 : supplier.paymentTerms === filter))
    .sort((a, b) => sort === 'minimum' ? b.minimumOrderCents - a.minimumOrderCents : sort === 'products' ? b.products.length - a.products.length : a.name.localeCompare(b.name));
  const openPOs = all.reduce((sum, supplier) => sum + supplier.purchaseOrders.filter((po) => !['received', 'cancelled'].includes(po.status || '')).length, 0);
  const unlinked = all.filter((supplier) => supplier.products.length === 0).length;
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Suppliers' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1><p className="mt-1 text-sm text-muted-foreground">Review contacts, ordering terms, product dependency, and purchase-order exposure.</p></div>;

  return <PageContainer title="Suppliers" header={header} breadcrumbs={breadcrumbs}><div className="space-y-5 px-4 pb-8 md:px-6">
    <PlatformMetricGrid metrics={[{ label: 'Suppliers', value: all.length, note: 'Store-owned vendor records' }, { label: 'Open purchase orders', value: openPOs, note: 'Not received or cancelled' }, { label: 'Linked products', value: all.reduce((sum, supplier) => sum + supplier.products.length, 0), note: 'Relationship count, not unique catalog size' }, { label: 'No linked products', value: unlinked, note: 'Supplier setup may be incomplete', tone: unlinked ? 'warning' : 'default' }]} />
    <PlatformTruthNotice title="Procurement boundary">Supplier terms and minimums are reference facts. Drafting and receiving happen in Purchasing; invoices, three-way match, discrepancies, credits, and AP export are not implemented.</PlatformTruthNotice>
    <PlatformToolbar search={q} searchPlaceholder="Supplier, contact, email, phone, or delivery day" filter={filter} filterLabel="Supplier state" filterOptions={[{ value: 'all', label: 'All suppliers' }, { value: 'open_po', label: 'Has open PO' }, { value: 'no_products', label: 'No linked products' }, { value: 'net_30', label: 'Net 30 terms' }]} sort={sort} sortOptions={[{ value: 'name', label: 'Name A–Z' }, { value: 'minimum', label: 'Highest minimum' }, { value: 'products', label: 'Most linked products' }]} resultCount={suppliers.length} />
    {loadError ? <PlatformErrorState description={loadError} /> : <PlatformSurface title="Supplier roster" description="Expand a supplier for commercial terms, contacts, and truthful next actions." action={<Link href="/dashboard/platform/purchasing" className="inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open purchasing</Link>}>
      {suppliers.length === 0 ? <PlatformEmptyState title="No matching suppliers" description="Reset the filters or add supplier records through the diagnostic model." /> : <div className="divide-y">{suppliers.map((supplier) => {
        const open = supplier.purchaseOrders.filter((po) => !['received', 'cancelled'].includes(po.status || '')).length;
        return <PlatformDetails key={supplier.id} summary={<div className="grid gap-3 px-4 py-4 hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:px-5"><div className="min-w-0"><p className="truncate font-medium">{supplier.name}</p><p className="truncate text-sm text-muted-foreground">{supplier.contactName || 'No named contact'} · {supplier.email || 'No email'}</p></div><PlatformStatusBadge status={open ? 'processing' : 'active'} label={open ? `${open} open PO${open === 1 ? '' : 's'}` : 'No open POs'} /><div className="text-sm md:text-right"><p className="font-medium tabular-nums">{money(supplier.minimumOrderCents, currencyCode)}</p><p className="text-xs text-muted-foreground">minimum order</p></div></div>}>
          <div className="grid gap-5 lg:grid-cols-[1fr_auto]"><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Phone</dt><dd className="mt-1 font-medium">{supplier.phone || 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Payment terms</dt><dd className="mt-1 font-medium">{supplier.paymentTerms || 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Delivery days</dt><dd className="mt-1 font-medium">{supplier.deliveryDays?.join(', ') || 'Not recorded'}</dd></div><div><dt className="text-xs text-muted-foreground">Relationships</dt><dd className="mt-1 font-medium">{supplier.products.length} products · {supplier.purchaseOrders.length} POs</dd></div></dl><details className="relative"><summary className="cursor-pointer list-none rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">Actions</summary><div className="mt-2 flex min-w-44 flex-col items-start gap-2 rounded-lg border bg-background p-2 shadow-sm"><Link href={`/dashboard/platform/purchasing?q=${encodeURIComponent(supplier.name)}`} className="w-full rounded px-2 py-1.5 text-xs font-medium hover:bg-muted">View purchase orders</Link>{supplier.paymentTerms !== 'net_30' ? <TaskButton label="Set terms to Net 30" onRun={updateSupplierTask.bind(null, supplier.id, 'net_30')} /> : <span className="px-2 py-1 text-xs text-muted-foreground">Terms already Net 30</span>}<Link href={`/dashboard/suppliers/${supplier.id}`} className="w-full rounded px-2 py-1.5 text-xs font-medium hover:bg-muted">Open diagnostic model</Link></div></details></div>
        </PlatformDetails>;
      })}</div>}
    </PlatformSurface>}
  </div></PageContainer>;
}

export default SuppliersPage;
