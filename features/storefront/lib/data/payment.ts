import { cache } from 'react';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

export interface GroceryPaymentProviderOption {
  id: string;
  name: string;
  code: string;
  isInstalled: boolean;
}

export const listPaymentProviders = cache(async function listPaymentProviders(): Promise<GroceryPaymentProviderOption[]> {
  try {
    const { data, errors } = await storefrontGraphQL<{
      activeCartPaymentProviders?: GroceryPaymentProviderOption[];
    }>(`
      query ListPaymentProviders {
        activeCartPaymentProviders {
          id
          name
          code
          isInstalled
        }
      }
    `, undefined, { cache: 'no-store' });

    throwGraphQLErrors(errors);

    return data?.activeCartPaymentProviders || [];
  } catch (error) {
    console.error('Error listing payment providers:', error);
    return [];
  }
});
