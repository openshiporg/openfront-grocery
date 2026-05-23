import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import PickupOperationsClient from '@/features/platform/pickup/components/PickupOperationsClient';

const PICKUP_QUERY = gql`
  query GroceryPickupBoard {
    pickupSlots(orderBy: [{ date: asc }, { startTime: asc }], take: 20) {
      id
      date
      startTime
      endTime
      maxOrders
      currentOrders
      isAvailable
    }
    parkingSpots(orderBy: { spotNumber: asc }, take: 20) {
      id
      spotNumber
      description
      isAccessible
      isAvailable
    }
    orders(where: { status: { equals: packed } }, orderBy: { updatedAt: desc }, take: 30) {
      id
      displayId
      email
      status
      metadata
    }
  }
`;

export async function PickupPage() {
  const response = await keystoneClient<any>(PICKUP_QUERY);
  const slots = response.success ? response.data?.pickupSlots || [] : [];
  const parkingSpots = response.success ? response.data?.parkingSpots || [] : [];
  const pickupOrders = (response.success ? response.data?.orders || [] : []).filter((order: any) => order.metadata?.fulfillmentMethod === 'pickup');
  const readyOrders = pickupOrders.filter((order: any) => order.metadata?.readyForPickup && !order.metadata?.customerArrived);
  const waitingOrders = pickupOrders.filter((order: any) => order.metadata?.customerArrived);

  const openSlots = slots.filter((slot: any) => slot.isAvailable).length;
  const constrainedSlots = slots.filter((slot: any) => slot.maxOrders > 0 && slot.currentOrders / slot.maxOrders >= 0.8).length;
  const occupiedSpots = parkingSpots.filter((spot: any) => !spot.isAvailable).length;

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Pickup' },
  ];

  const header = (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pickup Operations</h1>
        <p className="text-sm text-muted-foreground">Manage curbside capacity, parking readiness, and arriving customers from one operator surface.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border px-2.5 py-1 bg-background">Open slots: {openSlots}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">High-pressure slots: {constrainedSlots}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Occupied spots: {occupiedSpots}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Ready for pickup: {readyOrders.length}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Customers waiting: {waitingOrders.length}</span>
      </div>
    </div>
  );

  return (
    <PageContainer title="Pickup" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6">
        <PickupOperationsClient slots={slots} parkingSpots={parkingSpots} readyOrders={readyOrders} waitingOrders={waitingOrders} />
      </div>
    </PageContainer>
  );
}

export default PickupPage;
