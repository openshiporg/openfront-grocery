'use client';
import { useState, useTransition } from 'react';
import { recoverPaymentCreationAction } from '../creationRecoveryActions';

export function RecoverPaymentCreationForm({ paymentSessionId = '' }: { paymentSessionId?: string }) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return <form className="space-y-3 rounded-lg border p-4" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    start(async () => {
      try {
        const result = await recoverPaymentCreationAction({ paymentSessionId: String(form.get('paymentSessionId') || ''), providerPaymentId: String(form.get('providerPaymentId') || ''), reason: String(form.get('reason') || '') });
        setMessage(result.message);
      } catch { setMessage('Recovery could not complete. Check your permissions and retry the same reference.'); }
    });
  }}>
    <h3 className="font-medium">Recover an interrupted payment</h3>
    <p className="text-sm text-muted-foreground">Find the original payment in the provider dashboard and enter its reference. Recovery checks the saved checkout identity and amount before attaching it for reconciliation. Older payments without matching metadata remain held for manual review.</p>
    <label className="block text-sm">Checkout payment session<input className="mt-1 block w-full rounded border p-2" name="paymentSessionId" defaultValue={paymentSessionId} required maxLength={180} /></label>
    <label className="block text-sm">Provider payment reference<input className="mt-1 block w-full rounded border p-2" name="providerPaymentId" placeholder="pi_…" autoComplete="off" required maxLength={183} /></label>
    <label className="block text-sm">Reason<input className="mt-1 block w-full rounded border p-2" name="reason" required minLength={3} maxLength={470} /></label>
    <button className="rounded border px-3 py-2" disabled={pending}>{pending ? 'Verifying payment…' : 'Verify and recover payment'}</button>
    {message ? <p className="text-sm" role="status">{message}</p> : null}
  </form>;
}
