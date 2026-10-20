'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { recoverRevisedAuthorizationAction } from '../voidActions';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput } from '@/features/platform/components/platformStyles';

type Feedback = { tone: 'success' | 'info' | 'warning' | 'error'; text: string } | null;

/**
 * When the provider created the customer's revised authorization but the store
 * never saved it, record it here. The server accepts it only if the provider's
 * record matches this order's recorded request exactly.
 */
export function RecoverRevisedAuthorizationForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();
  return <form className="space-y-3 rounded-lg border bg-background p-4 text-sm shadow-xs" aria-busy={pending} onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { orderId, providerPaymentId: String(form.get('providerPaymentId') || '').trim(), reason: String(form.get('reason') || '').trim() };
    start(async () => {
      let result: Awaited<ReturnType<typeof recoverRevisedAuthorizationAction>>;
      try { result = await recoverRevisedAuthorizationAction(input); }
      catch { result = { ok: false, error: '', uncertain: true }; }
      if (!result.ok) { setFeedback(result.uncertain ? { tone: 'warning', text: 'We couldn’t confirm the recovery. Submit it again; a recorded authorization is never recorded twice.' } : { tone: 'error', text: result.error }); return; }
      setFeedback(result.data.recovered ? { tone: 'success', text: `Revised authorization ${result.data.paymentIntentId} recorded for this order.` } : { tone: 'info', text: `This order already has its revised authorization (${result.data.paymentIntentId}).` });
      router.refresh();
    });
  }}>
    <div className="flex items-start gap-2.5"><LifeBuoy className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div><h3 className="font-medium">Recover revised authorization</h3><p className="mt-0.5 text-xs text-muted-foreground">Use only when the payment provider shows the customer’s new authorization for this order but it isn’t recorded here.</p></div></div>
    <PlatformField label="Provider payment reference"><input className={`${platformInput} font-mono`} name="providerPaymentId" required minLength={3} maxLength={255} pattern="[A-Za-z0-9_\-]+" placeholder="pi_…" disabled={pending} /></PlatformField>
    <div className="flex items-end gap-2"><PlatformField label="Reason" className="flex-1"><input className={platformInput} name="reason" required minLength={3} maxLength={500} disabled={pending} /></PlatformField>
    <button className={platformButton('secondary', 'md')} disabled={pending}>{pending ? 'Checking…' : 'Recover'}</button></div>
    {feedback ? <PlatformFeedback tone={feedback.tone}>{feedback.text}</PlatformFeedback> : null}
  </form>;
}
