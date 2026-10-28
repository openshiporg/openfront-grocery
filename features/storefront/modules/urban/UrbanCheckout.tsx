'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Appearance } from '@stripe/stripe-js';
import { storefrontStripeAppearance, storefrontStripeFonts } from './stripeAppearance';
import Link from 'next/link';
import { Check, Lock, MapPin, RotateCcw, ShieldCheck, Store, Ticket, Truck } from 'lucide-react';
import { initiatePaymentSession, restartCheckoutAttempt, resumeCheckout } from '../../lib/data/checkout';
import { basketFingerprint, checkoutPaymentSnapshotMatches, createCheckoutPaymentSnapshot, type CheckoutPaymentSnapshot } from '../../lib/checkoutPaymentSnapshot';
import { retrieveCart } from '../../lib/data/cart';
import type { SavedAddress } from '../../lib/data/addresses';
import { checkoutContactProblem } from '../../../lib/checkoutContact';
import { checkoutRecoveryPointer, cleanCheckoutReturnUrl, type CheckoutRecoveryPointer } from '../../lib/checkoutRecoveryPointer';
import { MARKET_MODE_KEY } from '../market/MarketMode';
import type { DeliveryWindow, GroceryCart, GroceryUser } from '../../types';
import { UrbanButton, UrbanButtonLink, UrbanEmptyState, UrbanPrice, UrbanProductArtwork, UrbanSelect, UrbanTextInput, UrbanTextarea, formatMoney, timezoneLabel } from './UrbanPrimitives';
import { UrbanSlotPicker } from './UrbanSlotPicker';

const RECOVERY_KEY = 'grocery-stripe-session';
// Tab-scoped draft so a refresh keeps the chosen time and typed details. Card
// data stays inside Stripe Elements and is never part of this form.
const DRAFT_KEY = 'grocery-checkout-draft';
const DRAFT_FIELDS = ['email', 'firstName', 'lastName', 'phone', 'address1', 'city', 'province', 'postalCode', 'deliveryInstructions'] as const;
type CheckoutDraft = { version: 1; cartId: string; method: 'delivery' | 'pickup'; windowId: string; couponCode: string; substitutionPreference: string; fields: Partial<Record<(typeof DRAFT_FIELDS)[number], string>> };
function readCheckoutDraft(cartId: string | undefined): CheckoutDraft | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    return draft?.version === 1 && draft.cartId === cartId && (draft.method === 'delivery' || draft.method === 'pickup') ? draft : null;
  } catch { return null; }
}
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
  return <div className="mt-4 rounded-[var(--sf-radius-md)] border border-[var(--sf-rule)] bg-[var(--sf-card)] p-3"><PaymentElement /></div>;
}

