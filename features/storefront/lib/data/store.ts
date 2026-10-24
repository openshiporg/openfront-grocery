import { cache } from 'react';
import type { GroceryStore } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';
import { DEFAULT_STOREFRONT_BRAND_HUE } from '../branding';

const immutableBuildStore: GroceryStore = {
  id: 'immutable-build-placeholder',
  name: 'Storefront',
  brandHue: null,
  effectiveBrandHue: DEFAULT_STOREFRONT_BRAND_HUE,
};

// React.cache shares this read only within one server render/request. It does
// not retain settings or GraphQL errors across onboarding/navigation requests.
export const getStore = cache(async function getStore(): Promise<GroceryStore> {
  // Dynamic runtime identity cannot be fetched during the immutable compile.
  // This placeholder is never a runtime outage fallback and carries no retailer identity.
  if (process.env.GROCERY_IMMUTABLE_BUILD === 'true') return immutableBuildStore;

  const { data, errors } = await storefrontGraphQL<{
    publicGroceryStorefrontSettings: GroceryStore;
  }>(
    `
      query GetPublicGroceryStorefrontSettings {
        publicGroceryStorefrontSettings {
          id
          name
          setupIncomplete
          tagline
          homepageTitle
          homepageDescription
          contactEmail
          contactPhone
          address
          logoUrl
          logoIcon
          logoColor
          brandHue
          effectiveBrandHue
          currencyCode
          locale
          timezone
          countryCode
          openingHours
          policyNotes
          deliveryPostalPrefixes
          deliveryMinimumCents
          pickupMinimumCents
        }
      }
    `,
    undefined,
    // GraphQL failures also return HTTP 200. Caching that response can keep a
    // newly onboarded store unavailable after its settings have been created.
    { cache: 'no-store' },
  );
  throwGraphQLErrors(errors);
  const settings = data?.publicGroceryStorefrontSettings;
  if (!settings?.id) {
    throw new Error('The public grocery storefront is not configured');
  }
  // A store still using its setup placeholder name is shown as "being set up".
  return { ...settings, name: settings.name?.trim() || '', setupIncomplete: Boolean(settings.setupIncomplete || !settings.name?.trim()) };
});
