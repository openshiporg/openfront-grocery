'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
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
  return <UrbanPageShell><UrbanContainer className="py-10"><div className="mx-auto max-w-xl space-y-6"><header><p className="sf-eyebrow">Guest orders</p><h1 className="sf-title mt-2">Find your grocery order.</h1><p className="sf-copy mt-3">Use the order ID and email from checkout. We’ll send a secure link so you can see progress and your receipt.</p></header><form className="sf-panel sf-form space-y-5 p-5 sm:p-7" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setMessage('');
    start(async () => { try { setMessage(await requestOrderAccess(form)); setFailed(false); } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Could not request a link. Please try again.'); } });
  }}><label className="block space-y-2"><span className="font-medium">Order ID</span><UrbanTextInput name="orderId" required maxLength={200} autoCapitalize="none" autoCorrect="off" disabled={pending || opening} /><span className="block text-sm text-[var(--sf-ink-muted)]">Copy the order ID from your confirmation.</span></label><label className="block space-y-2"><span className="font-medium">Checkout email</span><UrbanTextInput name="email" type="email" required maxLength={320} autoComplete="email" disabled={pending || opening} /></label><UrbanButton type="submit" disabled={pending || opening} className="w-full">{opening ? 'Opening your order…' : pending ? 'Requesting link…' : 'Email an access link'}</UrbanButton>{message ? <p role={failed ? 'alert' : 'status'} className="text-sm leading-6">{message}</p> : null}</form><p className="sf-copy">Have an account? <Link href="/dashboard/signin?from=%2Faccount%2Forders" className="font-semibold underline underline-offset-4">Sign in to view your orders</Link>.</p><Link href="/support" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Need help with an order?</Link></div></UrbanContainer></UrbanPageShell>;
}
