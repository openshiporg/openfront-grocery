import { list } from '@keystone-6/core';
import { checkbox, json, relationship, text } from '@keystone-6/core/fields';
import { trackingFields } from './trackingFields';
import { canAdministerPaymentProviders, canReadPaymentProviderConfiguration } from '../lib/providerAuthority';

// Provider settings affect every Store in this deployment, so writes need
// explicit deployment authority (see providerAuthority); Store staff with
// payments + onboarding may read the non-secret configuration.
const canManageProviderConfiguration = canAdministerPaymentProviders;

const adapterSelector = () => text({
  defaultValue: 'manual',
  access: { create: canManageProviderConfiguration, update: canManageProviderConfiguration },
  ui: { description: 'Use a registered local adapter key (stripe/test) or an HTTPS URL on PAYMENT_ADAPTER_ALLOWED_ORIGINS.' },
});

export const PaymentProvider = list({
  access: {
    operation: {
      query: canReadPaymentProviderConfiguration,
      create: canManageProviderConfiguration,
      update: canManageProviderConfiguration,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'code', 'isInstalled', 'publicCheckout', 'supportsIdempotentCapture'],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      access: { create: canManageProviderConfiguration, update: canManageProviderConfiguration },
    }),
    code: text({
      isIndexed: 'unique',
      access: { create: canManageProviderConfiguration, update: () => false },
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: 'Payment provider code must start with pp_',
        },
      },
    }),
    isInstalled: checkbox({
      defaultValue: false,
      access: { create: canManageProviderConfiguration, update: canManageProviderConfiguration },
    }),
    publicCheckout: checkbox({
      defaultValue: false,
      access: { create: canManageProviderConfiguration, update: canManageProviderConfiguration },
    }),
    supportsIdempotentCapture: checkbox({
      defaultValue: false,
      access: { create: canManageProviderConfiguration, update: canManageProviderConfiguration },
    }),
    captureIdempotencyEvidence: text({
      defaultValue: '',
      access: { create: canManageProviderConfiguration, update: canManageProviderConfiguration },
      ui: { description: 'HTTPS provider-contract evidence required before custom idempotent capture is accepted; the deployment owner must review the provider retention contract.' },
    }),
    credentials: json({
      defaultValue: {},
      access: { read: () => false, create: canManageProviderConfiguration, update: canManageProviderConfiguration },
      ui: { description: 'Provider credentials are server-only and are never readable through GraphQL.' },
    }),
    createPaymentFunction: adapterSelector(),
    capturePaymentFunction: adapterSelector(),
    refundPaymentFunction: adapterSelector(),
    getPaymentStatusFunction: adapterSelector(),
    getRefundStatusFunction: adapterSelector(),
    cancelPaymentFunction: adapterSelector(),
    generatePaymentLinkFunction: adapterSelector(),
    handleWebhookFunction: adapterSelector(),
    metadata: json({
      defaultValue: {},
      access: { create: canManageProviderConfiguration, update: canManageProviderConfiguration },
      ui: {
        description: 'Non-secret provider display metadata. Remote adapters must explicitly set remoteCredentialKeys; an empty list means no credentials are sent. Every selected key must exist as a non-empty string. remoteWebhookHeaders controls signature-header projection. Configuration changes are deployment-wide.',
      },
    }),
    payments: relationship({
      ref: 'Payment.paymentProvider',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    sessions: relationship({
      ref: 'PaymentSession.paymentProvider',
      many: true,
      access: { create: () => false, update: () => false },
    }),
    ...trackingFields,
  },
});
