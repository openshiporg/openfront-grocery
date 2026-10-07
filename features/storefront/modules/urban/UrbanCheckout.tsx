'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import Link from 'next/link';
import { initiatePaymentSession, restartCheckoutAttempt, resumeCheckout } from '../../lib/data/checkout';
import { checkoutPaymentSnapshotMatches, createCheckoutPaymentSnapshot, type CheckoutPaymentSnapshot } from '../../lib/checkoutPaymentSnapshot';
import { checkoutRecoveryPointer, cleanCheckoutReturnUrl, type CheckoutRecoveryPointer } from '../../lib/checkoutRecoveryPointer';
import { MARKET_MODE_KEY } from '../market/MarketMode';
import type { DeliveryWindow, GroceryCart, GroceryUser } from '../../types';
import { UrbanButton, UrbanEmptyState, UrbanProductArtwork, UrbanSelect, UrbanTextInput, UrbanTextarea, formatMoney } from './UrbanPrimitives';

const RECOVERY_KEY = 'grocery-stripe-session';
type StripeConfirm = () => Promise<void>;
class PaymentInputError extends Error {}
function StripePaymentFields({ register }: { register: (confirm: StripeConfirm | null) => void }) {
  const stripe = useStripe(), elements = useElements();
  useEffect(() => {
    register(!stripe || !elements ? null : async () => {
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: 'if_required' });
      if (result.error) {
        const message = result.error.message || 'Payment could not be confirmed.';
        if (['card_error', 'validation_error'].includes(result.error.type)) throw new PaymentInputError(message);
        throw new Error(message);
      }
      const status = result.paymentIntent?.status;
      if (status === 'requires_payment_method') throw new PaymentInputError('Choose another payment method and try again.');
      if (!status || !['succeeded', 'requires_capture'].includes(status)) throw new Error('Payment confirmation is still pending. Check this checkout before trying another payment.');
    });
    return () => register(null);
  }, [elements, register, stripe]);
  return <div className="mt-4 rounded-md border border-[var(--sf-rule)] bg-white p-3"><PaymentElement /></div>;
}

