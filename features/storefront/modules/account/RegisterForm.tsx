'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerShopper, type ShopperRegisterState } from './auth/actions';
import { UrbanButton, UrbanTextInput } from '../urban/UrbanPrimitives';
import { SHOPPER_EMAIL_MAX, SHOPPER_PASSWORD_MAX, SHOPPER_PASSWORD_MIN } from '../../../lib/accountContract';

export function RegisterForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState<ShopperRegisterState, FormData>(registerShopper, { message: null, formData: { name: '', email: '', password: '' } });
  if (state.created) {
    // The account exists; the next step is signing in, never a second registration.
    const signIn = `/account/sign-in${from && from !== '/account' ? `?from=${encodeURIComponent(from)}` : ''}`;
    return <div className="space-y-4">
      <p role="status" className="rounded-[var(--sf-radius-md)] bg-[var(--sf-sage-light)] px-3 py-2.5 text-sm font-medium text-[var(--sf-sage)]">Your account for {state.formData.email} has been created. Sign in to continue.</p>
      <Link href={signIn} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--sf-ink)] px-5 text-sm font-semibold text-[var(--sf-paper)]">Sign in</Link>
    </div>;
  }
  return <form action={action} className="sf-form space-y-5" aria-busy={pending}>
    <input type="hidden" name="from" value={from} />
    <label className="sf-label">Full name<UrbanTextInput name="name" autoComplete="name" required maxLength={120} defaultValue={state.formData?.name || ''} disabled={pending} /></label>
    <label className="sf-label">Email address<UrbanTextInput name="email" type="email" autoComplete="email" required maxLength={SHOPPER_EMAIL_MAX} defaultValue={state.formData?.email || ''} disabled={pending} /></label>
    <label className="sf-label">Password<UrbanTextInput name="password" type="password" autoComplete="new-password" required minLength={SHOPPER_PASSWORD_MIN} maxLength={SHOPPER_PASSWORD_MAX} disabled={pending} /><span className="text-xs font-normal text-[var(--sf-ink-muted)]">{SHOPPER_PASSWORD_MIN} to {SHOPPER_PASSWORD_MAX} characters.</span></label>
    <label className="sf-label">Confirm password<UrbanTextInput name="confirmPassword" type="password" autoComplete="new-password" required minLength={SHOPPER_PASSWORD_MIN} maxLength={SHOPPER_PASSWORD_MAX} disabled={pending} /></label>
    {state.message ? <p role="alert" className="rounded-[var(--sf-radius-md)] bg-[var(--sf-danger-bg)] px-3 py-2.5 text-sm font-medium text-[var(--sf-danger)]">{state.message}</p> : null}
    <UrbanButton type="submit" variant="dark" size="lg" className="w-full" disabled={pending}>{pending ? 'Creating your account…' : 'Create account'}</UrbanButton>
  </form>;
}
