'use client';
import { useState, useTransition } from 'react';
import { saveNotificationChoices } from './actions';
import { UrbanButton } from '../urban/UrbanPrimitives';
export function NotificationChoicesForm({ preference }: { preference?: { orderUpdates: boolean; deliveryAlerts: boolean; backInStock: boolean } }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  return <form className="sf-panel space-y-4 p-5 sm:p-7" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setMessage('');
    start(async () => { try { await saveNotificationChoices(form); setFailed(false); setMessage('Email preferences saved.'); } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Preferences could not be saved. Try again.'); } });
  }}><h2 className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">Email preferences</h2><p className="sf-copy">Choose additional updates below. Receipts, requested access links, payment changes and safety notices are service messages.</p>{([
    ['orderUpdates', 'Ready-for-pickup updates'], ['deliveryAlerts', 'Dispatch updates'], ['backInStock', 'My requested back-in-stock alerts'],
  ] as const).map(([key, label]) => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3"><input className="h-5 w-5 accent-[var(--sf-accent)]" name={key} type="checkbox" disabled={pending} defaultChecked={preference ? preference[key] : true} /><span>{label}</span></label>)}<UrbanButton disabled={pending} type="submit">{pending ? 'Saving…' : 'Save email preferences'}</UrbanButton>{message ? <p role={failed ? 'alert' : 'status'} className="text-sm">{message}</p> : null}</form>;
}
