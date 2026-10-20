import { Metadata } from 'next';

import StorefrontServer from './StorefrontServer';
import UrbanFooter from '@/features/storefront/modules/urban/UrbanFooter';
import UrbanNav from '@/features/storefront/modules/urban/UrbanNav';
import UrbanTabBar from '@/features/storefront/modules/urban/UrbanTabBar';
import { UrbanButtonLink, UrbanPageShell, UrbanSearchStrip } from '@/features/storefront/modules/urban/UrbanPrimitives';
import { getStore } from '@/features/storefront/lib/data/store';
import { getUser } from '@/features/storefront/lib/data/user';
import { configureStorefrontMoney } from '@/features/storefront/lib/marketFormatting';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';

export async function MainLayout({ children }: { children: React.ReactNode }) {
  const [user, store] = await Promise.all([getUser(), getStore()]);
  configureStorefrontMoney(store.currencyCode, store.locale);
  if (store.setupIncomplete) return <StoreSetupInProgress />;
  return (
    <StorefrontServer shopperIdentity={user?.id || 'guest'} currencyCode={store.currencyCode} locale={store.locale} prefetchUser prefetchCart prefetchDepartments>
      <div className="sf-shell flex min-h-screen flex-col">
        <a href="#storefront-main" className="sf-skip-link">Skip to shopping content</a>
        <UrbanNav />
        {children}
        <UrbanFooter />
        <UrbanTabBar />
      </div>
    </StorefrontServer>
  );
}

/** Shown instead of the shop while it still has its setup placeholder name. */
function StoreSetupInProgress() {
  return (
    <main id="storefront-main" className="sf-shell flex min-h-screen items-center justify-center px-4 py-16">
      <div className="sf-panel max-w-md space-y-3 p-6 text-center sm:p-8">
        <h1 className="sf-subtitle">This shop is being set up</h1>
        <p className="sf-copy">The store hasn’t finished setting up its online shop yet. Please check back soon.</p>
      </div>
    </main>
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
