import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const SUBSCRIPTIONS_QUERY = gql`
  query GrocerySubscriptionsPage {
    subscriptions(orderBy: { createdAt: desc }, take: 20) {
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
      user { id name email }
    }
  }
`;

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export async function SubscriptionsPage() {
  const response = await keystoneClient<any>(SUBSCRIPTIONS_QUERY);
  const subscriptions = response.success ? response.data?.subscriptions || [] : [];

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Subscriptions' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Recurring Grocery</h1>
      <p className="text-sm text-muted-foreground">Monitor repeat-order programs and upcoming recurring demand.</p>
    </div>
  );

  return (
    <PageContainer title="Subscriptions" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6">
        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Active and paused subscriptions</h2>
          </div>
          {subscriptions.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No subscriptions found.</div>
          ) : (
            <div className="divide-y">
              {subscriptions.map((subscription: any) => (
                <div key={subscription.id} className="px-4 py-4 md:px-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium">{subscription.product}</p>
                    <p className="text-sm text-muted-foreground">{subscription.user?.name || subscription.user?.email || 'Unknown customer'}</p>
                    <p className="text-xs text-muted-foreground">Next delivery: {formatDate(subscription.nextDeliveryDate)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs lg:justify-end">
                    <span className="rounded-full border px-2.5 py-1">{subscription.frequency}</span>
                    <span className="rounded-full border px-2.5 py-1">Qty {subscription.quantity}</span>
                    <span className="rounded-full border px-2.5 py-1">Discount {subscription.discount || 0}%</span>
                    <span className={`rounded-full px-2.5 py-1 ${subscription.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
                      {subscription.isActive ? 'Active' : 'Paused'}
                    </span>
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

export default SubscriptionsPage;
