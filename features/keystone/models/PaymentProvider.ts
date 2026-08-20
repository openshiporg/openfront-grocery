import { list } from '@keystone-6/core';
import { checkbox, json, relationship, text } from '@keystone-6/core/fields';
import { trackingFields } from './trackingFields';

export const PaymentProvider = list({
  access: {
    // This is an immutable deployment-wide adapter registry populated only by
    // onboarding/seed code. Tenant operators cannot alter another Store's
    // checkout configuration through generic CRUD.
    operation: { query: () => false, create: () => false, update: () => false, delete: () => false },
  },
  ui: {
    listView: {
      initialColumns: ['name', 'code', 'isInstalled'],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
    }),
    code: text({
      isIndexed: 'unique',
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: 'Payment provider code must start with pp_',
        },
      },
    }),
    isInstalled: checkbox({
      defaultValue: true,
    }),
    metadata: json({
      defaultValue: {},
      ui: {
        description: 'Non-secret display metadata only. Adapter secrets are read from server environment variables.',
      },
    }),
    payments: relationship({
      ref: 'Payment.paymentProvider',
      many: true,
    }),
    sessions: relationship({
      ref: 'PaymentSession.paymentProvider',
      many: true,
    }),
    ...trackingFields,
  },
});
