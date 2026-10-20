'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { storefrontGraphQL, throwGraphQLErrors } from '../../lib/data/graphql';
import { UrbanButton, UrbanTextInput } from '../urban/UrbanPrimitives';
import { SHOPPER_EMAIL_MAX, SHOPPER_PASSWORD_MAX } from '../../../lib/accountContract';

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [pending, start] = useTransition();
  const [emailDraft, setEmailDraft] = useState(email);
  const emailChanging = emailDraft.trim().toLowerCase() !== email.trim().toLowerCase();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  return <form className="sf-panel sf-form space-y-5 p-5 sm:p-7" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage('');
    start(async () => {
      try {
        const data: Record<string, string> = { name: String(form.get('name') || '').trim(), email: String(form.get('email') || '').trim() };
        // Changing the sign-in email requires the current password.
        if (emailChanging) data.currentPassword = String(form.get('currentPassword') || '');
        const result = await storefrontGraphQL<{ updateActiveUser: { id: string } }>('mutation SaveProfile($data: UserUpdateProfileInput!) { updateActiveUser(data: $data) { id } }', { data });
        throwGraphQLErrors(result.errors);
        if (!result.data?.updateActiveUser?.id) throw new Error('Your changes could not be saved. Try again.');
        setFailed(false); setMessage('Your profile has been saved.'); router.refresh();
      } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Unable to save your profile.'); }
    });
  }}>
    <div><h2 className="sf-subtitle">Your details</h2><p className="sf-copy mt-1.5">Keep your name and sign-in email up to date. Existing orders keep their original checkout details.</p></div>
    <label className="sf-label">Full name<UrbanTextInput name="name" autoComplete="name" defaultValue={name} required maxLength={200} disabled={pending} /></label>
    <label className="sf-label">Email address<UrbanTextInput name="email" type="email" autoComplete="email" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} required maxLength={SHOPPER_EMAIL_MAX} disabled={pending} /></label>
    {emailChanging ? <label className="sf-label">Current password<UrbanTextInput name="currentPassword" type="password" autoComplete="current-password" required maxLength={SHOPPER_PASSWORD_MAX} disabled={pending} /><span className="text-xs font-normal text-[var(--sf-ink-muted)]">Needed to change the email you sign in with.</span></label> : null}
    <UrbanButton type="submit" variant="dark" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</UrbanButton>
    {message ? <p role={failed ? 'alert' : 'status'} className={`rounded-[var(--sf-radius-md)] px-3 py-2.5 text-sm font-medium ${failed ? 'bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]'}`}>{message}</p> : null}
  </form>;
}
