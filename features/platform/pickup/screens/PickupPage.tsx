import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import { PlatformErrorState, PlatformMetricGrid, PlatformPage, PlatformToolbar, PlatformWorkflowNav, queryValue } from '@/features/platform/components/PlatformPrimitives';
import PickupOperationsClient from '@/features/platform/pickup/components/PickupOperationsClient';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import { platformProjections } from '@/features/platform/lib/platformProjections';

const PATH = '/dashboard/platform/pickup';

export async function PickupPage({searchParams}: {searchParams?: Promise<Record<string,string|string[]|undefined>> | Record<string,string|string[]|undefined>} = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim();
  let data: Awaited<ReturnType<typeof platformProjections.pickup>> = null;
  let loadError: string | null = null;
  // Each queue's search, filter, sort and page run on the server.
  try {
    data = await platformProjections.pickup({
      search: q, arrivalPage: parsePageParam(params.arrivalPage), stagedPage: parsePageParam(params.stagedPage), slotPage: parsePageParam(params.slotPage),
      slotView: queryValue(params, 'slots'), slotSort: queryValue(params, 'slotSort'),
    });
  } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load pickup.'; }
  const summary = data?.summary;

  return (
    <PlatformPage
      title="Pickup & curbside"
      breadcrumb="Pickup"
      description="Hand off to arrived customers first, then watch staged orders, slot capacity and parking."
      actions={<PlatformWorkflowNav current="pickup" />}
    >
      {summary ? <PlatformMetricGrid metrics={[
        { label: 'Customers waiting', value: summary.waiting, note: 'Checked in for curbside handoff', tone: summary.waiting ? 'critical' : 'default' },
        { label: 'Ready for pickup', value: summary.staged, note: 'Packed and staged as ready' },
        { label: 'Open order capacity', value: summary.openCapacity, note: `Across open slots · ${summary.highPressureSlots} busy`, tone: summary.highPressureSlots ? 'warning' : 'default' },
        { label: 'Parking spots in use', value: `${summary.parkingInUse}/${summary.parkingSpots}`, note: 'Occupied or closed', tone: summary.parkingSpots && summary.parkingInUse === summary.parkingSpots ? 'warning' : 'default' },
      ]} /> : null}
      {loadError || !data ? <PlatformErrorState description={loadError || 'Pickup could not be loaded.'} retryHref={PATH} /> : <>
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs [&>form]:border-b-0">
          <PlatformToolbar path={PATH} search={q} searchPlaceholder="Order number, customer email, spot, vehicle, or slot date/time"
            preserve={{ slots: queryValue(params, 'slots'), slotSort: queryValue(params, 'slotSort') }} />
        </div>
        <PickupOperationsClient
          slots={data.pickupSlots}
          parkingSpots={data.parkingSpots}
          occupiedSpotIds={data.occupiedSpotIds}
          waitingOrders={data.arrivals}
          readyOrders={data.stagedOrders}
          waitingTotal={data.pagination.collections.arrivals?.total ?? data.arrivals.length}
          readyTotal={data.stagedPagination.collections.staged?.total ?? data.stagedOrders.length}
          slotTotal={data.slotPagination.collections.pickupSlots?.total ?? data.pickupSlots.length}
          search={q}
          slotView={data.slotView}
          slotSort={data.slotSort}
          params={params}
          arrivalPager={<PlatformPageLinks pagination={data.pagination} path={PATH} searchParams={params} pageParam="arrivalPage" />}
          stagedPager={<PlatformPageLinks pagination={data.stagedPagination} path={PATH} searchParams={params} pageParam="stagedPage" />}
          slotPager={<PlatformPageLinks pagination={data.slotPagination} path={PATH} searchParams={params} pageParam="slotPage" />}
        />
      </>}
    </PlatformPage>
  );
}

export default PickupPage;
