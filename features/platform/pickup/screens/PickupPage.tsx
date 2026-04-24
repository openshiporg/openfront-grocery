import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

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
  }
`;

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export async function PickupPage() {
  const response = await keystoneClient<any>(PICKUP_QUERY);
  const slots = response.success ? response.data?.pickupSlots || [] : [];
  const parkingSpots = response.success ? response.data?.parkingSpots || [] : [];

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Pickup' },
  ];

  const header = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Pickup Operations</h1>
      <p className="text-sm text-muted-foreground">See curbside slot pressure and parking spot readiness in one place.</p>
    </div>
  );

  return (
    <PageContainer title="Pickup" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Pickup slots</h2>
          </div>
          <div className="divide-y">
            {slots.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No pickup slots configured.</div>
            ) : (
              slots.map((slot: any) => (
                <div key={slot.id} className="px-4 py-4 md:px-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{formatDate(slot.date)} · {slot.startTime} – {slot.endTime}</p>
                    <p className="text-sm text-muted-foreground">
                      {slot.currentOrders}/{slot.maxOrders} orders scheduled
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${slot.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
                    {slot.isAvailable ? 'Available' : 'Full'}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Parking spots</h2>
          </div>
          <div className="divide-y">
            {parkingSpots.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No curbside parking spots found.</div>
            ) : (
              parkingSpots.map((spot: any) => (
                <div key={spot.id} className="px-4 py-4 md:px-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{spot.spotNumber}</p>
                    <p className="text-sm text-muted-foreground">{spot.description || 'Curbside pickup spot'}</p>
                    {spot.isAccessible ? <p className="text-xs text-muted-foreground">Accessible spot</p> : null}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${spot.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
                    {spot.isAvailable ? 'Ready' : 'Occupied'}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}

export default PickupPage;
