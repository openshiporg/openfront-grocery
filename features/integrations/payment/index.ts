import * as stripe from './stripe';
import * as test from './test';
import { stripeCheckoutActivated } from './stripeEnabled';
import type { PaymentProviderAdapter, PaymentProviderOperation, PaymentProviderRecord } from './types';

export const STRIPE_PROVIDER_CODE = 'pp_stripe_default' as const;
export const TEST_PROVIDER_CODE = 'pp_test_default' as const;

export type PaymentProviderDefinition = {
  adapterKey: 'stripe' | 'test';
  adapter: PaymentProviderAdapter;
  publicCheckout: boolean;
  /** Stripe's server-owned contract admits stable idempotent final capture. */
  supportsIdempotentCapture: boolean;
  credentialEnv: readonly string[];
};

// Provider codes and the built-in adapter contracts remain server-owned. A
// custom row may select only a registered local adapter or an admitted HTTPS
// origin; it can never name an import path or arbitrary module.
export const paymentProviderAdapters = {
  [STRIPE_PROVIDER_CODE]: stripe,
  [TEST_PROVIDER_CODE]: test,
} satisfies Record<string, PaymentProviderAdapter>;

export const paymentProviderDefinitions = {
  [STRIPE_PROVIDER_CODE]: {
    adapterKey: 'stripe',
    adapter: paymentProviderAdapters[STRIPE_PROVIDER_CODE],
    publicCheckout: true,
    supportsIdempotentCapture: true,
    credentialEnv: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
  },
  [TEST_PROVIDER_CODE]: {
    adapterKey: 'test',
    adapter: paymentProviderAdapters[TEST_PROVIDER_CODE],
    publicCheckout: false,
    supportsIdempotentCapture: false,
    credentialEnv: ['GROCERY_PAYMENT_TEST_SECRET'],
  },
} satisfies Record<string, PaymentProviderDefinition>;

export type SupportedPaymentProviderCode = keyof typeof paymentProviderDefinitions;

const PAYMENT_OPERATIONS: readonly PaymentProviderOperation[] = [
  'createPaymentFunction', 'capturePaymentFunction', 'refundPaymentFunction',
  'getPaymentStatusFunction', 'getRefundStatusFunction', 'cancelPaymentFunction',
  'generatePaymentLinkFunction', 'handleWebhookFunction',
];
const LOCAL_ADAPTER_CODES = new Set(['stripe', 'test']);

export function getPaymentProviderDefinition(providerCode: string): PaymentProviderDefinition {
  const definition = paymentProviderDefinitions[providerCode as SupportedPaymentProviderCode];
  if (!definition) throw new Error(`Unsupported payment provider: ${providerCode}`);
  return definition;
}

function configuredSelector(provider: PaymentProviderRecord, operation: PaymentProviderOperation) {
  const definition = paymentProviderDefinitions[provider.code as SupportedPaymentProviderCode];
  const selector = provider[operation] || definition?.adapterKey;
  if (typeof selector !== 'string' || !selector.trim() || selector === 'manual') {
    throw new Error(`Payment provider operation ${operation} is not configured`);
  }
  if (definition && selector !== definition.adapterKey) {
    throw new Error(`Built-in payment provider ${provider.code} cannot change its server-owned adapter`);
  }
  if (selector === 'test' && process.env.NODE_ENV === 'production') {
    throw new Error('The local test payment adapter is not available in production');
  }
  if (LOCAL_ADAPTER_CODES.has(selector)) return selector;

  let url: URL;
  try { url = new URL(selector); } catch { throw new Error('Unknown registered payment adapter'); }
  const allowedOrigins = (process.env.PAYMENT_ADAPTER_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !allowedOrigins.includes(url.origin)) {
    throw new Error('External payment adapter requires an explicitly allowed HTTPS origin');
  }
  return url.toString();
}

export function getConfiguredPaymentAdapterSelector(provider: PaymentProviderRecord, operation: PaymentProviderOperation) {
  return configuredSelector(provider, operation);
}

export function getLocalPaymentProviderAdapter(selector: string): PaymentProviderAdapter {
  if (selector === 'stripe') return paymentProviderAdapters[STRIPE_PROVIDER_CODE];
  if (selector === 'test') return paymentProviderAdapters[TEST_PROVIDER_CODE];
  throw new Error('Unknown registered payment adapter');
}

export function getPaymentProviderAdapter(provider: PaymentProviderRecord, operation: PaymentProviderOperation): PaymentProviderAdapter {
  const selector = configuredSelector(provider, operation);
  if (!LOCAL_ADAPTER_CODES.has(selector)) throw new Error('Configured payment adapter is remote');
  return getLocalPaymentProviderAdapter(selector);
}

export function projectRemoteProviderCredentials(provider: PaymentProviderRecord): Record<string, string> {
  const metadata = provider.metadata && typeof provider.metadata === 'object' && !Array.isArray(provider.metadata)
    ? provider.metadata as Record<string, unknown> : {};
  const credentials = provider.credentials && typeof provider.credentials === 'object' && !Array.isArray(provider.credentials)
    ? provider.credentials as Record<string, unknown> : {};
  const selected = metadata.remoteCredentialKeys;
  if (selected === undefined) throw new Error('External payment credential selection must be explicit');
  if (!Array.isArray(selected) || selected.length > 20) throw new Error('External payment credential selection is invalid');
  const output: Record<string, string> = {};
  for (const candidate of selected) {
    if (typeof candidate !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(candidate) || Object.hasOwn(output, candidate)) {
      throw new Error('External payment credential selection is invalid');
    }
    const value = Object.hasOwn(credentials, candidate) ? credentials[candidate] : undefined;
    if (typeof value !== 'string' || !value.trim() || value.length > 4096) {
      throw new Error(`External payment provider is missing selected credential ${candidate}`);
    }
    output[candidate] = value;
  }
  return output;
}

