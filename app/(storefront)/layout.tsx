import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import '@/features/storefront/styles/market-tokens.css';
import { MainLayout } from '@/features/storefront/screens/MainLayout';
import { getStore } from '@/features/storefront/lib/data/store';
import { storefrontBrandCssVariables } from '@/features/storefront/lib/branding';
import { storefrontThemeHue } from '@/features/lib/store-logo';
import { storeIconHref } from '@/features/storefront/lib/storeIcon';

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
    // The store's chosen mark (or its custom logo URL).
    icons: (() => { const icon = storeIconHref(store); return { icon, shortcut: icon, apple: icon }; })(),
  };
}

const rigel = Figtree({
  variable: '--font-rigel',
  subsets: ['latin'],
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
      className={`storefront-ui ${rigel.variable} min-h-screen font-[family-name:var(--sf-font-body)] antialiased`}
      style={{ ...brandVariables, backgroundColor: 'var(--sf-paper)', color: 'var(--sf-ink)' }}
    >
      <MainLayout>{children}</MainLayout>
    </div>
  );
}
