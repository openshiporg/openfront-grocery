'use client';

import { useActionState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { sendContactMessage, type ContactFormState } from './actions';
import { UrbanButton, UrbanSelect, UrbanTextInput, UrbanTextarea } from '../urban/UrbanPrimitives';

const TOPICS: Array<[string, string]> = [
  ['order_problem', 'Missing, wrong or damaged item'],
  ['order_change', 'Change an order, address or time'],
  ['substitution', 'Replacement or substitution'],
  ['refund', 'Refund or payment'],
  ['account', 'Account or sign-in'],
  ['other', 'Something else'],
];

export function ContactForm({ defaults }: { defaults: { name?: string; email?: string; orderNumber?: string; topic?: string } }) {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(sendContactMessage, { status: 'idle', message: '' });
  if (state.status === 'sent') return <div role="status" className="sf-panel space-y-3 p-6 sm:p-8">
    <CheckCircle2 className="h-7 w-7 text-[var(--sf-sage)]" aria-hidden="true" />
    <h2 className="sf-subtitle">Message received</h2>
    <p className="sf-copy">{state.message} Your reference is <strong className="font-[family-name:var(--sf-font-mono)] text-[var(--sf-ink)]">{state.reference}</strong>. The team replies to the email you gave.</p>
  </div>;
  const value = (name: string, fallback = '') => state.fields?.[name] ?? fallback;
  return <form action={action} className="sf-panel sf-form space-y-4 p-6 sm:p-8" aria-busy={pending} aria-labelledby="contact-form-title">
    <div><h2 id="contact-form-title" className="sf-subtitle">Send the store a message</h2><p className="sf-copy mt-1.5">For a missing item, a change, a replacement or a refund question. Messages go straight to the store team.</p></div>
    <input type="hidden" name="from" value="/support" />
    <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sf-label">Your name<UrbanTextInput name="name" autoComplete="name" required maxLength={100} defaultValue={value('name', defaults.name)} disabled={pending} /></label>
      <label className="sf-label">Email<UrbanTextInput name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={value('email', defaults.email)} disabled={pending} /></label>
      <label className="sf-label">Phone (optional)<UrbanTextInput name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={value('phone')} disabled={pending} /></label>
      <label className="sf-label">Order number (optional)<UrbanTextInput name="orderNumber" inputMode="numeric" maxLength={11} placeholder="e.g. 1024" defaultValue={value('orderNumber', defaults.orderNumber)} disabled={pending} /></label>
    </div>
    <label className="sf-label">What is it about?<UrbanSelect name="topic" required defaultValue={value('topic', defaults.topic || 'order_problem')} disabled={pending}>{TOPICS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</UrbanSelect></label>
    <label className="sf-label">Message<UrbanTextarea name="message" required minLength={10} maxLength={5000} rows={5} defaultValue={value('message')} disabled={pending} /></label>
    {state.status === 'error' ? <p role="alert" className="rounded-[var(--sf-radius-md)] bg-[var(--sf-danger-bg)] px-3 py-2.5 text-sm font-medium text-[var(--sf-danger)]">{state.message}</p> : null}
    <UrbanButton type="submit" variant="dark" disabled={pending}>{pending ? 'Sending…' : 'Send message'}</UrbanButton>
    <p className="text-xs leading-5 text-[var(--sf-ink-muted)]">Don’t include card numbers or passwords.</p>
  </form>;
}
