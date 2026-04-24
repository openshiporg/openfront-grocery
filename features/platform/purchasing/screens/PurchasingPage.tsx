import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const PURCHASING_QUERY = gql`
  query GroceryPurchasingPage {
    purchaseOrders(orderBy: { orderDate: desc }, take: 20) {
      id
      poNumber
      orderDate
      expectedDeliveryDate
      status
      totalAmount
      supplier { id name }
      items { id quantity unitCost }
    }
  }
`;

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export async function PurchasingPage() {
  const response = await keystoneClient<any>(PURCHASING_QUERY);
  const orders = response.success ? response.data?.purchaseOrders || [] : [];

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Purchasing' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Purchasing</h1>
      <p className="text-sm text-muted-foreground">Track open POs, inbound timing, and supplier order volume from a grocery ops lens.</p>
    </div>
  );

  return (
    <PageContainer title="Purchasing" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6">
        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Purchase orders</h2>
          </div>
          {orders.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No purchase orders found.</div>
          ) : (
            <div className="divide-y">
              {orders.map((order: any) => (
                <div key={order.id} className="px-4 py-4 md:px-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium">{order.poNumber}</p>
                    <p className="text-sm text-muted-foreground">{order.supplier?.name || 'No supplier assigned'}</p>
                    <p className="text-xs text-muted-foreground">Ordered {formatDate(order.orderDate)} · ETA {formatDate(order.expectedDeliveryDate)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs lg:justify-end">
                    <span className="rounded-full border px-2.5 py-1 uppercase tracking-wide">{order.status}</span>
                    <span className="rounded-full border px-2.5 py-1">${order.totalAmount || 0}</span>
                    <span className="rounded-full border px-2.5 py-1">Items: {order.items?.length || 0}</span>
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

export default PurchasingPage;