type Props = { cart: GroceryCart | null; user: GroceryUser | null; savedAddresses?: SavedAddress[]; paymentProviders: Array<{ id: string; name: string; code: string }>; deliveryWindows?: DeliveryWindow[]; pickupWindows?: DeliveryWindow[]; storeAddress?: string; timezone?: string };
export default function UrbanCheckout({ cart: initialCart, user, savedAddresses = [], paymentProviders, deliveryWindows = [], pickupWindows = [], storeAddress, timezone }: Props) {
  const [pending, startTransition] = useTransition();
  // The basket being reviewed follows every confirmed basket change (another tab's
  // edits arrive on the next read); a changed basket invalidates the estimate.
  const [cart, setCart] = useState(initialCart);
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
  const formRef = useRef<HTMLFormElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const messageRef = useRef<HTMLParagraphElement | null>(null);
  const initialRecovery = useRef(false);
  const register = useCallback((confirm: StripeConfirm | null) => { confirmRef.current = confirm; }, []);
  const [stripeAppearance, setStripeAppearance] = useState<Appearance | undefined>(undefined);
  useEffect(() => { setStripeAppearance(storefrontStripeAppearance()); }, []);
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const stripePromise = useMemo(() => stripeKey ? loadStripe(stripeKey) : null, [stripeKey]);
  const provider = paymentProviders.find((item) => item.code.includes('stripe')) || paymentProviders[0];
  const windows = method === 'pickup' ? pickupWindows : deliveryWindows;
  const selectedWindow = windows.find((window) => window.id === selectedWindowId && window.available);
  const normalizedCoupon = couponCode.trim().toUpperCase() || undefined;
  // A signed-in shopper starts from their first saved address; draft fields restored below take precedence.
  const initialAddress = savedAddresses[0];
  const active = cart && checkoutPaymentSnapshotMatches(snapshot, { cartId: cart.id, basketFingerprint: basketFingerprint(cart), windowId: selectedWindowId, fulfillmentMethod: method, couponCode: normalizedCoupon }) ? snapshot : null;

  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<GroceryCart | null>).detail;
      if (next) setCart((previous) => (!previous || previous.id === next.id ? next : previous));
    };
    window.addEventListener('cartUpdated', receive);
    return () => window.removeEventListener('cartUpdated', receive);
  }, []);

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
      const draft = readCheckoutDraft(cart?.id);
      const preferred = url.searchParams.get('fulfillment') || draft?.method || localStorage.getItem(MARKET_MODE_KEY);
      if (preferred === 'pickup' || preferred === 'delivery') setMethod(preferred);
      const candidateWindow = url.searchParams.get('window') || (draft?.method === preferred ? draft?.windowId : '');
      const choices = preferred === 'pickup' ? pickupWindows : deliveryWindows;
      if (candidateWindow && choices.some((window) => window.id === candidateWindow && window.available)) setSelectedWindowId(candidateWindow);
      else if (candidateWindow) setError('Your previously chosen time is no longer available. Choose another time.');
      const form = formRef.current;
      if (draft && form) {
        for (const name of DRAFT_FIELDS) {
          const input = form.elements.namedItem(name);
          const value = draft.fields?.[name];
          if ((input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && typeof value === 'string' && value) input.value = value.slice(0, 2000);
        }
        const preference = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="substitutionPreference"]')).find((input) => input.value === draft.substitutionPreference);
        if (preference) preference.checked = true;
      }
      setCouponCode(url.searchParams.get('coupon') || draft?.couponCode || '');
    } catch { setCouponCode(url.searchParams.get('coupon') || ''); /* Checkout can still be used when browser storage is unavailable. */ }
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
  const saveDraft = useCallback(() => {
    const form = formRef.current;
    if (!cart || !form || !initialRecovery.current) return;
    const data = new FormData(form);
    const fields: CheckoutDraft['fields'] = {};
    for (const name of DRAFT_FIELDS) {
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) fields[name] = input.value.slice(0, 2000);
    }
    const draft: CheckoutDraft = { version: 1, cartId: cart.id, method, windowId: selectedWindowId, couponCode, substitutionPreference: String(data.get('substitutionPreference') || 'best_match'), fields };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* Optional browser storage. */ }
  }, [cart, method, selectedWindowId, couponCode]);
  useEffect(() => { saveDraft(); }, [saveDraft]);
  // Review disables the form while it runs; return focus to the outcome so keyboard and screen-reader users land on it.
  useEffect(() => { if (!pending && error) errorRef.current?.focus(); }, [pending, error]);
  useEffect(() => { if (!pending && message) messageRef.current?.focus(); }, [pending, message]);
  useEffect(() => {
    if (!placedOrder) return;
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Optional browser storage. */ }
  }, [placedOrder]);

  if (placedOrder) return <section className="sf-panel mx-auto max-w-2xl overflow-hidden" aria-labelledby="order-placed-title">
    <div className="sf-dark flex flex-col items-center px-6 pb-8 pt-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]"><Check className="h-8 w-8" aria-hidden="true" /></span>
      <h2 id="order-placed-title" className="sf-title mt-5">Order #{placedOrder.orderNumber} received</h2>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-7 text-[var(--sf-header-ink-muted)]">{noChargePlaced ? 'No payment was due for this checkout.' : 'Your order was accepted. Check your order details for the current total and fulfillment status.'}</p>
    </div>
    <div className="space-y-5 p-6 text-center sm:p-8">
      <p className="sf-copy">Picked quantities and substitutions determine the final goods total.</p>
      <div className="flex flex-wrap justify-center gap-3"><UrbanButtonLink href={`/order/${placedOrder.id}`} variant="dark" size="lg">View your order</UrbanButtonLink><UrbanButtonLink href="/products" variant="ghost" size="lg">Continue shopping</UrbanButtonLink></div>
    </div>
  </section>;
  if (confirmationStarted && restartPayment) {
    const noCharge = restartPayment.data?.noCharge?.version === 1 && restartPayment.data.noCharge.amountCents === 0 && restartPayment.amountCents === 0;
    const restartTotal = Number(restartPayment.data?.total ?? restartPayment.amount ?? ((restartPayment.amountCents || 0) / 100));
    return <section className="sf-panel mx-auto max-w-2xl space-y-4 p-6 sm:p-8" aria-busy={pending}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--sf-sage-light)] text-[var(--sf-sage)]"><RotateCcw className="h-5 w-5" aria-hidden="true" /></span>
      <h2 className="sf-subtitle">Your checkout is ready to retry</h2>
      <p className="sf-copy">The previous payment was confirmed canceled or refunded. Your basket, time, address, and picking instructions are unchanged. Authorize one fresh payment to finish.</p>
      {error ? <p role="alert" className="sf-note">{error}</p> : null}
      {!noCharge && restartPayment.data?.clientSecret && provider?.code.includes('stripe') && stripePromise
        ? <Elements key={restartPayment.id} stripe={stripePromise} options={{ clientSecret: restartPayment.data.clientSecret, appearance: stripeAppearance, fonts: storefrontStripeFonts }}><StripePaymentFields register={register} /></Elements>
        : null}
      {!noCharge && !restartPayment.data?.clientSecret ? <p role="alert" className="sf-note">The new payment form is unavailable. Check this checkout or contact the store before trying again.</p> : null}
      <UrbanButton type="button" size="lg" disabled={pending || (!noCharge && (!provider?.code.includes('stripe') || !stripePromise || !restartPayment.data?.clientSecret))} onClick={confirmRestartedCheckout} className="w-full">
        {pending ? 'Working…' : noCharge ? 'Place order · no payment due' : `Authorize ${formatMoney(restartTotal)} & place order`}
      </UrbanButton>
      <div className="flex flex-wrap gap-5 text-sm font-semibold"><Link href="/order-access" className="underline underline-offset-4">Find an order by email</Link><Link href="/support" className="underline underline-offset-4">Contact the store</Link></div>
    </section>;
  }
  if (confirmationStarted && (!active || error)) return <section className="sf-panel mx-auto max-w-2xl space-y-4 p-6 sm:p-8" aria-busy={pending}>
    <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--sf-info-bg)] text-[var(--sf-info)]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
    <h2 className="sf-subtitle">Let’s check your checkout</h2>
    <p className="sf-copy">If payment was already authorized, this check resumes that same checkout. The store confirms the result before an order is shown.</p>
    {error ? <p role="alert" className="sf-note">{error}</p> : null}
    {recovery ? <div className="space-y-3 pt-1">
      <UrbanButton type="button" variant="dark" size="lg" className="w-full" disabled={pending} onClick={() => startTransition(() => recover(recovery))}>{pending ? 'Checking checkout…' : 'Check checkout status'}</UrbanButton>
      <p className="text-xs leading-5 text-[var(--sf-ink-muted)]">A new attempt is available only after the previous payment is confirmed canceled or refunded.</p>
      <UrbanButton type="button" variant="ghost" className="w-full" disabled={pending} onClick={() => startTransition(() => restart(recovery))}>Start a new payment attempt</UrbanButton>
    </div> : null}
    <div className="flex flex-wrap gap-5 text-sm font-semibold"><Link href="/order-access" className="underline underline-offset-4">Find an order by email</Link><Link href="/support" className="underline underline-offset-4">Contact the store</Link></div>
  </section>;
  if (!cart?.items.length) return <UrbanEmptyState title="Your basket is empty" actionHref="/products" actionLabel="Start shopping">Add your groceries, then come back to choose a time.</UrbanEmptyState>;
  const inventoryIssue = cart.items.find((item) => !item.product.inStock);
  const total = active?.total ?? cart.subtotal + cart.tax + (selectedWindow?.fee || 0);

  function invalidateReview() { if (!confirmationStarted) { setSnapshot(null); setMessage(''); } }
  // Fill the details from a saved address; the order keeps its own snapshot, so later edits to the address book never change it.
  function applySavedAddress(id: string) {
    const address = savedAddresses.find((entry) => entry.id === id);
    const form = formRef.current;
    if (!address || !form) return;
    const values: Record<string, string> = { firstName: address.firstName, lastName: address.lastName, phone: address.phone, address1: [address.address1, address.address2].filter(Boolean).join(', '), city: address.city, province: address.province, postalCode: address.postalCode };
    for (const [name, value] of Object.entries(values)) {
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLInputElement && value) input.value = value;
    }
    invalidateReview(); saveDraft();
  }
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
        // The same contact rules the store applies before payment, at submission and on recovery.
        const contactProblem = checkoutContactProblem({ email: request.email, fulfillmentMethod: method, deliveryAddress: request.deliveryAddress });
        if (contactProblem) throw new Error(contactProblem);
        if (!active || JSON.stringify(active.customerRequest) !== JSON.stringify(request)) {
          const payment = await initiatePaymentSession(cart.id, provider.code, method === 'delivery' ? selectedWindow.id : undefined, method === 'pickup' ? selectedWindow.id : undefined, normalizedCoupon, request);
          if (!payment) throw new Error('The checkout estimate could not be prepared. Please try again.');
          const next = createCheckoutPaymentSnapshot({ cartId: cart.id, basketFingerprint: basketFingerprint(cart), windowId: selectedWindow.id, fulfillmentMethod: method, couponCode: normalizedCoupon, customerRequest: request, payment });
          setSnapshot(next); setMessage('Your checkout estimate is ready. Review the total, then confirm below.');
          return;
        }
        if (!active.noCharge && (!provider.code.includes('stripe') || !stripePromise || !confirmRef.current)) throw new Error('The payment form is not ready. Please wait or contact the store if it does not load.');
        // Re-read the store's basket right before authorizing: an estimate for
        // different goods must be reviewed again, never paid.
        const confirmedCart = await retrieveCart({ throwOnError: true });
        if (!confirmedCart || confirmedCart.id !== cart.id || basketFingerprint(confirmedCart) !== active.basketFingerprint) {
          if (confirmedCart) setCart(confirmedCart);
          setSnapshot(null);
          throw new Error('Your basket changed since this estimate. Review the updated estimate before paying.');
        }
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
  const steps = [
    { label: 'Time', done: Boolean(selectedWindow) },
    { label: 'Details', done: Boolean(active) },
    { label: 'Pay & place', done: false },
  ];
  const currentStep = active ? 2 : selectedWindow ? 1 : 0;
  const sectionClass = 'sf-panel p-5 sm:p-7';
  const stepTitle = (number: number, title: string, hint?: string) => <div className="mb-5 flex items-start gap-3">
    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--sf-ink)] font-[family-name:var(--sf-font-display)] text-sm font-bold text-[var(--sf-paper)]">{number}</span>
    <div className="min-w-0"><h2 className="text-xl font-bold tracking-[-0.02em]">{title}</h2>{hint ? <p className="mt-0.5 text-sm text-[var(--sf-ink-muted)]">{hint}</p> : null}</div>
  </div>;

  return <form ref={formRef} onChange={saveDraft} onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-10" aria-busy={pending}>
    <ol aria-label="Checkout progress" className="flex items-center gap-2 text-sm lg:col-span-2">
      {steps.map((step, index) => <li key={step.label} aria-current={index === currentStep ? 'step' : undefined} className="flex items-center gap-2">
        {index > 0 ? <span aria-hidden="true" className={`h-px w-6 sm:w-10 ${index <= currentStep ? 'bg-[var(--sf-ink)]' : 'bg-[var(--sf-rule-strong)]'}`} /> : null}
        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 font-semibold ${index === currentStep ? 'bg-[var(--sf-ink)] text-[var(--sf-paper)]' : step.done ? 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]' : 'text-[var(--sf-ink-faint)]'}`}>{step.done && index !== currentStep ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}{step.label}</span>
      </li>)}
    </ol>
    <fieldset disabled={pending || confirmationStarted} className="min-w-0 space-y-5">
      <legend className="sr-only">Checkout details</legend>
      {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="sf-note outline-none">{error}</p> : null}
      {inventoryIssue ? <p role="alert" className="sf-note">{inventoryIssue.product.name} is no longer available in the requested quantity. <Link href="/cart" className="font-semibold underline">Review your basket</Link>.</p> : null}
      <section className={sectionClass}>
        {stepTitle(1, 'Delivery or pickup', `Times shown in ${timezoneLabel(timezone)}. A time is reserved when your order is accepted.`)}
        <div className="grid grid-cols-2 gap-3">{(['delivery', 'pickup'] as const).map((value) => {
          const Icon = value === 'pickup' ? Store : Truck;
          const options = value === 'pickup' ? pickupWindows : deliveryWindows;
          return <label key={value} className={`relative flex min-h-[5.5rem] cursor-pointer flex-col justify-between gap-2 rounded-[var(--sf-radius-md)] border p-4 transition-[border-color,box-shadow] duration-[var(--sf-dur-fast)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--sf-focus)] ${method === value ? 'border-[var(--sf-ink)] shadow-[0_0_0_1px_var(--sf-ink)]' : 'border-[var(--sf-rule)] hover:border-[var(--sf-ink-faint)]'}`}>
            <input type="radio" name="fulfillmentMethod" value={value} checked={method === value} onChange={() => chooseMethod(value)} className="sr-only" />
            <span className="flex items-center justify-between gap-2"><Icon className={`h-5 w-5 ${method === value ? 'text-[var(--sf-accent)]' : 'text-[var(--sf-ink-faint)]'}`} aria-hidden="true" /><span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full border-2 ${method === value ? 'border-[var(--sf-accent)]' : 'border-[var(--sf-rule-strong)]'}`}>{method === value ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--sf-accent)]" /> : null}</span></span>
            <span><span className="block font-semibold">{value === 'pickup' ? 'Store pickup' : 'Home delivery'}</span><span className="block text-xs text-[var(--sf-ink-muted)]">{options.some((window) => window.available) ? `${options.filter((window) => window.available).length} open times` : 'No open times'}</span></span>
          </label>;
        })}</div>
        {method === 'pickup' ? <p className="mt-4 flex items-start gap-2 text-sm leading-6"><MapPin className="mt-1 h-4 w-4 shrink-0 text-[var(--sf-sage)]" aria-hidden="true" />{storeAddress || 'Contact the store to confirm the pickup location.'}</p> : <p className="mt-4 text-sm leading-6 text-[var(--sf-ink-muted)]">Your postal code, delivery eligibility and any service fee are checked when you review the estimate.</p>}
        <div className="mt-6 border-t border-[var(--sf-rule)] pt-5">
          <p className="mb-3 text-sm font-semibold">Choose a time</p>
          <UrbanSlotPicker key={method} windows={windows} method={method} selectedWindowId={selectedWindowId} onSelect={(id) => { setSelectedWindowId(id); invalidateReview(); }} />
          {!windows.some((window) => window.available) ? <p role="status" className="sf-note mt-3">No {method} times are currently available. Try the other option or <Link href="/support" className="font-semibold underline">contact the store</Link>.</p> : null}
        </div>
      </section>
      <section className={sectionClass} onChange={invalidateReview}>
        {stepTitle(2, 'Your details', !user ? undefined : 'We’ll use these for order updates and the handoff.')}
        {!user ? <p className="-mt-3 mb-5 pl-11 text-sm text-[var(--sf-ink-muted)]">Check out as a guest, or <Link href={`/account/sign-in?from=${encodeURIComponent(`/checkout?${new URLSearchParams({ fulfillment: method, ...(selectedWindowId ? { window: selectedWindowId } : {}), ...(normalizedCoupon ? { coupon: normalizedCoupon } : {}) }).toString()}`)}`} className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">sign in</Link> to keep your orders together.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">{savedAddresses.length ? <label className="sf-label sm:col-span-2">Use a saved address<UrbanSelect defaultValue={initialAddress?.id || ''} onChange={(event) => applySavedAddress(event.target.value)}><option value="">Enter details below</option>{savedAddresses.map((address) => <option key={address.id} value={address.id}>{[[address.firstName, address.lastName].filter(Boolean).join(' '), address.address1, address.city].filter(Boolean).join(' · ')}</option>)}</UrbanSelect></label> : null}<label className="sf-label sm:col-span-2">Email<UrbanTextInput name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={user?.email || ''} /></label><label className="sf-label">First name<UrbanTextInput name="firstName" autoComplete="given-name" required maxLength={200} defaultValue={user?.firstName || ''} /></label><label className="sf-label">Last name (optional)<UrbanTextInput name="lastName" autoComplete="family-name" maxLength={200} defaultValue={user?.lastName || ''} /></label><label className="sf-label sm:col-span-2">Phone<UrbanTextInput name="phone" type="tel" autoComplete="tel" required maxLength={200} defaultValue={user?.phone || initialAddress?.phone || ''} /></label>
          <fieldset disabled={method === 'pickup'} className={method === 'delivery' ? 'grid gap-4 border-t border-[var(--sf-rule)] pt-4 sm:col-span-2 sm:grid-cols-2' : 'hidden'}><legend className="sr-only">Delivery address</legend><label className="sf-label sm:col-span-2">Street address and apartment<UrbanTextInput name="address1" autoComplete="street-address" required minLength={2} maxLength={200} defaultValue={initialAddress ? [initialAddress.address1, initialAddress.address2].filter(Boolean).join(', ') : ''} /></label><label className="sf-label">City<UrbanTextInput name="city" autoComplete="address-level2" required minLength={2} maxLength={200} defaultValue={initialAddress?.city || ''} /></label><label className="sf-label">State / province<UrbanTextInput name="province" autoComplete="address-level1" required minLength={2} maxLength={200} defaultValue={initialAddress?.province || ''} /></label><label className="sf-label">Postal code<UrbanTextInput name="postalCode" autoComplete="postal-code" required minLength={2} maxLength={200} defaultValue={initialAddress?.postalCode || ''} /></label></fieldset>
        </div>
      </section>
      <section className={sectionClass} onChange={invalidateReview}>
        {stepTitle(3, 'Picking preferences', 'Your per-item choices from the basket are kept.')}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">If an item is unavailable</legend>
          <div className="grid gap-2 sm:grid-cols-3">{([['best_match', 'Allow a suitable substitute', 'The picker chooses the closest match.'], ['call_me', 'Contact me first', 'We reach out before substituting.'], ['refund', 'Leave the item out', 'It’s removed from your total.']] as const).map(([value, label, hint]) => (
            <label key={value} className="flex cursor-pointer gap-3 rounded-[var(--sf-radius-md)] border border-[var(--sf-rule)] p-3.5 transition-[border-color,box-shadow] has-[:checked]:border-[var(--sf-ink)] has-[:checked]:shadow-[0_0_0_1px_var(--sf-ink)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--sf-focus)]">
              <input type="radio" name="substitutionPreference" value={value} defaultChecked={value === 'best_match'} className="sf-check mt-0.5" />
              <span><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-[var(--sf-ink-muted)]">{hint}</span></span>
            </label>
          ))}</div>
        </fieldset>
        <p className="mt-3 text-xs leading-6 text-[var(--sf-ink-muted)]">If a picked total increases, you must approve the extra authorization.</p>
        <label className="sf-label mt-5">{method === 'pickup' ? 'Pickup notes (optional)' : 'Delivery instructions (optional)'}<UrbanTextarea name="deliveryInstructions" rows={3} maxLength={2000} placeholder={method === 'pickup' ? 'Anything the store should know' : 'Apartment access or where to meet you'} /></label>
      </section>
    </fieldset>
    <aside className="lg:sticky lg:top-[calc(var(--sf-header-offset)+1rem)]">
      <div className="sf-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--sf-rule)] px-5 py-4">
          <h2 className="text-lg font-bold tracking-[-0.02em]">{active ? 'Review & confirm' : 'Order estimate'}</h2>
          <Link href="/cart" className="inline-flex min-h-9 items-center text-sm font-semibold underline underline-offset-4">Edit basket</Link>
        </div>
        <ul className="max-h-64 space-y-3 overflow-y-auto px-5 py-4" aria-label="Basket items">{cart.items.map((item) => <li key={item.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"><div className="relative h-11 overflow-hidden rounded-[var(--sf-radius-sm)] bg-[var(--sf-paper-3)]"><UrbanProductArtwork product={item.product} /><span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--sf-ink)] px-1 text-[0.625rem] font-bold text-[var(--sf-paper)]">{item.quantity}</span></div><span className="line-clamp-2 leading-5">{item.product.name}</span><span className="font-semibold tabular-nums">{formatMoney(item.subtotal)}</span></li>)}</ul>
        <div className="border-t border-[var(--sf-rule)] px-5 py-4">
          <label className="sf-label">Coupon code (optional)<div className="relative"><Ticket className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sf-ink-faint)]" aria-hidden="true" /><UrbanTextInput name="couponCode" value={couponCode} maxLength={100} disabled={pending || confirmationStarted} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); invalidateReview(); }} autoComplete="off" className="pl-10 font-[family-name:var(--sf-font-mono)] tracking-[0.06em]" /></div></label>
          <dl className="mt-5 space-y-2 text-sm"><div className="flex justify-between gap-3 text-[var(--sf-ink-muted)]"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(active?.subtotal ?? cart.subtotal)}</dd></div><div className="flex justify-between gap-3 text-[var(--sf-ink-muted)]"><dt>Estimated tax</dt><dd className="tabular-nums">{formatMoney(active?.tax ?? cart.tax)}</dd></div><div className="flex justify-between gap-3 text-[var(--sf-ink-muted)]"><dt>{method === 'pickup' ? 'Pickup' : 'Delivery fee'}</dt><dd className="text-right tabular-nums">{active ? formatMoney(active.deliveryFee) : selectedWindow ? `${formatMoney(selectedWindow.fee)}${method === 'delivery' ? ' + service fee if applicable' : ''}` : 'Choose a time'}</dd></div>{active && active.discount > 0 ? <div className="flex justify-between gap-3 font-semibold text-[var(--sf-sage)]"><dt>Discount · {active.couponCode}</dt><dd className="tabular-nums">−{formatMoney(active.discount)}</dd></div> : null}<div className="flex items-baseline justify-between gap-3 border-t border-[var(--sf-rule)] pt-3"><dt className="font-semibold">{active ? 'Amount to authorize' : 'Estimated total'}</dt><dd><UrbanPrice value={total} className="text-[1.75rem]" /></dd></div></dl>
          <p className="mt-3 text-xs leading-5 text-[var(--sf-ink-muted)]">{active ? 'This is the amount to authorize. Final picked quantities, unavailable items and substitutions can change the final charge.' : 'Review checks your address, time, prices and coupon before payment confirmation.'}</p>
          {message ? <p ref={messageRef} tabIndex={-1} role="status" className="mt-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-sage-light)] px-3 py-2.5 text-sm font-medium text-[var(--sf-sage)] outline-none">{message}</p> : null}
          {active && !active.noCharge && provider?.code.includes('stripe') && stripePromise ? <Elements key={active.id} stripe={stripePromise} options={{ clientSecret: active.clientSecret, appearance: stripeAppearance, fonts: storefrontStripeFonts }}><StripePaymentFields register={register} /></Elements> : null}
          {!provider ? <p role="status" className="sf-note mt-3">Online payment is unavailable. <Link href="/support" className="font-semibold underline">Contact the store</Link> for help.</p> : null}
          <UrbanButton type="submit" size="lg" disabled={pending || !selectedWindow || !provider || Boolean(inventoryIssue) || confirmationStarted} className="mt-4 w-full">{pending ? 'Working…' : active ? active.noCharge ? 'Place order · no payment due' : `Authorize ${formatMoney(active.total)} & place order` : 'Review checkout estimate'}</UrbanButton>
          {provider ? <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--sf-ink-faint)]"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Payment handled securely by {provider.code.includes('stripe') ? 'Stripe' : provider.name}</p> : null}
          <Link href="/policies" className="mt-1 block py-2 text-center text-xs font-medium underline underline-offset-4">How picking, payment & order help work</Link>
        </div>
      </div>
    </aside>
  </form>;
}
