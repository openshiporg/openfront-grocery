import { Metadata } from 'next';
import { CreditCard, Truck } from 'lucide-react';

import { retrieveCart } from '@/features/storefront/lib/data/cart';
import { getUser } from '@/features/storefront/lib/data/user';
import { getCheckoutFulfillmentWindows } from '@/features/storefront/lib/data/delivery';
import { listPaymentProviders } from '@/features/storefront/lib/data/payment';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import UrbanCheckout from '@/features/storefront/modules/urban/UrbanCheckout';
import { UrbanContainer, UrbanMetric, UrbanPageHeader, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';

export const metadata: Metadata = storefrontMetadata({
  title: 'Checkout',
  description: 'Complete your grocery order.',
});

export async function CheckoutPage() {
  // Materialize/read availability once before the remaining independent reads.
  // The maintained runtime intentionally uses a one-connection pool, so two
  // concurrent rolling-availability transactions would be avoidable pressure.
  const fulfillment = await getCheckoutFulfillmentWindows();
  const [cart, user, paymentProviders] = await Promise.all([
    retrieveCart(),
    getUser(),
    listPaymentProviders(),
  ]);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Basket', href: '/cart' }, { label: 'Checkout' }]}
          title="Checkout"
          description="Choose delivery or pickup, confirm your details, and place your order."
          aside={
            <div className="space-y-3">
              <UrbanMetric label="Payment" value={paymentProviders[0]?.name || 'Manual'} icon={CreditCard} />
              <UrbanMetric label="Windows" value={fulfillment.deliveryWindows.filter((w) => w.available).length + fulfillment.pickupWindows.filter((w) => w.available).length} icon={Truck} />
            </div>
          }
        />
        <UrbanCheckout
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
