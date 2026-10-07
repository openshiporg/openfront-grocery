'use client';

import { useId, useState, useTransition } from 'react';
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
  const fieldId = useId();
  const [isPending, startTransition] = useTransition();
  const [parkingSpotId, setParkingSpotId] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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
      <label htmlFor={`${fieldId}-spot`} className="block text-sm font-medium">Pickup location</label>
      <UrbanSelect id={`${fieldId}-spot`} value={parkingSpotId} disabled={isPending} onChange={(event) => setParkingSpotId(event.target.value)}>
        <option value="" disabled>Choose where you are waiting</option>
        <option value="counter">Counter pickup / no parking spot</option>
        {parkingSpots.map((spot) => (
          <option key={spot.id} value={spot.id}>
            Spot {spot.spotNumber}{spot.isAccessible ? ' · accessible' : ''}{spot.description ? ` · ${spot.description}` : ''}
          </option>
        ))}
      </UrbanSelect>
      <label htmlFor={`${fieldId}-vehicle`} className="block text-sm font-medium">Vehicle color and model (optional)</label>
      <UrbanTextInput
        id={`${fieldId}-vehicle`}
        disabled={isPending}
        value={vehicleDescription}
        onChange={(event) => setVehicleDescription(event.target.value)}
        maxLength={200}
        placeholder="Vehicle color and model (optional)"
      />
      <UrbanButton
        type="button"
        disabled={isPending || !parkingSpotId}
        onClick={() => {
          setMessage(null);
          setFailed(false);
          startTransition(async () => {
            try {
              const result = await checkInOwnedPickupOrder({
                orderId,
                parkingSpotId: parkingSpotId === 'counter' ? undefined : parkingSpotId,
                vehicleDescription: vehicleDescription.trim() || undefined,
              });
              setFailed(!result.success);
              setMessage(result.message);
              if (result.success) router.refresh();
            } catch (error) {
              setFailed(true);
              setMessage(error instanceof Error ? error.message : 'We could not confirm your check-in. Please try again.');
            }
          });
        }}
        className="w-full"
      >
        {isPending ? 'Checking in…' : 'Check in'}
      </UrbanButton>
      {message ? <p role={failed ? 'alert' : 'status'} className="text-sm text-[var(--sf-ink-muted)]">{message}</p> : null}
    </div>
  );
}
