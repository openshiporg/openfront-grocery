import { isDefaultStorefrontLogo } from '@/features/storefront/lib/branding';
import { DEFAULT_LIBRARY_LOGO_COLOR, DEFAULT_STORE_LOGO_ICON, normalizeStoreLogoColor } from '@/features/lib/store-logo';
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo';

type IconStore = { logoIcon?: string | null; logoColor?: string | null; logoUrl?: string | null } | null | undefined;

/**
 * Favicon and app icon for the storefront: the same mark and colour as UrbanStoreLogo. The saved
 * SVG is sanitized, and the colour is the same hue rotation (an SVG feColorMatrix in sRGB, like
 * CSS hue-rotate) so browsers that render SVG icons match the header. Returned as a URL (the
 * custom logo URL, or an inline SVG data URI), so no API route is needed.
 */
export function storeIconHref(store: IconStore): string {
  const saved = sanitizeStoreLogoSvg(store?.logoIcon || '');
  if (!saved && store?.logoUrl && !isDefaultStorefrontLogo(store.logoUrl)) return store.logoUrl;
  const mark = saved || DEFAULT_STORE_LOGO_ICON;
  const hue = saved ? normalizeStoreLogoColor(store?.logoColor) : DEFAULT_LIBRARY_LOGO_COLOR;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs><filter id="store-logo-hue" color-interpolation-filters="sRGB"><feColorMatrix type="hueRotate" values="${hue}"/></filter></defs><g filter="url(#store-logo-hue)">${mark}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
