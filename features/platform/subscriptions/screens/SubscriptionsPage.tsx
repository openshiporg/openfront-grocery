import Link from 'next/link';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformTruthNotice } from '@/features/platform/components/PlatformPrimitives';

/** Subscription automation is intentionally outside the bounded launch. */
export async function SubscriptionsPage() {
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Subscriptions' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Recurring orders</h1><p className="mt-1 text-sm text-muted-foreground">A truthful boundary for a data structure that is not an active Grocery workflow.</p></div>;
  return <PageContainer title="Recurring orders" header={header} breadcrumbs={breadcrumbs}><div className="space-y-5 px-4 pb-8 md:px-6">
    <PlatformTruthNotice title="Automation is not active" tone="warning">Grocery does not currently create recurring checkout attempts, reserve inventory or slots, charge a provider, or produce orders from Subscription records. No upcoming revenue or demand is shown here.</PlatformTruthNotice>
    <section className="rounded-xl border bg-background p-5"><h2 className="font-semibold">Supported alternatives</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Use customer shopping lists for repeat planning and create ordinary carts/orders through the supported storefront. Raw Subscription records remain diagnostics only.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/dashboard/platform/customers" className="inline-flex min-h-10 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open customers</Link><Link href="/dashboard/products" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open catalog</Link><Link href="/dashboard/subscriptions" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open diagnostic records</Link></div></section>
  </div></PageContainer>;
}

export default SubscriptionsPage;
