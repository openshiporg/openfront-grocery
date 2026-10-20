'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Minus, Plus, Route, Truck, UserRound } from 'lucide-react';
import {
  PlatformChip,
  PlatformEmptyState,
  PlatformFeedback,
  PlatformField,
  PlatformMeter,
  PlatformStatusBadge,
  PlatformSurface,
  platformButton,
  platformCheckbox,
  platformHref,
  platformSelect,
  type PlatformSearchParams,
} from '@/features/platform/components/PlatformPrimitives';
import { formatCalendarDate } from '@/features/platform/lib/format';
import { PlatformTime } from '@/features/platform/components/PlatformTime';
import { createDeliveryRouteFromReadyOrders, updateDeliveryRouteStatus, updateDeliverySlotState } from '@/features/platform/delivery/actions';
import { DeliveryStopForm, type DeliveryStopRecord } from './DeliveryStopForm';

interface DeliverySlotRecord {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  currentBookings: number;
  isActive: boolean;
  deliveryFee: number;
}

interface DeliveryOrderRecord {
  id: string;
  displayId: number;
  email?: string | null;
  status: string;
  deliveryDate?: string | null;
  deliveryTimeWindow?: string | null;
  metadata?: Record<string, any> | null;
  lineItems?: Array<{ id: string; quantity: number }>;
}

interface DeliveryRouteRecord {
  id: string;
  date: string;
  timeWindow: string;
  status: string;
  stops?: DeliveryStopRecord[] | null;
  startedAt?: string | null;
  completedAt?: string | null;
  driver?: { id: string; name?: string | null; email?: string | null } | null;
  orders: Array<{ id: string; displayId: number; status: string; metadata?: Record<string, any> | null }>;
}

