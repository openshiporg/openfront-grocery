'use client';
import { useState, useTransition } from 'react';
import { Ban } from 'lucide-react';
import { voidAuthorizationAction } from '../voidActions';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput } from '@/features/platform/components/platformStyles';

type Feedback = { tone: 'success' | 'warning' | 'error'; text: string } | null;

export function VoidAuthorizationForm({ paymentId }: { paymentId: string }) {
  const [key] = useState(() => `authorization-void:${paymentId}`);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();
  return <form className="space-y-3 rounded-lg border bg-background p-4 text-sm shadow-xs" aria-busy={pending} onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      let result: Awaited<ReturnType<typeof voidAuthorizationAction>>;
      try { result = await voidAuthorizationAction({ paymentId, reason: String(form.get('reason') || ''), idempotencyKey: key }); }
      catch { result = { ok: false, error: '', uncertain: true }; }
      if (!result.ok) setFeedback(result.uncertain ? { tone: 'warning', text: 'We couldn’t confirm the void. Press Void again to check; it won’t be applied twice.' } : { tone: 'error', text: result.error });
      else setFeedback(result.data.success ? { tone: 'success', text: 'Authorization voided. The order can now be cancelled.' } : { tone: 'warning', text: 'The void is still processing with the payment provider. Press Void again later to check.' });
    });
  }}>
    <div className="flex items-start gap-2.5"><Ban className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div><h3 className="font-medium">Void authorization</h3><p className="mt-0.5 text-xs text-muted-foreground">Release the uncaptured payment before cancelling this order. For a revised sale still waiting on the customer, this also cancels the new authorization and refunds any remaining original charge.</p></div></div>
    <div className="flex items-end gap-2"><PlatformField label="Reason" className="flex-1"><input className={platformInput} name="reason" required minLength={3} maxLength={470} disabled={pending} /></PlatformField>
    <button className={platformButton('destructive', 'md')} disabled={pending}>{pending ? 'Checking…' : 'Void'}</button></div>
    {feedback ? <PlatformFeedback tone={feedback.tone}>{feedback.text}</PlatformFeedback> : null}
  </form>;
}
