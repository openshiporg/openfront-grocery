import type { GroceryStore } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';
import { DEFAULT_STOREFRONT_BRAND_HUE } from '../branding';

const immutableBuildStore: GroceryStore = {
  id: 'immutable-build-placeholder',
  name: 'Storefront',
  brandHue: null,
  effectiveBrandHue: DEFAULT_STOREFRONT_BRAND_HUE,
};

export async function getStore(): Promise<GroceryStore> {
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
          tagline
          homepageTitle
          homepageDescription
          contactEmail
          contactPhone
          address
          logoUrl
          brandHue
          effectiveBrandHue
          currencyCode
          locale
          timezone
          countryCode
        }
      }
    `,
    undefined,
    { next: { revalidate: 300 } },
  );
  throwGraphQLErrors(errors);
  const settings = data?.publicGroceryStorefrontSettings;
  if (!settings?.id || !settings.name?.trim()) {
    throw new Error('The public grocery storefront is not configured');
  }
  return settings;
}
