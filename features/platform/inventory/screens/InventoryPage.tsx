import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const INVENTORY_QUERY = gql`
  query GroceryInventoryPage {
    products(orderBy: { updatedAt: desc }, take: 20) {
      id
      title
      sku
      stockQuantity
      lowStockThreshold
      inStock
      department
      supplier { id name }
    }
    inventoryLots(orderBy: { expirationDate: asc }, take: 20) {
      id
      lotNumber
      expirationDate
      quantityRemaining
      location
      product { id title }
      supplier { id name }
    }
  }
`;

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export async function InventoryPage() {
  const response = await keystoneClient<any>(INVENTORY_QUERY);
  const data = response.success ? response.data : { products: [], inventoryLots: [] };

  const lowStockProducts = (data.products || []).filter(
    (product: any) => typeof product.stockQuantity === 'number' && typeof product.lowStockThreshold === 'number' && product.stockQuantity <= product.lowStockThreshold
  );

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Inventory' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Inventory Control</h1>
      <p className="text-sm text-muted-foreground">Watch low-stock exposure and lot freshness from an operator surface instead of raw model tables.</p>
    </div>
  );

  return (
    <PageContainer title="Inventory" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Low stock watchlist</h2>
          </div>
          <div className="divide-y">
            {lowStockProducts.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No low-stock products right now.</div>
            ) : (
              lowStockProducts.map((product: any) => (
                <div key={product.id} className="px-4 py-4 md:px-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{product.title}</p>
                    <p className="text-sm text-muted-foreground">{product.sku || 'No SKU'} · {product.department || 'No department'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{product.stockQuantity}</p>
                    <p className="text-xs text-muted-foreground">threshold {product.lowStockThreshold}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Lot freshness</h2>
          </div>
          <div className="divide-y">
            {(data.inventoryLots || []).length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No inventory lots found.</div>
            ) : (
              data.inventoryLots.map((lot: any) => (
                <div key={lot.id} className="px-4 py-4 md:px-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{lot.product?.title || 'Unknown product'}</p>
                    <p className="text-sm text-muted-foreground">Lot {lot.lotNumber} · {lot.location || 'No location'}</p>
                    <p className="text-xs text-muted-foreground">Supplier: {lot.supplier?.name || 'Unknown supplier'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{lot.quantityRemaining} left</p>
                    <p className="text-xs text-muted-foreground">Expires {formatDate(lot.expirationDate)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}

export default InventoryPage;
