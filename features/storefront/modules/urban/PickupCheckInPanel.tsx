'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { checkInOwnedPickupOrder } from '@/features/storefront/lib/data/guest-orders';
import type { GroceryParkingSpot, GroceryPickupCheckIn } from '@/features/storefront/types';
import { UrbanButton, UrbanInset, UrbanSelect, UrbanTextInput } from './UrbanPrimitives';

export function PickupCheckInPanel({
  orderId,
  parkingSpots,
  checkIn,
}: {
  orderId: string;
  parkingSpots: GroceryParkingSpot[];
  checkIn?: GroceryPickupCheckIn;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [parkingSpotId, setParkingSpotId] = useState(parkingSpots[0]?.id || '');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (checkIn?.customerArrived) {
    return (
      <UrbanInset className="mt-4 p-4 text-sm text-[var(--sf-ink)]">
        Checked in{checkIn.parkingSpotNumber ? ` at spot ${checkIn.parkingSpotNumber}` : ''}.
        {checkIn.vehicleDescription ? ` Vehicle: ${checkIn.vehicleDescription}.` : ''}
      </UrbanInset>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t border-[var(--sf-rule)] pt-4">
      <div>
        <h3 className="font-medium text-[var(--sf-ink)]">I’m here for curbside pickup</h3>
        <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">Choose your parking spot so the store can bring out this order.</p>
      </div>
      <UrbanSelect value={parkingSpotId} onChange={(event) => setParkingSpotId(event.target.value)}>
        <option value="">Counter pickup / no parking spot</option>
        {parkingSpots.map((spot) => (
          <option key={spot.id} value={spot.id}>
            Spot {spot.spotNumber}{spot.isAccessible ? ' · accessible' : ''}{spot.description ? ` · ${spot.description}` : ''}
          </option>
        ))}
      </UrbanSelect>
      <UrbanTextInput
        value={vehicleDescription}
        onChange={(event) => setVehicleDescription(event.target.value)}
        maxLength={200}
        placeholder="Vehicle color and model (optional)"
      />
      <UrbanButton
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await checkInOwnedPickupOrder({
              orderId,
              parkingSpotId: parkingSpotId || undefined,
              vehicleDescription: vehicleDescription || undefined,
            });
            setMessage(result.message);
            if (result.success) router.refresh();
          });
        }}
        className="w-full"
      >
        {isPending ? 'Checking in…' : 'Check in'}
      </UrbanButton>
      {message ? <p role="status" className="text-sm text-[var(--sf-ink-muted)]">{message}</p> : null}
    </div>
  );
}
