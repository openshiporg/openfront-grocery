'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { BadgeCheck, KeyRound, Link2Off } from 'lucide-react';
import { storefrontGraphQL, throwGraphQLErrors } from '../../lib/data/graphql';
import { UrbanButton, UrbanContainer, UrbanPageShell, UrbanTextInput } from '../../modules/urban/UrbanPrimitives';
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
  const state = complete ? 'complete' : !ready ? 'opening' : !token.current ? 'missing' : 'form';
  const Icon = state === 'complete' ? BadgeCheck : state === 'missing' ? Link2Off : KeyRound;
  return <UrbanPageShell><UrbanContainer className="py-10 sm:py-16"><div className="mx-auto max-w-md">
    <div className="sf-panel overflow-hidden">
      <div className="sf-dark px-6 pb-7 pt-8 sm:px-8">
        <span className={`grid h-12 w-12 place-items-center rounded-full ${state === 'missing' ? 'bg-[var(--sf-header-2)] text-[var(--sf-header-ink)]' : 'bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <p className="mt-5 text-[0.8125rem] font-medium text-[var(--sf-header-ink-muted)]">Staff invitation</p>
        <h1 className="sf-subtitle mt-1">{state === 'complete' ? 'You’re all set.' : state === 'missing' ? 'An invitation link is needed' : 'Accept your invitation'}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--sf-header-ink-muted)]">{state === 'missing' ? 'Open the complete link from your invitation email.' : 'Set a password to activate the staff account you were invited to use.'}</p>
      </div>
      <div className="p-6 sm:p-8">
        {state === 'complete' ? <div className="space-y-4"><p role="status" className="rounded-[var(--sf-radius-md)] bg-[var(--sf-sage-light)] px-3 py-2.5 text-sm font-medium text-[var(--sf-sage)]">{message}</p><Link href="/dashboard/signin" className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--sf-ink)] px-5 text-sm font-semibold text-[var(--sf-paper)] hover:bg-[var(--sf-header-2)]">Sign in to your staff account</Link></div>
          : state === 'opening' ? <div role="status" className="space-y-3"><span className="sr-only">Opening your invitation…</span><div aria-hidden="true" className="sf-skeleton h-4 w-32" /><div aria-hidden="true" className="sf-skeleton h-12" /><div aria-hidden="true" className="sf-skeleton h-12 rounded-full" /></div>
          : state === 'missing' ? <p className="sf-copy">If the link has expired, ask the store administrator for a new invitation. <Link href="/" className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">Back to the shop</Link></p>
          : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setError(''); start(async () => { try { const response = await storefrontGraphQL<{acceptGroceryStaffInvitation: unknown}>('mutation Accept($token:String!,$password:String!){acceptGroceryStaffInvitation(token:$token,password:$password)}', { token: token.current, password: String(form.get('password') || '') }); throwGraphQLErrors(response.errors); if (!response.data?.acceptGroceryStaffInvitation) throw new Error('The invitation was not accepted. Ask the administrator for a new link.'); setComplete(true); setMessage('Your staff account is ready.'); token.current = ''; } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to accept the invitation.'); } }); }}>
            <label className="sf-label">Choose a password<UrbanTextInput name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={pending} aria-describedby="invitation-password-help" /></label>
            <p id="invitation-password-help" className="-mt-2 text-xs leading-6 text-[var(--sf-ink-muted)]">Use at least 12 characters.</p>
            {error ? <p role="alert" className="rounded-[var(--sf-radius-md)] bg-[var(--sf-danger-bg)] px-3 py-2.5 text-sm font-medium text-[var(--sf-danger)]">{error}</p> : null}
            <UrbanButton type="submit" variant="dark" size="lg" className="w-full" disabled={pending}>{pending ? 'Accepting invitation…' : 'Accept invitation'}</UrbanButton>
          </form>}
      </div>
    </div>
  </div></UrbanContainer></UrbanPageShell>;
}
