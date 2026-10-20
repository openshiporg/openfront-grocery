import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import Link from 'next/link';
import { ClipboardList, ExternalLink, UserPlus, Users } from 'lucide-react';
import {
  PlatformCellLabel,
  PlatformDetails,
  PlatformDisclosure,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformFacts,
  PlatformList,
  PlatformListHeader,
  PlatformMetricGrid,
  PlatformPage,
  PlatformSearchParams,
  PlatformSurface,
  PlatformTabs,
  PlatformToolbar,
  humanize,
  platformButton,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { formatDate, formatRelative } from '@/features/platform/lib/format';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { ProvisionCustomerForm } from '@/features/platform/customers/components/ProvisionCustomerForm';
import { parsePageParam } from '@/features/platform/lib/pageParams';

const PATH = '/dashboard/platform/customers';
const rowGrid = 'md:grid md:grid-cols-[minmax(0,1.5fr)_8.5rem_5rem_minmax(0,1fr)_6.5rem] md:items-center md:gap-3';

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export async function CustomersPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim();
  const filter = queryValue(params, 'filter') || 'all';
  const sort = queryValue(params, 'sort') || 'newest';
  let data: Awaited<ReturnType<typeof platformProjections.customers>> = null;
  let loadError: string | null = null;
  // Search, filter and sort run on the server across every customer.
  try { data = await platformProjections.customers(parsePageParam(params.page), 50, q, '', filter, sort); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load customers.'; }
  const customers = data?.users || [];

  return (
    <PlatformPage
      title="Customers"
      description="Find shopper accounts and their orders, and create accounts for customers."
    >
      {data ? <PlatformMetricGrid metrics={[
        { label: 'Customer accounts', value: data.allCustomers, note: 'Shoppers in this store' },
        { label: 'Customers with orders', value: data.customersWithOrders, note: 'At least one order' },
        { label: 'Open carts', value: data.savedCarts, note: 'Carts with at least one item' },
      ]} /> : null}

      {data ? (
        <PlatformDisclosure icon={UserPlus} title="Provision a customer" description="Create a shopper account with a temporary password. Share it only through a private channel.">
          <ProvisionCustomerForm />
        </PlatformDisclosure>
      ) : null}

      {loadError ? <PlatformErrorState description={loadError} retryHref={PATH} /> : (
        <PlatformSurface
          icon={Users}
          title="Customer directory"
          description="Shopper accounts and their order activity."
          tabs={<PlatformTabs path={PATH} params={params} active={filter} label="Order activity" tabs={[
            { value: 'all', label: 'All customers', count: filter === 'all' ? data?.totalCustomers : undefined },
            { value: 'with_orders', label: 'With orders', count: filter === 'with_orders' ? data?.totalCustomers : undefined },
            { value: 'without_orders', label: 'No orders yet', count: filter === 'without_orders' ? data?.totalCustomers : undefined },
          ]} />}
        >
          <PlatformToolbar
            path={PATH}
            search={q}
            searchPlaceholder="Name or email"
            preserve={{ filter }}
            sort={sort}
            sortOptions={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Name A–Z' }]}
            resultCount={data?.totalCustomers ?? 0}
            resultLabel="matching customers"
          />
          {customers.length === 0 ? (
            <PlatformEmptyState icon={Users} title={q || filter !== 'all' ? 'No matching customers' : 'No customers yet'} description={q || filter !== 'all' ? 'Clear the search or choose All customers.' : 'Provision the first customer account above.'} />
          ) : (
            <>
              <PlatformListHeader className={rowGrid}>
                <span>Customer</span><span>Lists</span><span className="text-right">Orders</span><span>Last order</span><span className="text-right">Joined</span>
              </PlatformListHeader>
              <PlatformList>
                {customers.map((customer) => (
                  <PlatformDetails key={customer.id} summary={
                    <div className={`grid gap-1.5 ${rowGrid}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{initials(customer.name, customer.email)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{customer.name || 'Unnamed shopper'}</p>
                          <p className="truncate text-xs text-muted-foreground">{customer.email}</p>
                        </div>
                      </div>
                      <p className="text-sm tabular-nums"><PlatformCellLabel>Shopping lists</PlatformCellLabel>{customer.shoppingListCount}<span className="text-xs text-muted-foreground"> {customer.shoppingListCount === 1 ? 'list' : 'lists'}</span></p>
                      <p className="text-sm tabular-nums md:text-right"><PlatformCellLabel>Orders</PlatformCellLabel>{customer.orderCount}<span className="text-xs text-muted-foreground md:hidden"> orders · {customer.shoppingListCount} lists</span></p>
                      <p className="hidden truncate text-xs text-muted-foreground md:block"><PlatformCellLabel>Last order</PlatformCellLabel>{customer.lastOrder ? <>#{customer.lastOrder.displayId} · <span className="capitalize">{humanize(customer.lastOrder.status)}</span></> : 'No retained orders'}</p>
                      <p className="hidden text-right text-xs text-muted-foreground md:block" title={formatDate(customer.createdAt)}><PlatformCellLabel>Joined</PlatformCellLabel>{formatRelative(customer.createdAt)}</p>
                    </div>
                  }>
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                      <PlatformFacts columns={4} items={[
                        { label: 'Joined', value: formatDate(customer.createdAt) },
                        { label: 'Orders', value: customer.orderCount },
                        { label: 'Shopping lists', value: customer.shoppingListCount },
                        { label: 'Last order', value: customer.lastOrder ? <>#{customer.lastOrder.displayId} · <span className="capitalize">{humanize(customer.lastOrder.status)}</span> · {formatDate(customer.lastOrder.createdAt)}</> : 'No retained orders' },
                        { label: 'Account ID', value: customer.id, mono: true, wide: true },
                      ]} />
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/dashboard/platform/orders?q=${encodeURIComponent(customer.email)}&filter=all`} className={platformButton('secondary', 'sm')}><ClipboardList aria-hidden="true" />Find orders</Link>
                        <Link href={`/dashboard/platform/customers/${customer.id}`} className={platformButton('ghost', 'sm')}><ExternalLink aria-hidden="true" />View customer</Link>
                      </div>
                    </div>
                  </PlatformDetails>
                ))}
              </PlatformList>
            </>
          )}
          <PlatformPageLinks pagination={data?.pagination} path={PATH} searchParams={params} />
        </PlatformSurface>
      )}
    </PlatformPage>
  );
}

export default CustomersPage;
