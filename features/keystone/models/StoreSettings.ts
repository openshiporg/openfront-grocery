import { list } from '@keystone-6/core';
import { checkbox, integer, json, relationship, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { assertValidRollingFulfillmentPolicy } from '../lib/rollingFulfillment';
import { assertValidTimeZone } from '../lib/storeTime';
import { requiredUniqueRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';
import { normalizeStorefrontBrandHue } from '../../storefront/lib/branding';

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
      const storeId = context.session?.data.store?.id;
      if (!storeId) throw new Error('An active store is required');
      return { ...data, store: { connect: { id: storeId } } };
    },
    afterOperation: async ({ operation, item, resolvedData, context }) => {
      if (operation !== 'update') return;
      const storeId = (item as any).storeId;
      if (!storeId) throw new Error('Store settings are missing ownership');
      const data = Object.fromEntries(Object.entries({
        name: resolvedData.name,
        timezone: resolvedData.timezone,
        currencyCode: resolvedData.currencyCode,
        isActive: resolvedData.isActive,
      }).filter(([, value]) => value !== undefined));
      if (Object.keys(data).length) await context.prisma.store.update({ where: { id: storeId }, data });
    },
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
    name: text({ validation: { isRequired: true }, defaultValue: 'Juniper Market' }),
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
    logoUrl: text({ defaultValue: '/logo.svg' }),
    brandHue: integer({
      validation: { min: 0, max: 359 },
      label: 'Storefront brand hue (0–359)',
      ui: { description: 'Leave unset to use the explicit storefront default. Use Platform Settings to choose a supported preset.' },
    }),
    currencyCode: text({ access: { update: () => false }, defaultValue: 'USD' }),
    taxRateBps: integer({ defaultValue: 875, validation: { isRequired: true, min: 0, max: 10_000 }, label: 'Default tax rate (basis points)' }),
    locale: text({ defaultValue: 'en-US' }),
    timezone: text({ defaultValue: 'America/Los_Angeles' }),
    countryCode: text({ defaultValue: 'US' }),
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
