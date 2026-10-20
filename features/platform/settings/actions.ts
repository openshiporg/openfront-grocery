'use server';

import { revalidatePath } from 'next/cache';
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo';
import { normalizeStoreLogoColor } from '@/features/lib/store-logo';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import { parseMoneyToCents, parsePercentToBps } from '@/features/lib/moneyInput';
import {
  isStorefrontBrandPresetHue,
  normalizeStorefrontBrandHue,
} from '@/features/storefront/lib/branding';

/** Storefront accent for image logos; the outcome is returned to the control, never thrown. */
export async function updateStorefrontBrandHueAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const raw = formData.get('brandHue');
  const brandHue = raw === 'unset' ? null : normalizeStorefrontBrandHue(raw);
  if (brandHue !== null && !isStorefrontBrandPresetHue(brandHue)) {
    return { ok: false, error: 'Choose one of the listed accent colours.', message: null };
  }

  const response = await keystoneClient<{
    updateGroceryStorefrontBrandHue: { brandHue: number | null; effectiveBrandHue: number };
  }>(`
    mutation UpdateGroceryStorefrontBrandHue($brandHue: Int) {
      updateGroceryStorefrontBrandHue(brandHue: $brandHue) {
        brandHue
        effectiveBrandHue
      }
    }
  `, { brandHue });
  if (!response.success) return { ok: false, error: response.error || 'The accent colour could not be saved.', message: null };

  revalidatePath('/dashboard/platform/settings');
  revalidatePath('/', 'layout');
  revalidatePath('/manifest.webmanifest');
  return { ok: true, error: null, message: brandHue === null ? 'The default accent is now used.' : 'Accent colour saved.' };
}

export type StoreLogoResult = { ok: true; data: { logoIcon: string | null; logoColor: string } } | { ok: false; error: string };

export async function updateStoreLogoAction(formData: FormData): Promise<StoreLogoResult> {
  const raw = formData.get('logoIcon');
  if (typeof raw !== 'string') return { ok: false, error: 'Choose a logo or keep the current one.' };
  const logoIcon = raw ? sanitizeStoreLogoSvg(raw) : null;
  if (raw && !logoIcon) return { ok: false, error: 'The logo must be a valid SVG image.' };
  const logoColor = normalizeStoreLogoColor(formData.get('logoColor'));
  const response = await keystoneClient<{
    updateGroceryStoreLogo: { logoIcon: string | null; logoColor: string };
  }>(`
    mutation UpdateGroceryStoreLogo($logoIcon: String, $logoColor: String!) {
      updateGroceryStoreLogo(logoIcon: $logoIcon, logoColor: $logoColor) {
        logoIcon
        logoColor
      }
    }
  `, { logoIcon, logoColor });
  if (!response.success) return { ok: false, error: response.error || 'The store logo could not be saved.' };
  revalidatePath('/dashboard/platform/settings');
  revalidatePath('/dashboard/store-settings');
  revalidatePath('/', 'layout');
  return { ok: true, data: response.data.updateGroceryStoreLogo };
}

export type SettingsActionState = { ok: boolean; error: string | null; message: string | null; values?: Record<string, string> };

/** Delivery area and minimums, entered in currency units and percent; stored as exact cents and basis points. */
export async function updateDeliveryPolicyAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const values = Object.fromEntries(['postalPrefixes', 'pickupMinimum', 'deliveryMinimum', 'deliveryFee', 'feeTaxRate'].map((key) => [key, String(formData.get(key) || '')]));
  const amounts: Record<string, number | null> = {
    pickupMinimumCents: parseMoneyToCents(values.pickupMinimum || '0'),
    deliveryMinimumCents: parseMoneyToCents(values.deliveryMinimum || '0'),
    deliveryFeeCents: parseMoneyToCents(values.deliveryFee || '0'),
    feeTaxRateBasisPoints: parsePercentToBps(values.feeTaxRate || '0'),
  };
  const invalid = Object.entries(amounts).find(([, value]) => value === null);
  if (invalid) return { ok: false, error: invalid[0] === 'feeTaxRateBasisPoints' ? 'Enter the fee tax as a percent with at most two decimals, like 8.75.' : 'Enter amounts like 12.50 (at most two decimals).', message: null, values };
  const policy = { version: 1, postalPrefixes: values.postalPrefixes.split(',').map((prefix) => prefix.trim()).filter(Boolean), ...amounts };
  const result = await keystoneClient('mutation Policy($policy:JSON!){updateGroceryDeliveryPolicy(policy:$policy)}', { policy });
  if (!result.success) return { ok: false, error: result.error || 'The delivery area could not be saved.', message: null, values };
  revalidatePath('/dashboard/platform/settings');
  revalidatePath('/checkout');
  return { ok: true, error: null, message: 'Delivery area and minimums saved.' };
}

/** Store details editor (one atomic store-and-settings update on the server). */
export async function updateStoreProfileAction(_previous: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => { if (typeof value === 'string') values[key] = value; });
  const taxRateBps = parsePercentToBps(values.taxRate || '');
  if (taxRateBps === null) return { ok: false, error: 'Enter the tax rate as a percent with at most two decimals, like 8.75.', message: null, values };
  const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .filter((day) => values[`hours.${day}`]?.trim()).map((day) => [day, values[`hours.${day}`].trim()]));
  const input = {
    name: values.name, tagline: values.tagline, homepageTitle: values.homepageTitle, homepageDescription: values.homepageDescription,
    contactEmail: values.contactEmail, contactPhone: values.contactPhone, address: values.address, countryCode: values.countryCode,
    locale: values.locale, timezone: values.timezone, taxRateBps, policyNotes: values.policyNotes,
    ...(Object.keys(hours).length ? { hours } : {}),
  };
  const result = await keystoneClient('mutation StoreProfile($input:GroceryStoreProfileInput!){updateGroceryStoreProfile(input:$input){success}}', { input });
  if (!result.success) return { ok: false, error: result.error || 'Store details could not be saved.', message: null, values };
  revalidatePath('/dashboard/platform/settings');
  revalidatePath('/', 'layout');
  return { ok: true, error: null, message: 'Store details saved.' };
}