type Props = { cart: GroceryCart | null; user: GroceryUser | null; paymentProviders: Array<{ id: string; name: string; code: string }>; deliveryWindows?: DeliveryWindow[]; pickupWindows?: DeliveryWindow[]; storeAddress?: string; timezone?: string };
export default function UrbanCheckout({ cart, user, paymentProviders, deliveryWindows = [], pickupWindows = [], storeAddress, timezone }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [method, setMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [selectedWindowId, setSelectedWindowId] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [snapshot, setSnapshot] = useState<CheckoutPaymentSnapshot | null>(null);
  const [recovery, setRecovery] = useState<CheckoutRecoveryPointer | null>(null);
  const [restartPayment, setRestartPayment] = useState<Awaited<ReturnType<typeof restartCheckoutAttempt>>>(null);
  const [placedOrder, setPlacedOrder] = useState<{ id: string; orderNumber: string } | null>(null);
  const [noChargePlaced, setNoChargePlaced] = useState(false);
  const [confirmationStarted, setConfirmationStarted] = useState(false);
  const confirmRef = useRef<StripeConfirm | null>(null);
  const initialRecovery = useRef(false);
  const register = useCallback((confirm: StripeConfirm | null) => { confirmRef.current = confirm; }, []);
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const stripePromise = useMemo(() => stripeKey ? loadStripe(stripeKey) : null, [stripeKey]);
  const provider = paymentProviders.find((item) => item.code.includes('stripe')) || paymentProviders[0];
  const windows = method === 'pickup' ? pickupWindows : deliveryWindows;
  const selectedWindow = windows.find((window) => window.id === selectedWindowId && window.available);
  const normalizedCoupon = couponCode.trim().toUpperCase() || undefined;
  const active = cart && checkoutPaymentSnapshotMatches(snapshot, { cartId: cart.id, windowId: selectedWindowId, fulfillmentMethod: method, couponCode: normalizedCoupon }) ? snapshot : null;

  function clearRecovery() {
    try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* Optional browser storage. */ }
    setRecovery(null); setConfirmationStarted(false);
    window.history.replaceState({}, '', cleanCheckoutReturnUrl(window.location.href));
  }
  async function recover(pointer: CheckoutRecoveryPointer) {
    setError('');
    try { const order = await resumeCheckout(pointer.id); setPlacedOrder(order); clearRecovery(); window.dispatchEvent(new CustomEvent('checkoutCompleted', { detail: pointer.cartId })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Checkout status is not available yet. Try checking again.'); }
  }
  async function restart(pointer: CheckoutRecoveryPointer) {
    setError('');
    try {
      const payment = await restartCheckoutAttempt(pointer.id);
      if (!payment) throw new Error('A fresh payment attempt could not be prepared. Check this checkout again.');
      if (payment.data?.status === 'completed') {
        const order = await resumeCheckout(payment.id);
        setPlacedOrder(order); clearRecovery();
        window.dispatchEvent(new CustomEvent('checkoutCompleted', { detail: pointer.cartId }));
        return;
      }
      if (payment.data?.compensationStatus) {
        if (payment.data.compensationStatus !== 'refunded') throw new Error('The previous payment is not yet confirmed canceled or refunded. Check this checkout later or contact the store.');
        const nextPointer = { version: 1 as const, id: payment.id, cartId: pointer.cartId };
        try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(nextPointer)); } catch { /* The server still owns the durable restart identity. */ }
        setRecovery(nextPointer);
        throw new Error('That retry was also compensated. You can start another fresh payment attempt.');
      }
      setRestartPayment(payment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A fresh payment attempt is not available yet. Check this checkout again.');
    }
  }
  function confirmRestartedCheckout() {
    const payment = restartPayment;
    if (!payment || !recovery) return;
    setError('');
    startTransition(async () => {
      try {
        const pointer = { version: 1 as const, id: payment.id, cartId: recovery.cartId };
        try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(pointer)); }
        catch { throw new PaymentInputError('Your browser could not save this checkout reference. Allow site storage before confirming payment.'); }
        setRecovery(pointer);
        const noCharge = payment.data?.noCharge?.version === 1 && payment.data.noCharge.amountCents === 0 && payment.amountCents === 0;
        if (!noCharge) {
          if (!provider?.code.includes('stripe') || !stripePromise || !confirmRef.current) throw new Error('The payment form is not ready. Please wait or contact the store if it does not load.');
          await confirmRef.current();
        }
        const order = await resumeCheckout(payment.id);
        setNoChargePlaced(noCharge); setPlacedOrder(order); clearRecovery();
        window.dispatchEvent(new CustomEvent('checkoutCompleted', { detail: pointer.cartId }));
      } catch (cause) {
        if (!(cause instanceof PaymentInputError)) setRestartPayment(null);
        setError(cause instanceof Error ? cause.message : 'Checkout status is not available yet. Check this checkout before trying again.');
      }
    });
  }
  useEffect(() => {
    if (initialRecovery.current) return;
    initialRecovery.current = true;
    const url = new URL(window.location.href);
    const returned = url.searchParams.has('payment_intent');
    let pointer: CheckoutRecoveryPointer | null = null;
    try {
      // Migrate older storage to a minimal pointer, discarding secrets and contact details.
      pointer = checkoutRecoveryPointer(JSON.parse(sessionStorage.getItem(RECOVERY_KEY) || 'null'));
      if (pointer) sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(pointer));
      else sessionStorage.removeItem(RECOVERY_KEY);
      const preferred = url.searchParams.get('fulfillment') || localStorage.getItem(MARKET_MODE_KEY);
      if (preferred === 'pickup' || preferred === 'delivery') setMethod(preferred);
      const candidateWindow = url.searchParams.get('window');
      const choices = preferred === 'pickup' ? pickupWindows : deliveryWindows;
      if (candidateWindow && choices.some((window) => window.id === candidateWindow && window.available)) setSelectedWindowId(candidateWindow);
    } catch { /* Checkout can still be used when browser storage is unavailable. */ }
    setCouponCode(url.searchParams.get('coupon') || '');
    window.history.replaceState({}, '', cleanCheckoutReturnUrl(window.location.href));
    if (pointer) {
      setRecovery(pointer); setConfirmationStarted(true);
      if (returned) startTransition(() => recover(pointer));
    } else if (returned) {
      setError('The payment return could not be matched to a checkout in this browser. Find your order or contact the store before attempting another payment.');
      setConfirmationStarted(true);
    }
  // Recovery runs once and uses the immutable server attempt, never redirect fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (placedOrder) return <UrbanEmptyState title={`Order #${placedOrder.orderNumber} received`} actionHref={`/order/${placedOrder.id}`} actionLabel="View your order"><p>{noChargePlaced ? 'No payment was due for this checkout.' : 'Your order was accepted. Check your order details for the current total and fulfillment status.'}</p><p className="mt-2">Picked quantities and substitutions determine the final goods total.</p><Link href="/products" className="mt-4 inline-block underline">Continue shopping</Link></UrbanEmptyState>;
  if (confirmationStarted && restartPayment) {
    const noCharge = restartPayment.data?.noCharge?.version === 1 && restartPayment.data.noCharge.amountCents === 0 && restartPayment.amountCents === 0;
    const restartTotal = Number(restartPayment.data?.total ?? restartPayment.amount ?? ((restartPayment.amountCents || 0) / 100));
    return <section className="sf-panel space-y-4 p-5" aria-busy={pending}>
      <h2 className="font-[family-name:var(--sf-font-display)] text-2xl">Your checkout is ready to retry</h2>
      <p className="sf-copy">The previous payment was confirmed canceled or refunded. Your basket, time, address, and picking instructions are unchanged. Authorize one fresh payment to finish.</p>
      {error ? <p role="alert" className="text-sm text-[var(--sf-danger)]">{error}</p> : null}
      {!noCharge && restartPayment.data?.clientSecret && provider?.code.includes('stripe') && stripePromise
        ? <Elements key={restartPayment.id} stripe={stripePromise} options={{ clientSecret: restartPayment.data.clientSecret }}><StripePaymentFields register={register} /></Elements>
        : null}
      {!noCharge && !restartPayment.data?.clientSecret ? <p role="alert" className="text-sm text-[var(--sf-danger)]">The new payment form is unavailable. Check this checkout or contact the store before trying again.</p> : null}
      <UrbanButton type="button" disabled={pending || (!noCharge && (!provider?.code.includes('stripe') || !stripePromise || !restartPayment.data?.clientSecret))} onClick={confirmRestartedCheckout} className="w-full">
        {pending ? 'Working…' : noCharge ? 'Place order · no payment due' : `Authorize ${formatMoney(restartTotal)} & place order`}
      </UrbanButton>
      <div className="flex flex-wrap gap-5 text-sm"><Link href="/order-access" className="underline">Find an order by email</Link><Link href="/support" className="underline">Contact the store</Link></div>
    </section>;
  }
  if (confirmationStarted && (!active || error)) return <section className="sf-panel space-y-4 p-5" aria-busy={pending}><h2 className="font-[family-name:var(--sf-font-display)] text-2xl">Let’s check your checkout</h2><p className="sf-copy">If payment was already authorized, this check resumes that same checkout. The store confirms the result before an order is shown.</p>{error ? <p role="alert" className="text-sm text-[var(--sf-danger)]">{error}</p> : null}{recovery ? <><UrbanButton type="button" disabled={pending} onClick={() => startTransition(() => recover(recovery))}>{pending ? 'Checking checkout…' : 'Check checkout status'}</UrbanButton><p className="text-xs leading-5 text-[var(--sf-ink-muted)]">A new attempt is available only after the previous payment is confirmed canceled or refunded.</p><UrbanButton type="button" disabled={pending} onClick={() => startTransition(() => restart(recovery))}>Start a new payment attempt</UrbanButton></> : null}<div className="flex flex-wrap gap-5 text-sm"><Link href="/order-access" className="underline">Find an order by email</Link><Link href="/support" className="underline">Contact the store</Link></div></section>;
  if (!cart?.items.length) return <UrbanEmptyState title="Your basket is empty" actionHref="/products" actionLabel="Start shopping">Add your groceries, then come back to choose a time.</UrbanEmptyState>;
  const inventoryIssue = cart.items.find((item) => !item.product.inStock);
  const total = active?.total ?? cart.subtotal + cart.tax + (selectedWindow?.fee || 0);

  function invalidateReview() { if (!confirmationStarted) { setSnapshot(null); setMessage(''); } }
  function chooseMethod(next: 'delivery' | 'pickup') {
    setMethod(next); setSelectedWindowId(''); invalidateReview();
    try { localStorage.setItem(MARKET_MODE_KEY, next); window.dispatchEvent(new Event('marketModeChanged')); } catch { /* Optional preference. */ }
  }
  function submit(formData: FormData) {
    setError(''); setMessage('');
    startTransition(async () => {
      try {
        if (!cart || inventoryIssue) throw new Error('Review unavailable items in your basket before checkout.');
        if (!selectedWindow) throw new Error('Choose an available time before continuing.');
        if (!provider) throw new Error('Online payment is not available. Contact the store for help.');
        const request = {
          email: String(formData.get('email') || '').trim(),
          deliveryAddress: { firstName: String(formData.get('firstName') || '').trim(), lastName: String(formData.get('lastName') || '').trim(), phone: String(formData.get('phone') || '').trim(), address1: String(formData.get('address1') || '').trim(), city: String(formData.get('city') || '').trim(), province: String(formData.get('province') || '').trim(), postalCode: String(formData.get('postalCode') || '').trim() },
          substitutionPreference: String(formData.get('substitutionPreference') || 'best_match') as 'call_me' | 'best_match' | 'refund',
          deliveryInstructions: String(formData.get('deliveryInstructions') || '').trim(),
        };
        const requiredContact = [request.deliveryAddress.firstName, request.deliveryAddress.lastName, request.deliveryAddress.phone];
        const requiredAddress = method === 'delivery' ? [request.deliveryAddress.address1, request.deliveryAddress.city, request.deliveryAddress.province, request.deliveryAddress.postalCode] : [];
        if ([...requiredContact, ...requiredAddress].some((value) => value.length < 2)) throw new Error('Complete each required contact and address field with at least two characters.');
        if (!active || JSON.stringify(active.customerRequest) !== JSON.stringify(request)) {
          const payment = await initiatePaymentSession(cart.id, provider.code, method === 'delivery' ? selectedWindow.id : undefined, method === 'pickup' ? selectedWindow.id : undefined, normalizedCoupon, request);
          if (!payment) throw new Error('The checkout estimate could not be prepared. Please try again.');
          const next = createCheckoutPaymentSnapshot({ cartId: cart.id, windowId: selectedWindow.id, fulfillmentMethod: method, couponCode: normalizedCoupon, customerRequest: request, payment });
          setSnapshot(next); setMessage('Your checkout estimate is ready. Review the total, then confirm below.');
          return;
        }
        if (!active.noCharge && (!provider.code.includes('stripe') || !stripePromise || !confirmRef.current)) throw new Error('The payment form is not ready. Please wait or contact the store if it does not load.');
        const pointer = { version: 1 as const, id: active.id, cartId: cart.id };
        try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(pointer)); } catch { throw new PaymentInputError('Your browser could not save this checkout reference. Allow site storage before confirming payment so you can safely return to your order.'); }
        setRecovery(pointer); setConfirmationStarted(true);
        if (!active.noCharge) await confirmRef.current!();
        // The server owns the exact address, fee, coupon, slot and payment identity.
        const order = await resumeCheckout(active.id);
        setNoChargePlaced(Boolean(active.noCharge)); setPlacedOrder(order); clearRecovery();
        window.dispatchEvent(new CustomEvent('checkoutCompleted', { detail: cart.id }));
      } catch (cause) {
        if (cause instanceof PaymentInputError) clearRecovery();
        setError(cause instanceof Error ? cause.message : 'Checkout could not be completed. Please try again.');
      }
    });
  }
  return <form onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy={pending}>
    <fieldset disabled={pending || confirmationStarted} className="min-w-0 space-y-6">
      <legend className="sr-only">Checkout details</legend>
      {error ? <p role="alert" className="sf-note text-[var(--sf-danger)]">{error}</p> : null}
      {inventoryIssue ? <p role="alert" className="sf-note text-[var(--sf-danger)]">{inventoryIssue.product.name} is no longer available in the requested quantity. <Link href="/cart" className="underline">Review your basket</Link>.</p> : null}
      <section className="sf-panel p-4 sm:p-5"><h2 className="font-[family-name:var(--sf-font-display)] text-xl font-semibold">1. Choose delivery or pickup</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">{(['delivery', 'pickup'] as const).map((value) => <label key={value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-3 text-sm font-semibold ${method === value ? 'border-[var(--sf-accent)] bg-[var(--sf-paper-2)]' : 'border-[var(--sf-rule)]'}`}><input type="radio" name="fulfillmentMethod" value={value} checked={method === value} onChange={() => chooseMethod(value)} className="accent-[var(--sf-accent)]" />{value === 'pickup' ? 'Store pickup' : 'Home delivery'}</label>)}</div>
        {method === 'pickup' ? <p className="mt-3 text-sm leading-6">{storeAddress || 'Contact the store to confirm the pickup location.'}</p> : <p className="mt-3 text-sm leading-6 text-[var(--sf-ink-muted)]">Your postal code, delivery eligibility and any service fee are checked when you review the estimate.</p>}
        <fieldset className="mt-5"><legend className="text-sm font-semibold">Choose a time{timezone ? ` · ${timezone}` : ' · store local time'}</legend><p className="mt-1 text-xs leading-5 text-[var(--sf-ink-muted)]">Availability can change. A time is reserved when your order is accepted.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{windows.map((window) => <label key={window.id} className={`flex min-h-16 items-start gap-2 rounded-md border p-3 text-sm ${selectedWindowId === window.id ? 'border-[var(--sf-accent)] bg-[var(--sf-paper-2)]' : 'border-[var(--sf-rule)]'} ${!window.available ? 'text-[var(--sf-ink-muted)]' : ''}`}><input type="radio" name="windowId" value={window.id} checked={selectedWindowId === window.id} required disabled={!window.available} onChange={() => { setSelectedWindowId(window.id); invalidateReview(); }} className="mt-1 accent-[var(--sf-accent)]" /><span><span className="block font-medium">{new Date(`${window.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="mt-0.5 block text-xs">{window.startTime}–{window.endTime} · {!window.available ? 'Unavailable' : window.fee ? `${formatMoney(window.fee)} slot fee` : 'No slot fee'}</span></span></label>)}</div>
          {!windows.some((window) => window.available) ? <p role="status" className="sf-note mt-3">No {method} times are currently available. Try the other option or <Link href="/support" className="underline">contact the store</Link>.</p> : null}
        </fieldset>
      </section>
      <section className="sf-panel p-4 sm:p-5" onChange={invalidateReview}><h2 className="font-[family-name:var(--sf-font-display)] text-xl font-semibold">2. Your details</h2>{!user ? <p className="mt-2 text-sm text-[var(--sf-ink-muted)]">Checkout as a guest, or <Link href={`/dashboard/signin?from=${encodeURIComponent(`/checkout?${new URLSearchParams({ fulfillment: method, ...(selectedWindowId ? { window: selectedWindowId } : {}), ...(normalizedCoupon ? { coupon: normalizedCoupon } : {}) }).toString()}`)}`} className="underline">sign in</Link> to keep your orders together.</p> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="sf-label sm:col-span-2">Email<UrbanTextInput name="email" type="email" autoComplete="email" required maxLength={320} defaultValue={user?.email || ''} /></label><label className="sf-label">First name<UrbanTextInput name="firstName" autoComplete="given-name" required minLength={2} maxLength={200} defaultValue={user?.firstName || ''} /></label><label className="sf-label">Last name<UrbanTextInput name="lastName" autoComplete="family-name" required minLength={2} maxLength={200} defaultValue={user?.lastName || ''} /></label><label className="sf-label sm:col-span-2">Phone<UrbanTextInput name="phone" type="tel" autoComplete="tel" required minLength={2} maxLength={200} defaultValue={user?.phone || ''} /></label>
          <fieldset disabled={method === 'pickup'} className={method === 'delivery' ? 'grid gap-4 sm:col-span-2 sm:grid-cols-2' : 'hidden'}><legend className="sr-only">Delivery address</legend><label className="sf-label sm:col-span-2">Street address and apartment<UrbanTextInput name="address1" autoComplete="street-address" required minLength={2} maxLength={200} /></label><label className="sf-label">City<UrbanTextInput name="city" autoComplete="address-level2" required minLength={2} maxLength={200} /></label><label className="sf-label">State / province<UrbanTextInput name="province" autoComplete="address-level1" required minLength={2} maxLength={200} /></label><label className="sf-label">Postal code<UrbanTextInput name="postalCode" autoComplete="postal-code" required minLength={2} maxLength={200} /></label></fieldset>
        </div>
      </section>
      <section className="sf-panel space-y-4 p-4 sm:p-5" onChange={invalidateReview}><h2 className="font-[family-name:var(--sf-font-display)] text-xl font-semibold">3. Picking preferences</h2><label className="sf-label">If an item is unavailable<UrbanSelect name="substitutionPreference"><option value="best_match">Allow a suitable substitute</option><option value="call_me">Contact me before substituting</option><option value="refund">Leave the item out</option></UrbanSelect></label><p className="text-xs leading-6 text-[var(--sf-ink-muted)]">Your individual item choices in the basket are retained. If a picked total increases, you must approve the extra authorization.</p><label className="sf-label">{method === 'pickup' ? 'Pickup notes (optional)' : 'Delivery instructions (optional)'}<UrbanTextarea name="deliveryInstructions" rows={3} maxLength={2000} placeholder={method === 'pickup' ? 'Anything the store should know' : 'Apartment access or where to meet you'} /></label></section>
    </fieldset>
    <aside className="sf-panel p-5 lg:sticky lg:top-[var(--sf-header-offset)]"><h2 className="font-[family-name:var(--sf-font-display)] text-xl font-semibold">{active ? 'Review & confirm' : 'Your order estimate'}</h2><Link href="/cart" className="mt-1 inline-block py-2 text-sm underline">Edit basket</Link>
      <div className="max-h-72 space-y-3 overflow-y-auto border-y border-[var(--sf-rule)] py-4">{cart.items.map((item) => <div key={item.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 text-sm"><div className="h-11 overflow-hidden rounded border border-[var(--sf-rule)]"><UrbanProductArtwork product={item.product} /></div><span>{item.quantity} × {item.product.name}</span><span>{formatMoney(item.subtotal)}</span></div>)}</div>
      <label className="sf-label mt-4">Coupon code (optional)<UrbanTextInput name="couponCode" value={couponCode} maxLength={100} disabled={pending || confirmationStarted} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); invalidateReview(); }} autoComplete="off" /></label>
      <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Subtotal</dt><dd>{formatMoney(active?.subtotal ?? cart.subtotal)}</dd></div><div className="flex justify-between gap-3"><dt>Estimated tax</dt><dd>{formatMoney(active?.tax ?? cart.tax)}</dd></div><div className="flex justify-between gap-3"><dt>{method === 'pickup' ? 'Pickup' : 'Delivery fee'}</dt><dd>{active ? formatMoney(active.deliveryFee) : selectedWindow ? `${formatMoney(selectedWindow.fee)}${method === 'delivery' ? ' + service fee if applicable' : ''}` : 'Choose a time'}</dd></div>{active && active.discount > 0 ? <div className="flex justify-between gap-3 text-[var(--sf-sage)]"><dt>Discount · {active.couponCode}</dt><dd>−{formatMoney(active.discount)}</dd></div> : null}<div className="flex justify-between gap-3 border-t border-[var(--sf-rule)] pt-3 text-lg font-semibold"><dt>Estimated total</dt><dd>{formatMoney(total)}</dd></div></dl>
      <p className="mt-3 text-xs leading-6 text-[var(--sf-ink-muted)]">{active ? 'This is the amount to authorize. Final picked quantities, unavailable items and substitutions can change the final charge.' : 'Review checks your address, time, prices and coupon before payment confirmation.'}</p>
      {message ? <p role="status" className="sf-note mt-3">{message}</p> : null}
      {active && !active.noCharge && provider?.code.includes('stripe') && stripePromise ? <Elements key={active.id} stripe={stripePromise} options={{ clientSecret: active.clientSecret }}><StripePaymentFields register={register} /></Elements> : null}
      {!provider ? <p role="status" className="sf-note mt-3">Online payment is unavailable. <Link href="/support" className="underline">Contact the store</Link> for help.</p> : null}
      <UrbanButton type="submit" disabled={pending || !selectedWindow || !provider || Boolean(inventoryIssue) || confirmationStarted} className="mt-4 w-full">{pending ? 'Working…' : active ? active.noCharge ? 'Place order · no payment due' : `Authorize ${formatMoney(active.total)} & place order` : 'Review checkout estimate'}</UrbanButton>
      <Link href="/policies" className="mt-3 block py-2 text-center text-xs underline">How picking, payment & order help work</Link>
    </aside>
  </form>;
}
