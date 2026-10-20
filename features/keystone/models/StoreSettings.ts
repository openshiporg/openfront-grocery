import { normalizeDeliveryPolicy } from '../lib/deliveryPolicy';
import { list } from '@keystone-6/core';
import { checkbox, integer, json, relationship, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { currentMembershipStoreId, storeScopedFilter } from '../lib/storeAccess';
import { assertValidRollingFulfillmentPolicy } from '../lib/rollingFulfillment';
import { assertValidTimeZone } from '../lib/storeTime';
import { requiredUniqueRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';
import { normalizeStorefrontBrandHue } from '../../storefront/lib/branding';
import { DEFAULT_STORE_LOGO_COLOR, normalizeStoreLogoColor } from '../../lib/store-logo';
import { sanitizeStoreLogoSvg } from '../utils/storeLogo';

export const StoreSettings = list({
  db: { idField: { kind: 'autoincrement' } },
  access: {
    operation: {
      query: ({ session }) => Boolean(session?.itemId),
      create: () => false,
      update: permissions.canManageOnboarding,
      delete: () => false,
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter,
    },
  },
  hooks: {
    validateInput: async ({ resolvedData, addValidationError }) => {
      if (resolvedData.deliveryPolicy !== undefined) {
        try { normalizeDeliveryPolicy(resolvedData.deliveryPolicy); }
        catch (error) { addValidationError(error instanceof Error ? error.message : 'Invalid delivery policy'); }
      }
      if (resolvedData.timezone !== undefined) {
        try { assertValidTimeZone(String(resolvedData.timezone)); }
        catch (error) { addValidationError(error instanceof Error ? error.message : 'Store timezone is invalid'); }
      }
      if (resolvedData.hours !== undefined) {
        try { assertValidRollingFulfillmentPolicy(resolvedData.hours); }
        catch (error) { addValidationError(error instanceof Error ? error.message : 'Store fulfillment policy is invalid'); }
      }
    },
    resolveInput: async ({ operation, resolvedData, context }) => {
      const data = { ...resolvedData };
      if ('brandHue' in data) data.brandHue = normalizeStorefrontBrandHue(data.brandHue);
      if (operation !== 'create') return data;
      const storeId = await currentMembershipStoreId({ session: context.session, context });
      if (!storeId) throw new Error('An active store is required');
      return { ...data, store: { connect: { id: storeId } } };
    },
    // Name and timezone are mirrored on Store; they change only through
    // updateGroceryStoreProfile, which writes both in one transaction.
  },
  graphql: { plural: 'storeSettingsItems' },
  ui: {
    labelField: 'name',
    listView: {
      initialColumns: ['name', 'contactEmail', 'contactPhone', 'isActive'],
    },
  },
  fields: {
    store: relationship({
      ref: 'Store.settings',
      db: { extendPrismaSchema: requiredUniqueRelationshipPrisma },
      graphql: { isNonNull: { create: true } },
      access: { create: () => false, update: () => false },
    }),
    // Mirrored on Store: edited only through updateGroceryStoreProfile (atomic with the mirror).
    name: text({ validation: { isRequired: true }, defaultValue: 'Juniper Market', access: { update: () => false } }),
    tagline: text({ defaultValue: 'Neighborhood grocery · delivery & curbside pickup' }),
    homepageTitle: text({ defaultValue: 'Fresh from the neighborhood' }),
    homepageDescription: text({
      defaultValue:
        'Seasonal produce, pantry staples, and household essentials selected for everyday shopping.',
      ui: { displayMode: 'textarea' },
    }),
    contactEmail: text({ defaultValue: 'hello@junipermarket.example' }),
    contactPhone: text({ defaultValue: '(415) 555-0148' }),
    address: text({ defaultValue: '184 Juniper Street, San Francisco, CA 94107' }),
    // Merchant-written terms shown on the storefront Policies page above the standard
    // picking, payment and pickup rules. Empty shows only the standard sections.
    policyNotes: text({
      defaultValue: '',
      validation: { length: { max: 5000 } },
      ui: { displayMode: 'textarea', description: 'Your own store policy text (returns, refunds, age-restricted goods, and so on), shown on the storefront Policies page.' },
    }),
    logoUrl: text({ defaultValue: '/logo.svg' }),
    // Openfront logo-library mark. Nullable so existing stores keep their logoUrl artwork until an
    // operator explicitly chooses a library or custom SVG; when set, it takes precedence over logoUrl.
    logoIcon: text({
      db: { isNullable: true },
      ui: { displayMode: 'textarea', description: 'Sanitized SVG from the logo library or a custom SVG. Unset uses the logo path.' },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          if (value === undefined || value === null || value === '') return value;
          return typeof value === 'string' ? sanitizeStoreLogoSvg(value) : '';
        },
        validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
          const submitted = inputData?.[fieldKey];
          if (typeof submitted === 'string' && submitted.trim() && !resolvedData?.[fieldKey]) {
            addValidationError('Logo must be a valid, safe SVG document');
          }
        },
      },
    }),
    logoColor: text({
      defaultValue: DEFAULT_STORE_LOGO_COLOR,
      label: 'Logo colour',
      ui: { description: 'Hue rotation in degrees applied to the library or uploaded SVG logo. The shop’s buttons, links, focus rings and hero follow this colour. Custom image logos use the storefront brand hue instead.' },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          return value === undefined ? value : normalizeStoreLogoColor(value);
        },
      },
    }),
    brandHue: integer({
      validation: { min: 0, max: 359 },
      label: 'Storefront brand hue (0–359)',
      ui: { description: 'Accent colour for shops whose logo is a custom image (library and SVG logos set the accent from the logo colour). Leave empty to use the default green.' },
    }),
    // Grocery prices in two-decimal minor units; the currency is fixed when the
    // store is set up (onboarding accepts USD) and orders keep their own copy.
    currencyCode: text({ access: { update: () => false }, defaultValue: 'USD', ui: { description: 'Fixed at store setup. Orders keep the currency they were placed in.' } }),
    taxRateBps: integer({ defaultValue: 875, validation: { isRequired: true, min: 0, max: 10_000 }, label: 'Default tax rate (basis points)' }),
    locale: text({ defaultValue: 'en-US' }),
    timezone: text({ defaultValue: 'America/Los_Angeles', access: { update: () => false } }),
    countryCode: text({ defaultValue: 'US' }),
    deliveryPolicy: json({ defaultValue: { version: 1, postalPrefixes: [], pickupMinimumCents: 0, deliveryMinimumCents: 0, deliveryFeeCents: 0, feeTaxRateBasisPoints: 0 }, access: { create: () => false, update: () => false } }),
    hours: json({
      defaultValue: {
        monday: '8:00 AM - 8:00 PM',
        tuesday: '8:00 AM - 8:00 PM',
        wednesday: '8:00 AM - 8:00 PM',
        thursday: '8:00 AM - 8:00 PM',
        friday: '8:00 AM - 9:00 PM',
        saturday: '8:00 AM - 9:00 PM',
        sunday: '9:00 AM - 7:00 PM',
      },
    }),
    isActive: checkbox({ access: { update: () => false }, defaultValue: true }),
    ...trackingFields,
  },
});