interface DriverRecord {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface DeliveryOperationsClientProps {
  slots: DeliverySlotRecord[];
  routes: DeliveryRouteRecord[];
  readyOrders: DeliveryOrderRecord[];
  drivers: DriverRecord[];
  driversTruncated: boolean;
  timezone: string;
  search: string;
  routeView: RouteView;
  routeViewCounts: Record<RouteView, number>;
  slotView: string;
  slotSort: string;
  readyTotal: number;
  slotTotal: number;
  /** URL state; every queue's search, view, sort and page live in the URL. */
  params: PlatformSearchParams;
  readyPager: ReactNode;
  slotPager: ReactNode;
  routePager: ReactNode;
}

const PATH = '/dashboard/platform/delivery';
type RouteView = 'open' | 'in_progress' | 'planning' | 'completed' | 'all';
const routeViews: Array<{ value: RouteView; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'On the road' },
  { value: 'planning', label: 'Planning' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
];
const slotViews = [{ value: 'all', label: 'All slots' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'pressure', label: '80%+ booked' }];

function formatDay(value?: string | null) {
  if (!value) return 'Unscheduled';
  return new Date(value).toISOString().split('T')[0];
}

export default function DeliveryOperationsClient({ slots, routes, readyOrders, drivers, driversTruncated, timezone, search, routeView, routeViewCounts, slotView, slotSort, readyTotal, slotTotal, params, readyPager, slotPager, routePager }: DeliveryOperationsClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState(drivers[0]?.id || '');
  const [routeGroupKey, setRouteGroupKey] = useState('');
  const [isPending, startTransition] = useTransition();

  // Each action returns a typed result; an unknown outcome is reported, never shown as success.
  const runAction = (fn: () => Promise<{ ok: true; data: any } | { ok: false; error: string; uncertain: boolean }>, success: (data: any) => string) => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) { setError(result.uncertain ? 'We couldn’t confirm that change. Refresh the page to see whether it was applied before trying again.' : result.error); return; }
        setMessage(success(result.data));
        router.refresh();
      } catch {
        setError('We couldn’t confirm that change. Refresh the page to see whether it was applied before trying again.');
      }
    });
  };

  const groupedReadyOrders = useMemo(() => {
    const groups = new Map<string, DeliveryOrderRecord[]>();
    for (const order of readyOrders) {
      const key = `${formatDay(order.deliveryDate)}|${order.deliveryTimeWindow || 'unknown'}`;
      groups.set(key, [...(groups.get(key) || []), order]);
    }
    return Array.from(groups.entries()).map(([key, orders]) => ({ key, orders }));
  }, [readyOrders]);

  const activeGroup = groupedReadyOrders.find((group) => group.key === routeGroupKey) || groupedReadyOrders[0];
  // Only visible orders in the active group can be selected or submitted.
  const selectedOrders = activeGroup?.orders.filter((order) => selectedOrderIds.includes(order.id)) || [];

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]
    );
  };

  const selectGroup = (key: string) => {
    setRouteGroupKey(key);
    setSelectedOrderIds([]);
  };

  const createRoute = () => {
    if (!activeGroup || selectedOrders.length === 0) return;
    const [deliveryDate, deliveryTimeWindow] = activeGroup.key.split('|');
    const orderIds = selectedOrders.map((order) => order.id);
    runAction(
      () => createDeliveryRouteFromReadyOrders({ deliveryDate: new Date(deliveryDate).toISOString(), deliveryTimeWindow, orderIds, driverId: selectedDriverId }),
      (data) => { setSelectedOrderIds([]); return `Created route ${String(data.routeId).slice(-6)} with ${orderIds.length} ${orderIds.length === 1 ? 'order' : 'orders'}.`; },
    );
  };

  const updateRoute = (route: DeliveryRouteRecord, status: 'in_progress' | 'completed') => {
    runAction(
      () => updateDeliveryRouteStatus({ routeId: route.id, status }),
      () => status === 'in_progress' ? `Dispatched route ${route.id.slice(-6)}.` : `Completed route ${route.id.slice(-6)}.`,
    );
  };

  const allInGroupSelected = Boolean(activeGroup && activeGroup.orders.every((order) => selectedOrderIds.includes(order.id)));

  const stepper = (label: string, value: string, onMinus: () => void, onPlus: () => void) => (
    <div className="flex items-center gap-1.5">
      <span className="w-16 text-xs text-muted-foreground">{label}</span>
      <div className="inline-flex items-center rounded-md border bg-background shadow-xs">
        <button type="button" disabled={isPending} onClick={onMinus} aria-label={`Decrease ${label.toLowerCase()}`} className={platformButton('ghost', 'icon', 'rounded-r-none')}><Minus aria-hidden="true" /></button>
        <span className="min-w-12 border-x px-2 text-center text-xs font-semibold tabular-nums">{value}</span>
        <button type="button" disabled={isPending} onClick={onPlus} aria-label={`Increase ${label.toLowerCase()}`} className={platformButton('ghost', 'icon', 'rounded-l-none')}><Plus aria-hidden="true" /></button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {(message || error) && <PlatformFeedback tone={error ? 'error' : 'success'}>{error || message}</PlatformFeedback>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <PlatformSurface icon={Route} title="Build a route" count={readyTotal} description="Packed delivery orders grouped by day and booked window. Select orders, pick a driver, and create one route per group.">
          {groupedReadyOrders.length === 0 ? (
            <PlatformEmptyState compact icon={Truck} title="Nothing to route" description={search ? 'No packed delivery orders match the search.' : 'Packed delivery orders appear here once Pick & pack marks them packed.'} />
          ) : (
            <div className="space-y-4 p-4 md:p-5">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Delivery window groups">
                {groupedReadyOrders.map((group) => {
                  const [day, window] = group.key.split('|');
                  const active = activeGroup?.key === group.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectGroup(group.key)}
                      className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors ${active ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted'}`}
                    >
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      {day === 'Unscheduled' ? day : formatCalendarDate(day)} · <span className="capitalize">{window.replaceAll('_', ' ')}</span>
                      <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-background/20' : 'bg-muted'}`}>{group.orders.length}</span>
                    </button>
                  );
                })}
              </div>

              <div className="overflow-hidden rounded-lg border bg-background">
                <label className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    className={platformCheckbox}
                    checked={allInGroupSelected}
                    onChange={() => setSelectedOrderIds(allInGroupSelected ? [] : activeGroup?.orders.map((order) => order.id) || [])}
                  />
                  {selectedOrders.length ? `${selectedOrders.length} of ${activeGroup?.orders.length || 0} selected` : 'Select all in this window'}
                </label>
                <div className="max-h-80 divide-y overflow-y-auto">
                  {activeGroup?.orders.map((order) => (
                    <label key={order.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40 has-[:checked]:bg-muted/50">
                      <input type="checkbox" className={platformCheckbox} checked={selectedOrderIds.includes(order.id)} onChange={() => toggleOrder(order.id)} />
                      <span className="font-semibold tabular-nums">#{order.displayId}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{order.email}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{order.lineItems?.length || 0} lines</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <PlatformField label="Driver" className="flex-1" hint={driversTruncated ? 'Showing the first 200 drivers by name.' : undefined}>
                  <select value={selectedDriverId} onChange={(event) => setSelectedDriverId(event.target.value)} className={platformSelect}>
                    {drivers.length === 0 ? <option value="">No eligible drivers available</option> : null}
                    {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name || driver.email}</option>)}
                  </select>
                </PlatformField>
                <button type="button" disabled={isPending || selectedOrders.length === 0 || !selectedDriverId} onClick={createRoute} className={platformButton('primary', 'md')}>
                  <Route aria-hidden="true" />Create route · {selectedOrders.length}
                </button>
              </div>
            </div>
          )}
          {readyPager}
        </PlatformSurface>

        <PlatformSurface icon={CalendarClock} title="Delivery capacity" count={slotTotal} description="Order-count capacity, slot fee and availability. Changes apply to new bookings immediately."
          tabs={<div className="flex flex-wrap items-center gap-2 px-4 py-2 md:px-5">
            <nav aria-label="Slot filter" className="flex flex-wrap gap-1">
              {slotViews.map((view) => <Link key={view.value} scroll={false} aria-current={slotView === view.value ? 'page' : undefined} href={platformHref(PATH, params, { slots: view.value, slotPage: null })} className={`inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors ${slotView === view.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{view.label}</Link>)}
            </nav>
            <label className="ml-auto flex items-center gap-2 text-xs font-medium text-muted-foreground">Sort
              <select value={slotSort} onChange={(event) => router.push(platformHref(PATH, params, { slotSort: event.target.value, slotPage: null }), { scroll: false })} className={`${platformSelect} h-7 w-auto`}><option value="date">Date and time</option><option value="pressure">Highest pressure</option><option value="capacity">Least capacity left</option></select>
            </label>
          </div>}>
          {slots.length === 0 ? (
            <PlatformEmptyState compact icon={CalendarClock} title="No slots match" description="Change the slot filter or search." />
          ) : (
            <div className="max-h-[36rem] divide-y overflow-y-auto">
              {slots.map((slot) => {
                const pressure = slot.capacity > 0 ? Math.min(100, Math.round((slot.currentBookings / slot.capacity) * 100)) : 0;
                return (
                  <div key={slot.id} className={`space-y-3 px-4 py-3.5 md:px-5 ${slot.isActive ? '' : 'bg-muted/30'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{formatCalendarDate(slot.date)} · <span className="tabular-nums">{slot.startTime}–{slot.endTime}</span></p>
                        <p className="text-xs text-muted-foreground tabular-nums">{slot.currentBookings} of {slot.capacity} booked · {pressure}%</p>
                      </div>
                      <PlatformStatusBadge status={slot.isActive ? 'active' : 'closed'} label={slot.isActive ? 'Live' : 'Closed'} />
                    </div>
                    <PlatformMeter value={slot.currentBookings} max={slot.capacity} label={`Slot utilization ${pressure}%`} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {stepper('Capacity', String(slot.capacity),
                        () => runAction(() => updateDeliverySlotState({ slotId: slot.id, capacity: Math.max(slot.currentBookings || 1, slot.capacity - 1) }), () => `Reduced capacity for ${slot.startTime}–${slot.endTime}.`),
                        () => runAction(() => updateDeliverySlotState({ slotId: slot.id, capacity: slot.capacity + 1 }), () => `Increased capacity for ${slot.startTime}–${slot.endTime}.`))}
                      {stepper('Slot fee', `$${((slot.deliveryFee || 0) / 100).toFixed(2)}`,
                        () => runAction(() => updateDeliverySlotState({ slotId: slot.id, deliveryFee: Math.max(0, (slot.deliveryFee || 0) - 100) }), () => `Lowered delivery fee for ${slot.startTime}–${slot.endTime}.`),
                        () => runAction(() => updateDeliverySlotState({ slotId: slot.id, deliveryFee: Math.max(0, (slot.deliveryFee || 0) + 100) }), () => `Raised delivery fee for ${slot.startTime}–${slot.endTime}.`))}
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(() => updateDeliverySlotState({ slotId: slot.id, isActive: !slot.isActive }), () => `${slot.isActive ? 'Closed' : 'Re-opened'} delivery slot ${slot.startTime}–${slot.endTime}.`)}
                        className={platformButton(slot.isActive ? 'ghost' : 'secondary', 'sm', 'sm:ml-auto')}
                      >
                        {slot.isActive ? 'Close slot' : 'Open slot'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {slotPager}
        </PlatformSurface>
      </div>

      <PlatformSurface
        icon={Truck}
        title="Routes"
        count={routeViewCounts[routeView]}
        description="Dispatch planned routes, record each stop outcome, and complete runs once every stop is delivered or back at the store."
        tabs={
          <nav aria-label="Route status" className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:px-5">
            {routeViews.map((view) => {
              const selected = routeView === view.value;
              return (
                <Link key={view.value} scroll={false} aria-current={selected ? 'page' : undefined} href={platformHref(PATH, params, { routes: view.value, routePage: null })} className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                  {view.label}<span className={`tabular-nums ${selected ? 'opacity-80' : ''}`}>{routeViewCounts[view.value] ?? 0}</span>
                </Link>
              );
            })}
          </nav>
        }
      >
        {routes.length === 0 ? (
          <PlatformEmptyState
            icon={Route}
            title={routeViewCounts.all === 0 ? 'No routes yet' : search ? 'No routes match' : routeView === 'open' ? 'No open routes' : 'No routes in this state'}
            description={routeViewCounts.all === 0 ? 'Create a route from packed orders above to start dispatch.' : search ? 'No delivery routes match the current search.' : routeView === 'open' ? 'Every route is completed. Build a new route from packed orders above.' : 'Choose another status to see more routes.'}
            action={routeViewCounts.all && routeView !== 'all' ? <Link href={platformHref(PATH, params, { routes: 'all', routePage: null })} className={platformButton('secondary', 'sm')}>Show all routes</Link> : undefined}
          />
        ) : (
          <div className="divide-y">
            {routes.map((route) => {
              const stops = route.stops || [];
              const settledStops = stops.filter((stop) => ['delivered', 'returned'].includes(stop.status)).length;
              return (
                <article key={route.id} className="space-y-4 px-4 py-4 md:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold capitalize">{route.timeWindow.replaceAll('_', ' ')}</h3>
                        <PlatformStatusBadge status={route.status} />
                        <span className="font-mono text-xs text-muted-foreground">Route …{route.id.slice(-6)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" aria-hidden="true" />{formatCalendarDate(route.date)}</span>
                        <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" aria-hidden="true" />{route.driver?.name || route.driver?.email || 'Unassigned'}</span>
                        {route.startedAt ? <PlatformTime value={route.startedAt} prefix="Dispatched" /> : null}
                        {route.completedAt ? <PlatformTime value={route.completedAt} prefix="Completed" /> : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(route.orders || []).length === 0 ? <span className="text-xs text-muted-foreground">No assigned orders yet.</span> : route.orders.map((order) => <PlatformChip key={order.id}>#{order.displayId} · {order.status.replaceAll('_', ' ')}</PlatformChip>)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 lg:items-end">
                      {stops.length ? (
                        <div className="w-44">
                          <p className="mb-1 text-right text-xs text-muted-foreground tabular-nums">{settledStops}/{stops.length} stops settled</p>
                          <PlatformMeter value={settledStops} max={stops.length} tone="positive" label="Settled stops" />
                        </div>
                      ) : null}
                      {route.status === 'planning' && (
                        <button type="button" disabled={isPending || route.orders.length === 0} onClick={() => updateRoute(route, 'in_progress')} className={platformButton('primary', 'md')}>
                          <Truck aria-hidden="true" />Dispatch route
                        </button>
                      )}
                      {route.status === 'in_progress' && (
                        <button type="button" disabled={isPending || !route.stops?.length || route.stops.some(stop => !['delivered', 'returned'].includes(stop.status))} onClick={() => updateRoute(route, 'completed')} className={platformButton('success', 'md')}>
                          Complete route
                        </button>
                      )}
                    </div>
                  </div>
                  {stops.length ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {stops.map(stop => <DeliveryStopForm key={`${route.id}:${stop.orderId}:${stop.status}`} routeId={route.id} stop={stop} active={route.status === 'in_progress'} timezone={timezone} />)}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
        {routePager}
      </PlatformSurface>
    </div>
  );
}
