import type { Context } from '.keystone/types';

import { sanitizeStoreLogoSvg } from '../utils/storeLogo';
import { normalizeStoreLogoColor } from '../../lib/store-logo';
import { requireFreshCapability } from '../access';
import { publicStore, requireSessionStore } from '../lib/storeScope';
import { publicOpeningHours } from '../lib/rollingFulfillment';
import { isOnboardingPlaceholder } from '../../lib/onboarding-placeholders';
import {
  effectiveStorefrontBrandHue,
  normalizeStorefrontBrandHue,
} from '../../storefront/lib/branding';

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

/** Merchant-facing onboarding placeholders are never published as real store details. */
function publicText(value: string | null | undefined) {
  return isOnboardingPlaceholder(value) ? null : optionalText(value);
}

export async function getPublicGroceryStorefrontSettings(
  _root: unknown,
  _args: unknown,
  context: Context,
) {
  const store = await publicStore(context);
  const settings = await context.prisma.storeSettings.findUnique({
    where: { storeId: store.id },
    select: {
      id: true,
      name: true,
      tagline: true,
      homepageTitle: true,
      homepageDescription: true,
      contactEmail: true,
      contactPhone: true,
      address: true,
      logoUrl: true,
      logoIcon: true,
      logoColor: true,
      brandHue: true,
      currencyCode: true,
      locale: true,
      timezone: true,
      countryCode: true,
      hours: true,
      policyNotes: true,
      isActive: true,
    },
  });
  if (!settings?.isActive) throw new Error('No active grocery storefront settings are configured');

  // The setup placeholder ("Replace with your store name") is never published as
  // the merchant's identity. With no real name configured the shop reports that
  // setup is incomplete rather than inventing one.
  const name = publicText(settings.name) || publicText(store.name);
  const brandHue = normalizeStorefrontBrandHue(settings.brandHue);

  return {
    id: String(settings.id),
    name,
    setupIncomplete: !name,
    tagline: publicText(settings.tagline),
    homepageTitle: publicText(settings.homepageTitle),
    homepageDescription: publicText(settings.homepageDescription),
    contactEmail: publicText(settings.contactEmail),
    contactPhone: publicText(settings.contactPhone),
    address: publicText(settings.address),
    logoUrl: optionalText(settings.logoUrl),
    logoIcon: sanitizeStoreLogoSvg(settings.logoIcon || '') || null,
    logoColor: normalizeStoreLogoColor(settings.logoColor),
    brandHue,
    effectiveBrandHue: effectiveStorefrontBrandHue(brandHue),
    currencyCode: optionalText(settings.currencyCode),
    locale: optionalText(settings.locale),
    timezone: optionalText(settings.timezone),
    countryCode: optionalText(settings.countryCode),
    openingHours: publicOpeningHours(settings.hours),
    policyNotes: publicText(settings.policyNotes),
  };
}

export async function updateGroceryStorefrontBrandHue(
  _root: unknown,
  args: { brandHue?: number | null },
  context: Context,
) {
  await requireFreshCapability(context, 'canManageOnboarding');
  if (!Object.prototype.hasOwnProperty.call(args, 'brandHue')) {
    throw new Error('Set brandHue to a hue or null to explicitly use the storefront default');
  }
  const brandHue = normalizeStorefrontBrandHue(args.brandHue);
  const store = await requireSessionStore(context);
  const settings = await context.prisma.storeSettings.update({
    where: { storeId: store.id },
    data: { brandHue },
    select: { brandHue: true },
  });
  return {
    brandHue: settings.brandHue,
    effectiveBrandHue: effectiveStorefrontBrandHue(settings.brandHue),
  };
}
