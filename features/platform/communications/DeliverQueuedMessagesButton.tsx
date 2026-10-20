'use client';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PlatformFeedback } from '@/features/platform/components/PlatformForm';
import { platformButton } from '@/features/platform/components/platformStyles';
import { deliverQueuedMessages } from './actions';

/** Sends up to 20 queued events now. Sent means the mail provider accepted the message, not that it was read. */
export function DeliverQueuedMessagesButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);
  return <div className="flex flex-col items-start gap-2">
    <button type="button" disabled={busy || pending === 0} aria-busy={busy} className={platformButton('primary', 'md')} onClick={() => startTransition(async () => {
      setResult(null);
      try {
        const outcome = await deliverQueuedMessages();
        if (!outcome.ok) { setResult({ tone: 'error', text: outcome.error }); return; }
        const { attempted, delivered, failed, unknown, suppressed } = outcome.data;
        setResult({ tone: failed || unknown ? 'warning' : 'success', text: attempted ? `Processed ${attempted}: ${delivered} sent or completed, ${suppressed} skipped by preference, ${failed} failed, ${unknown} need review.` : 'Nothing was waiting to send.' });
        router.refresh();
      } catch { setResult({ tone: 'error', text: 'Queued messages could not be processed. Try again.' }); }
    })}><Send aria-hidden="true" />{busy ? 'Sending…' : 'Send queued messages'}</button>
    {result ? <PlatformFeedback tone={result.tone}>{result.text}</PlatformFeedback> : null}
  </div>;
}
