'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformSelect, platformTextarea } from '@/features/platform/components/platformStyles';
import { updateContactMessage } from './actions';

export function ContactMessageFollowUp({ id, status, staffNotes }: { id: string; status: string; staffNotes: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return <form className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await updateContactMessage({ id, status: String(data.get('status')), staffNotes: String(data.get('staffNotes') || '') });
        setResult(outcome.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: outcome.error });
        if (outcome.ok) router.refresh();
      } catch { setResult({ ok: false, text: 'The message could not be updated. Try again.' }); }
    });
  }}>
    <PlatformField label="Status"><select name="status" defaultValue={status} className={platformSelect} disabled={busy}><option value="new">New</option><option value="in_progress">In progress</option><option value="replied">Replied</option><option value="closed">Closed</option></select></PlatformField>
    <PlatformField label="Internal notes" hint="Never shown to the customer."><textarea name="staffNotes" defaultValue={staffNotes} maxLength={5000} className={`${platformTextarea} min-h-16`} disabled={busy} /></PlatformField>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" className={platformButton('secondary', 'sm')} disabled={busy}>{busy ? 'Saving…' : 'Save follow-up'}</button>{result ? <PlatformFeedback tone={result.ok ? 'success' : 'error'}>{result.text}</PlatformFeedback> : null}</div>
  </form>;
}
