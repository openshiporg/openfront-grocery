'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { changeShopperPassword, completeShopperPasswordReset, requestShopperPasswordReset, signInShopper, type ShopperAuthState, type ShopperPasswordState } from './actions';
import { SHOPPER_PASSWORD_MAX, SHOPPER_PASSWORD_MIN } from '../../../../lib/accountContract';
import { UrbanButton, UrbanTextInput } from '../../urban/UrbanPrimitives';

const initial: ShopperAuthState = { message: null, success: null, email: '' };
const alertClass = 'rounded-[var(--sf-radius-md)] bg-[var(--sf-danger-bg)] px-3 py-2.5 text-sm font-medium text-[var(--sf-danger)]';
const successClass = 'rounded-[var(--sf-radius-md)] bg-[var(--sf-sage-light)] px-3 py-2.5 text-sm font-medium text-[var(--sf-sage)]';

function PasswordInput({ name, autoComplete, disabled, minLength }: { name: string; autoComplete: string; disabled: boolean; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  return <span className="relative block">
    <UrbanTextInput name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength} maxLength={SHOPPER_PASSWORD_MAX} disabled={disabled} className="pr-12" />
    <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[var(--sf-ink-muted)] hover:text-[var(--sf-ink)]">
      {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
    </button>
  </span>;
}

export function ShopperSignInForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(signInShopper, initial);
  return <form action={action} className="sf-form space-y-5" aria-busy={pending}>
    <input type="hidden" name="from" value={from} />
    <label className="sf-label">Email address<UrbanTextInput name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={state.email} disabled={pending} /></label>
    <label className="sf-label">Password<PasswordInput name="password" autoComplete="current-password" disabled={pending} /></label>
    {state.message ? <p role="alert" className={alertClass}>{state.message}</p> : null}
    <UrbanButton type="submit" variant="dark" size="lg" className="w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</UrbanButton>
    <p className="text-sm text-[var(--sf-ink-muted)]"><Link href={from && from !== '/account' ? `/account/reset?from=${encodeURIComponent(from)}` : '/account/reset'} className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">Forgot your password?</Link></p>
  </form>;
}

export function ShopperResetRequestForm({ from }: { from?: string }) {
  const [state, action, pending] = useActionState(requestShopperPasswordReset, initial);
  if (state.success) return <p role="status" className={successClass}>{state.success}</p>;
  return <form action={action} className="sf-form space-y-5" aria-busy={pending}>
    {from ? <input type="hidden" name="from" value={from} /> : null}
    <label className="sf-label">Email address<UrbanTextInput name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={state.email} disabled={pending} /></label>
    {state.message ? <p role="alert" className={alertClass}>{state.message}</p> : null}
    <UrbanButton type="submit" variant="dark" size="lg" className="w-full" disabled={pending}>{pending ? 'Sending…' : 'Email me a reset link'}</UrbanButton>
  </form>;
}

export function ShopperResetCompleteForm({ token, from }: { token: string; from?: string }) {
  const [state, action, pending] = useActionState(completeShopperPasswordReset, initial);
  const signInHref = from ? `/account/sign-in?from=${encodeURIComponent(from)}` : '/account/sign-in';
  if (state.success) return <div className="space-y-4"><p role="status" className={successClass}>Your password has been reset.</p><Link href={signInHref} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--sf-ink)] px-5 text-sm font-semibold text-[var(--sf-paper)]">Sign in</Link></div>;
  return <form action={action} className="sf-form space-y-5" aria-busy={pending}>
    <input type="hidden" name="token" value={token} />
    <label className="sf-label">Email address<UrbanTextInput name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={state.email} disabled={pending} /></label>
    <label className="sf-label">New password<PasswordInput name="password" autoComplete="new-password" minLength={SHOPPER_PASSWORD_MIN} disabled={pending} /><span className="text-xs font-normal text-[var(--sf-ink-muted)]">{SHOPPER_PASSWORD_MIN} to {SHOPPER_PASSWORD_MAX} characters.</span></label>
    <label className="sf-label">Confirm new password<PasswordInput name="confirmPassword" autoComplete="new-password" minLength={SHOPPER_PASSWORD_MIN} disabled={pending} /></label>
    {state.message ? <p role="alert" className={alertClass}>{state.message}</p> : null}
    <UrbanButton type="submit" variant="dark" size="lg" className="w-full" disabled={pending}>{pending ? 'Saving…' : 'Set new password'}</UrbanButton>
  </form>;
}

const initialPassword: ShopperPasswordState = { message: null, success: null };

/** Signed-in password change (E-commerce profile-password pattern): current, new and confirmation. */
export function ShopperPasswordForm() {
  const [state, action, pending] = useActionState(changeShopperPassword, initialPassword);
  return <form action={action} className="sf-panel sf-form space-y-5 p-5 sm:p-7" aria-busy={pending}>
    <div><h2 className="sf-subtitle">Password</h2><p className="sf-copy mt-1.5">Change the password you use to sign in. You’ll need your current password.</p></div>
    <label className="sf-label">Current password<PasswordInput name="currentPassword" autoComplete="current-password" disabled={pending} /></label>
    <label className="sf-label">New password<PasswordInput name="newPassword" autoComplete="new-password" minLength={SHOPPER_PASSWORD_MIN} disabled={pending} /><span className="text-xs font-normal text-[var(--sf-ink-muted)]">{SHOPPER_PASSWORD_MIN} to {SHOPPER_PASSWORD_MAX} characters.</span></label>
    <label className="sf-label">Confirm new password<PasswordInput name="confirmPassword" autoComplete="new-password" minLength={SHOPPER_PASSWORD_MIN} disabled={pending} /></label>
    {state.message ? <p role="alert" className={alertClass}>{state.message}</p> : null}
    {state.success ? <p role="status" className={successClass}>{state.success}</p> : null}
    <UrbanButton type="submit" variant="dark" disabled={pending}>{pending ? 'Saving…' : 'Change password'}</UrbanButton>
  </form>;
}
