import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { publicStore, requireSessionStore } from '../lib/storeScope';
import {
  effectiveStorefrontBrandHue,
  normalizeStorefrontBrandHue,
} from '../../storefront/lib/branding';

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
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
      brandHue: true,
      currencyCode: true,
      locale: true,
      timezone: true,
      countryCode: true,
      isActive: true,
    },
  });
  if (!settings?.isActive) throw new Error('No active grocery storefront settings are configured');

  const name = optionalText(settings.name) || optionalText(store.name);
  if (!name) throw new Error('The active grocery storefront has no configured name');
  const brandHue = normalizeStorefrontBrandHue(settings.brandHue);

  return {
    id: String(settings.id),
    name,
    tagline: optionalText(settings.tagline),
    homepageTitle: optionalText(settings.homepageTitle),
    homepageDescription: optionalText(settings.homepageDescription),
    contactEmail: optionalText(settings.contactEmail),
    contactPhone: optionalText(settings.contactPhone),
    address: optionalText(settings.address),
    logoUrl: optionalText(settings.logoUrl),
    brandHue,
    effectiveBrandHue: effectiveStorefrontBrandHue(brandHue),
    currencyCode: optionalText(settings.currencyCode),
    locale: optionalText(settings.locale),
    timezone: optionalText(settings.timezone),
    countryCode: optionalText(settings.countryCode),
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
