'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getReturnedDeliveryRescheduleSlots, rescheduleReturnedDelivery } from '../actions';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformSelect, platformTextarea } from '@/features/platform/components/platformStyles';
export function ReturnedDeliveryRescheduleForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [slots, setSlots] = useState<any[] | null>(null), [timezone, setTimezone] = useState('UTC');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [key] = useState(() => `delivery-reschedule:${orderId}:${globalThis.crypto.randomUUID()}`);
  return <section className="space-y-3 border-t pt-3">
    {!complete && <button type="button" className={platformButton('secondary', 'sm')} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await getReturnedDeliveryRescheduleSlots(orderId); if (!result.ok) { setError(result.error); return; } setSlots(result.data.slots); setTimezone(result.data.timezone); setMessage(result.data.message); } catch { setError('Later delivery windows could not be loaded. Try again.'); } finally { setBusy(false); } }}>Review later delivery windows</button>}
    {!complete && !!slots?.length && <form className="space-y-3" aria-busy={busy} onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
      try {
        const result = await rescheduleReturnedDelivery({ orderId, deliverySlotId: String(data.get('deliverySlotId')), customerApproval: String(data.get('customerApproval')), conditionEvidence: String(data.get('conditionEvidence')), idempotencyKey: key });
        if (!result.ok) { setError(result.uncertain ? 'We couldn’t confirm the new window. Submit again to check; it won’t be reserved twice.' : result.error); return; }
        setComplete(true); setMessage('Later delivery reserved. Assign the packed order to a new route.'); router.refresh();
      }
      catch { setError('We couldn’t confirm the new window. Submit again to check; it won’t be reserved twice.'); } finally { setBusy(false); }
    }}>
      <PlatformField label={`New delivery window (${timezone})`}><select name="deliverySlotId" className={platformSelect} required>{slots.map(slot => <option key={slot.id} value={slot.id}>{new Date(slot.date).toLocaleDateString('en-US', { timeZone: timezone })} · {slot.startTime}–{slot.endTime} · {slot.available} available</option>)}</select></PlatformField>
      <PlatformField label="Customer approval of the new window"><textarea name="customerApproval" className={`${platformTextarea} min-h-16`} required minLength={12} maxLength={1000} placeholder="Customer identity, contact channel and agreed date/time" /></PlatformField>
      <PlatformField label="Return inspection and cold-chain condition"><textarea name="conditionEvidence" className={`${platformTextarea} min-h-16`} required minLength={12} maxLength={1000} placeholder="Confirm goods remain sealed/safe in store custody; record temperature and inspection" /></PlatformField>
      <p className="text-xs text-muted-foreground">Reserved goods must remain safe through the new window. The existing final price is retained. Refund or inventory disposition closes this rebooking path.</p>
      <button className={platformButton('primary', 'md')} disabled={busy}>{busy ? 'Reserving…' : 'Reserve approved later delivery'}</button>
    </form>}
    {message && <PlatformFeedback tone={complete ? 'success' : 'info'}>{message}</PlatformFeedback>}{error && <PlatformFeedback tone="error">{error}</PlatformFeedback>}
  </section>;
}
