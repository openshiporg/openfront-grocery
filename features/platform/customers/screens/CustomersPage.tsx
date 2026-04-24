import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const CUSTOMERS_QUERY = gql`
  query GroceryCustomersPage {
    users(orderBy: { createdAt: desc }, take: 25) {
      id
      name
      email
      onboardingStatus
      createdAt
    }
    totalCustomers: usersCount
    activeSubscriptions: subscriptionsCount(where: { isActive: { equals: true } })
    savedCarts: cartsCount(where: { itemCount: { gt: 0 } })
  }
`;

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export async function CustomersPage() {
  const response = await keystoneClient<any>(CUSTOMERS_QUERY);
  const data = response.success ? response.data : null;
  const customers = data?.users || [];

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Customers' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Customer Overview</h1>
      <p className="text-sm text-muted-foreground">A higher-signal look at grocery customers, lifecycle readiness, and repeat-order potential.</p>
    </div>
  );

  const metrics = [
    { label: 'Customers', value: data?.totalCustomers ?? 0 },
    { label: 'Active subscriptions', value: data?.activeSubscriptions ?? 0 },
    { label: 'Open carts', value: data?.savedCarts ?? 0 },
  ];

  return (
    <PageContainer title="Customers" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6 space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border bg-background p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Recent customers</h2>
          </div>
          {customers.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No customers found.</div>
          ) : (
            <div className="divide-y">
              {customers.map((customer: any) => (
                <div key={customer.id} className="px-4 py-4 md:px-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-sm text-muted-foreground">{customer.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{customer.onboardingStatus || 'not_started'}</p>
                    <p className="text-xs text-muted-foreground">Joined {formatDate(customer.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

export default CustomersPage;
