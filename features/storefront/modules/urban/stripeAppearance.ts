import type { Appearance, CssFontSource } from '@stripe/stripe-js';

// Stripe Elements renders in an iframe, so it cannot read the storefront's CSS
// variables. Resolve the Market Shelf tokens (including the retailer's accent
// hue, set inline by the storefront layout) to sRGB hex values Stripe accepts.

const FALLBACK = {
  accent: '#1f7a4d',
  ink: '#14302b',
  inkMuted: '#46564f',
  card: '#ffffff',
  paper: '#f8f8f3',
  rule: '#dfe2d8',
  danger: '#b3261e',
};

function resolveColor(root: Element, token: string, fallback: string) {
  try {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    probe.style.display = 'none';
    root.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !computed) return fallback;
    ctx.fillStyle = fallback;
    ctx.fillStyle = computed;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return fallback;
  }
}

export function storefrontStripeAppearance(): Appearance {
  const root = typeof document === 'undefined' ? null : document.querySelector('.storefront-ui');
  const color = (token: string, fallback: string) => (root ? resolveColor(root, token, fallback) : fallback);
  const accent = color('--sf-accent', FALLBACK.accent);
  const ink = color('--sf-ink', FALLBACK.ink);
  const inkMuted = color('--sf-ink-muted', FALLBACK.inkMuted);
  const card = color('--sf-card', FALLBACK.card);
  const paper = color('--sf-paper-2', FALLBACK.paper);
  const rule = color('--sf-rule-strong', FALLBACK.rule);
  const danger = color('--sf-danger', FALLBACK.danger);
  return {
    theme: 'stripe',
    variables: {
      colorPrimary: accent,
      colorBackground: card,
      colorText: ink,
      colorTextSecondary: inkMuted,
      colorTextPlaceholder: inkMuted,
      colorDanger: danger,
      fontFamily: '"Instrument Sans", system-ui, sans-serif',
      fontSizeBase: '15px',
      borderRadius: '10px',
      spacingUnit: '4px',
    },
    rules: {
      '.Input': { border: `1px solid ${rule}`, boxShadow: 'none' },
      '.Input:focus': { borderColor: accent, boxShadow: `0 0 0 3px ${accent}33` },
      '.Tab': { border: `1px solid ${rule}`, backgroundColor: paper, boxShadow: 'none' },
      '.Tab--selected': { borderColor: accent, backgroundColor: card },
      '.Label': { fontWeight: '600', color: ink },
    },
  };
}

export const storefrontStripeFonts: CssFontSource[] = [
  { cssSrc: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap' },
];
