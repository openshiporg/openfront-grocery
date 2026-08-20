import { list } from '@keystone-6/core';
import { integer, json, relationship, text, timestamp } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { storeScopedFilter } from '../lib/storeAccess';

const DELIVERY_FIELDS = new Set([
  'status',
  'attempts',
  'claimToken',
  'claimedAt',
  'deliveredAt',
  'lastError',
]);

export const GroceryOutboxEvent = list({
  access: {
    operation: {
      query: permissions.canManageOnboarding,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter },
  },
  hooks: {
    validate: {
      update: async ({ resolvedData, addValidationError }) => {
        const invalid = Object.keys(resolvedData).filter((key) => !DELIVERY_FIELDS.has(key));
        if (invalid.length) addValidationError('Outbox event identity and payload are immutable');
      },
      delete: async ({ addValidationError }) => {
        addValidationError('Outbox event evidence cannot be deleted');
      },
    },
  },
  ui: {
    labelField: 'eventKey',
    listView: { initialColumns: ['eventType', 'aggregateType', 'aggregateId', 'status', 'attempts', 'occurredAt'] },
  },
  fields: {
    store: relationship({
      ref: 'Store.outboxEvents',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
    }),
    eventKey: text({ isIndexed: 'unique', validation: { isRequired: true }, access: { update: () => false } }),
    eventType: text({ validation: { isRequired: true }, access: { update: () => false } }),
    aggregateType: text({ validation: { isRequired: true }, access: { update: () => false } }),
    aggregateId: text({ validation: { isRequired: true }, isIndexed: true, access: { update: () => false } }),
    schemaVersion: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 }, access: { update: () => false } }),
    payload: json({ access: { update: () => false } }),
    payloadHash: text({ validation: { isRequired: true }, access: { update: () => false } }),
    occurredAt: timestamp({ validation: { isRequired: true }, isIndexed: true, access: { update: () => false } }),
    status: text({ defaultValue: 'pending', isIndexed: true }),
    attempts: integer({ defaultValue: 0, validation: { min: 0 } }),
    claimToken: text(),
    claimedAt: timestamp(),
    deliveredAt: timestamp(),
    lastError: text({ ui: { displayMode: 'textarea' } }),
    ...trackingFields,
  },
});
