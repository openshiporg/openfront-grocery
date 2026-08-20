import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';
import '@/features/storefront/styles/market-tokens.css';
import { MainLayout } from '@/features/storefront/screens/MainLayout';
import { getStore } from '@/features/storefront/lib/data/store';
import { storefrontBrandCssVariables } from '@/features/storefront/lib/branding';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  return {
    title: {
      default: store.name,
      template: `%s | ${store.name}`,
    },
    applicationName: store.name,
    description: store.homepageDescription || undefined,
    icons: store.logoUrl
      ? { icon: store.logoUrl, shortcut: store.logoUrl, apple: store.logoUrl }
      : null,
  };
}

const marketBody = DM_Sans({
  variable: '--font-market-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const marketDisplay = Fraunces({
  variable: '--font-market-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export default async function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const store = await getStore();
  const brandVariables = storefrontBrandCssVariables(store.effectiveBrandHue) as CSSProperties;
  return (
    <div
      className={`${marketBody.variable} ${marketDisplay.variable} min-h-screen font-[family-name:var(--sf-font-body)] antialiased`}
      style={{ ...brandVariables, backgroundColor: 'var(--sf-paper)', color: 'var(--sf-ink)' }}
    >
      <MainLayout>{children}</MainLayout>
    </div>
  );
}
