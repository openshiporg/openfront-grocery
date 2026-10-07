import {PlatformPageLinks} from '@/features/platform/components/PlatformPageLinks';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { RunDueSubscriptionsButton } from '../components/RunDueSubscriptionsButton';
import { configureLoyaltyTask } from '../actions/recurringTasks';
import { getAuthenticatedUser } from '@/features/dashboard/actions/auth';

export async function SubscriptionsPage({searchParams}:{searchParams?:Promise<{page?:string}>}={}) {
  const params=await searchParams || {};
  const [result, userResult] = await Promise.all([
    keystoneClient<any>('query($page:Int){groceryRecurringOverview(page:$page,customerOnly:false)}',{page:Number(params.page||1)},{cache:'no-store'}),
    getAuthenticatedUser(),
  ]);
  const role = userResult.success ? userResult.data?.authenticatedItem?.role : undefined;
  const canManageOrders = role?.canManageOrders === true;
  const canManageLoyalty = role?.canManageUsers === true;
  const data=result.success?result.data.groceryRecurringOverview:null;
  const error=result.success?undefined:result.error;
  const subscriptions=data?.subscriptions||[],runs=data?.runs||[],program=data?.program;
  const showEmptyRuns = Boolean(data && runs.length === 0);
  const showEmptySchedules = Boolean(data && subscriptions.length === 0);
  const field = 'min-h-10 rounded border bg-background px-3 text-sm';
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Recurring orders' }];
  return <PageContainer title="Recurring orders" breadcrumbs={breadcrumbs} header={<div><h1 className="text-2xl font-semibold">Recurring orders and rewards</h1><p className="text-sm text-muted-foreground">Scheduled baskets reach normal customer checkout; rewards follow final paid goods and refund reversals.</p></div>}><div className="space-y-5 px-4 pb-8 md:px-6">
    {error ? <p role="alert">{error}</p> : null}<PlatformPageLinks pagination={data?.pagination} path="/dashboard/platform/subscriptions" searchParams={params}/>{canManageOrders ? <RunDueSubscriptionsButton /> : null}
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Occurrence outcomes</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Customer</th><th>Product</th><th>Scheduled</th><th>Outcome</th><th>Evidence</th></tr></thead><tbody>{runs.map((run:any) => <tr key={run.id}><td>{run.user?.email}</td><td>{run.productTitle} × {run.quantity}</td><td>{new Date(run.dueAt).toLocaleString()}</td><td>{run.status}</td><td>{run.order?.id ? <a href={`/dashboard/orders/${run.order.id}`} className="underline">Order {run.order.id}</a> : run.failureReason || 'Customer slot and payment approval required'}</td></tr>)}{showEmptyRuns ? <tr><td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground">No recurring order outcomes yet.</td></tr> : null}</tbody></table></div></section>
    <section className="space-y-2 rounded border p-4"><h2 className="font-semibold">Schedules</h2>{subscriptions.map((subscription:any) => <p key={subscription.id} className="text-sm">{subscription.user?.email} · {subscription.product} × {subscription.quantity} · {subscription.frequency} · {subscription.status} · next {new Date(subscription.nextDeliveryDate).toLocaleString('en-US', { timeZone: subscription.scheduleTimezone || 'UTC' })} ({subscription.scheduleTimezone || 'UTC'})</p>)}{showEmptySchedules ? <p className="text-sm text-muted-foreground">No recurring schedules yet.</p> : null}</section>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Retailer-funded loyalty rules</h2><p className="text-sm text-muted-foreground">Earned points use final paid goods after discounts. Refunds reverse earnings; a resulting points debt offsets future earnings and prevents redemption until recovered. Issued rewards require an account-owned single-use coupon.</p>{canManageLoyalty ? <form action={configureLoyaltyTask} className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs">Program name<input name="name" required defaultValue={program?.name || 'Grocery rewards'} className={field} /></label><label className="grid gap-1 text-xs">Points earned per 100 currency minor units<input name="earnPointsPer100Cents" type="number" required min="0" step="1" defaultValue={program?.earnPointsPer100Cents ?? 1} className={field} /></label><label className="grid gap-1 text-xs">Points exchanged for 100 currency minor units<input name="redeemPointsPer100Cents" type="number" required min="1" step="1" defaultValue={program?.redeemPointsPer100Cents ?? 100} className={field} /></label><label className="grid gap-1 text-xs">Minimum points to redeem<input name="minimumRedemptionPoints" type="number" required min="1" step="1" defaultValue={program?.minimumRedemptionPoints ?? 100} className={field} /></label><label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" defaultChecked={program?.isActive ?? false} />Rewards active</label><button className={field}>Save loyalty rules</button></form> : <p className="text-sm text-muted-foreground">Your role can’t manage loyalty program settings.</p>}</section>
  </div></PageContainer>;
}
export default SubscriptionsPage;
