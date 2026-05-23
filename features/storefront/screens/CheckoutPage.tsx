import { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard, ShieldCheck, Truck } from 'lucide-react';

import { retrieveCart } from '@/features/storefront/lib/data/cart';
import { getUser } from '@/features/storefront/lib/data/user';
import { listPaymentProviders } from '@/features/storefront/lib/data/payment';
import UrbanCheckout from '@/features/storefront/modules/urban/UrbanCheckout';
import { UrbanBadge, UrbanContainer, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel } from '@/features/storefront/modules/urban/UrbanPrimitives';

export const metadata: Metadata = {
  title: 'Checkout | Urban Express',
  description: 'Complete your Urban Express grocery order.',
};

export async function CheckoutPage() {
  const [cart, user, paymentProviders] = await Promise.all([retrieveCart(), getUser(), listPaymentProviders()]);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <Link href="/cart" className="hover:text-[#ffb693]">Cart</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Checkout</span>
        </nav>
        <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <UrbanPanel className="p-5 sm:p-8">
            <UrbanBadge tone="orange"><CreditCard className="h-3 w-3" /> Secure terminal</UrbanBadge>
            <UrbanHeadline className="mt-5">Checkout lane.</UrbanHeadline>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">Choose delivery or pickup, set substitution protocol, and submit the live Openfront cart into fulfillment.</p>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Payment" value={paymentProviders[0]?.name || 'Manual'} icon={ShieldCheck} />
            <UrbanMetric label="Fulfillment" value="Live" icon={Truck} />
          </div>
        </section>
        <UrbanCheckout cart={cart} user={user} paymentProviders={paymentProviders} />
      </UrbanContainer>
    </UrbanPageShell>
  );
}
