'use client';

import { useActionState } from 'react';
import { RotateCw } from 'lucide-react';
import { PlatformCheckboxRow, PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformCheckbox, platformInput } from '@/features/platform/components/platformStyles';
import { replayCommunication, type CommunicationActionState } from './actions';

const initial: CommunicationActionState = { ok: false, error: null, message: null };

function Outcome({ state }: { state: CommunicationActionState }) {
  if (state.error) return <PlatformFeedback tone="error">{state.error}</PlatformFeedback>;
  if (state.ok && state.message) return <PlatformFeedback tone="success">{state.message}</PlatformFeedback>;
  return null;
}

/** Retry and reconciliation actions for one outbox event; each form keeps its own result. */
export function OutboxEventActions({ event }: { event: { id: string; status: string; attempts: number } }) {
  const [retryState, retry, retrying] = useActionState(replayCommunication, initial);
  const [ackState, acknowledge, acknowledging] = useActionState(replayCommunication, initial);
  const [authState, authorize, authorizing] = useActionState(replayCommunication, initial);
  if (event.status === 'failed' && Number(event.attempts) < 10) {
    return <form action={retry} className="space-y-2" aria-busy={retrying}><input type="hidden" name="eventId" value={event.id} />
      <button className={platformButton('secondary', 'sm')} disabled={retrying}><RotateCw aria-hidden="true" />{retrying ? 'Retrying…' : 'Retry after resolving the error'}</button>
      <Outcome state={retryState} />
    </form>;
  }
  if (event.status === 'failed') return <PlatformFeedback tone="warning">Attempt limit reached. Review this event manually; it can’t be retried from here.</PlatformFeedback>;
  if (event.status !== 'unknown') return null;
  return <div className="grid gap-3 rounded-lg border bg-background p-3 lg:grid-cols-2">
    <p className="text-xs leading-relaxed text-muted-foreground lg:col-span-2">Check with the email provider or the customer first. Recording the outcome stops automatic retries without claiming delivery; retrying may send a duplicate.</p>
    <form action={acknowledge} className="flex flex-col gap-2" aria-busy={acknowledging}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="reconcileAction" value="acknowledge" />
      <PlatformField label="What you confirmed, and how"><input name="reason" required minLength={10} maxLength={500} className={platformInput} disabled={acknowledging} /></PlatformField>
      <button className={platformButton('primary', 'sm', 'self-start')} disabled={acknowledging}>Record outcome without resending</button>
      <Outcome state={ackState} />
    </form>
    <form action={authorize} className="flex flex-col gap-2" aria-busy={authorizing}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="reconcileAction" value="retry" />
      <PlatformField label="Why is a retry needed?"><input name="reason" required minLength={10} maxLength={500} className={platformInput} disabled={authorizing} /></PlatformField>
      <PlatformCheckboxRow className="text-xs"><input type="checkbox" name="confirmDuplicateRisk" required className={platformCheckbox} disabled={authorizing} />I understand this retry may send a duplicate.</PlatformCheckboxRow>
      <button className={platformButton('destructive', 'sm', 'self-start')} disabled={authorizing}>Retry, accepting a possible duplicate</button>
      <Outcome state={authState} />
    </form>
  </div>;
}
