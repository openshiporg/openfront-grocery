'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { recordDeliveryStopOutcome } from '../actions';
import type { DeliveryStopStatus } from '@/features/keystone/lib/deliveryStops';
import { ReturnedDeliveryRescheduleForm } from './ReturnedDeliveryRescheduleForm';

export type DeliveryStopRecord = { orderId: string; displayId?: number; status: string; custody?: string; reason?: string; recipient?: string; proofReference?: string; retryAt?: string; conditionEvidence?: string; events?: Array<unknown> };
const field = 'min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm';

export function DeliveryStopForm({ routeId, stop, active }: { routeId: string; stop: DeliveryStopRecord; active: boolean }) {
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
      const retryAt = String(data.get('retryAt') || '');
      const result = await recordDeliveryStopOutcome({ routeId, orderId: stop.orderId, status,
        recipient: String(data.get('recipient') || ''), proofReference: String(data.get('proofReference') || ''),
        reason: String(data.get('reason') || ''), custody: status === 'delivered' ? 'recipient' : status === 'returned' ? 'store' : 'driver',
        conditionEvidence: String(data.get('conditionEvidence') || ''), retryAt: retryAt ? new Date(retryAt).toISOString() : '',
        approvalEvidence: String(data.get('approvalEvidence') || ''), idempotencyKey: key });
      setMessage(`Stop recorded as ${result.status}.`);
      setKey(`stop:${stop.orderId}:${globalThis.crypto.randomUUID()}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record delivery outcome'); }
    finally { setPending(false); }
  }

  return <article className="rounded-lg border p-3 space-y-3">
    <div><h3 className="text-sm font-medium">Order #{stop.displayId || stop.orderId.slice(-6)} · {stop.status.replaceAll('_', ' ')}</h3>
      {stop.custody && <p className="text-xs text-muted-foreground">Custody: {stop.custody}</p>}
      {stop.reason && <p className="text-sm">{stop.reason}</p>}
      {stop.recipient && <p className="text-sm">Received by {stop.recipient} · {stop.proofReference}</p>}
      {stop.retryAt && <p className="text-sm">Agreed retry: {new Date(stop.retryAt).toLocaleString()}</p>}
    </div>
    {stop.status === 'returned' && <><p className="text-sm text-muted-foreground">Goods are back at the store. Arrange an approved later delivery, or complete the refund and stock disposition in Orders.</p><ReturnedDeliveryRescheduleForm orderId={stop.orderId} /></>}
    {active && !terminal && stop.status !== 'planned' && <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit} aria-busy={pending}>
      <label className="text-xs font-medium">Outcome<select className={field} value={status} onChange={event => setStatus(event.target.value as DeliveryStopStatus)}>
        {!['failed', 'refused'].includes(stop.status) && <><option value="delivered">Delivered to recipient</option><option value="failed">Delivery failed; driver retains goods</option><option value="refused">Customer refused; driver retains goods</option></>}
        <option value="returned">Returned to store custody</option><option value="rescheduled">Customer-approved retry in booked window</option>
      </select></label>
      {status === 'delivered' && <>
        <label className="text-xs font-medium">Recipient<input className={field} name="recipient" required /></label>
        <label className="text-xs font-medium">Handoff proof reference<input className={field} name="proofReference" required minLength={4} placeholder="Signed receipt or proof reference" /></label>
      </>}
      {status !== 'delivered' && <label className="text-xs font-medium">Reason<textarea className={field} name="reason" required placeholder="Describe the delivery exception" /></label>}
      <label className="text-xs font-medium">Package and cold-chain condition<textarea className={field} name="conditionEvidence" required minLength={8} placeholder="Observed condition, temperature if relevant, and custody transfer" /></label>
      {status === 'rescheduled' && <>
        <label className="text-xs font-medium">Agreed retry time<input className={field} name="retryAt" type="datetime-local" required /></label>
        <label className="text-xs font-medium">Customer approval<textarea className={field} name="approvalEvidence" required minLength={8} placeholder="Who approved the retry and how they were contacted" /></label>
        <p className="text-xs text-muted-foreground sm:col-span-2">A retry keeps the current booking and price. It must fall within the existing delivery window.</p>
      </>}
      <button className="min-h-10 rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50" disabled={pending}>{pending ? 'Saving outcome…' : 'Record stop outcome'}</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </article>;
}