export function assertProviderCredentials(providerOrCode: PaymentProviderRecord | string, operation: PaymentProviderOperation) {
  const provider = typeof providerOrCode === 'string' ? null : providerOrCode;
  const definition = typeof providerOrCode === 'string' ? getPaymentProviderDefinition(providerOrCode) : paymentProviderDefinitions[providerOrCode.code as SupportedPaymentProviderCode];
  if (!provider && !definition) throw new Error(`Unsupported payment provider: ${providerOrCode}`);
  const selector = provider ? configuredSelector(provider, operation) : definition!.adapterKey;

  if (selector === 'stripe') {
    const required = definition?.credentialEnv || ['STRIPE_SECRET_KEY', ...(operation === 'handleWebhookFunction' ? ['STRIPE_WEBHOOK_SECRET'] : [])];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`Payment provider ${provider?.code || providerOrCode} is not configured for ${operation}: missing ${missing.join(', ')}`);
    return;
  }
  if (selector === 'test') {
    if (!process.env.GROCERY_PAYMENT_TEST_SECRET || process.env.NODE_ENV === 'production') {
      throw new Error(`Payment provider ${provider?.code || providerOrCode} is not configured for ${operation}`);
    }
    return;
  }
  // configuredSelector already checks the deployment allowlist and forbids
  // HTTP, credentials in URLs, query strings, fragments, and redirects.
  if (!provider || !provider.isInstalled) throw new Error('External payment provider is not installed');
  const credentials = provider.credentials;
  if (credentials !== undefined && credentials !== null && (typeof credentials !== 'object' || Array.isArray(credentials))) {
    throw new Error('External payment credentials must be a JSON object');
  }
  projectRemoteProviderCredentials(provider);
}

export function isPaymentProviderConfigured(provider: PaymentProviderRecord) {
  if (!provider?.isInstalled) return false;
  try {
    for (const operation of PAYMENT_OPERATIONS) assertProviderCredentials(provider, operation);
    return true;
  } catch {
    return false;
  }
}

export function assertIdempotentCaptureProvider(providerOrCode: PaymentProviderRecord | string) {
  const provider = typeof providerOrCode === 'string' ? null : providerOrCode;
  const definition = typeof providerOrCode === 'string' ? getPaymentProviderDefinition(providerOrCode) : paymentProviderDefinitions[providerOrCode.code as SupportedPaymentProviderCode];
  const supported = definition?.supportsIdempotentCapture || (!definition && provider?.supportsIdempotentCapture === true);
  if (!supported) {
    const code = provider?.code || providerOrCode;
    throw new Error(`Payment provider ${code} does not provide idempotent capture required for final-sale settlement`);
  }
  if (provider && !definition) {
    const evidence = provider.captureIdempotencyEvidence || '';
    let url: URL;
    try { url = new URL(evidence); } catch { throw new Error('Custom idempotent capture requires HTTPS provider-contract evidence'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Custom idempotent capture requires HTTPS provider-contract evidence');
    configuredSelector(provider, 'capturePaymentFunction');
  }
}

export function isPublicPaymentProviderEnabled(providerOrCode: PaymentProviderRecord | string): boolean {
  const provider = typeof providerOrCode === 'string' ? null : providerOrCode;
  const definition = typeof providerOrCode === 'string' ? getPaymentProviderDefinition(providerOrCode) : paymentProviderDefinitions[providerOrCode.code as SupportedPaymentProviderCode];
  const code = provider?.code || String(providerOrCode);
  const persistedOptIn = provider ? provider.publicCheckout === true : definition?.publicCheckout === true;
  return persistedOptIn && (code !== STRIPE_PROVIDER_CODE || stripeCheckoutActivated());
}

export function assertPublicPaymentProvider(providerOrCode: PaymentProviderRecord | string): void {
  const provider = typeof providerOrCode === 'string' ? null : providerOrCode;
  const definition = typeof providerOrCode === 'string' ? getPaymentProviderDefinition(providerOrCode) : paymentProviderDefinitions[providerOrCode.code as SupportedPaymentProviderCode];
  const code = provider?.code || String(providerOrCode);
  if (code === STRIPE_PROVIDER_CODE && !stripeCheckoutActivated()) {
    throw new Error('Stripe checkout is disabled for new payments unless STRIPE_ENABLED=true');
  }
  if (!isPublicPaymentProviderEnabled(providerOrCode)) {
    throw new Error(`Payment provider ${code} is not enabled for public checkout`);
  }
  if (!provider && !definition) throw new Error(`Unsupported payment provider: ${code}`);
  if (provider) {
    if (!provider.isInstalled || !isPaymentProviderConfigured(provider)) throw new Error(`Payment provider ${code} is not configured for public checkout`);
    assertIdempotentCaptureProvider(provider);
  }
}

export type { PaymentProviderAdapter, PaymentProviderOperation, PaymentProviderRecord, PaymentWebhookResult } from './types';
