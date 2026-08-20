import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformErrorState, PlatformMetricGrid, PlatformTruthNotice } from '@/features/platform/components/PlatformPrimitives';
import PickupOperationsClient from '@/features/platform/pickup/components/PickupOperationsClient';
import { platformProjections } from '@/features/platform/lib/platformProjections';

export async function PickupPage() {
  let data: Awaited<ReturnType<typeof platformProjections.pickup>> = null;
  let loadError: string | null = null;
  try { data = await platformProjections.pickup(); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load pickup.'; }
  const slots = data?.pickupSlots || [];
  const parkingSpots = data?.parkingSpots || [];
  const pickupOrders = data?.pickupOrders || [];
  const readyOrders = pickupOrders.filter((order) => order.metadata?.readyForPickup && !order.metadata?.customerArrived);
  const waitingOrders = pickupOrders.filter((order) => order.metadata?.customerArrived);
  const pressure = slots.filter((slot) => slot.maxOrders > 0 && slot.currentOrders / slot.maxOrders >= 0.8).length;
  const remaining = slots.filter((slot) => slot.isAvailable).reduce((sum, slot) => sum + Math.max(0, slot.maxOrders - slot.currentOrders), 0);
  const occupied = parkingSpots.filter((spot) => !spot.isAvailable).length;
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Pickup' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Pickup & curbside</h1><p className="mt-1 text-sm text-muted-foreground">Watch order-count capacity, staged orders, customer arrivals, parking, and atomic handoff.</p></div>;
  return <PageContainer title="Pickup" header={header} breadcrumbs={breadcrumbs}><div className="space-y-5 px-4 pb-8 md:px-6">
    <PlatformMetricGrid metrics={[{ label: 'Ready for pickup', value: readyOrders.length, note: 'Packed and staged as ready' }, { label: 'Customers waiting', value: waitingOrders.length, note: 'Checked in for curbside handoff', tone: waitingOrders.length ? 'warning' : 'default' }, { label: 'Open order capacity', value: remaining, note: 'Across available projected slots' }, { label: 'Occupied / unavailable spots', value: occupied, note: `${pressure} high-pressure slots`, tone: occupied || pressure ? 'warning' : 'default' }]} />
    <PlatformTruthNotice title="Pickup boundary">Slot capacity is an order-count limit. Customer check-in owns parking assignment; occupied spots release atomically through completed handoff and cannot be manually reopened here.</PlatformTruthNotice>
    {loadError ? <PlatformErrorState description={loadError} /> : <PickupOperationsClient slots={slots} parkingSpots={parkingSpots} readyOrders={readyOrders} waitingOrders={waitingOrders} />}
  </div></PageContainer>;
}

export default PickupPage;
