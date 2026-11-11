'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { PackageSearch } from 'lucide-react';
import { acceptGuestOrderLink } from './actions';
import { UrbanContainer, UrbanPageShell } from '../urban/UrbanPrimitives';
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
        catch (error) { setFailed(true); setOpening(false); setMessage(error instanceof Error ? error.message : 'We could not open that link. Contact the store from the Help page.'); }
      });
    } else if (orderId || sessionId || token) { start(() => { setFailed(true); setMessage('This access link is incomplete. Contact the store from the Help page.'); }); }
  }, [start]);
  return <UrbanPageShell><UrbanContainer className="py-10 sm:py-16"><div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
    <header className="lg:pt-6">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]"><PackageSearch className="h-6 w-6" aria-hidden="true" /></span>
      <h1 className="sf-title mt-5">Find your grocery order.</h1>
      <p className="sf-copy mt-3 max-w-md">Checked out as a guest? Your order stays open in the browser you checked out with.</p>
      <p className="sf-copy mt-6">Have an account? <Link href="/account/sign-in?from=%2Faccount%2Forders" className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">Sign in to view your orders</Link>.</p>
      <Link href="/support" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Need help with an order?</Link>
    </header>
    <div className="sf-panel space-y-5 p-6 sm:p-8">
      <p className="sf-copy">Open your order from the browser you checked out with, or sign in if you have an account. Otherwise send the store a message from the Help page with your order number and checkout email.</p>
      {message ? <p role={failed ? 'alert' : 'status'} className={`rounded-[var(--sf-radius-md)] px-3 py-2.5 text-sm font-medium leading-6 ${failed ? 'bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]'}`}>{message}</p> : null}
    </div>
  </div></UrbanContainer></UrbanPageShell>;
}
