import { gql } from 'graphql-request';
import { cache } from 'react';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export interface GroceryPaymentProviderOption {
  id: string;
  name: string;
  code: string;
  isInstalled: boolean;
}

export const listPaymentProviders = cache(async function listPaymentProviders(): Promise<GroceryPaymentProviderOption[]> {
  try {
    const response = await keystoneClient<{ activeCartPaymentProviders: GroceryPaymentProviderOption[] }>(gql`
      query ListPaymentProviders {
        activeCartPaymentProviders {
          id
          name
          code
          isInstalled
        }
      }
    `);

    if (!response.success) {
      throw new Error(response.error);
    }

    return response.data.activeCartPaymentProviders || [];
  } catch (error) {
    console.error('Error listing payment providers:', error);
    return [];
  }
});
