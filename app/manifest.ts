import type { MetadataRoute } from 'next';
import { getStore } from '@/features/storefront/lib/data/store';
import { storefrontAccentColor } from '@/features/storefront/lib/branding';

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Public metadata must remain valid before owner setup (or if settings are
  // unavailable). This fallback does not make storefront/auth requests succeed.
  const store = await getStore().catch(() => ({
    name: 'Openfront Grocery',
    homepageDescription: undefined,
    effectiveBrandHue: undefined,
    logoUrl: undefined,
  }));
  return {
    name: store.name,
    short_name: store.name.slice(0, 20),
    ...(store.homepageDescription ? { description: store.homepageDescription } : {}),
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f1e8',
    theme_color: storefrontAccentColor(store.effectiveBrandHue),
    icons: store.logoUrl ? [{ src: store.logoUrl, sizes: 'any' }] : [],
  };
}
