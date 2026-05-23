'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, MapPin, Truck } from 'lucide-react';

import { initiatePaymentSession, submitOrder } from '@/features/storefront/lib/data/checkout';
import type { GroceryCart, GroceryUser } from '@/features/storefront/types';
import { UrbanBadge, UrbanButton, UrbanEmptyState, UrbanPanel, UrbanSelect, UrbanTextInput, UrbanTextarea, formatMoney } from './UrbanPrimitives';

export default function UrbanCheckout({ cart, user, paymentProviders }: { cart: GroceryCart | null; user: GroceryUser | null; paymentProviders: Array<{ id: string; name: string; code: string }> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [email, setEmail] = useState(user?.email || '');
  const provider = paymentProviders[0];

  if (!cart || cart.items.length === 0) {
    return <UrbanEmptyState title="No checkout cargo" actionHref="/products" actionLabel="Shop inventory">Add products before opening the checkout lane.</UrbanEmptyState>;
  }

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        const payment = await initiatePaymentSession(cart.id, provider?.code || provider?.id || 'manual');
        const order = await submitOrder({
          cartId: cart.id,
          paymentSessionId: payment?.id || 'manual-session',
          paymentIntentId: payment?.data?.paymentIntentId || payment?.data?.clientSecret || 'manual-intent',
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
          deliveryDate: String(formData.get('deliveryDate') || new Date().toISOString().slice(0, 10)),
          deliveryTimeWindow: String(formData.get('deliveryTimeWindow') || 'time_16_18'),
          fulfillmentMethod: method,
          deliveryFee: cart.deliveryFee || 0,
          expectedTotal: cart.total || 0,
          substitutionPreference: String(formData.get('substitutionPreference') || 'best_match') as any,
          deliveryInstructions: String(formData.get('deliveryInstructions') || ''),
        });
        if (!order) throw new Error('Order could not be submitted.');
        router.push(`/order/${order.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Checkout failed');
      }
    });
  };

  return (
    <form action={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {error ? <div className="border border-[#ffb4ab] bg-[#331718] px-4 py-3 text-sm text-[#ffb4ab]">{error}</div> : null}
        <UrbanPanel className="p-5">
          <UrbanBadge tone="orange"><MapPin className="h-3 w-3" /> Contact + address</UrbanBadge>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <UrbanTextInput name="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required className="sm:col-span-2" />
            <UrbanTextInput name="firstName" placeholder="First name" required defaultValue={user?.firstName || ''} />
            <UrbanTextInput name="lastName" placeholder="Last name" required defaultValue={user?.lastName || ''} />
            <UrbanTextInput name="address1" placeholder="Street address" required className="sm:col-span-2" />
            <UrbanTextInput name="city" placeholder="City" required />
            <UrbanTextInput name="province" placeholder="State / province" required />
            <UrbanTextInput name="postalCode" placeholder="Postal code" required />
            <UrbanTextInput name="phone" placeholder="Phone" required defaultValue={user?.phone || ''} />
          </div>
        </UrbanPanel>

        <UrbanPanel className="p-5">
          <UrbanBadge tone="blue"><Truck className="h-3 w-3" /> Fulfillment lane</UrbanBadge>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <UrbanSelect value={method} onChange={(event) => setMethod(event.target.value as 'delivery' | 'pickup')}>
              <option value="delivery">Express delivery</option>
              <option value="pickup">Curbside pickup</option>
            </UrbanSelect>
            <UrbanTextInput name="deliveryDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <UrbanSelect name="deliveryTimeWindow">
              <option value="time_8_10">08:00 - 10:00</option>
              <option value="time_10_12">10:00 - 12:00</option>
              <option value="time_12_14">12:00 - 14:00</option>
              <option value="time_16_18">16:00 - 18:00</option>
            </UrbanSelect>
            <UrbanSelect name="substitutionPreference">
              <option value="best_match">Best match substitutions</option>
              <option value="call_me">Contact me first</option>
              <option value="refund">Refund unavailable items</option>
            </UrbanSelect>
            <UrbanTextarea name="deliveryInstructions" placeholder="Delivery / pickup instructions" rows={4} className="sm:col-span-2" />
          </div>
        </UrbanPanel>
      </div>

      <UrbanPanel className="h-max p-5">
        <UrbanBadge tone="muted"><CreditCard className="h-3 w-3" /> Payment terminal</UrbanBadge>
        <div className="mt-5 space-y-3 border-y border-[#5a4136] py-5 text-sm text-[#e2bfb0]">
          {cart.items.map((item) => <div key={item.id} className="flex justify-between gap-4"><span>{item.quantity} × {item.product.name}</span><span>{formatMoney(item.subtotal)}</span></div>)}
          <div className="border-t border-[#5a4136] pt-3 flex justify-between"><span>Subtotal</span><span>{formatMoney(cart.subtotal)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{formatMoney(cart.tax)}</span></div>
          <div className="flex justify-between"><span>Delivery</span><span>{formatMoney(cart.deliveryFee)}</span></div>
          <div className="flex justify-between font-market-label text-3xl font-black uppercase text-[#ffb693]"><span>Total</span><span>{formatMoney(cart.total)}</span></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-[#e2bfb0]">Provider: {provider?.name || 'Manual payment'}. The order uses Openfront checkout mutations and live cart data.</p>
        <UrbanButton type="submit" disabled={isPending} className="mt-5 w-full">{isPending ? 'Submitting…' : 'Submit order'}</UrbanButton>
      </UrbanPanel>
    </form>
  );
}
