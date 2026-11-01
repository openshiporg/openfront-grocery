import { Metadata } from 'next';

import StorefrontServer from './StorefrontServer';
import UrbanFooter from '@/features/storefront/modules/urban/UrbanFooter';
import RigelHeader from '@/features/storefront/modules/rigel/RigelHeader';
import { RigelChromeProvider, RigelPhoneCartBar, RigelShell } from '@/features/storefront/modules/rigel/RigelChrome';
import { RigelFulfillmentProvider } from '@/features/storefront/modules/rigel/RigelFulfillment';
import UrbanTabBar from '@/features/storefront/modules/urban/UrbanTabBar';
import { UrbanButtonLink, UrbanPageShell, UrbanSearchStrip } from '@/features/storefront/modules/urban/UrbanPrimitives';
import { getStore } from '@/features/storefront/lib/data/store';
import { getUser } from '@/features/storefront/lib/data/user';
import { getAllDepartments } from '@/features/storefront/lib/data/departments';
import { getShopFulfillmentWindows } from '@/features/storefront/lib/data/delivery';
import { getSavedAddresses } from '@/features/storefront/lib/data/addresses';
import { configureStorefrontMoney, formatDeliveryArea } from '@/features/storefront/lib/marketFormatting';
import { storeToday } from '@/features/storefront/lib/storeToday';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';

export async function MainLayout({ children }: { children: React.ReactNode }) {
  const [user, store] = await Promise.all([getUser(), getStore()]);
  configureStorefrontMoney(store.currencyCode, store.locale);
  if (store.setupIncomplete) return <StoreSetupInProgress />;
  // Availability first: the runtime keeps a one-connection pool (see CheckoutPage).
  const availability = await getShopFulfillmentWindows();
  const [{ departments }, saved] = await Promise.all([
    getAllDepartments().catch(() => ({ departments: [] })),
    user ? getSavedAddresses().catch(() => ({ addresses: [] })) : Promise.resolve({ addresses: [] }),
  ]);
  const home = saved.addresses[0];
  const shopperAddress = home ? `${home.address1}${home.address2 ? `, ${home.address2}` : ''}, ${home.city}, ${home.province} ${home.postalCode}` : null;
  const deliveryArea = store.deliveryPostalPrefixes?.length ? formatDeliveryArea(store.deliveryPostalPrefixes, 3) : null;
  return (
    <StorefrontServer shopperIdentity={user?.id || 'guest'} currencyCode={store.currencyCode} locale={store.locale} prefetchUser prefetchCart prefetchDepartments>
      <RigelFulfillmentProvider delivery={availability?.deliveryWindows ?? null} pickup={availability?.pickupWindows ?? null} today={storeToday(store.timezone)}>
        <RigelChromeProvider storeAddress={store.address} shopperAddress={shopperAddress} deliveryArea={deliveryArea} departments={departments.map(({ id, name, handle }) => ({ id, name, handle }))}>
          <div className="sf-shell flex min-h-screen flex-col">
            <a href="#storefront-main" className="sf-skip-link">Skip to shopping content</a>
            <RigelHeader store={store} user={user} departments={departments} />
            <RigelShell>{children}</RigelShell>
            <UrbanFooter />
            <RigelPhoneCartBar />
            <UrbanTabBar />
          </div>
        </RigelChromeProvider>
      </RigelFulfillmentProvider>
    </StorefrontServer>
  );
}

/** Shown instead of the shop while it still has its setup placeholder name. */
function StoreSetupInProgress() {
  return (
    <div id="storefront-main" className="sf-shell flex min-h-screen items-center justify-center px-4 py-16">
      <div className="sf-panel max-w-md space-y-3 p-6 text-center sm:p-8">
        <h1 className="sf-subtitle">This shop is being set up</h1>
        <p className="sf-copy">The store hasn’t finished setting up its online shop yet. Please check back soon.</p>
      </div>
    </div>
  );
}

export const MainNotFoundMetadata: Metadata = storefrontMetadata({
  title: '404',
  description: 'The requested route does not exist on the grocery storefront.',
});

export async function MainNotFound() {
  const store = await getStore();
  return (
    <UrbanPageShell className="px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-xl text-center">
        <p className="font-[family-name:var(--sf-font-display)] text-[clamp(5rem,3rem+10vw,9rem)] font-bold leading-none tracking-[-0.06em] text-[var(--sf-paper-3)]" aria-hidden="true">404</p>
        <h1 className="sf-title -mt-4">This shelf is empty</h1>
        <p className="sf-copy mx-auto mt-3 max-w-md">That page isn’t part of the {store.name} shop. Try searching for what you need, or head back to the aisles.</p>
        <div className="mx-auto mt-7 max-w-md"><UrbanSearchStrip placeholder="Search the shop" /></div>
        <div className="mt-5 flex flex-wrap justify-center gap-3"><UrbanButtonLink href="/" variant="dark">Back to the shop</UrbanButtonLink><UrbanButtonLink href="/departments" variant="ghost">Browse aisles</UrbanButtonLink></div>
      </div>
    </UrbanPageShell>
  );
}
