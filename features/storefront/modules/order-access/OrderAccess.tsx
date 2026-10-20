'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { PackageSearch } from 'lucide-react';
import { acceptGuestOrderLink, requestOrderAccess } from './actions';
import { UrbanButton, UrbanContainer, UrbanPageShell, UrbanTextInput } from '../urban/UrbanPrimitives';
export default function OrderAccess() {
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pending, start] = useTransition();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return; once.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const orderId = params.get('orderId'), sessionId = params.get('sessionId'), token = params.get('token');
    // The signed secret is consumed into an HttpOnly cookie, never query params or browser storage.
    if (orderId || sessionId || token) window.history.replaceState({}, '', window.location.pathname + window.location.search);
    if (orderId && sessionId && token) {
      start(async () => {
        setOpening(true); setMessage('Verifying your access link…');
        try { window.location.assign(await acceptGuestOrderLink(orderId, sessionId, token)); }
        catch (error) { setFailed(true); setOpening(false); setMessage(error instanceof Error ? error.message : 'We could not open that link. Request a new one below.'); }
      });
    } else if (orderId || sessionId || token) { start(() => { setFailed(true); setMessage('This access link is incomplete. Request a new link below.'); }); }
  }, [start]);
  return <UrbanPageShell><UrbanContainer className="py-10 sm:py-16"><div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
    <header className="lg:pt-6">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]"><PackageSearch className="h-6 w-6" aria-hidden="true" /></span>
      <h1 className="sf-title mt-5">Find your grocery order.</h1>
      <p className="sf-copy mt-3 max-w-md">Checked out as a guest? Use the order number and email from checkout. We’ll send a secure link so you can see progress and your receipt.</p>
      <p className="sf-copy mt-6">Have an account? <Link href="/account/sign-in?from=%2Faccount%2Forders" className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">Sign in to view your orders</Link>.</p>
      <Link href="/support" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Need help with an order?</Link>
    </header>
    <form className="sf-panel space-y-5 p-6 sm:p-8" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setMessage('');
      start(async () => { try { setMessage(await requestOrderAccess(form)); setFailed(false); } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Could not request a link. Please try again.'); } });
    }}>
      <label className="sf-label">Order number<UrbanTextInput name="orderId" required maxLength={200} autoCapitalize="none" autoCorrect="off" inputMode="text" placeholder="1024" disabled={pending || opening} className="font-[family-name:var(--sf-font-mono)]" /><span className="sf-hint">The number shown on your confirmation and order emails, like #1024.</span></label>
      <label className="sf-label">Checkout email<UrbanTextInput name="email" type="email" required maxLength={320} autoComplete="email" disabled={pending || opening} /></label>
      <UrbanButton type="submit" variant="dark" size="lg" disabled={pending || opening} className="w-full">{opening ? 'Opening your order…' : pending ? 'Requesting link…' : 'Email an access link'}</UrbanButton>
      {message ? <p role={failed ? 'alert' : 'status'} className={`rounded-[var(--sf-radius-md)] px-3 py-2.5 text-sm font-medium leading-6 ${failed ? 'bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]'}`}>{message}</p> : null}
    </form>
  </div></UrbanContainer></UrbanPageShell>;
}
