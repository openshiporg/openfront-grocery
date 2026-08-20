import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformErrorState, PlatformMetricGrid, PlatformTruthNotice } from '@/features/platform/components/PlatformPrimitives';
import FulfillmentBoardClient from '@/features/platform/fulfillment/components/FulfillmentBoardClient';
import { platformProjections } from '@/features/platform/lib/platformProjections';

export async function FulfillmentPage() {
  let data: Awaited<ReturnType<typeof platformProjections.fulfillment>> = null;
  let loadError: string | null = null;
  try { data = await platformProjections.fulfillment(); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load fulfillment.'; }
  const safe = data || { pending: [], picking: [], packed: [], orderItemSubstitutions: [] };
  const columns = [{ title: 'Pending', items: safe.pending }, { title: 'Picking', items: safe.picking }, { title: 'Packed', items: safe.packed }];
  const awaitingApproval = safe.orderItemSubstitutions.filter((entry) => !entry.customerApproved).length;
  const lineCount = [...safe.pending, ...safe.picking, ...safe.packed].reduce((sum, order) => sum + order.lineItems.length, 0);
  const pickupCount = [...safe.pending, ...safe.picking, ...safe.packed].filter((order) => order.metadata?.fulfillmentMethod === 'pickup').length;
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Fulfillment' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Pick & pack</h1><p className="mt-1 text-sm text-muted-foreground">Work the active order lanes, retain substitution decisions, and hand packed orders to pickup or delivery.</p></div>;

  return <PageContainer title="Fulfillment" header={header} breadcrumbs={breadcrumbs}><div className="space-y-5 px-4 pb-8 md:px-6">
    <PlatformMetricGrid metrics={[{ label: 'Waiting to pick', value: safe.pending.length, note: 'Pending orders' }, { label: 'In picking', value: safe.picking.length, note: `${lineCount} total lines across active lanes` }, { label: 'Packed', value: safe.packed.length, note: `${pickupCount} pickup orders across lanes` }, { label: 'Awaiting approval', value: awaitingApproval, note: 'Unapproved recorded substitutions', tone: awaitingApproval ? 'warning' : 'default' }]} />
    <PlatformTruthNotice title="Fulfillment evidence boundary">The workflow records stage transitions and substitution snapshots. It does not record actual picked quantity, short quantity, tote, staging location, quality check, temperature, seal, or custody chain.</PlatformTruthNotice>
    {loadError ? <PlatformErrorState description={loadError} /> : <FulfillmentBoardClient columns={columns} substitutions={safe.orderItemSubstitutions} />}
  </div></PageContainer>;
}

export default FulfillmentPage;
