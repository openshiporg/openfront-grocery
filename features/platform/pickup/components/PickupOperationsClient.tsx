'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Accessibility, Car, CircleParking, Clock, Minus, PackageCheck, Plus, ShoppingBasket } from 'lucide-react';
import {
  PlatformChip,
  PlatformEmptyState,
  PlatformFeedback,
  PlatformMeter,
  PlatformStatusBadge,
  PlatformSurface,
  platformButton,
  platformHref,
  platformSelect,
  type PlatformSearchParams,
} from '@/features/platform/components/PlatformPrimitives';
import { formatCalendarDate } from '@/features/platform/lib/format';
import { PlatformTime } from '@/features/platform/components/PlatformTime';
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
  occupiedSpotIds: string[];
  /** Server-ordered: longest-waiting customer first. */
  waitingOrders: PickupQueueOrder[];
  readyOrders: PickupQueueOrder[];
  waitingTotal: number;
  readyTotal: number;
  slotTotal: number;
  search: string;
  slotView: string;
  slotSort: string;
  params: PlatformSearchParams;
  arrivalPager: ReactNode;
  stagedPager: ReactNode;
  slotPager: ReactNode;
}

const PATH = '/dashboard/platform/pickup';
const slotViews = [{ value: 'all', label: 'All slots' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'pressure', label: '80%+ booked' }];

