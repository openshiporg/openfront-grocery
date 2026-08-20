import { list } from '@keystone-6/core';
import { integer, relationship, select, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { storeScopedFilter } from '../lib/storeAccess';

export const PaymentWebhookEvent = list({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter },
  },
  ui: {
    isHidden: true,
  },
  fields: {
    replayKey: text({
      isIndexed: 'unique',
      validation: { isRequired: true },
    }),
    providerCode: text({
      validation: { isRequired: true },
      isIndexed: true,
    }),
    providerEventId: text({
      validation: { isRequired: true },
      isIndexed: true,
    }),
    providerCreatedAt: timestamp({ db: { isNullable: true } }),
    providerVersion: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    eventType: text({
      validation: { isRequired: true },
    }),
    payloadHash: text({
      validation: { isRequired: true },
    }),
    claimToken: text({
      validation: { isRequired: true },
      access: { read: permissions.canManagePayments },
    }),
    status: select({
      type: 'enum',
      options: [
        { label: 'Processing', value: 'processing' },
        { label: 'Processed', value: 'processed' },
        { label: 'Ignored', value: 'ignored' },
        { label: 'Unmatched', value: 'unmatched' },
      ],
      defaultValue: 'processing',
      validation: { isRequired: true },
    }),
    paymentRecordId: text(),
    store: relationship({
      ref: 'Store.paymentWebhookEvents',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    payment: relationship({
      ref: 'Payment.webhookEvents',
      access: { update: () => false },
    }),
    processedAt: timestamp(),
    ...trackingFields,
  },
});
