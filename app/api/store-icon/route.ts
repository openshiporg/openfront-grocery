import { getStore } from '@/features/storefront/lib/data/store';
import { isDefaultStorefrontLogo } from '@/features/storefront/lib/branding';
import { DEFAULT_LIBRARY_LOGO_COLOR, DEFAULT_STORE_LOGO_ICON, normalizeStoreLogoColor } from '@/features/lib/store-logo';
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo';

export const dynamic = 'force-dynamic';

/**
 * Favicon and app icon for the storefront: the same mark and colour as UrbanStoreLogo. The saved
 * SVG is sanitized, and the colour is the same hue rotation (an SVG feColorMatrix in sRGB, like
 * CSS hue-rotate) so browsers that render SVG icons match the header.
 */
export async function GET() {
  const store = await getStore().catch(() => null);
  const saved = sanitizeStoreLogoSvg(store?.logoIcon || '');
  if (!saved && store?.logoUrl && !isDefaultStorefrontLogo(store.logoUrl)) {
    return Response.redirect(new URL(store.logoUrl, process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost'), 307);
  }
  const mark = saved || DEFAULT_STORE_LOGO_ICON;
  const hue = saved ? normalizeStoreLogoColor(store?.logoColor) : DEFAULT_LIBRARY_LOGO_COLOR;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs><filter id="store-logo-hue" color-interpolation-filters="sRGB"><feColorMatrix type="hueRotate" values="${hue}"/></filter></defs><g filter="url(#store-logo-hue)">${mark}</g></svg>`;
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
