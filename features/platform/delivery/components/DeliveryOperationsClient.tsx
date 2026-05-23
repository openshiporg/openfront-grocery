'use client';

import { useMemo, useState, useTransition } from 'react';
import { createDeliveryRouteFromReadyOrders, updateDeliveryRouteStatus, updateDeliverySlotState } from '@/features/platform/delivery/actions';

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
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatDay(value?: string | null) {
  if (!value) return 'Unscheduled';
  return new Date(value).toISOString().split('T')[0];
}

export default function DeliveryOperationsClient({ slots, routes, readyOrders, drivers }: DeliveryOperationsClientProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [routeGroupKey, setRouteGroupKey] = useState('');
  const [isPending, startTransition] = useTransition();

  const runAction = (fn: () => Promise<void>) => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
    });
  };

  const unroutedOrders = useMemo(
    () => readyOrders.filter((order) => !order.metadata?.deliveryRouteId),
    [readyOrders]
  );

  const groupedReadyOrders = useMemo(() => {
    const groups = new Map<string, DeliveryOrderRecord[]>();
    for (const order of unroutedOrders) {
      const key = `${formatDay(order.deliveryDate)}|${order.deliveryTimeWindow || 'unknown'}`;
      groups.set(key, [...(groups.get(key) || []), order]);
    }
    return Array.from(groups.entries()).map(([key, orders]) => ({ key, orders }));
  }, [unroutedOrders]);

  const activeGroup = groupedReadyOrders.find((group) => group.key === routeGroupKey) || groupedReadyOrders[0];
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
    if (!activeGroup) return;
    const [deliveryDate, deliveryTimeWindow] = activeGroup.key.split('|');
    const orderIds = selectedOrderIds.length ? selectedOrderIds : activeGroup.orders.map((order) => order.id);

    runAction(async () => {
      const result = await createDeliveryRouteFromReadyOrders({
        deliveryDate: new Date(deliveryDate).toISOString(),
        deliveryTimeWindow,
        orderIds,
        driverId: selectedDriverId || undefined,
      });
      setMessage(`Created route ${result.routeId.slice(-6)} with ${orderIds.length} orders.`);
      setSelectedOrderIds([]);
    });
  };

  const updateRoute = (route: DeliveryRouteRecord, status: 'in_progress' | 'completed') => {
    runAction(async () => {
      await updateDeliveryRouteStatus({
        routeId: route.id,
        status,
      });
      setMessage(status === 'in_progress' ? `Dispatched route ${route.id.slice(-6)}.` : `Completed route ${route.id.slice(-6)}.`);
    });
  };

  return (
    <div className="space-y-4">
      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
          <div className="border-b px-4 py-4 md:px-6">
            <h2 className="text-base font-semibold">Delivery capacity</h2>
            <p className="text-sm text-muted-foreground">Adjust live delivery slot capacity, fees, and availability as demand shifts.</p>
          </div>
          <div className="divide-y">
            {slots.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No delivery slots configured.</div>
            ) : (
              slots.map((slot) => {
                const pressure = slot.capacity > 0 ? Math.min(100, Math.round((slot.currentBookings / slot.capacity) * 100)) : 0;
                return (
                  <div key={slot.id} className="px-4 py-4 md:px-6 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{new Date(slot.date).toLocaleDateString()} · {slot.startTime} – {slot.endTime}</p>
                        <p className="text-sm text-muted-foreground">{slot.currentBookings}/{slot.capacity} booked · Fee ${((slot.deliveryFee || 0) / 100).toFixed(2)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${slot.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
                        {slot.isActive ? 'Live' : 'Closed'}
                      </span>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Utilization</span>
                        <span>{pressure}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${pressure >= 90 ? 'bg-red-500' : pressure >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pressure}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(async () => {
                          const next = Math.max(slot.currentBookings || 1, slot.capacity - 1);
                          await updateDeliverySlotState({ slotId: slot.id, capacity: next });
                          setMessage(`Reduced capacity for ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Capacity −
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(async () => {
                          await updateDeliverySlotState({ slotId: slot.id, capacity: slot.capacity + 1 });
                          setMessage(`Increased capacity for ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Capacity +
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(async () => {
                          await updateDeliverySlotState({ slotId: slot.id, deliveryFee: Math.max(0, (slot.deliveryFee || 0) + 100) });
                          setMessage(`Raised delivery fee for ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Fee +$1
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(async () => {
                          await updateDeliverySlotState({ slotId: slot.id, deliveryFee: Math.max(0, (slot.deliveryFee || 0) - 100) });
                          setMessage(`Lowered delivery fee for ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Fee -$1
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => runAction(async () => {
                          await updateDeliverySlotState({ slotId: slot.id, isActive: !slot.isActive });
                          setMessage(`${slot.isActive ? 'Closed' : 'Re-opened'} delivery slot ${slot.startTime}–${slot.endTime}.`);
                        })}
                        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        {slot.isActive ? 'Close slot' : 'Open slot'}
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
            <h2 className="text-base font-semibold">Build delivery routes</h2>
            <p className="text-sm text-muted-foreground">Group packed delivery orders by day and time window, then create a route for dispatch.</p>
          </div>
          {groupedReadyOrders.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No packed delivery orders are ready to route.</div>
          ) : (
            <div className="p-4 md:p-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                {groupedReadyOrders.map((group) => {
                  const [day, window] = group.key.split('|');
                  const active = activeGroup?.key === group.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => selectGroup(group.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs ${active ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                    >
                      {day} · {window.replaceAll('_', ' ')} · {group.orders.length}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {activeGroup?.orders.map((order) => (
                  <label key={order.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                    <span>
                      <span className="font-medium">Order #{order.displayId}</span>
                      <span className="ml-2 text-muted-foreground">{order.email}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{order.lineItems?.length || 0} lines</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.includes(order.id)}
                      onChange={() => toggleOrder(order.id)}
                    />
                  </label>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={selectedDriverId}
                  onChange={(event) => setSelectedDriverId(event.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Assign driver later</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>{driver.name || driver.email}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isPending || !activeGroup}
                  onClick={createRoute}
                  className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  Create route ({selectedOrders.length || activeGroup?.orders.length || 0})
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border bg-background shadow-sm overflow-hidden">
        <div className="border-b px-4 py-4 md:px-6">
          <h2 className="text-base font-semibold">Routes</h2>
          <p className="text-sm text-muted-foreground">Dispatch routes and complete delivery runs while keeping order statuses in sync.</p>
        </div>
        {routes.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">No delivery routes found.</div>
        ) : (
          <div className="divide-y">
            {routes.map((route) => (
              <div key={route.id} className="px-4 py-4 md:px-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr_auto]">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{route.timeWindow}</span>
                    <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">{route.status}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Scheduled: {formatDate(route.date)}</p>
                  <p className="text-sm text-muted-foreground">Driver: {route.driver?.name || route.driver?.email || 'Unassigned'}</p>
                  <p className="text-xs text-muted-foreground">Started: {formatDate(route.startedAt)} · Completed: {formatDate(route.completedAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Assigned orders</p>
                  <div className="flex flex-wrap gap-2">
                    {(route.orders || []).length === 0 ? (
                      <span className="text-sm text-muted-foreground">No assigned orders yet.</span>
                    ) : (
                      route.orders.map((order) => (
                        <span key={order.id} className="rounded-full bg-muted px-2.5 py-1 text-xs">#{order.displayId} · {order.status}</span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 xl:items-end">
                  {route.status === 'planning' && (
                    <button
                      type="button"
                      disabled={isPending || route.orders.length === 0}
                      onClick={() => updateRoute(route, 'in_progress')}
                      className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                    >
                      Dispatch route
                    </button>
                  )}
                  {route.status === 'in_progress' && (
                    <button
                      type="button"
                      disabled={isPending || route.orders.length === 0}
                      onClick={() => updateRoute(route, 'completed')}
                      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Complete route
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
