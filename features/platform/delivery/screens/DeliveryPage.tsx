import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import { PlatformErrorState, PlatformMetricGrid, PlatformPage, PlatformToolbar, PlatformWorkflowNav, queryValue } from '@/features/platform/components/PlatformPrimitives';
import DeliveryOperationsClient from '@/features/platform/delivery/components/DeliveryOperationsClient';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import { platformProjections } from '@/features/platform/lib/platformProjections';

const PATH = '/dashboard/platform/delivery';

export async function DeliveryPage({searchParams}: {searchParams?: Promise<Record<string,string|string[]|undefined>> | Record<string,string|string[]|undefined>} = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim();
  let data: Awaited<ReturnType<typeof platformProjections.delivery>> = null;
  let loadError: string | null = null;
  // Each queue's search, view, sort and page run on the server.
  try {
    data = await platformProjections.delivery({
      search: q, routeView: queryValue(params, 'routes'), routePage: parsePageParam(params.routePage),
      readyPage: parsePageParam(params.readyPage), slotPage: parsePageParam(params.slotPage),
      slotView: queryValue(params, 'slots'), slotSort: queryValue(params, 'slotSort'),
    });
  } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load delivery.'; }
  const summary = data?.summary;

  return (
    <PlatformPage
      title="Delivery"
      description="Group packed orders into routes, assign a driver, record each stop and set slot capacity."
      actions={<PlatformWorkflowNav current="delivery" />}
    >
      {summary ? <PlatformMetricGrid metrics={[
        { label: 'Ready to route', value: summary.readyToRoute, note: 'Packed delivery orders without a route', tone: summary.readyToRoute ? 'warning' : 'default' },
        { label: 'Open routes', value: summary.openRoutes, note: `${summary.inProgress} on the road · ${summary.drivers} drivers` },
        { label: 'Open order capacity', value: summary.openCapacity, note: 'Across open upcoming slots' },
        { label: 'Busy slots', value: summary.highPressureSlots, note: 'At least 80% booked', tone: summary.highPressureSlots ? 'warning' : 'default' },
      ]} /> : null}
      {loadError || !data ? <PlatformErrorState description={loadError || 'Delivery could not be loaded.'} retryHref={PATH} /> : <>
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs [&>form]:border-b-0">
          <PlatformToolbar path={PATH} search={q} searchPlaceholder="Order number, customer email, driver, or slot date/time"
            preserve={{ routes: queryValue(params, 'routes'), slots: queryValue(params, 'slots'), slotSort: queryValue(params, 'slotSort') }} />
        </div>
        <DeliveryOperationsClient
          key={JSON.stringify(params)}
          slots={data.deliverySlots}
          routes={data.deliveryRoutes}
          readyOrders={data.readyOrders}
          drivers={data.drivers}
          driversTruncated={data.driversTruncated}
          timezone={data.timezone}
          search={q}
          routeView={data.routeView}
          routeViewCounts={data.routeViewCounts}
          slotView={data.slotView}
          slotSort={data.slotSort}
          readyTotal={data.readyPagination.collections.readyOrders?.total ?? data.readyOrders.length}
          slotTotal={data.slotPagination.collections.deliverySlots?.total ?? data.deliverySlots.length}
          params={params}
          readyPager={<PlatformPageLinks pagination={data.readyPagination} path={PATH} searchParams={params} pageParam="readyPage" />}
          slotPager={<PlatformPageLinks pagination={data.slotPagination} path={PATH} searchParams={params} pageParam="slotPage" />}
          routePager={<PlatformPageLinks pagination={data.pagination} path={PATH} searchParams={params} pageParam="routePage" />}
        />
      </>}
    </PlatformPage>
  );
}

export default DeliveryPage;
