import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import DeliveryOperationsClient from '@/features/platform/delivery/components/DeliveryOperationsClient';

const DELIVERY_QUERY = gql`
  query GroceryDeliveryBoard {
    deliveryRoutes(orderBy: { date: desc }, take: 20) {
      id
      date
      timeWindow
      status
      startedAt
      completedAt
      driver { id name email }
      orders { id displayId status metadata }
    }
    readyOrders: orders(
      where: {
        AND: [
          { status: { equals: packed } }
          { metadata: { path: ["fulfillmentMethod"], equals: "delivery" } }
        ]
      }
      orderBy: { updatedAt: asc }
      take: 50
    ) {
      id
      displayId
      email
      status
      deliveryDate
      deliveryTimeWindow
      metadata
      lineItems { id quantity }
    }
    drivers: users(where: { role: { canManageDelivery: { equals: true } } }, take: 25, orderBy: { name: asc }) {
      id
      name
      email
    }
    deliverySlots(orderBy: [{ date: asc }, { startTime: asc }], take: 20) {
      id
      date
      startTime
      endTime
      capacity
      currentBookings
      isActive
      deliveryFee
    }
  }
`;

export async function DeliveryPage() {
  const response = await keystoneClient<any>(DELIVERY_QUERY);
  const routes = response.success ? response.data?.deliveryRoutes || [] : [];
  const slots = response.success ? response.data?.deliverySlots || [] : [];
  const readyOrders = response.success ? response.data?.readyOrders || [] : [];
  const drivers = response.success ? response.data?.drivers || [] : [];

  const constrainedSlots = slots.filter((slot: any) => slot.capacity > 0 && slot.currentBookings / slot.capacity >= 0.8).length;
  const liveSlots = slots.filter((slot: any) => slot.isActive).length;
  const openRoutes = routes.filter((route: any) => route.status !== 'completed').length;

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Delivery' },
  ];

  const header = (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Delivery Operations</h1>
        <p className="text-sm text-muted-foreground">Dispatch-oriented visibility into route readiness and live delivery capacity controls.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border px-2.5 py-1 bg-background">Live slots: {liveSlots}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">High-pressure slots: {constrainedSlots}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Open routes: {openRoutes}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Ready to route: {readyOrders.length}</span>
      </div>
    </div>
  );

  return (
    <PageContainer title="Delivery" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6">
        <DeliveryOperationsClient slots={slots} routes={routes} readyOrders={readyOrders} drivers={drivers} />
      </div>
    </PageContainer>
  );
}

export default DeliveryPage;
