import { Metadata } from 'next';

import { retrieveCart } from '@/features/storefront/lib/data/cart';
import { getStore } from '@/features/storefront/lib/data/store';
import { getUser } from '@/features/storefront/lib/data/user';
import { getCheckoutFulfillmentWindows } from '@/features/storefront/lib/data/delivery';
import { listPaymentProviders } from '@/features/storefront/lib/data/payment';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanCheckout from '@/features/storefront/modules/urban/UrbanCheckout';
import { UrbanContainer, UrbanPageHeader, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';

export const metadata: Metadata = storefrontMetadata({
  title: 'Checkout',
  description: 'Complete your grocery order.',
});

export async function CheckoutPage() {
  // Materialize/read availability once before the remaining independent reads.
  // The maintained runtime intentionally uses a one-connection pool, so two
  // concurrent rolling-availability transactions would be avoidable pressure.
  const fulfillment = await getCheckoutFulfillmentWindows();
  const [cart, user, paymentProviders, store] = await Promise.all([
    retrieveCart({ throwOnError: true }),
    getUser(),
    listPaymentProviders(),
    getStore(),
  ]);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Basket', href: '/cart' }, { label: 'Checkout' }]}
          title="Checkout"
          description="Choose delivery or pickup, confirm your details, and place your order."

        />
        <p className="text-sm text-[var(--sf-ink-muted)]">Payment availability: {paymentProviders[0]?.name || 'Unavailable'}</p>
        <UrbanCheckout
          storeAddress={store.address}
          timezone={store.timezone}
          cart={cart}
          user={user}
          paymentProviders={paymentProviders}
          deliveryWindows={fulfillment.deliveryWindows}
          pickupWindows={fulfillment.pickupWindows}
        />
      </UrbanContainer>
    </UrbanPageShell>
  );
}
