'use client';
import { useState, useTransition } from 'react';
import { prepareDueSubscriptionsTask } from '../actions/recurringTasks';
export function RunDueSubscriptionsButton() {
  const [pending, startTransition] = useTransition(), [message, setMessage] = useState('');
  return <div className="space-y-2"><button disabled={pending} className="min-h-10 rounded border px-3 text-sm" onClick={() => startTransition(async () => { const result = await prepareDueSubscriptionsTask(); setMessage(result.ok ? `Reviewed ${result.data.processed} due occurrences: ${result.data.results.map((run: any) => run.status).join(', ')}` : result.error); })}>{pending ? 'Preparing…' : 'Prepare due recurring baskets'}</button>{message ? <p role="status" className="text-sm">{message}</p> : null}</div>;
}
