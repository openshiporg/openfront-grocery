'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, MapPin, Truck } from 'lucide-react';

import { initiatePaymentSession, submitOrder } from '@/features/storefront/lib/data/checkout';
import { checkoutPaymentSnapshotMatches, createCheckoutPaymentSnapshot, type CheckoutPaymentSnapshot } from '@/features/storefront/lib/checkoutPaymentSnapshot';
import type { DeliveryWindow, GroceryCart, GroceryUser } from '@/features/storefront/types';
import { UrbanBadge, UrbanButton, UrbanEmptyState, UrbanProductArtwork, UrbanSelect, UrbanTextInput, UrbanTextarea, formatMoney } from './UrbanPrimitives';

type StripeConfirm = () => Promise<{ status: string }>;

function StripePaymentFields({ register }: { register: (confirm: StripeConfirm | null) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  useEffect(() => {
    register(async () => {
      if (!stripe || !elements) throw new Error('Stripe payment form is not ready.');
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: 'if_required' });
      if (result.error) throw new Error(result.error.message || 'Payment confirmation failed.');
      const status = result.paymentIntent?.status || 'unknown';
      if (!['succeeded', 'requires_capture'].includes(status)) throw new Error(`Payment was not successful (${status}).`);
      return { status };
    });
    return () => register(null);
  }, [elements, register, stripe]);
  return <div className="mt-4 rounded border border-[var(--sf-rule)] bg-white p-3"><PaymentElement /></div>;
}

type UrbanCheckoutProps = {
  cart: GroceryCart | null;
  user: GroceryUser | null;
  paymentProviders: Array<{ id: string; name: string; code: string }>;
  deliveryWindows?: DeliveryWindow[];
  pickupWindows?: DeliveryWindow[];
};

function deliveryTimeWindow(startTime: string) {
  const startHour = Number.parseInt(startTime.slice(0, 2), 10);
  if (!Number.isFinite(startHour)) {
    throw new Error(`Unsupported fulfillment window start: ${startTime}`);
  }
  if (startHour < 10) return 'time_8_10';
  if (startHour < 12) return 'time_10_12';
  if (startHour < 14) return 'time_12_14';
  if (startHour < 16) return 'time_14_16';
  if (startHour < 18) return 'time_16_18';
  return 'time_18_20';
}

