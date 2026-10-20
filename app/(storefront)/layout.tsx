import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import '@/features/storefront/styles/market-tokens.css';
import { MainLayout } from '@/features/storefront/screens/MainLayout';
import { getStore } from '@/features/storefront/lib/data/store';
import { storefrontBrandCssVariables } from '@/features/storefront/lib/branding';
import { storefrontThemeHue } from '@/features/lib/store-logo';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  const name = store.name || 'Shop setup in progress';
  return {
    title: {
      default: name,
      template: store.name ? `%s | ${store.name}` : '%s',
    },
    applicationName: store.name || undefined,
    description: store.homepageDescription || undefined,
    // The store's chosen mark (or its custom logo URL), rendered by the store-icon route.
    icons: { icon: '/api/store-icon', shortcut: '/api/store-icon', apple: '/api/store-icon' },
  };
}

const marketBody = Instrument_Sans({
  variable: '--font-market-body',
  subsets: ['latin'],
});

const marketDisplay = Bricolage_Grotesque({
  variable: '--font-market-display',
  subsets: ['latin'],
  axes: ['opsz'],
});

export default async function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const store = await getStore();
  // The logo colour themes the storefront accents, hero and badges (Restaurant pattern).
  const brandVariables = storefrontBrandCssVariables(storefrontThemeHue(store)) as CSSProperties;
  return (
    <div
      className={`storefront-ui ${marketBody.variable} ${marketDisplay.variable} min-h-screen font-[family-name:var(--sf-font-body)] antialiased`}
      style={{ ...brandVariables, backgroundColor: 'var(--sf-paper)', color: 'var(--sf-ink)' }}
    >
      <MainLayout>{children}</MainLayout>
    </div>
  );
}
