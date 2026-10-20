'use client';

import { useActionState } from 'react';
import { UserPlus } from 'lucide-react';
import { provisionCustomerTask, type ProvisionCustomerState } from '@/features/platform/lib/taskActions';
import { PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput } from '@/features/platform/components/platformStyles';
import { SHOPPER_PASSWORD_MAX, SHOPPER_PASSWORD_MIN } from '@/features/lib/accountContract';

const initial: ProvisionCustomerState = { ok: false, error: null, message: null };

export function ProvisionCustomerForm() {
  const [state, action, pending] = useActionState(provisionCustomerTask, initial);
  return <form action={action} className="space-y-3" aria-busy={pending}>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
      <PlatformField label="Name"><input name="name" required maxLength={120} autoComplete="name" defaultValue={state.values?.name} disabled={pending} className={platformInput} /></PlatformField>
      <PlatformField label="Email"><input name="email" required type="email" maxLength={254} autoComplete="email" defaultValue={state.values?.email} disabled={pending} className={platformInput} /></PlatformField>
      <PlatformField label="Temporary password" hint={`${SHOPPER_PASSWORD_MIN} to ${SHOPPER_PASSWORD_MAX} characters.`}><input name="temporaryPassword" required type="password" minLength={SHOPPER_PASSWORD_MIN} maxLength={SHOPPER_PASSWORD_MAX} autoComplete="new-password" disabled={pending} className={platformInput} /></PlatformField>
      <button type="submit" disabled={pending} className={platformButton('primary', 'md', 'xl:mb-[22px]')}><UserPlus aria-hidden="true" />{pending ? 'Creating…' : 'Provision customer'}</button>
    </div>
    {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
    {state.ok && state.message ? <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null}
  </form>;
}
