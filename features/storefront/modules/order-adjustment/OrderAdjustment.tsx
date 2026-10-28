'use client';
import Link from 'next/link';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Appearance } from '@stripe/stripe-js';
import { storefrontStripeAppearance, storefrontStripeFonts } from '../urban/stripeAppearance';
import { requestAdjustmentAuthorization } from './actions';
import { UrbanButton, formatCents } from '../urban/UrbanPrimitives';

function authorizationMessage(status?: string) {
  if (status === 'requires_capture') return 'The revised amount is authorized. The shop still needs to finalize your order; this is not a final receipt.';
  if (status === 'succeeded') return 'The payment provider confirmed the payment. Refresh your order to check whether the shop has finalized it.';
  if (status === 'processing') return 'Your payment is processing. Wait for confirmation before attempting another payment.';
  return 'Authorization is not confirmed yet. Follow the payment instructions or contact the shop before trying another card.';
}
function Confirm() {
  const stripe = useStripe(), elements = useElements();
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false);
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); if (!stripe || !elements || busy) return;
    setBusy(true); setMessage('');
    try {
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set('adjustment_return', '1');
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl.toString() }, redirect: 'if_required' });
      setMessage(result.error?.message || authorizationMessage(result.paymentIntent?.status));
      if (!result.error) setSubmitted(true);
    } catch { setSubmitted(true); setMessage('The payment result could not be confirmed. Contact the shop before trying another card.'); }
    finally { setBusy(false); }
  }}><PaymentElement /><UrbanButton type="submit" disabled={busy || !stripe || !elements || submitted}>{busy ? 'Confirming…' : submitted ? 'Authorization submitted' : 'Authorize revised total'}</UrbanButton>{message ? <p role="status" className="text-sm leading-6">{message}</p> : null}{submitted ? <UrbanButton type="button" variant="ghost" onClick={() => window.location.reload()}>Refresh order status</UrbanButton> : null}</form>;
}
export function OrderAdjustment({ orderId, totalCents }: { orderId: string; totalCents: number }) {
  const [secret, setSecret] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [returnMessage, setReturnMessage] = useState('');
  const [authorizedTotal, setAuthorizedTotal] = useState(totalCents);
  const [stripeAppearance, setStripeAppearance] = useState<Appearance | undefined>(undefined);
  useEffect(() => { setStripeAppearance(storefrontStripeAppearance()); }, []);
  const stripe = useMemo(() => process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const returnedSecret = url.searchParams.get('payment_intent_client_secret');
    const returned = url.searchParams.has('adjustment_return') || Boolean(returnedSecret);
    if (!returned) return;
    url.searchParams.delete('payment_intent_client_secret'); url.searchParams.delete('payment_intent'); url.searchParams.delete('redirect_status'); url.searchParams.delete('adjustment_return');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    // Redirect parameters are not order-bound payment proof; only the server can finalize this order.
    startTransition(() => setReturnMessage('You returned from payment. The shop has not finalized this order yet. Refresh the order or contact the shop before trying another payment.'));
  }, [stripe]);
  return <section className="sf-panel space-y-4 border-2 border-[var(--sf-accent)] p-5 sm:p-7" aria-labelledby="adjustment-title"><p className="sf-eyebrow">Your review is needed</p><h2 id="adjustment-title" className="sf-subtitle">Approve the picked total</h2><p className="sf-copy">Your proposed picked total is <strong className="text-[var(--sf-ink)]">{formatCents(authorizedTotal)}</strong>. Review the item changes below before authorizing this amount. The shop must complete settlement of the original and revised payments before finalizing your order.</p>{returnMessage ? <div className="space-y-3"><p role="status" className="text-sm leading-6">{returnMessage}</p><UrbanButton variant="ghost" onClick={() => window.location.reload()}>Refresh order status</UrbanButton></div> : !stripe ? <p role="status">Online authorization is unavailable. Contact the shop to resolve this order.</p> : secret ? <Elements stripe={stripe} options={{ clientSecret: secret, appearance: stripeAppearance, fonts: storefrontStripeFonts }}><Confirm /></Elements> : <UrbanButton disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try { const result = await requestAdjustmentAuthorization(orderId); if (!result.clientSecret) throw new Error('Authorization is unavailable. Contact the shop.'); setAuthorizedTotal(result.totalCents); setSecret(result.clientSecret); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to prepare authorization'); }
    finally { setBusy(false); }
  }}>{busy ? 'Preparing secure payment…' : 'Review payment authorization'}</UrbanButton>}{error ? <p role="alert" className="text-sm">{error}</p> : null}<Link href="/support" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Questions about these changes?</Link></section>;
}

/** Clean provider secrets even if the order finalized before the browser returned. */
export function OrderAdjustmentReturnNotice() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('payment_intent_client_secret') && !url.searchParams.has('adjustment_return')) return;
    for (const key of ['payment_intent_client_secret', 'payment_intent', 'redirect_status', 'adjustment_return']) url.searchParams.delete(key);
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    startTransition(() => setMessage('You returned from payment. The order details below reflect the latest information available from the shop.'));
  }, []);
  return message ? <p role="status" className="sf-panel p-4 text-sm">{message}</p> : null;
}
