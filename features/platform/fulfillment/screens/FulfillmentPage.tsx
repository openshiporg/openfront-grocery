import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import { PlatformErrorState, PlatformMetricGrid, PlatformPage, PlatformTruthNotice, PlatformWorkflowNav, queryValue } from '@/features/platform/components/PlatformPrimitives';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import FulfillmentBoardClient from '@/features/platform/fulfillment/components/FulfillmentBoardClient';
import { platformProjections } from '@/features/platform/lib/platformProjections';

const PATH = '/dashboard/platform/fulfillment';

export async function FulfillmentPage({searchParams}: {searchParams?: Promise<Record<string,string|string[]|undefined>> | Record<string,string|string[]|undefined>} = {}) {
  const params=searchParams?await searchParams:{};
  const q = queryValue(params, 'q').trim();
  const view = queryValue(params, 'view') || 'all';
  const sort = queryValue(params, 'sort') || 'oldest';
  let data: Awaited<ReturnType<typeof platformProjections.fulfillment>> = null;
  let loadError: string | null = null;
  // Search, view and sort run on the server before each lane is paged.
  try {
    data = await platformProjections.fulfillment(parsePageParam(params.page), 50, q, view, sort);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load fulfillment.';
  }

  return (
    <PlatformPage
      title="Pick & pack"
      breadcrumb="Fulfillment"
      description="Drag a card one stage forward or open it to record actual goods, substitutions and customer approvals before packing."
      actions={<PlatformWorkflowNav current="fulfillment" />}
    >
      {loadError || !data ? (
        <PlatformErrorState description={loadError || 'Fulfillment could not be loaded.'} retryHref={PATH} />
      ) : (
        <>
          <PlatformMetricGrid metrics={[
            { label: 'Waiting to pick', value: data.summary.pending, note: q || view !== 'all' ? 'Matching the current filter' : 'Paid orders not started' },
            { label: 'Picking', value: data.summary.picking, note: 'Actuals being recorded', tone: data.summary.picking ? 'warning' : 'default' },
            { label: 'Packed', value: data.summary.packed, note: data.summary.pickupNotReady ? `${data.summary.pickupNotReady} pickup not yet marked ready` : 'Ready for delivery or pickup' },
            { label: 'Substitutions to review', value: data.summary.substitutionsToReview, note: 'Without recorded customer approval', tone: data.summary.substitutionsToReview ? 'critical' : 'default' },
          ]} />
          <PlatformTruthNotice title="Stage rules">
            Orders move one authorized stage at a time. Each line is resolved once with its actual quantity; customer approval is required for contact preferences and quantities above the estimate. Finalize the actual sale before marking an order packed.
          </PlatformTruthNotice>
          <FulfillmentBoardClient
            lanes={{ pending: data.pending, picking: data.picking, packed: data.packed }}
            laneTotals={{ pending: data.summary.pending, picking: data.summary.picking, packed: data.summary.packed }}
            substitutions={data.orderItemSubstitutions}
            timeZone={data.timezone}
            search={q}
            view={data.view}
            sort={sort}
          />
          <div className="overflow-hidden rounded-xl border bg-card [&>nav]:border-t-0"><PlatformPageLinks pagination={data.pagination} path={PATH} searchParams={params} /></div>
        </>
      )}
    </PlatformPage>
  );
}

export default FulfillmentPage;
