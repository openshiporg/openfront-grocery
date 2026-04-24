import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const SUPPLIERS_QUERY = gql`
  query GrocerySuppliersPage {
    suppliers(orderBy: { createdAt: desc }, take: 20) {
      id
      name
      contactName
      email
      paymentTerms
      deliveryDays
      minimumOrder
      products { id }
      purchaseOrders { id status }
    }
  }
`;

export async function SuppliersPage() {
  const response = await keystoneClient<any>(SUPPLIERS_QUERY);
  const suppliers = response.success ? response.data?.suppliers || [] : [];

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Suppliers' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Supplier Network</h1>
      <p className="text-sm text-muted-foreground">Vendor relationships, delivery cadence, and replenishment dependency at a glance.</p>
    </div>
  );

  return (
    <PageContainer title="Suppliers" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6">
        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Supplier roster</h2>
          </div>
          {suppliers.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No suppliers found.</div>
          ) : (
            <div className="divide-y">
              {suppliers.map((supplier: any) => (
                <div key={supplier.id} className="px-4 py-4 md:px-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <p className="font-medium">{supplier.name}</p>
                    <p className="text-sm text-muted-foreground">{supplier.contactName || 'No contact'} · {supplier.email}</p>
                    <p className="text-xs text-muted-foreground">Delivery days: {(supplier.deliveryDays || []).join(', ') || '—'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end text-xs">
                    <span className="rounded-full border px-2.5 py-1">Terms: {supplier.paymentTerms || '—'}</span>
                    <span className="rounded-full border px-2.5 py-1">Min: ${supplier.minimumOrder || 0}</span>
                    <span className="rounded-full border px-2.5 py-1">Products: {supplier.products?.length || 0}</span>
                    <span className="rounded-full border px-2.5 py-1">POs: {supplier.purchaseOrders?.length || 0}</span>
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

export default SuppliersPage;
