import { LOGO_ICONS } from '../platform/settings/lib/untitled-logo-registry';
import { effectiveStorefrontBrandHue, isDefaultStorefrontLogo, storefrontLogoAccentHue } from '../storefront/lib/branding';

// Juniper's mark: Capsule (two overlapping berries) from the Untitled UI library. Onboarding writes
// it to Store Settings; unsaved stores render the same mark without a settings write.
export const DEFAULT_STORE_LOGO_ICON_ID = 'capsule';
export const DEFAULT_STORE_LOGO_ICON = LOGO_ICONS.find((icon) => icon.id === DEFAULT_STORE_LOGO_ICON_ID)!.lightSvg;
// Juniper green: Capsule's native blues rotated 297°, independent of brandHue.
export const DEFAULT_LIBRARY_LOGO_COLOR = '297';

/** A library icon id or an SVG document becomes the SVG source that Store Settings stores. */
export function storeLogoSvgFor(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return LOGO_ICONS.find((icon) => icon.id === text)?.lightSvg || text;
}

export const DEFAULT_STORE_LOGO_COLOR = '0';

export function normalizeStoreLogoColor(value: unknown): string {
  const numeric = Number.parseFloat(String(value ?? DEFAULT_STORE_LOGO_COLOR));
  if (!Number.isFinite(numeric)) return DEFAULT_STORE_LOGO_COLOR;
  return String(((numeric % 360) + 360) % 360);
}

/**
 * The storefront accent hue: the colour the shopper sees in the saved (or default) library logo.
 * A custom image logo has no colour to read, so the stored accent hue applies instead.
 */
export function storefrontThemeHue(store: { logoIcon?: string | null; logoColor?: string | null; logoUrl?: string | null; brandHue?: number | null }) {
  if (!store.logoIcon && store.logoUrl && !isDefaultStorefrontLogo(store.logoUrl)) return effectiveStorefrontBrandHue(store.brandHue);
  return storefrontLogoAccentHue({ logoIcon: store.logoIcon, logoColor: store.logoColor, defaultIcon: DEFAULT_STORE_LOGO_ICON, defaultColor: DEFAULT_LIBRARY_LOGO_COLOR, fallbackHue: store.brandHue });
}
