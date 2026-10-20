'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Accessibility, Car, Check, Store } from 'lucide-react';

import { checkInOwnedPickupOrder } from '@/features/storefront/lib/data/guest-orders';
import type { GroceryParkingSpot, GroceryPickupCheckIn } from '@/features/storefront/types';
import { UrbanButton, UrbanTextInput } from './UrbanPrimitives';

const tile = 'relative flex min-h-[5.25rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--sf-radius-md)] border p-2 text-center transition-[border-color,background-color,box-shadow] duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] has-[:checked]:border-[var(--sf-ink)] has-[:checked]:bg-[var(--sf-card)] has-[:checked]:shadow-[0_0_0_1px_var(--sf-ink)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--sf-focus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 border-[var(--sf-rule)] bg-[var(--sf-paper-2)] hover:border-[var(--sf-ink-faint)]';

/** Curbside arrival. The store owns which bays exist; this only reports where the customer is waiting. */
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
      <div role="status" className="mt-5 flex items-center gap-4 rounded-[var(--sf-radius-md)] bg-[var(--sf-sage-light)] p-4">
        {checkIn.parkingSpotNumber ? (
          <span className="sf-aisle-no h-14 min-w-14 text-2xl" aria-hidden="true">{checkIn.parkingSpotNumber}</span>
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--sf-radius-sm)] bg-[var(--sf-sage)] text-[var(--sf-card)]"><Check className="h-6 w-6" aria-hidden="true" /></span>
        )}
        <div className="min-w-0 text-sm leading-6">
          <p className="font-semibold text-[var(--sf-ink)]">You’re checked in{checkIn.parkingSpotNumber ? ` at bay ${checkIn.parkingSpotNumber}` : ''}.</p>
          <p className="text-[var(--sf-ink-muted)]">The store has been told you’re here.{checkIn.vehicleDescription ? ` Vehicle: ${checkIn.vehicleDescription}.` : ''}</p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mt-5 space-y-4 border-t border-[var(--sf-rule)] pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!parkingSpotId) return;
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
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]"><Car className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-[-0.01em] text-[var(--sf-ink)]">I’m here for pickup</h3>
          <p className="mt-0.5 text-sm leading-6 text-[var(--sf-ink-muted)]">Tell the store where you’re waiting so they can bring out this order.</p>
        </div>
      </div>

      <fieldset disabled={isPending}>
        <legend className="mb-2 text-sm font-semibold text-[var(--sf-ink)]">Where are you waiting?</legend>
        <div className="grid grid-cols-3 gap-2">
          {parkingSpots.map((spot) => (
            <label key={spot.id} className={tile} title={spot.description || undefined}>
              <input type="radio" name={`${fieldId}-spot`} value={spot.id} checked={parkingSpotId === spot.id} onChange={() => setParkingSpotId(spot.id)} className="sr-only" />
              <span className="text-[0.625rem] font-semibold text-[var(--sf-ink-faint)]">Bay</span>
              <span className="font-[family-name:var(--sf-font-display)] text-[1.6rem] font-bold leading-none tabular-nums tracking-[-0.03em] text-[var(--sf-ink)]">{spot.spotNumber}</span>
              {spot.isAccessible ? <span className="inline-flex items-center gap-0.5 text-[0.625rem] font-semibold text-[var(--sf-info)]"><Accessibility className="h-3 w-3" aria-hidden="true" />Accessible</span> : null}
              <span className="sr-only">{spot.isAccessible ? ', accessible bay' : ''}{spot.description ? `, ${spot.description}` : ''}</span>
            </label>
          ))}
          <label className={`${tile} ${parkingSpots.length % 3 === 0 ? 'col-span-3 flex-row gap-2' : ''}`}>
            <input type="radio" name={`${fieldId}-spot`} value="counter" checked={parkingSpotId === 'counter'} onChange={() => setParkingSpotId('counter')} className="sr-only" />
            <Store className="h-5 w-5 text-[var(--sf-sage)]" aria-hidden="true" />
            <span className="text-xs font-semibold leading-tight text-[var(--sf-ink)]">Counter pickup<span className="block font-normal text-[var(--sf-ink-faint)]">no parking bay</span></span>
          </label>
        </div>
      </fieldset>

      <label htmlFor={`${fieldId}-vehicle`} className="sf-label">
        <span>Vehicle color and model <span className="font-normal text-[var(--sf-ink-faint)]">(optional)</span></span>
        <UrbanTextInput
          id={`${fieldId}-vehicle`}
          disabled={isPending}
          value={vehicleDescription}
          onChange={(event) => setVehicleDescription(event.target.value)}
          maxLength={200}
          autoComplete="off"
          placeholder="e.g. Blue hatchback"
        />
      </label>

      <UrbanButton type="submit" size="lg" disabled={isPending || !parkingSpotId} className="w-full">
        {isPending ? 'Checking in…' : parkingSpotId ? 'Check in — I’m here' : 'Choose where you’re waiting'}
      </UrbanButton>
      {message ? (
        <p role={failed ? 'alert' : 'status'} className={`rounded-[var(--sf-radius-md)] px-3 py-2.5 text-sm font-medium leading-6 ${failed ? 'bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]'}`}>{message}</p>
      ) : null}
    </form>
  );
}