export default function UrbanCheckout({ cart, user, paymentProviders, deliveryWindows = [], pickupWindows = [] }: UrbanCheckoutProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [email, setEmail] = useState(user?.email || '');
  const [selectedWindowId, setSelectedWindowId] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [placedOrder, setPlacedOrder] = useState<{ id: string; orderNumber: string } | null>(null);
  const [stripeSession, setStripeSession] = useState<CheckoutPaymentSnapshot | null>(null);
  const stripeConfirmRef = useRef<StripeConfirm | null>(null);
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const stripePromise = useMemo(() => stripeKey ? loadStripe(stripeKey) : null, [stripeKey]);
  const provider = (stripeKey ? paymentProviders.find((item) => item.code.includes('stripe')) : null) || paymentProviders.find((item) => item.code.includes('manual')) || paymentProviders[0];
  const windows = useMemo(
    () => (method === 'pickup' ? pickupWindows : deliveryWindows).filter((window) => window.available),
    [deliveryWindows, method, pickupWindows]
  );

  useEffect(() => {
    setSelectedWindowId(windows[0]?.id || '');
  }, [method, windows]);

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('grocery-stripe-session') || 'null') as CheckoutPaymentSnapshot | null;
      if (stored && stored.cartId === cart?.id) {
        setStripeSession(stored);
        setCouponCode(stored.couponCode || '');
      }
    } catch {
      sessionStorage.removeItem('grocery-stripe-session');
    }
  }, [cart?.id]);

  if (placedOrder) {
    return (
      <UrbanEmptyState
        title={`Order #${placedOrder.orderNumber} placed`}
        actionHref={`/order/${placedOrder.id}`}
        actionLabel="Track order"
      >
        Your payment was accepted and the fulfillment slot is reserved.
      </UrbanEmptyState>
    );
  }

  if (!cart || cart.items.length === 0) {
    return <UrbanEmptyState title="Nothing in checkout" actionHref="/products" actionLabel="Browse catalog">Add products to your basket before checkout.</UrbanEmptyState>;
  }

  const inventoryIssue = cart.items.find((item) => !item.product.inStock);
  const selectedWindow = windows.find((window) => window.id === selectedWindowId);
  const checkoutTax = cart.tax;
  const checkoutDeliveryFee = method === 'delivery' ? selectedWindow?.fee || 0 : 0;
  const checkoutTotal = Number((cart.subtotal + checkoutTax + checkoutDeliveryFee).toFixed(2));
  const normalizedCouponCode = couponCode.trim().toUpperCase() || undefined;
  const activeStripeSession = checkoutPaymentSnapshotMatches(stripeSession, {
    cartId: cart.id,
    windowId: selectedWindowId,
    fulfillmentMethod: method,
    couponCode: normalizedCouponCode,
  }) ? stripeSession : null;
  const summarySubtotal = activeStripeSession?.subtotal ?? cart.subtotal;
  const summaryTax = activeStripeSession?.tax ?? checkoutTax;
  const summaryDeliveryFee = activeStripeSession?.deliveryFee ?? checkoutDeliveryFee;
  const summaryDiscount = activeStripeSession?.discount ?? 0;
  const summaryTotal = activeStripeSession?.total ?? checkoutTotal;

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        if (inventoryIssue) {
          throw new Error(`${inventoryIssue.product.name} no longer has enough unexpired inventory. Return to your basket to reduce or remove it.`);
        }
        if (!selectedWindow) {
          throw new Error(`Choose an available ${method === 'pickup' ? 'pickup' : 'delivery'} window before placing your order.`);
        }
        if (!provider) {
          throw new Error('No installed payment provider is available.');
        }

        const deliverySlotId = method === 'delivery' ? selectedWindow.id : undefined;
        const pickupSlotId = method === 'pickup' ? selectedWindow.id : undefined;
        const recovery = {
          email,
          deliveryAddress: {
            firstName: String(formData.get('firstName') || ''),
            lastName: String(formData.get('lastName') || ''),
            address1: String(formData.get('address1') || ''),
            city: String(formData.get('city') || ''),
            province: String(formData.get('province') || ''),
            postalCode: String(formData.get('postalCode') || ''),
            phone: String(formData.get('phone') || ''),
          },
          substitutionPreference: String(formData.get('substitutionPreference') || 'best_match') as 'call_me' | 'best_match' | 'refund',
          deliveryInstructions: String(formData.get('deliveryInstructions') || ''),
        };
        const canConfirmStripe = provider.code.includes('stripe');
        let payment: any = activeStripeSession
          ? { id: activeStripeSession.id, amount: activeStripeSession.total, data: activeStripeSession }
          : null;
        if (!payment) payment = await initiatePaymentSession(cart.id, provider.code, deliverySlotId, pickupSlotId, normalizedCouponCode, recovery);
        if (!payment?.id || !payment.data?.paymentIntentId) throw new Error('Payment session could not be initiated.');
        if (canConfirmStripe) {
          if (!payment.data.clientSecret || !stripePromise) throw new Error('Stripe checkout is not configured for card confirmation.');
          if (!activeStripeSession || activeStripeSession.id !== payment.id) {
            const storedSession = createCheckoutPaymentSnapshot({
              cartId: cart.id,
              windowId: selectedWindow.id,
              fulfillmentMethod: method,
              couponCode: normalizedCouponCode,
              payment,
            });
            setStripeSession(storedSession);
            sessionStorage.setItem('grocery-stripe-session', JSON.stringify(storedSession));
            return;
          }
          if (!stripeConfirmRef.current) throw new Error('Stripe payment form is not ready.');
          await stripeConfirmRef.current();
        }
        const order = await submitOrder({
          cartId: cart.id,
          paymentSessionId: payment.id,
          paymentIntentId: payment.data.paymentIntentId,
          email: recovery.email,
          deliveryAddress: recovery.deliveryAddress,
          deliveryDate: selectedWindow.date,
          deliveryTimeWindow: deliveryTimeWindow(selectedWindow.startTime),
          fulfillmentMethod: method,
          deliverySlotId,
          pickupSlotId,
          deliveryFee: method === 'delivery' ? selectedWindow.fee : 0,
          expectedTotal: Number(payment.data.total ?? payment.amount),
          couponCode: normalizedCouponCode,
          substitutionPreference: recovery.substitutionPreference,
          deliveryInstructions: recovery.deliveryInstructions,
        });
        if (!order) throw new Error('Order could not be submitted.');
        sessionStorage.removeItem('grocery-stripe-session');
        if (user) {
          router.push(`/order/${order.id}`);
        } else {
          setPlacedOrder({ id: order.id, orderNumber: order.orderNumber });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Checkout failed');
      }
    });
  };

  return (
    <form action={handleSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {error ? <div className="border border-[var(--sf-danger-bg)] bg-[var(--sf-danger-bg)] px-4 py-3 text-sm text-[var(--sf-danger)]">{error}</div> : null}
        {inventoryIssue ? (
          <div className="border border-[var(--sf-danger-bg)] bg-[var(--sf-danger-bg)] px-4 py-3 text-sm text-[var(--sf-danger)]" role="alert">
            {inventoryIssue.product.name} no longer has enough unexpired inventory. <Link href="/cart" className="font-semibold underline">Return to your basket</Link> to reduce or remove it.
          </div>
        ) : null}

        <section className="border border-[var(--sf-rule)] p-5">
          <UrbanBadge tone="primary"><MapPin className="h-3 w-3" /> Contact &amp; address</UrbanBadge>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <UrbanTextInput name="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required className="sm:col-span-2" />
            <UrbanTextInput name="firstName" placeholder="First name" required defaultValue={user?.firstName || ''} />
            <UrbanTextInput name="lastName" placeholder="Last name" required defaultValue={user?.lastName || ''} />
            <UrbanTextInput name="address1" placeholder="Street address" required className="sm:col-span-2" />
            <UrbanTextInput name="city" placeholder="City" required />
            <UrbanTextInput name="province" placeholder="State / province" required />
            <UrbanTextInput name="postalCode" placeholder="Postal code" required />
            <UrbanTextInput name="phone" placeholder="Phone" required defaultValue={user?.phone || ''} />
          </div>
        </section>

        <section className="border border-[var(--sf-rule)] p-5">
          <UrbanBadge tone="blue"><Truck className="h-3 w-3" /> Fulfillment</UrbanBadge>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <UrbanSelect value={method} onChange={(event) => setMethod(event.target.value as 'delivery' | 'pickup')}>
              <option value="delivery">Home delivery</option>
              <option value="pickup">Curbside pickup</option>
            </UrbanSelect>
            <UrbanSelect value={selectedWindowId} onChange={(event) => setSelectedWindowId(event.target.value)} required className="sm:col-span-2">
              {windows.length === 0 ? <option value="">No available windows</option> : null}
              {windows.map((window) => (
                <option key={window.id} value={window.id}>
                  {window.date} · {window.startTime}–{window.endTime}
                  {typeof window.remainingCapacity === 'number' ? ` · ${window.remainingCapacity} left` : ''}
                  {window.fee ? ` · ${formatMoney(window.fee)}` : ''}
                </option>
              ))}
            </UrbanSelect>
            <UrbanSelect name="substitutionPreference">
              <option value="best_match">Best match substitutions</option>
              <option value="call_me">Contact me first</option>
              <option value="refund">Refund unavailable items</option>
            </UrbanSelect>
            <UrbanTextarea name="deliveryInstructions" placeholder="Gate code, apartment notes, or pickup details" rows={4} className="sm:col-span-2" />
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="border border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] p-5">
          <UrbanBadge tone="muted"><CreditCard className="h-3 w-3" /> Payment</UrbanBadge>
          <div className="mt-4 space-y-2 border-y border-[var(--sf-rule)] py-4 text-sm text-[var(--sf-ink-muted)]">
            {cart.items.map((item) => (
              <div key={item.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3">
                <div className="h-11 overflow-hidden border border-[var(--sf-rule)] bg-[var(--sf-paper-3)]">
                  <UrbanProductArtwork product={item.product} className="h-full w-full" />
                </div>
                <span className="min-w-0 truncate">{item.quantity} × {item.product.name}</span>
                <span className="shrink-0">{formatMoney(item.subtotal)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-[var(--sf-rule)] pt-3"><span>Subtotal</span><span>{formatMoney(summarySubtotal)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>{formatMoney(summaryTax)}</span></div>
            <div className="flex justify-between"><span>{method === 'pickup' ? 'Pickup' : 'Delivery'}</span><span>{formatMoney(summaryDeliveryFee)}</span></div>
            {summaryDiscount > 0 ? <div className="flex justify-between text-[var(--sf-sage)]"><span>Coupon{activeStripeSession?.couponCode ? ` (${activeStripeSession.couponCode})` : ''}</span><span>−{formatMoney(summaryDiscount)}</span></div> : null}
            <div className="flex justify-between font-[family-name:var(--sf-font-display)] text-lg font-semibold text-[var(--sf-ink)]"><span>Total</span><span>{formatMoney(summaryTotal)}</span></div>
          </div>
          {activeStripeSession && provider?.code.includes('stripe') && stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret: activeStripeSession.clientSecret }}>
              <StripePaymentFields register={(confirm) => { stripeConfirmRef.current = confirm; }} />
            </Elements>
          ) : null}
          <UrbanTextInput name="couponCode" value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Coupon code (optional)" className="mt-3" autoComplete="off" />
          {activeStripeSession?.couponCode ? <p className="mt-2 text-sm text-[var(--sf-sage)]">Coupon applied. The charged total above is locked to this payment session.</p> : null}
          <p className="mt-3 text-sm text-[var(--sf-ink-muted)]">Payment: {provider?.name || 'Unavailable'}</p>
          <UrbanButton type="submit" disabled={isPending || !selectedWindowId || !provider || Boolean(inventoryIssue)} className="mt-4 w-full">{isPending ? 'Submitting…' : activeStripeSession ? 'Confirm payment &amp; place order' : provider?.code.includes('stripe') ? (normalizedCouponCode ? 'Apply coupon &amp; continue to payment' : 'Continue to secure payment') : 'Place order'}</UrbanButton>
        </div>
      </aside>
    </form>
  );
}
