'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getReturnedDeliveryRescheduleSlots, rescheduleReturnedDelivery } from '../actions';
const field = 'min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm';
export function ReturnedDeliveryRescheduleForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [slots, setSlots] = useState<any[] | null>(null), [timezone, setTimezone] = useState('UTC');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [key] = useState(() => `delivery-reschedule:${orderId}:${globalThis.crypto.randomUUID()}`);
  return <section className="space-y-3 border-t pt-3">
    {!complete && <button type="button" className={field} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await getReturnedDeliveryRescheduleSlots(orderId); setSlots(result.slots); setTimezone(result.timezone); setMessage(result.message); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load later windows'); } finally { setBusy(false); } }}>Review later delivery windows</button>}
    {!complete && !!slots?.length && <form className="space-y-3" aria-busy={busy} onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
      try { await rescheduleReturnedDelivery({ orderId, deliverySlotId: String(data.get('deliverySlotId')), customerApproval: String(data.get('customerApproval')), conditionEvidence: String(data.get('conditionEvidence')), idempotencyKey: key }); setComplete(true); setMessage('Later delivery reserved. Assign the packed order to a new route.'); router.refresh(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to reserve the later window'); } finally { setBusy(false); }
    }}>
      <label className="block text-xs font-medium">New delivery window ({timezone})<select name="deliverySlotId" className={field} required>{slots.map(slot => <option key={slot.id} value={slot.id}>{new Date(slot.date).toLocaleDateString('en-US', { timeZone: timezone })} · {slot.startTime}–{slot.endTime} · {slot.available} available</option>)}</select></label>
      <label className="block text-xs font-medium">Customer approval of the new window<textarea name="customerApproval" className={field} required minLength={12} maxLength={1000} placeholder="Customer identity, contact channel and agreed date/time" /></label>
      <label className="block text-xs font-medium">Return inspection and cold-chain condition<textarea name="conditionEvidence" className={field} required minLength={12} maxLength={1000} placeholder="Confirm goods remain sealed/safe in store custody; record temperature and inspection" /></label>
      <p className="text-xs text-muted-foreground">Reserved goods must remain safe through the new window. The existing final price is retained. Refund or inventory disposition closes this rebooking path.</p>
      <button className="min-h-10 rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50" disabled={busy}>{busy ? 'Reserving…' : 'Reserve approved later delivery'}</button>
    </form>}
    {message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
