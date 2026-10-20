'use client';

import { useActionState } from 'react';
import { updateStoreProfileAction, type SettingsActionState } from '../actions';
import { PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput } from '@/features/platform/components/platformStyles';
import { bpsToInput } from '@/features/lib/moneyInput';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

type Settings = {
  name: string; tagline?: string | null; homepageTitle?: string | null; homepageDescription?: string | null;
  contactEmail?: string | null; contactPhone?: string | null; address?: string | null; policyNotes?: string | null;
  countryCode?: string | null; locale?: string | null; timezone?: string | null; taxRateBps?: number | null; currencyCode?: string | null;
  hours?: Record<string, unknown> | null;
};

const initial: SettingsActionState = { ok: false, error: null, message: null };

/** The store's public details, locale/tax and weekly opening hours, saved together. */
export function StoreProfileForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updateStoreProfileAction, initial);
  const value = (key: keyof Settings) => {
    const raw = state.values?.[key as string] ?? settings[key];
    return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  };
  const hours = settings.hours || {};
  return <form action={action} className="space-y-5 p-4 md:p-5" aria-busy={pending}>
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">Store details</legend>
      <PlatformField label="Store name"><input name="name" required maxLength={120} defaultValue={value('name')} className={platformInput} /></PlatformField>
      <PlatformField label="Tagline"><input name="tagline" maxLength={200} defaultValue={value('tagline')} className={platformInput} /></PlatformField>
      <PlatformField label="Homepage title"><input name="homepageTitle" maxLength={200} defaultValue={value('homepageTitle')} className={platformInput} /></PlatformField>
      <PlatformField label="Contact email"><input name="contactEmail" type="email" maxLength={254} defaultValue={value('contactEmail')} className={platformInput} /></PlatformField>
      <PlatformField label="Contact phone"><input name="contactPhone" type="tel" maxLength={40} defaultValue={value('contactPhone')} className={platformInput} /></PlatformField>
      <PlatformField label="Country" hint="Two-letter code, like US."><input name="countryCode" required maxLength={2} defaultValue={value('countryCode')} className={`${platformInput} uppercase`} /></PlatformField>
      <PlatformField label="Address" className="sm:col-span-2"><input name="address" maxLength={500} defaultValue={value('address')} className={platformInput} /></PlatformField>
      <PlatformField label="Homepage description" className="sm:col-span-2"><textarea name="homepageDescription" rows={3} maxLength={1000} defaultValue={value('homepageDescription')} className={platformInput} /></PlatformField>
      <PlatformField label="Store policies shown to shoppers" className="sm:col-span-2"><textarea name="policyNotes" rows={4} maxLength={5000} defaultValue={value('policyNotes')} className={platformInput} /></PlatformField>
    </fieldset>
    <fieldset disabled={pending} className="grid gap-3 border-t pt-4 sm:grid-cols-3">
      <legend className="mb-2 text-sm font-medium">Tax and locale</legend>
      <PlatformField label="Default tax rate" hint="Percent, e.g. 8.75"><span className="relative block"><input name="taxRate" inputMode="decimal" required defaultValue={state.values?.taxRate ?? bpsToInput(settings.taxRateBps)} className={`${platformInput} pr-8 tabular-nums`} /><span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">%</span></span></PlatformField>
      <PlatformField label="Locale" hint="Like en-US."><input name="locale" required maxLength={35} defaultValue={value('locale')} className={platformInput} /></PlatformField>
      <PlatformField label="Timezone" hint="Like America/Los_Angeles."><input name="timezone" required maxLength={64} defaultValue={value('timezone')} className={platformInput} /></PlatformField>
      <p className="text-xs text-muted-foreground sm:col-span-3">Currency: {settings.currencyCode || 'USD'} (set when the store was created).</p>
    </fieldset>
    <fieldset disabled={pending} className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
      <legend className="mb-2 text-sm font-medium">Opening hours</legend>
      {DAYS.map((day) => <PlatformField key={day} label={`${day[0].toUpperCase()}${day.slice(1)}`}><input name={`hours.${day}`} maxLength={60} placeholder="8:00 AM - 8:00 PM or Closed" defaultValue={state.values?.[`hours.${day}`] ?? (typeof hours[day] === 'string' ? String(hours[day]) : '')} className={platformInput} /></PlatformField>)}
    </fieldset>
    {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
    {state.ok && state.message ? <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null}
    <div className="border-t pt-4"><button className={platformButton('primary', 'md')} type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save store details'}</button></div>
  </form>;
}
