export const DEFAULT_STOREFRONT_BRAND_HUE = 35;

// StoreSettings.logoUrl default (and onboarding seed value): the platform mark in /public, not a retailer upload.
export const DEFAULT_STOREFRONT_LOGO_URL = '/logo.svg';

export function isDefaultStorefrontLogo(logoUrl: unknown) {
  return typeof logoUrl === 'string' && logoUrl.trim() === DEFAULT_STOREFRONT_LOGO_URL;
}

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

// ---- Storefront palette from the logo colour -------------------------------------------------
// The saved logo colour is a CSS hue-rotate of the logo SVG. Like Restaurant's storefront, that
// colour themes the storefront: the accent hue is the hue the shopper actually sees in the logo
// (its primary fill rotated by the same matrix CSS uses), and every palette colour is computed
// in OKLCH inside the sRGB gamut so each text/background pair below meets WCAG AA for any hue.

type Rgb = [number, number, number];

function toLinear(channel: number) { return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }

function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** The CSS `hue-rotate()` matrix (Filter Effects), applied to sRGB channels. */
export function hueRotateRgb([r, g, b]: Rgb, degrees: number): Rgb {
  const angle = (degrees * Math.PI) / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return [
    clamp((0.213 + cos * 0.787 - sin * 0.213) * r + (0.715 - cos * 0.715 - sin * 0.715) * g + (0.072 - cos * 0.072 + sin * 0.928) * b),
    clamp((0.213 - cos * 0.213 + sin * 0.143) * r + (0.715 + cos * 0.285 + sin * 0.14) * g + (0.072 - cos * 0.072 - sin * 0.283) * b),
    clamp((0.213 - cos * 0.213 - sin * 0.787) * r + (0.715 - cos * 0.715 + sin * 0.715) * g + (0.072 + cos * 0.928 + sin * 0.072) * b),
  ];
}

function rgbToOklch(rgb: Rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinearRgb(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians), b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);

/** Largest chroma at this lightness and hue that is still inside sRGB. */
export function maxSrgbChroma(lightness: number, hue: number) {
  let low = 0, high = 0.4;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (inGamut(oklchToLinearRgb(lightness, middle, hue))) low = middle; else high = middle;
  }
  return low;
}

export type PaletteColor = { l: number; c: number; h: number };

/** WCAG 2 relative luminance of an in-gamut OKLCH colour. */
export function oklchLuminance({ l, c, h }: PaletteColor) {
  const [r, g, b] = oklchToLinearRgb(l, c, h).map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: PaletteColor, second: PaletteColor) {
  const [light, dark] = [oklchLuminance(first), oklchLuminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const cssColor = ({ l, c, h }: PaletteColor) => `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(4)} ${h})`;
const tone = (l: number, chroma: number, h: number): PaletteColor => ({ l, c: Math.min(chroma, maxSrgbChroma(l, h) * 0.97), h });

/** Every brand-dependent storefront colour for one hue (buttons, links, focus, hero, badges). */
export function storefrontPalette(hueValue: unknown) {
  const h = effectiveStorefrontBrandHue(hueValue);
  return {
    accent: tone(0.52, 0.15, h),
    accentHover: tone(0.44, 0.13, h),
    accentSoft: tone(0.955, 0.03, h),
    accentInk: tone(0.99, 0.004, h),
    header: tone(0.25, 0.045, h),
    header2: tone(0.31, 0.05, h),
    headerInk: tone(0.97, 0.012, h),
    headerInkMuted: tone(0.84, 0.03, h),
    brandSoft: tone(0.945, 0.022, h),
  };
}

/** Text/background pairs the storefront renders with palette colours, for AA verification. */
export const STOREFRONT_PALETTE_TEXT_PAIRS = [
  ['accentInk', 'accent'], ['accentInk', 'accentHover'], ['accentHover', 'accentSoft'],
  ['headerInk', 'header'], ['headerInkMuted', 'header'], ['headerInk', 'header2'], ['headerInkMuted', 'header2'],
] as const;

/** Painted colours of an SVG in document order: fill, stroke and gradient stops, as attributes or inline style. */
function paintedColors(svg: string) {
  const colors: string[] = [];
  const pattern = /(?:\b(?:fill|stroke|stop-color)\s*=\s*["']?|\b(?:fill|stroke|stop-color)\s*:\s*)(#[0-9a-f]{6}\b|#[0-9a-f]{3}\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(svg))) {
    const hex = match[1];
    colors.push(hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex);
  }
  return colors;
}

/**
 * The hue a shopper sees in the logo: its first chromatic painted colour —
 * fill, stroke (line-drawn marks) or gradient stop — under the saved hue
 * rotation. A mark painted only in greys keeps the configured accent.
 */
export function storefrontLogoAccentHue({ logoIcon, logoColor, defaultIcon, defaultColor, fallbackHue }: {
  logoIcon?: string | null; logoColor?: string | null; defaultIcon: string; defaultColor: string; fallbackHue: unknown;
}) {
  const svg = logoIcon || defaultIcon;
  const rotation = Number.parseFloat(String(logoIcon ? logoColor ?? '0' : defaultColor));
  if (!Number.isFinite(rotation)) return effectiveStorefrontBrandHue(fallbackHue);
  for (const color of paintedColors(svg)) {
    const rgb = hexToRgb(color);
    if (!rgb) continue;
    const seen = rgbToOklch(hueRotateRgb(rgb, rotation));
    // Grey or near-black paint has no meaningful hue; look for the next colour.
    if (seen.c >= 0.04) return Math.round(seen.h) % 360;
  }
  return effectiveStorefrontBrandHue(fallbackHue);
}

export function storefrontAccentColor(value: unknown) {
  return cssColor(storefrontPalette(value).accent);
}

export function storefrontAccentHoverColor(value: unknown) {
  return cssColor(storefrontPalette(value).accentHover);
}

export function storefrontBrandCssVariables(value: unknown) {
  const hue = effectiveStorefrontBrandHue(value);
  const palette = storefrontPalette(hue);
  return {
    '--sf-brand-hue': String(hue),
    '--sf-accent': cssColor(palette.accent),
    '--sf-accent-hover': cssColor(palette.accentHover),
    '--sf-accent-soft': cssColor(palette.accentSoft),
    '--sf-accent-ink': cssColor(palette.accentInk),
    '--sf-focus': cssColor(palette.accent),
    '--sf-header': cssColor(palette.header),
    '--sf-header-2': cssColor(palette.header2),
    '--sf-header-ink': cssColor(palette.headerInk),
    '--sf-header-ink-muted': cssColor(palette.headerInkMuted),
    '--sf-juniper-soft': cssColor(palette.brandSoft),
  } as const;
}
