import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const FULFILLMENT_QUERY = gql`
  query GroceryFulfillmentBoard {
    picking: orders(where: { status: { equals: picking } }, orderBy: { createdAt: asc }, take: 20) {
      id
      displayId
      email
      deliveryTimeWindow
      lineItems { id quantity title }
    }
    packed: orders(where: { status: { equals: packed } }, orderBy: { updatedAt: desc }, take: 20) {
      id
      displayId
      email
      deliveryTimeWindow
      lineItems { id quantity title }
    }
    pending: orders(where: { status: { equals: pending } }, orderBy: { createdAt: asc }, take: 20) {
      id
      displayId
      email
      lineItems { id quantity title }
    }
  }
`;

export async function FulfillmentPage() {
  const response = await keystoneClient<any>(FULFILLMENT_QUERY);
  const data = response.success ? response.data : { pending: [], picking: [], packed: [] };

  const columns = [
    { title: 'Pending', items: data.pending || [] },
    { title: 'Picking', items: data.picking || [] },
    { title: 'Packed', items: data.packed || [] },
  ];

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Fulfillment' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Fulfillment Board</h1>
      <p className="text-sm text-muted-foreground">A simple picking and packing board to move Grocery beyond model CRUD.</p>
    </div>
  );

  return (
    <PageContainer title="Fulfillment" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6">
        <div className="grid gap-4 xl:grid-cols-3">
          {columns.map((column) => (
            <section key={column.title} className="rounded-2xl border bg-background shadow-sm overflow-hidden">
              <div className="border-b px-4 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{column.title}</h2>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{column.items.length}</span>
                </div>
              </div>
              <div className="divide-y">
                {column.items.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-muted-foreground">No orders in this lane.</div>
                ) : (
                  column.items.map((order: any) => (
                    <div key={order.id} className="px-4 py-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">Order #{order.displayId}</p>
                        <span className="text-xs text-muted-foreground">{order.lineItems?.length || 0} items</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{order.email}</p>
                      <p className="text-xs text-muted-foreground">Window: {order.deliveryTimeWindow || '—'}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(order.lineItems || []).slice(0, 3).map((item: any) => (
                          <span key={item.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                            {item.quantity}× {item.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}

export default FulfillmentPage;
