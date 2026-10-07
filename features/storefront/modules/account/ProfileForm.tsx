'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { storefrontGraphQL, throwGraphQLErrors } from '../../lib/data/graphql';
import { UrbanButton, UrbanTextInput } from '../urban/UrbanPrimitives';

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  return <form className="sf-panel sf-form space-y-5 p-5 sm:p-7" onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage('');
    start(async () => {
      try {
        const result = await storefrontGraphQL<{ updateActiveUser: { id: string } }>('mutation SaveProfile($data: UserUpdateProfileInput!) { updateActiveUser(data: $data) { id } }', { data: { name: String(form.get('name') || '').trim(), email: String(form.get('email') || '').trim() } });
        throwGraphQLErrors(result.errors);
        if (!result.data?.updateActiveUser?.id) throw new Error('Your changes could not be saved. Try again.');
        setFailed(false); setMessage('Your profile has been saved.'); router.refresh();
      } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Unable to save your profile.'); }
    });
  }}>
    <div><h2 className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">Your details</h2><p className="sf-copy mt-2">Keep your name and sign-in email up to date. Existing orders keep their original checkout details.</p></div>
    <label className="block space-y-2"><span className="font-medium">Full name</span><UrbanTextInput name="name" autoComplete="name" defaultValue={name} required maxLength={200} disabled={pending} /></label>
    <label className="block space-y-2"><span className="font-medium">Email address</span><UrbanTextInput name="email" type="email" autoComplete="email" defaultValue={email} required maxLength={320} disabled={pending} /></label>
    <UrbanButton type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</UrbanButton>
    {message ? <p role={failed ? 'alert' : 'status'} className="text-sm">{message}</p> : null}
  </form>;
}
