import * as stripe from './stripe';
import * as test from './test';
import type { PaymentProviderAdapter } from './types';

export const STRIPE_PROVIDER_CODE = 'pp_stripe_default' as const;
export const TEST_PROVIDER_CODE = 'pp_test_default' as const;

export type PaymentProviderDefinition = {
  adapter: PaymentProviderAdapter;
  publicCheckout: boolean;
  credentialEnv: readonly string[];
};

// Provider codes and credential names are server-owned. Database metadata,
// function paths, URLs, and arbitrary credential names never select code.
export const paymentProviderAdapters = {
  [STRIPE_PROVIDER_CODE]: stripe,
  [TEST_PROVIDER_CODE]: test,
} satisfies Record<string, PaymentProviderAdapter>;

export const paymentProviderDefinitions = {
  [STRIPE_PROVIDER_CODE]: {
    adapter: paymentProviderAdapters[STRIPE_PROVIDER_CODE],
    publicCheckout: true,
    credentialEnv: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  },
  [TEST_PROVIDER_CODE]: {
    adapter: paymentProviderAdapters[TEST_PROVIDER_CODE],
    publicCheckout: false,
    credentialEnv: ['GROCERY_PAYMENT_TEST_SECRET'],
  },
} satisfies Record<string, PaymentProviderDefinition>;

export type SupportedPaymentProviderCode = keyof typeof paymentProviderDefinitions;

export function getPaymentProviderDefinition(providerCode: string): PaymentProviderDefinition {
  const definition = paymentProviderDefinitions[providerCode as SupportedPaymentProviderCode];
  if (!definition) throw new Error(`Unsupported payment provider: ${providerCode}`);
  return definition;
}

export function getPaymentProviderAdapter(providerCode: string): PaymentProviderAdapter {
  const adapter = paymentProviderAdapters[providerCode as SupportedPaymentProviderCode];
  if (!adapter) throw new Error(`Unsupported payment provider: ${providerCode}`);
  return adapter;
}

export function assertProviderCredentials(providerCode: string, operation: string) {
  const definition = getPaymentProviderDefinition(providerCode);
  const missing = definition.credentialEnv.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Payment provider ${providerCode} is not configured for ${operation}: missing ${missing.join(', ')}`);
}

export function assertPublicPaymentProvider(providerCode: string): asserts providerCode is SupportedPaymentProviderCode {
  const definition = getPaymentProviderDefinition(providerCode);
  if (!definition.publicCheckout && !(providerCode === TEST_PROVIDER_CODE && process.env.NODE_ENV !== 'production' && process.env.GROCERY_PAYMENT_TEST_SECRET)) {
    throw new Error(`Payment provider ${providerCode} is not enabled for public checkout`);
  }
}

export type { PaymentProviderAdapter, PaymentProviderRecord, PaymentWebhookResult } from './types';
