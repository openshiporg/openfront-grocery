import { isDefaultStorefrontLogo } from '../../lib/branding';
import { DEFAULT_STORE_LOGO_ICON, DEFAULT_LIBRARY_LOGO_COLOR, normalizeStoreLogoColor } from '@/features/lib/store-logo';
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo';

export interface UrbanStoreLogoProps {
  name: string;
  logoUrl?: string | null;
  logoIcon?: string | null;
  logoColor?: string | null;
}

/** One mark renderer for header, mobile menu, footer and settings preview.
 * A saved safe SVG wins over a custom logoUrl; unsaved stores use the default library mark.
 * Only the saved logo colour controls a chosen SVG, never the storefront accent.
 */
export function UrbanStoreLogo({ name, logoUrl, logoIcon, logoColor }: UrbanStoreLogoProps) {
  const safeIcon = sanitizeStoreLogoSvg(logoIcon || '');
  if (safeIcon) {
    return <span
      data-store-logo="saved"
      className="block h-9 w-9 shrink-0 overflow-hidden [&>svg]:block [&>svg]:size-full"
      style={{ filter: `hue-rotate(${normalizeStoreLogoColor(logoColor)}deg)` }}
      dangerouslySetInnerHTML={{ __html: safeIcon }}
      aria-hidden="true"
    />;
  }
  if (!logoUrl || isDefaultStorefrontLogo(logoUrl)) {
    return <span
      data-store-logo="default"
      className="block h-9 w-9 shrink-0 [&>svg]:block [&>svg]:size-full"
      style={{ filter: `hue-rotate(${DEFAULT_LIBRARY_LOGO_COLOR}deg)` }}
      dangerouslySetInnerHTML={{ __html: DEFAULT_STORE_LOGO_ICON }}
      aria-hidden="true"
    />;
  }
  if (logoUrl) {
    return <img data-store-logo="url" src={logoUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />;
  }
  return <span data-store-logo="initial" aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--sf-accent)] font-[family-name:var(--sf-font-display)] text-lg font-bold text-[var(--sf-accent-ink)]">
    {name.slice(0, 1)}
  </span>;
}
