import { list } from '@keystone-6/core';
import { checkbox, json, relationship, text } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { trackingFields } from './trackingFields';

export const PaymentProvider = list({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: permissions.canManagePayments,
      update: permissions.canManagePayments,
      delete: permissions.canManagePayments,
    },
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
    credentials: json({
      defaultValue: {},
    }),
    metadata: json({
      defaultValue: {},
    }),
    createPaymentFunction: text({ validation: { isRequired: true }, defaultValue: 'manual' }),
    capturePaymentFunction: text({ validation: { isRequired: true }, defaultValue: 'manual' }),
    refundPaymentFunction: text({ validation: { isRequired: true }, defaultValue: 'manual' }),
    getPaymentStatusFunction: text({ validation: { isRequired: true }, defaultValue: 'manual' }),
    generatePaymentLinkFunction: text({ validation: { isRequired: true }, defaultValue: 'manual' }),
    handleWebhookFunction: text({ validation: { isRequired: true }, defaultValue: 'manual' }),
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
