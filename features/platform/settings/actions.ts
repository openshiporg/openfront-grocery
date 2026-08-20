'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import {
  isStorefrontBrandPresetHue,
  normalizeStorefrontBrandHue,
} from '@/features/storefront/lib/branding';

export async function updateStorefrontBrandHueAction(formData: FormData) {
  const raw = formData.get('brandHue');
  const brandHue = raw === 'unset' ? null : normalizeStorefrontBrandHue(raw);
  if (brandHue !== null && !isStorefrontBrandPresetHue(brandHue)) {
    throw new Error('Choose one of the supported storefront brand presets');
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
  if (!response.success) throw new Error(response.error);

  revalidatePath('/dashboard/platform/settings');
  revalidatePath('/', 'layout');
  revalidatePath('/manifest.webmanifest');
}
