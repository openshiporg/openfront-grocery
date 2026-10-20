'use client';
import { useState, useTransition } from 'react';
import { CalendarClock, LoaderCircle } from 'lucide-react';
import { prepareDueSubscriptionsTask } from '../actions/recurringTasks';
import { platformButton } from '@/features/platform/components/platformStyles';

export function RunDueSubscriptionsButton() {
  const [pending, startTransition] = useTransition(), [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  return <div className="flex flex-col items-start gap-1.5 lg:items-end">
    <button disabled={pending} aria-busy={pending} className={platformButton('primary', 'md')} onClick={() => startTransition(async () => { const result = await prepareDueSubscriptionsTask(); setFailed(!result.ok); setMessage(result.ok ? `Reviewed ${result.data.processed} due occurrences${result.data.results.length ? `: ${result.data.results.map((run: any) => run.status).join(', ')}` : ''}` : result.error); })}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}{pending ? 'Preparing…' : 'Prepare due baskets'}
    </button>
    {message ? <p role={failed ? 'alert' : 'status'} className={`max-w-80 text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p> : null}
  </div>;
}
