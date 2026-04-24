import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const DELIVERY_QUERY = gql`
  query GroceryDeliveryBoard {
    deliveryRoutes(orderBy: { date: desc }, take: 20) {
      id
      date
      timeWindow
      status
      startedAt
      completedAt
      driver { id name email }
      orders { id displayId status }
    }
  }
`;

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export async function DeliveryPage() {
  const response = await keystoneClient<any>(DELIVERY_QUERY);
  const routes = response.success ? response.data?.deliveryRoutes || [] : [];

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Delivery' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Delivery Operations</h1>
      <p className="text-sm text-muted-foreground">Dispatch-oriented visibility into routes, drivers, and assigned grocery orders.</p>
    </div>
  );

  return (
    <PageContainer title="Delivery" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6">
        <div className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Routes</h2>
            <p className="text-sm text-muted-foreground">Use this board to inspect which grocery orders are assigned to delivery runs.</p>
          </div>
          {routes.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No delivery routes found.</div>
          ) : (
            <div className="divide-y">
              {routes.map((route: any) => (
                <div key={route.id} className="px-4 py-4 md:px-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{route.timeWindow}</span>
                      <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                        {route.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">Scheduled: {formatDate(route.date)}</p>
                    <p className="text-sm text-muted-foreground">
                      Driver: {route.driver?.name || route.driver?.email || 'Unassigned'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Started: {formatDate(route.startedAt)} · Completed: {formatDate(route.completedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Assigned orders</p>
                    <div className="flex flex-wrap gap-2">
                      {(route.orders || []).length === 0 ? (
                        <span className="text-sm text-muted-foreground">No assigned orders yet.</span>
                      ) : (
                        route.orders.map((order: any) => (
                          <span key={order.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                            #{order.displayId} · {order.status}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

export default DeliveryPage;
