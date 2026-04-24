import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const MERCH_QUERY = gql`
  query GroceryMerchandisingPage {
    departments(orderBy: { sortOrder: asc }, take: 20) {
      id
      name
      handle
      sortOrder
      isActive
      temperatureZone
      products { id }
    }
    coupons(orderBy: { createdAt: desc }, take: 20) {
      id
      code
      discountType
      discountValue
      minPurchase
      isActive
      validTo
    }
  }
`;

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export async function MerchandisingPage() {
  const response = await keystoneClient<any>(MERCH_QUERY);
  const data = response.success ? response.data : { departments: [], coupons: [] };

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Merchandising' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Merchandising</h1>
      <p className="text-sm text-muted-foreground">Department curation and promotional levers for the grocery storefront.</p>
    </div>
  );

  return (
    <PageContainer title="Merchandising" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Departments</h2>
          </div>
          <div className="divide-y">
            {(data.departments || []).length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No departments found.</div>
            ) : (
              data.departments.map((department: any) => (
                <div key={department.id} className="px-4 py-4 md:px-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{department.name}</p>
                    <p className="text-sm text-muted-foreground">/{department.handle} · {department.temperatureZone}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p>{department.products?.length || 0} products</p>
                    <p className="text-muted-foreground">Sort {department.sortOrder ?? 0}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Active promos</h2>
          </div>
          <div className="divide-y">
            {(data.coupons || []).length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No coupons found.</div>
            ) : (
              data.coupons.map((coupon: any) => (
                <div key={coupon.id} className="px-4 py-4 md:px-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{coupon.code}</p>
                    <p className="text-sm text-muted-foreground">{coupon.discountType} · {coupon.discountValue}</p>
                    <p className="text-xs text-muted-foreground">Expires {formatDate(coupon.validTo)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p>Min ${coupon.minPurchase || 0}</p>
                    <p className={coupon.isActive ? 'text-emerald-700' : 'text-zinc-500'}>{coupon.isActive ? 'Active' : 'Inactive'}</p>
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

export default MerchandisingPage;
