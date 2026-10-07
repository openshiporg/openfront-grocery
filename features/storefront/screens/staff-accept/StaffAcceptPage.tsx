'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { storefrontGraphQL, throwGraphQLErrors } from '../../lib/data/graphql';
import { UrbanButton, UrbanContainer, UrbanPageHeader, UrbanPageShell, UrbanTextInput } from '../../modules/urban/UrbanPrimitives';
export default function StaffAcceptPage() {
  const token = useRef('');
  const consumed = useRef(false);
  const [ready, setReady] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [complete, setComplete] = useState(false), [pending, start] = useTransition();
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    setReady(true);
    const url = new URL(window.location.href); const fragment = new URLSearchParams(url.hash.slice(1)); fragment.delete('token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${fragment.size ? `#${fragment}` : ''}`);
  }, []);
  return <UrbanPageShell><UrbanContainer className="py-8"><div className="mx-auto max-w-xl space-y-6"><UrbanPageHeader title="Accept your invitation" description="Set a password to activate the staff account you were invited to use." breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Staff invitation' }]} />
    {complete ? <div className="sf-note"><p role="status">{message}</p><Link href="/dashboard/signin" className="mt-3 inline-flex min-h-11 items-center underline">Sign in to your staff account</Link></div> : !ready ? <p role="status">Opening your invitation…</p> : !token.current ? <div className="sf-note"><h2 className="font-semibold">An invitation link is needed</h2><p className="mt-2">Open the complete link from your invitation email. If it has expired, ask the store administrator for a new invitation.</p></div> : <form className="sf-panel space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setError(''); start(async () => { try { const response = await storefrontGraphQL<{acceptGroceryStaffInvitation: unknown}>('mutation Accept($token:String!,$password:String!){acceptGroceryStaffInvitation(token:$token,password:$password)}', { token: token.current, password: String(form.get('password') || '') }); throwGraphQLErrors(response.errors); if (!response.data?.acceptGroceryStaffInvitation) throw new Error('The invitation was not accepted. Ask the administrator for a new link.'); setComplete(true); setMessage('Your staff account is ready.'); token.current = ''; } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to accept the invitation.'); } }); }}><label className="sf-label">Choose a password<UrbanTextInput name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={pending} aria-describedby="invitation-password-help" /></label><p id="invitation-password-help" className="text-xs leading-6 text-[var(--sf-ink-muted)]">Use at least 12 characters.</p>{error ? <p role="alert" className="text-sm text-[var(--sf-danger)]">{error}</p> : null}<UrbanButton type="submit" disabled={pending}>{pending ? 'Accepting invitation…' : 'Accept invitation'}</UrbanButton></form>}
  </div></UrbanContainer></UrbanPageShell>;
}
