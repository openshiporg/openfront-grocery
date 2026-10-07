import { list } from '@keystone-6/core';
import { decimal, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { currentMembershipRelatedStoreScopedFilter } from '../lib/storeAccess';

export const PaymentRefund = list({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: { query: currentMembershipRelatedStoreScopedFilter('payment'), update: currentMembershipRelatedStoreScopedFilter('payment'), delete: currentMembershipRelatedStoreScopedFilter('payment') },
  },
  hooks: {
    validate: {
      update: async ({ resolvedData, addValidationError }) => {
        const immutableFields = [
          'idempotencyKey',
          'amount',
          'amountCents',
          'payment',
          'providerCode',
          'providerPaymentId',
          'requestedBy',
        ];
        if (immutableFields.some((field) => resolvedData[field] !== undefined)) {
          addValidationError('Refund request and ownership evidence are immutable');
        }
      },
      delete: async ({ addValidationError }) => {
        addValidationError('Refund evidence cannot be deleted');
      },
    },
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true }, access: { update: () => false } }),
    amount: decimal({ precision: 10, scale: 2, validation: { isRequired: true }, access: { update: () => false } }),
    amountCents: integer({ validation: { isRequired: true, min: 1 }, access: { update: () => false } }),
    status: select({
      type: 'enum',
      options: [
        { label: 'Processing', value: 'processing' },
        { label: 'Succeeded', value: 'succeeded' },
        { label: 'Failed', value: 'failed' },
        { label: 'Canceled', value: 'canceled' },
      ],
      defaultValue: 'processing',
      validation: { isRequired: true },
    }),
    providerCode: text({ validation: { isRequired: true }, access: { update: () => false } }),
    providerPaymentId: text({ validation: { isRequired: true }, access: { update: () => false } }),
    providerRefundId: text({ access: { update: () => false } }),
    providerStatus: text({ access: { update: () => false } }),
    providerData: json({ defaultValue: {}, access: { read: () => false, update: () => false } }),
    providerEventId: text({ db: { isNullable: true }, access: { update: () => false } }),
    providerEventCreatedAt: timestamp({ db: { isNullable: true }, access: { update: () => false } }),
    providerEventVersion: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    failureMessage: text({ access: { read: () => false, update: () => false } }),
    reconciliationAttempts: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    reconciliationOwner: text({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationToken: text({ db: { isNullable: true }, access: { read: () => false, update: () => false } }),
    reconciliationLeaseExpiresAt: timestamp({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationNextAttemptAt: timestamp({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationDeadLetterAt: timestamp({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationLastError: text({ db: { isNullable: true }, access: { read: () => false, update: () => false } }),
    requestedAt: timestamp({ validation: { isRequired: true }, access: { update: () => false } }),
    processedAt: timestamp({ access: { update: () => false } }),
    payment: relationship({
      ref: 'Payment.refunds',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
    }),
    requestedBy: relationship({
      ref: 'User.paymentRefunds',
      access: { update: () => false },
    }),
    ...trackingFields,
  },
});
