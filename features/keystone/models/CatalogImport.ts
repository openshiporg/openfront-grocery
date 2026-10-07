import { list } from '@keystone-6/core';
import { integer, json, relationship, text, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const CatalogImport = list({
  access: { operation: { query: permissions.canManageProducts, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    identityKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    sourceSystem: text({ validation: { isRequired: true } }), sourceBatchId: text({ validation: { isRequired: true } }),
    schemaVersion: integer({ validation: { isRequired: true } }), payloadHash: text({ validation: { isRequired: true } }), reviewHash: text({ validation: { isRequired: true } }),
    currencyCode: text({ validation: { isRequired: true } }), rowCount: integer({ validation: { isRequired: true } }),
    rows: json(), result: json(), committedAt: timestamp({ validation: { isRequired: true } }), actorId: text({ validation: { isRequired: true } }),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields,
  },
});
