import { Metadata } from 'next';

import StorefrontServer from './StorefrontServer';
import UrbanFooter from '@/features/storefront/modules/urban/UrbanFooter';
import UrbanNav from '@/features/storefront/modules/urban/UrbanNav';
import { UrbanButtonLink, UrbanInset, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';
import { getStore } from '@/features/storefront/lib/data/store';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';

export async function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <StorefrontServer prefetchUser prefetchCart prefetchDepartments>
      <div className="flex min-h-screen flex-col">
        <UrbanNav />
        {children}
        <UrbanFooter />
      </div>
    </StorefrontServer>
  );
}

export const MainNotFoundMetadata: Metadata = storefrontMetadata({
  title: '404',
  description: 'The requested route does not exist on the grocery storefront.',
});

export async function MainNotFound() {
  const store = await getStore();
  return (
    <UrbanPageShell className="flex min-h-[70vh] items-center justify-center px-4">
      <UrbanInset className="max-w-xl p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sf-ink-faint)]">Route missing</p>
        <h1 className="mt-3 font-[family-name:var(--sf-font-display)] text-4xl font-semibold text-[var(--sf-ink)]">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--sf-ink-muted)]">The page you tried to access is not part of the active {store.name} storefront.</p>
        <div className="mt-6"><UrbanButtonLink href="/">Return home</UrbanButtonLink></div>
      </UrbanInset>
    </UrbanPageShell>
  );
}
