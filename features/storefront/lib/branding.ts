export const DEFAULT_STOREFRONT_BRAND_HUE = 35;

export const STOREFRONT_BRAND_PRESETS = [
  { label: 'Terracotta', hue: 35, description: 'Warm and neighborhood-focused' },
  { label: 'Citrus', hue: 75, description: 'Bright and produce-forward' },
  { label: 'Leaf', hue: 145, description: 'Fresh and natural' },
  { label: 'Ocean', hue: 240, description: 'Cool and dependable' },
  { label: 'Plum', hue: 315, description: 'Rich and distinctive' },
] as const;

export function normalizeStorefrontBrandHue(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || (typeof value === 'string' && !value.trim())) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new Error('Storefront brand hue must be a finite number');
  const integer = Math.round(numeric);
  return ((integer % 360) + 360) % 360;
}

export function effectiveStorefrontBrandHue(value: unknown) {
  return normalizeStorefrontBrandHue(value) ?? DEFAULT_STOREFRONT_BRAND_HUE;
}

export function isStorefrontBrandPresetHue(value: number) {
  return STOREFRONT_BRAND_PRESETS.some((preset) => preset.hue === value);
}

export function storefrontAccentColor(value: unknown) {
  return `oklch(52% 0.14 ${effectiveStorefrontBrandHue(value)})`;
}

export function storefrontAccentHoverColor(value: unknown) {
  return `oklch(44% 0.12 ${effectiveStorefrontBrandHue(value)})`;
}

export function storefrontBrandCssVariables(value: unknown) {
  const hue = effectiveStorefrontBrandHue(value);
  return {
    '--sf-brand-hue': String(hue),
    '--sf-accent': storefrontAccentColor(hue),
    '--sf-accent-hover': storefrontAccentHoverColor(hue),
    '--sf-focus': storefrontAccentColor(hue),
  } as const;
}
