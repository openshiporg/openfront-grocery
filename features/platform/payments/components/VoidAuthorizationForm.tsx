'use client';
import { useState, useTransition } from 'react';
import { voidAuthorizationAction } from '../voidActions';
export function VoidAuthorizationForm({ paymentId }: { paymentId: string }) {
  const [key] = useState(() => `authorization-void:${paymentId}`);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return <form className="space-y-3 rounded-lg border p-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); start(async () => { try { const result = await voidAuthorizationAction({ paymentId, reason: String(form.get('reason') || ''), idempotencyKey: key }); setMessage(result.success ? 'Authorization void confirmed. The order can now be cancelled.' : 'Authorization void is processing; retry this request.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to void authorization'); } }); }}>
    <h3 className="font-medium">Void authorization</h3><p className="text-sm text-muted-foreground">Release the uncaptured payment before cancelling this order. For an unresolved revised sale, this also abandons its new authorization and refunds any remaining original charge.</p>
    <label className="block text-sm">Reason<input className="mt-1 block w-full rounded border p-2" name="reason" required minLength={3} maxLength={470} /></label>
    <button className="rounded border px-3 py-2" disabled={pending}>{pending ? 'Checking authorization…' : 'Void authorization'}</button>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </form>;
}
