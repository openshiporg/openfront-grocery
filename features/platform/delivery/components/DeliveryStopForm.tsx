'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { recordDeliveryStopOutcome } from '../actions';
import type { DeliveryStopStatus } from '@/features/keystone/lib/deliveryStops';
import { ReturnedDeliveryRescheduleForm } from './ReturnedDeliveryRescheduleForm';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { PlatformStatusBadge } from '@/features/platform/components/PlatformStatus';
import { PlatformTime } from '@/features/platform/components/PlatformTime';
import { platformButton, platformInput, platformSelect, platformTextarea } from '@/features/platform/components/platformStyles';

export type DeliveryStopRecord = { orderId: string; displayId?: number; status: string; custody?: string; reason?: string; recipient?: string; proofReference?: string; retryAt?: string; conditionEvidence?: string; events?: Array<unknown> };

/** `timezone` is the Store's: an agreed retry time is entered and checked as Store-local time. */
export function DeliveryStopForm({ routeId, stop, active, timezone }: { routeId: string; stop: DeliveryStopRecord; active: boolean; timezone: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<DeliveryStopStatus>(['failed', 'refused'].includes(stop.status) ? 'returned' : 'delivered');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [key, setKey] = useState(() => `stop:${stop.orderId}:${globalThis.crypto.randomUUID()}`);
  const terminal = ['delivered', 'returned'].includes(stop.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setError('');
    try {
      const result = await recordDeliveryStopOutcome({ routeId, orderId: stop.orderId, status,
        recipient: String(data.get('recipient') || ''), proofReference: String(data.get('proofReference') || ''),
        reason: String(data.get('reason') || ''), custody: status === 'delivered' ? 'recipient' : status === 'returned' ? 'store' : 'driver',
        conditionEvidence: String(data.get('conditionEvidence') || ''), retryLocalTime: String(data.get('retryAt') || ''),
        approvalEvidence: String(data.get('approvalEvidence') || ''), idempotencyKey: key });
      if (!result.ok) {
        // Same key on an unknown outcome: resubmitting returns the recorded outcome instead of a second one.
        setError(result.uncertain ? 'We couldn’t confirm this outcome. Submit it again unchanged to check.' : result.error);
        return;
      }
      setMessage(`Stop recorded as ${result.data.status}.`);
      setKey(`stop:${stop.orderId}:${globalThis.crypto.randomUUID()}`);
      router.refresh();
    } catch { setError('We couldn’t confirm this outcome. Submit it again unchanged to check.'); }
    finally { setPending(false); }
  }

  return <article className={`space-y-3 rounded-lg border bg-background p-3.5 shadow-xs ${terminal ? 'opacity-90' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tabular-nums">Order #{stop.displayId || stop.orderId.slice(-6)}</h3>
        {stop.custody && <p className="text-xs text-muted-foreground">Custody: <span className="capitalize">{stop.custody}</span></p>}
      </div>
      <PlatformStatusBadge status={stop.status} />
    </div>
    {(stop.reason || stop.recipient || stop.retryAt) && <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
      {stop.reason && <p>{stop.reason}</p>}
      {stop.recipient && <p>Received by <span className="font-medium">{stop.recipient}</span> · {stop.proofReference}</p>}
      {stop.retryAt && <p>Agreed retry: <PlatformTime value={stop.retryAt} /></p>}
    </div>}
    {stop.status === 'returned' && <><p className="text-xs text-muted-foreground">Goods are back at the store. Arrange an approved later delivery, or complete the refund and stock disposition in Orders.</p><ReturnedDeliveryRescheduleForm orderId={stop.orderId} /></>}
    {active && !terminal && stop.status !== 'planned' && <form className="grid gap-3 border-t pt-3 sm:grid-cols-2" onSubmit={submit} aria-busy={pending}>
      <PlatformField label="Outcome" className="sm:col-span-2"><select className={platformSelect} value={status} onChange={event => setStatus(event.target.value as DeliveryStopStatus)}>
        {!['failed', 'refused'].includes(stop.status) && <><option value="delivered">Delivered to recipient</option><option value="failed">Delivery failed; driver retains goods</option><option value="refused">Customer refused; driver retains goods</option></>}
        <option value="returned">Returned to store custody</option><option value="rescheduled">Customer-approved retry in booked window</option>
      </select></PlatformField>
      {status === 'delivered' && <>
        <PlatformField label="Recipient"><input className={platformInput} name="recipient" required /></PlatformField>
        <PlatformField label="Handoff proof reference"><input className={platformInput} name="proofReference" required minLength={4} placeholder="Signed receipt or proof reference" /></PlatformField>
      </>}
      {status !== 'delivered' && <PlatformField label="Reason" className="sm:col-span-2"><textarea className={`${platformTextarea} min-h-16`} name="reason" required placeholder="Describe the delivery exception" /></PlatformField>}
      <PlatformField label="Package and cold-chain condition" className="sm:col-span-2"><textarea className={`${platformTextarea} min-h-16`} name="conditionEvidence" required minLength={8} placeholder="Observed condition, temperature if relevant, and custody transfer" /></PlatformField>
      {status === 'rescheduled' && <>
        <PlatformField label={`Agreed retry time (${timezone})`} hint="Store time. Must fall within the existing delivery window; booking and price are kept."><input className={platformInput} name="retryAt" type="datetime-local" required /></PlatformField>
        <PlatformField label="Customer approval"><textarea className={`${platformTextarea} min-h-16`} name="approvalEvidence" required minLength={8} placeholder="Who approved the retry and how they were contacted" /></PlatformField>
      </>}
      <div className="sm:col-span-2"><button className={platformButton('primary', 'md', 'w-full sm:w-auto')} disabled={pending}>{pending ? 'Saving outcome…' : 'Record stop outcome'}</button></div>
    </form>}
    {error && <PlatformFeedback tone="error">{error}</PlatformFeedback>}
    {message && <PlatformFeedback tone="success">{message}</PlatformFeedback>}
  </article>;
}