export default function PickupOperationsClient({ slots, parkingSpots, occupiedSpotIds: occupiedIds, waitingOrders, readyOrders, waitingTotal, readyTotal, slotTotal, search, slotView, slotSort, params, arrivalPager, stagedPager, slotPager }: PickupOperationsClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const visibleSlots = slots;
  const visibleReady = readyOrders;
  const visibleWaiting = waitingOrders;

  const must = <T,>(result: { ok: true; data: T } | { ok: false; error: string }) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };
  // A bay is occupied only while an arrived, unfinished pickup order holds it (computed across
  // every arrival, not just this page); otherwise an unavailable bay was closed by staff.
  const occupiedSpotIds = new Set(occupiedIds);

  const runAction = (key: string, fn: () => Promise<void>) => {
    setMessage(null);
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div className="space-y-5">
      {(message || error) && <PlatformFeedback tone={error ? 'error' : 'success'}>{error || message}</PlatformFeedback>}

      <PlatformSurface
        icon={Car}
        title="Curbside arrivals"
        count={waitingTotal}
        description="Checked-in customers, longest wait first. Completing a handoff frees their parking spot."
        className={visibleWaiting.length ? 'border-amber-500/40 ring-1 ring-amber-500/15' : ''}
      >
        {visibleWaiting.length === 0 ? (
          <PlatformEmptyState compact icon={Car} title="No one is waiting" description={search ? 'No curbside arrivals match the search.' : 'Checked-in customers appear here with their spot and vehicle.'} />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5 2xl:grid-cols-3">
            {visibleWaiting.map((order) => {
              const metadata = order.metadata || {};
              const busy = isPending && pendingKey === `handoff-${order.id}`;
              return (
                <article key={order.id} className="flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold tabular-nums">#{order.displayId}</p>
                      <p className="truncate text-sm text-muted-foreground">{order.email}</p>
                    </div>
                    <div className="grid min-w-16 place-items-center rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-center ring-1 ring-amber-500/25 ring-inset">
                      <span className="text-[10px] font-medium tracking-wide text-amber-800 uppercase dark:text-amber-300">Spot</span>
                      <span className="text-lg leading-none font-bold tabular-nums">{metadata.parkingSpotNumber || '—'}</span>
                    </div>
                  </div>
                  <dl className="grid gap-1 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Car className="size-3.5" aria-hidden="true" /><dt className="sr-only">Vehicle</dt><dd className="text-foreground">{metadata.vehicleDescription || 'Vehicle not provided'}</dd></div>
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="size-3.5" aria-hidden="true" /><dt className="sr-only">Checked in</dt><dd>{metadata.checkInTime ? <PlatformTime relative value={metadata.checkInTime} prefix="Checked in" /> : 'Check-in time not recorded'}</dd></div>
                  </dl>
                  <button
                    type="button"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => runAction(`handoff-${order.id}`, async () => {
                      must(await completePickupOrderHandoff({ orderId: order.id }));
                      setMessage(`Completed curbside handoff for order #${order.displayId}.`);
                    })}
                    className={platformButton('primary', 'lg', 'mt-auto w-full')}
                  >
                    <PackageCheck aria-hidden="true" />{busy ? 'Completing…' : 'Complete handoff'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
        {arrivalPager}
      </PlatformSurface>

      <PlatformSurface icon={ShoppingBasket} title="Staged for pickup" count={readyTotal} description="Packed pickup orders marked ready, oldest first, waiting for the customer to check in.">
        {visibleReady.length === 0 ? (
          <PlatformEmptyState compact icon={ShoppingBasket} title="Nothing staged" description={search ? 'No ready pickup orders match the search.' : 'Orders appear here once Pick & pack marks them ready for pickup.'} />
        ) : (
          <div className="divide-y">
            {visibleReady.map((order) => {
              const metadata = order.metadata || {};
              return (
                <div key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 md:px-5">
                  <span className="font-semibold tabular-nums">#{order.displayId}</span>
                  <PlatformStatusBadge status="ready_for_pickup" label="Ready" />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{order.email}</span>
                  <span className="text-xs text-muted-foreground">{metadata.pickupReadyAt ? <PlatformTime relative value={metadata.pickupReadyAt} prefix="Ready" /> : 'Ready time not recorded'}</span>
                </div>
              );
            })}
          </div>
        )}
        {stagedPager}
      </PlatformSurface>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <PlatformSurface icon={Clock} title="Pickup slots" count={slotTotal} description="Order-count capacity per slot. Open or close slots as curbside staffing changes."
          tabs={<div className="flex flex-wrap items-center gap-2 px-4 py-2 md:px-5">
            <nav aria-label="Slot filter" className="flex flex-wrap gap-1">
              {slotViews.map((view) => <Link key={view.value} scroll={false} aria-current={slotView === view.value ? 'page' : undefined} href={platformHref(PATH, params, { slots: view.value, slotPage: null })} className={`inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors ${slotView === view.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{view.label}</Link>)}
            </nav>
            <label className="ml-auto flex items-center gap-2 text-xs font-medium text-muted-foreground">Sort
              <select value={slotSort} onChange={(event) => router.push(platformHref(PATH, params, { slotSort: event.target.value, slotPage: null }), { scroll: false })} className={`${platformSelect} h-7 w-auto`}><option value="date">Date and time</option><option value="pressure">Highest pressure</option><option value="capacity">Least capacity left</option></select>
            </label>
          </div>}>
          {visibleSlots.length === 0 ? (
            <PlatformEmptyState compact icon={Clock} title="No slots match" description="Change the slot filter or search." />
          ) : (
            <div className="max-h-[36rem] divide-y overflow-y-auto">
              {visibleSlots.map((slot) => {
                const pressure = slot.maxOrders > 0 ? Math.min(100, Math.round((slot.currentOrders / slot.maxOrders) * 100)) : 0;
                return (
                  <div key={slot.id} className={`grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5 ${slot.isAvailable ? '' : 'bg-muted/30'}`}>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{formatCalendarDate(slot.date)} · <span className="tabular-nums">{slot.startTime}–{slot.endTime}</span></p>
                        <PlatformStatusBadge status={slot.isAvailable ? 'active' : 'closed'} label={slot.isAvailable ? 'Open' : 'Closed'} />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="max-w-56 flex-1"><PlatformMeter value={slot.currentOrders} max={slot.maxOrders} label={`Slot pressure ${pressure}%`} /></div>
                        <span className="text-xs text-muted-foreground tabular-nums">{slot.currentOrders}/{slot.maxOrders} orders</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center rounded-md border bg-background shadow-xs">
                        <button type="button" disabled={isPending} aria-label="Decrease capacity" className={platformButton('ghost', 'icon', 'rounded-r-none')} onClick={() => runAction(`slot-minus-${slot.id}`, async () => {
                          const next = Math.max(slot.currentOrders || 1, slot.maxOrders - 1);
                          must(await updatePickupSlotState({ slotId: slot.id, maxOrders: next }));
                          setMessage(`Reduced capacity for ${slot.startTime}–${slot.endTime}.`);
                        })}><Minus aria-hidden="true" /></button>
                        <span className="min-w-10 border-x px-2 text-center text-xs font-semibold tabular-nums">{slot.maxOrders}</span>
                        <button type="button" disabled={isPending} aria-label="Increase capacity" className={platformButton('ghost', 'icon', 'rounded-l-none')} onClick={() => runAction(`slot-plus-${slot.id}`, async () => {
                          must(await updatePickupSlotState({ slotId: slot.id, maxOrders: slot.maxOrders + 1 }));
                          setMessage(`Increased capacity for ${slot.startTime}–${slot.endTime}.`);
                        })}><Plus aria-hidden="true" /></button>
                      </div>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(`slot-toggle-${slot.id}`, async () => {
                          must(await updatePickupSlotState({ slotId: slot.id, isAvailable: !slot.isAvailable }));
                          setMessage(`${slot.isAvailable ? 'Closed' : 'Re-opened'} pickup slot ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className={platformButton(slot.isAvailable ? 'ghost' : 'secondary', 'sm')}
                      >
                        {slot.isAvailable ? 'Close' : 'Open'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {slotPager}
        </PlatformSurface>

        <PlatformSurface icon={CircleParking} title="Parking spots" count={parkingSpots.length} description="Spot readiness. Occupied spots release only through a completed handoff.">
          {parkingSpots.length === 0 ? (
            <PlatformEmptyState compact icon={CircleParking} title="No parking spots" description="Add curbside spots in Store setup to enable check-in." />
          ) : (
            <div className="grid grid-cols-2 gap-2 p-4 md:p-5">
              {parkingSpots.map((spot) => (
                <div key={spot.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${spot.isAvailable ? 'bg-background' : 'border-dashed bg-muted/40'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-lg leading-none font-bold tabular-nums">{spot.spotNumber}</span>
                    {spot.isAccessible ? <Accessibility className="size-4 text-blue-600 dark:text-blue-400" aria-label="Accessible spot" /> : null}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{spot.description || 'Curbside pickup spot'}</p>
                  <PlatformStatusBadge status={spot.isAvailable ? 'available' : 'held'} label={spot.isAvailable ? 'Ready' : occupiedSpotIds.has(spot.id) ? 'Occupied' : 'Closed'} />
                  {spot.isAvailable ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(`spot-${spot.id}`, async () => {
                        must(await updateParkingSpotState({ spotId: spot.id, isAvailable: false }));
                        setMessage(`Marked spot ${spot.spotNumber} unavailable.`);
                      })}
                      className={platformButton('ghost', 'sm', '-mx-1 justify-start')}
                    >
                      Mark unavailable
                    </button>
                  ) : occupiedSpotIds.has(spot.id) ? <PlatformChip>Releases on handoff</PlatformChip> : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(`spot-${spot.id}`, async () => {
                        must(await updateParkingSpotState({ spotId: spot.id, isAvailable: true }));
                        setMessage(`Reopened spot ${spot.spotNumber}.`);
                      })}
                      className={platformButton('ghost', 'sm', '-mx-1 justify-start')}
                    >
                      Reopen spot
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </PlatformSurface>
      </div>
    </div>
  );
}
