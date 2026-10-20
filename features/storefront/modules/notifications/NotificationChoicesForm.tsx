'use client';
import { useState, useTransition } from 'react';
import { saveNotificationChoices } from './actions';
import { UrbanButton } from '../urban/UrbanPrimitives';
export function NotificationChoicesForm({ preference }: { preference?: { orderUpdates: boolean; deliveryAlerts: boolean; backInStock: boolean; channels?: unknown } }) {
  // No saved preference means the default: email on. A saved channel list is the customer's choice.
  const emailOn = !preference || !Array.isArray(preference.channels) || preference.channels.includes('email');
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  return <form className="sf-panel space-y-4 p-5 sm:p-7" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setMessage('');
    start(async () => { try { await saveNotificationChoices(form); setFailed(false); setMessage('Email preferences saved.'); } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Preferences could not be saved. Try again.'); } });
  }}><h2 className="sf-subtitle">Email preferences</h2><p className="sf-copy">Choose additional updates below. Receipts, requested access links, payment changes and safety notices are service messages.</p><label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-2)] px-4 text-sm font-semibold"><span>Email me the updates I choose below</span><input className="sf-check" role="switch" name="emailEnabled" type="checkbox" disabled={pending} defaultChecked={emailOn} /></label>{([
    ['orderUpdates', 'Ready-for-pickup updates'], ['deliveryAlerts', 'Dispatch updates'], ['backInStock', 'My requested back-in-stock alerts'],
  ] as const).map(([key, label]) => <label key={key} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-2)] px-4 text-sm font-medium"><span>{label}</span><input className="sf-check" role="switch" name={key} type="checkbox" disabled={pending} defaultChecked={preference ? preference[key] : true} /></label>)}<UrbanButton disabled={pending} type="submit" variant="dark">{pending ? 'Saving…' : 'Save email preferences'}</UrbanButton>{message ? <p role={failed ? 'alert' : 'status'} className={`rounded-[var(--sf-radius-md)] px-3 py-2.5 text-sm font-medium ${failed ? 'bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]'}`}>{message}</p> : null}</form>;
}
