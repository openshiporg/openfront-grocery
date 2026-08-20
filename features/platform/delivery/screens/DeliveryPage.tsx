import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformErrorState, PlatformMetricGrid, PlatformTruthNotice } from '@/features/platform/components/PlatformPrimitives';
import DeliveryOperationsClient from '@/features/platform/delivery/components/DeliveryOperationsClient';
import { platformProjections } from '@/features/platform/lib/platformProjections';

export async function DeliveryPage() {
  let data: Awaited<ReturnType<typeof platformProjections.delivery>> = null;
  let loadError: string | null = null;
  try { data = await platformProjections.delivery(); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load delivery.'; }
  const routes = data?.deliveryRoutes || [];
  const slots = data?.deliverySlots || [];
  const readyOrders = data?.readyOrders || [];
  const drivers = data?.drivers || [];
  const highPressure = slots.filter((slot) => slot.capacity > 0 && slot.currentBookings / slot.capacity >= 0.8).length;
  const openRoutes = routes.filter((route) => route.status !== 'completed').length;
  const remainingCapacity = slots.filter((slot) => slot.isActive).reduce((sum, slot) => sum + Math.max(0, slot.capacity - slot.currentBookings), 0);
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Delivery' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Delivery</h1><p className="mt-1 text-sm text-muted-foreground">Control order-count capacity, group packed orders, assign an eligible driver, and complete retailer-operated routes.</p></div>;
  return <PageContainer title="Delivery" header={header} breadcrumbs={breadcrumbs}><div className="space-y-5 px-4 pb-8 md:px-6">
    <PlatformMetricGrid metrics={[{ label: 'Ready to route', value: readyOrders.length, note: 'Packed delivery orders' }, { label: 'Open routes', value: openRoutes, note: `${routes.filter((route) => route.status === 'in_progress').length} in progress` }, { label: 'Open order capacity', value: remainingCapacity, note: 'Across active projected slots' }, { label: 'High-pressure slots', value: highPressure, note: 'At least 80% booked', tone: highPressure ? 'warning' : 'default' }]} />
    <PlatformTruthNotice title="Delivery boundary">Routes are manually grouped and retailer-operated. Capacity means order count—not pick minutes, cold-zone staging, vehicle volume, GPS optimization, proof images, or third-party last mile.</PlatformTruthNotice>
    {loadError ? <PlatformErrorState description={loadError} /> : <DeliveryOperationsClient slots={slots} routes={routes} readyOrders={readyOrders} drivers={drivers} />}
  </div></PageContainer>;
}

export default DeliveryPage;
