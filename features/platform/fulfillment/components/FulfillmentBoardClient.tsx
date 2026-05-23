'use client';

import { useMemo, useState, useTransition } from 'react';
import { advanceOrderStatus, saveOrderItemSubstitution } from '@/features/platform/fulfillment/actions';

interface SubstitutionRecord {
  id: string;
  orderItem: string;
  originalProduct: string;
  substitutedProduct: string;
  reason?: string | null;
  customerApproved?: boolean;
  approvedAt?: string | null;
}

interface FulfillmentOrder {
  id: string;
  displayId: number;
  email: string;
  status: string;
  deliveryTimeWindow?: string | null;
  substitutionPreference?: string | null;
  metadata?: Record<string, any> | null;
  lineItems: Array<{
    id: string;
    quantity: number;
    title: string;
    sku?: string | null;
  }>;
}

interface FulfillmentBoardClientProps {
  columns: Array<{ title: string; items: FulfillmentOrder[] }>;
  substitutions: SubstitutionRecord[];
}

function formatPreference(value?: string | null) {
  switch (value) {
    case 'best_match':
      return 'Best match';
    case 'call_me':
      return 'Contact customer';
    case 'refund':
      return 'Remove / refund';
    default:
      return 'No preference';
  }
}

export default function FulfillmentBoardClient({ columns, substitutions }: FulfillmentBoardClientProps) {
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const substitutionMap = useMemo(() => {
    const map = new Map<string, SubstitutionRecord>();
    substitutions.forEach((entry) => map.set(entry.orderItem, entry));
    return map;
  }, [substitutions]);

  const handleAdvanceStatus = (orderId: string, currentStatus: string) => {
    setError(null);
    setMessage(null);
    setPendingOrderId(orderId);

    startTransition(async () => {
      try {
        const order = columns.flatMap((column) => column.items).find((item) => item.id === orderId);
        await advanceOrderStatus({
          orderId,
          currentStatus,
          fulfillmentMethod: order?.metadata?.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery',
          metadata: order?.metadata || null,
        });
        setMessage(`Moved order ${orderId.slice(-6)} to the next fulfillment stage.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update order status.');
      } finally {
        setPendingOrderId(null);
      }
    });
  };

  const handleSaveSubstitution = (formData: FormData) => {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        await saveOrderItemSubstitution({
          orderItemId: String(formData.get('orderItemId') || ''),
          originalProduct: String(formData.get('originalProduct') || ''),
          substitutedProduct: String(formData.get('substitutedProduct') || ''),
          reason: String(formData.get('reason') || ''),
          customerApproved: formData.get('customerApproved') === 'on',
        });
        setMessage('Saved substitution guidance for the picker team.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save substitution.');
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

      <div className="grid gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <section key={column.title} className="rounded-2xl border bg-background shadow-sm overflow-hidden">
            <div className="border-b px-4 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{column.title}</h2>
                <span className="rounded-full border px-2 py-0.5 text-xs">{column.items.length}</span>
              </div>
            </div>
            <div className="divide-y">
              {column.items.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">No orders in this lane.</div>
              ) : (
                column.items.map((order) => {
                  const isPickup = order.metadata?.fulfillmentMethod === 'pickup';
                  const isPickupReady = Boolean(order.metadata?.readyForPickup);
                  const transitionLabel =
                    order.status === 'pending'
                      ? 'Start picking'
                      : order.status === 'picking'
                      ? 'Mark packed'
                      : order.status === 'packed' && isPickup && !isPickupReady
                      ? 'Mark ready for pickup'
                      : order.status === 'packed' && !isPickup
                      ? 'Dispatch ready'
                      : null;

                  return (
                    <div key={order.id} className="px-4 py-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">Order #{order.displayId}</p>
                          <p className="text-sm text-muted-foreground">{order.email}</p>
                        </div>
                        <div className="text-right">
                          <span className="block text-xs text-muted-foreground">{order.lineItems?.length || 0} items</span>
                          <span className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {formatPreference(order.substitutionPreference)}
                          </span>
                          <span className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {isPickup ? (isPickupReady ? 'Pickup ready' : 'Pickup') : 'Delivery'}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">Window: {order.deliveryTimeWindow || '—'}</p>

                      <div className="space-y-3">
                        {order.lineItems.map((item) => {
                          const existing = substitutionMap.get(item.id);

                          return (
                            <div key={item.id} className="rounded-xl border bg-muted/20 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium">{item.quantity}× {item.title}</p>
                                  {item.sku ? <p className="text-[11px] text-muted-foreground">SKU {item.sku}</p> : null}
                                </div>
                                {existing ? (
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${existing.customerApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {existing.customerApproved ? 'Approved substitute' : 'Needs customer review'}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">No substitution</span>
                                )}
                              </div>

                              <div className="mt-3 rounded-lg bg-background p-3">
                                <div className="text-xs text-muted-foreground">
                                  {existing ? (
                                    <>
                                      <div>Swap to: <span className="font-medium text-foreground">{existing.substitutedProduct}</span></div>
                                      {existing.reason ? <div className="mt-1">Reason: {existing.reason}</div> : null}
                                    </>
                                  ) : (
                                    'Record substitution guidance if the ordered item cannot be fulfilled as requested.'
                                  )}
                                </div>

                                <form action={handleSaveSubstitution} className="mt-3 grid gap-2">
                                  <input type="hidden" name="orderItemId" value={item.id} />
                                  <input type="hidden" name="originalProduct" value={item.title} />
                                  <input
                                    name="substitutedProduct"
                                    defaultValue={existing?.substitutedProduct || ''}
                                    placeholder={order.substitutionPreference === 'refund' ? 'Use REMOVED if no substitute should ship' : 'Replacement product or REMOVED'}
                                    className="rounded-md border px-3 py-2 text-sm"
                                  />
                                  <textarea
                                    name="reason"
                                    defaultValue={existing?.reason || ''}
                                    placeholder="Why is this being swapped or removed?"
                                    className="min-h-[76px] rounded-md border px-3 py-2 text-sm"
                                  />
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input name="customerApproved" type="checkbox" defaultChecked={Boolean(existing?.customerApproved)} />
                                    Customer approved this substitution
                                  </label>
                                  <div className="flex justify-end">
                                    <button
                                      type="submit"
                                      disabled={isPending}
                                      className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                                    >
                                      Save substitution
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {transitionLabel ? (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleAdvanceStatus(order.id, order.status)}
                            disabled={isPending && pendingOrderId === order.id}
                            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
                          >
                            {isPending && pendingOrderId === order.id ? 'Updating…' : transitionLabel}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
