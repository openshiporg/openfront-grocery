'use client';
import { useState, useTransition } from 'react';
import { LifeBuoy } from 'lucide-react';
import { recoverPaymentCreationAction } from '../creationRecoveryActions';
import { PlatformDisclosure, PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput } from '@/features/platform/components/platformStyles';

export function RecoverPaymentCreationForm({ paymentSessionId = '' }: { paymentSessionId?: string }) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  return <PlatformDisclosure icon={LifeBuoy} title="Recover an interrupted payment" description="Attach a provider payment that was created but never recorded at checkout.">
  <form className="space-y-3" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    start(async () => {
      try {
        const result = await recoverPaymentCreationAction({ paymentSessionId: String(form.get('paymentSessionId') || ''), providerPaymentId: String(form.get('providerPaymentId') || ''), reason: String(form.get('reason') || '') });
        setMessage(result.message);
      } catch { setMessage('Recovery could not complete. Check your permissions and retry the same reference.'); }
    });
  }}>
    <p className="text-xs leading-relaxed text-muted-foreground">Find the original payment in the provider dashboard and enter its reference. Recovery checks the saved checkout identity and amount before attaching it for reconciliation. Older payments without matching metadata remain held for manual review.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <PlatformField label="Checkout payment session"><input className={`${platformInput} font-mono`} name="paymentSessionId" defaultValue={paymentSessionId} required maxLength={180} /></PlatformField>
      <PlatformField label="Provider payment reference"><input className={`${platformInput} font-mono`} name="providerPaymentId" placeholder="pi_…" autoComplete="off" required maxLength={183} /></PlatformField>
      <PlatformField label="Reason" className="sm:col-span-2"><input className={platformInput} name="reason" required minLength={3} maxLength={470} /></PlatformField>
    </div>
    <button className={platformButton('primary', 'md')} disabled={pending}>{pending ? 'Verifying payment…' : 'Verify and recover payment'}</button>
    {message ? <PlatformFeedback tone={/could not|unable|fail/i.test(message) ? 'error' : 'info'}>{message}</PlatformFeedback> : null}
  </form>
  </PlatformDisclosure>;
}
