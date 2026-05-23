'use client';

import { useState, useTransition } from 'react';
import { completePickupOrderHandoff, updateParkingSpotState, updatePickupSlotState } from '@/features/platform/pickup/actions';

interface PickupSlotRecord {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  maxOrders: number;
  currentOrders: number;
  isAvailable: boolean;
}

interface ParkingSpotRecord {
  id: string;
  spotNumber: string;
  description?: string | null;
  isAccessible: boolean;
  isAvailable: boolean;
}

interface PickupQueueOrder {
  id: string;
  displayId: number;
  email: string;
  status: string;
  metadata?: Record<string, any> | null;
}

interface PickupOperationsClientProps {
  slots: PickupSlotRecord[];
  parkingSpots: ParkingSpotRecord[];
  readyOrders: PickupQueueOrder[];
  waitingOrders: PickupQueueOrder[];
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export default function PickupOperationsClient({ slots, parkingSpots, readyOrders, waitingOrders }: PickupOperationsClientProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runAction = (key: string, fn: () => Promise<void>) => {
    setMessage(null);
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Pickup slots</h2>
            <p className="text-sm text-muted-foreground">Watch slot pressure and manually open/close capacity when curbside demand changes.</p>
          </div>
          <div className="divide-y">
            {slots.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No pickup slots configured.</div>
            ) : (
              slots.map((slot) => {
                const pressure = slot.maxOrders > 0 ? Math.min(100, Math.round((slot.currentOrders / slot.maxOrders) * 100)) : 0;
                return (
                  <div key={slot.id} className="px-4 py-4 md:px-6 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{formatDate(slot.date)} · {slot.startTime} – {slot.endTime}</p>
                        <p className="text-sm text-muted-foreground">{slot.currentOrders}/{slot.maxOrders} orders scheduled</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${slot.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
                        {slot.isAvailable ? 'Available' : 'Closed'}
                      </span>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Pressure</span>
                        <span>{pressure}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${pressure >= 90 ? 'bg-red-500' : pressure >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pressure}%` }} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(`slot-minus-${slot.id}`, async () => {
                          const next = Math.max(slot.currentOrders || 1, slot.maxOrders - 1);
                          await updatePickupSlotState({ slotId: slot.id, maxOrders: next });
                          setMessage(`Reduced capacity for ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Capacity −
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(`slot-plus-${slot.id}`, async () => {
                          await updatePickupSlotState({ slotId: slot.id, maxOrders: slot.maxOrders + 1 });
                          setMessage(`Increased capacity for ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Capacity +
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(`slot-toggle-${slot.id}`, async () => {
                          await updatePickupSlotState({ slotId: slot.id, isAvailable: !slot.isAvailable });
                          setMessage(`${slot.isAvailable ? 'Closed' : 'Re-opened'} pickup slot ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        {slot.isAvailable ? 'Close slot' : 'Open slot'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Parking spots</h2>
            <p className="text-sm text-muted-foreground">Control curbside spot readiness when staffing or lot conditions change.</p>
          </div>
          <div className="divide-y">
            {parkingSpots.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No curbside parking spots found.</div>
            ) : (
              parkingSpots.map((spot) => (
                <div key={spot.id} className="px-4 py-4 md:px-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{spot.spotNumber}</p>
                    <p className="text-sm text-muted-foreground">{spot.description || 'Curbside pickup spot'}</p>
                    {spot.isAccessible ? <p className="text-xs text-muted-foreground">Accessible spot</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${spot.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
                      {spot.isAvailable ? 'Ready' : 'Occupied'}
                    </span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(`spot-${spot.id}`, async () => {
                        await updateParkingSpotState({ spotId: spot.id, isAvailable: !spot.isAvailable });
                        setMessage(`${spot.isAvailable ? 'Marked' : 'Returned'} spot ${spot.spotNumber} ${spot.isAvailable ? 'occupied' : 'ready'}.`);
                      })}
                      className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      Toggle
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
        <div className="border-b px-4 py-4 md:px-6">
          <h2 className="text-base font-semibold">Ready for pickup</h2>
          <p className="text-sm text-muted-foreground">Packed pickup orders waiting for the customer to arrive.</p>
        </div>
        {readyOrders.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">No pickup orders are waiting for customer arrival.</div>
        ) : (
          <div className="divide-y">
            {readyOrders.map((order) => {
              const metadata = order.metadata || {};
              return (
                <div key={order.id} className="px-4 py-4 md:px-6 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Order #{order.displayId}</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] uppercase tracking-wide text-emerald-700">ready</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{order.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ready since: {metadata.pickupReadyAt ? new Date(metadata.pickupReadyAt).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
        <div className="border-b px-4 py-4 md:px-6">
          <h2 className="text-base font-semibold">Curbside arrival queue</h2>
          <p className="text-sm text-muted-foreground">Orders that have checked in and are waiting for handoff.</p>
        </div>
        {waitingOrders.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">No customers are waiting in the curbside queue.</div>
        ) : (
          <div className="divide-y">
            {waitingOrders.map((order) => {
              const metadata = order.metadata || {};
              return (
                <div key={order.id} className="px-4 py-4 md:px-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Order #{order.displayId}</span>
                      <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{order.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{order.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Spot: {metadata.parkingSpotNumber || 'No spot selected'} · Vehicle: {metadata.vehicleDescription || 'Not provided'}
                    </p>
                    <p className="text-xs text-muted-foreground">Checked in: {metadata.checkInTime ? new Date(metadata.checkInTime).toLocaleString() : '—'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending && pendingKey === `handoff-${order.id}`}
                    onClick={() => runAction(`handoff-${order.id}`, async () => {
                      await completePickupOrderHandoff({ orderId: order.id });
                      setMessage(`Completed curbside handoff for order #${order.displayId}.`);
                    })}
                    className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
                  >
                    {isPending && pendingKey === `handoff-${order.id}` ? 'Completing…' : 'Complete handoff'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
