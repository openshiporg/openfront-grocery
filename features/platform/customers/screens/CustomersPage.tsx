import Link from 'next/link';
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
import { provisionCustomerTask } from '@/features/platform/lib/taskActions';

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : '—';
}

export async function CustomersPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim().toLowerCase();
  const filter = queryValue(params, 'filter') || 'all';
  const sort = queryValue(params, 'sort') || 'newest';
  let data: Awaited<ReturnType<typeof platformProjections.customers>> = null;
  let loadError: string | null = null;
  try { data = await platformProjections.customers(); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load customers.'; }
  const customers = [...(data?.users || [])]
    .filter((customer) => !q || customer.name.toLowerCase().includes(q) || customer.email.toLowerCase().includes(q))
    .filter((customer) => filter === 'all' || (filter === 'initialized' ? customer.onboardingStatus === 'completed' : customer.onboardingStatus !== 'completed'))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const initialized = (data?.users || []).filter((customer) => customer.onboardingStatus === 'completed').length;
  const orderingCustomers = (data?.users || []).filter((customer) => customer.orderCount > 0).length;
  const shoppingLists = (data?.users || []).reduce((sum, customer) => sum + customer.shoppingListCount, 0);

  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Customers' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Customers</h1><p className="mt-1 text-sm text-muted-foreground">Provision shoppers and find account records without opening staff role or public-signup paths.</p></div>;

  return <PageContainer title="Customers" header={header} breadcrumbs={breadcrumbs}>
    <div className="space-y-5 px-4 pb-8 md:px-6">
      <PlatformMetricGrid metrics={[
        { label: 'Customer accounts', value: data?.totalCustomers || 0, note: 'Store-scoped shoppers' },
        { label: 'Customers with orders', value: orderingCustomers, note: 'At least one retained order' },
        { label: 'Open carts', value: data?.savedCarts || 0, note: 'Carts with at least one item' },
        { label: 'Shopping lists', value: shoppingLists, note: `${initialized} initialized profiles` },
      ]} />
      <PlatformTruthNotice title="Account boundary">Public signup is closed. Provisioning creates a shopper without a staff role; the temporary password must be shared through an approved private channel.</PlatformTruthNotice>

      <PlatformDetails
        className="rounded-xl border bg-background"
        summary={<div className="flex items-center justify-between gap-4 px-4 py-4 md:px-5"><div><p className="font-semibold">Provision a customer</p><p className="mt-1 text-sm text-muted-foreground">Create a real Store-owned shopper account.</p></div><span className="text-xs font-medium text-muted-foreground">Open form</span></div>}
      >
        <form action={provisionCustomerTask} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">Name<input name="name" required minLength={2} maxLength={120} autoComplete="name" className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">Email<input name="email" required type="email" autoComplete="email" className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">Temporary password<input name="temporaryPassword" required type="password" minLength={12} maxLength={200} autoComplete="new-password" className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <button type="submit" className="mt-auto h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Provision customer</button>
        </form>
      </PlatformDetails>

      <PlatformToolbar search={q} searchPlaceholder="Name or email" filter={filter} filterLabel="Profile" filterOptions={[{ value: 'all', label: 'All customers' }, { value: 'initialized', label: 'Initialized' }, { value: 'incomplete', label: 'Needs profile completion' }]} sort={sort} sortOptions={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Name A–Z' }]} resultCount={customers.length} />

      {loadError ? <PlatformErrorState description={loadError} /> : <PlatformSurface title="Customer directory" description="This bounded view contains account identity and profile readiness; order/payment evidence remains in Orders.">
        {customers.length === 0 ? <PlatformEmptyState title="No matching customers" description="Reset the filters or provision the first customer account." /> : <div className="divide-y">{customers.map((customer) => <PlatformDetails key={customer.id} summary={<div className="grid gap-2 px-4 py-4 hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:px-5"><div className="min-w-0"><p className="truncate font-medium">{customer.name}</p><p className="truncate text-sm text-muted-foreground">{customer.email}</p></div><PlatformStatusBadge status={customer.onboardingStatus === 'completed' ? 'completed' : 'pending'} label={customer.onboardingStatus === 'completed' ? 'Profile ready' : 'Profile incomplete'} /><span className="text-xs text-muted-foreground">{customer.orderCount} orders · {customer.shoppingListCount} lists</span></div>}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs text-muted-foreground">Joined {formatDate(customer.createdAt)}</p><p className="mt-1 text-sm font-medium">{customer.lastOrder ? `Last order #${customer.lastOrder.displayId} · ${customer.lastOrder.status.replaceAll('_', ' ')} · ${formatDate(customer.lastOrder.createdAt)}` : 'No retained orders'}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{customer.id}</p></div><div className="flex flex-wrap gap-2"><Link href={`/dashboard/users/${customer.id}`} className="inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open diagnostic model</Link><Link href={`/dashboard/platform/orders?q=${encodeURIComponent(customer.email)}&filter=all`} className="inline-flex min-h-9 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Find recent orders</Link></div></div>
        </PlatformDetails>)}</div>}
      </PlatformSurface>}
    </div>
  </PageContainer>;
}

export default CustomersPage;
