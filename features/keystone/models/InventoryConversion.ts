import { list } from '@keystone-6/core';
import { integer, json, relationship, text, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';
export const InventoryConversion = list({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), inputFingerprint: text({ validation: { isRequired: true } }), reviewHash: text(),
    quantityCases: integer({ validation: { isRequired: true, min: 1 } }), unitsPerCase: integer({ validation: { isRequired: true, min: 2 } }), destinationQuantity: integer({ validation: { isRequired: true, min: 1 } }), totalCostCents: integer({ validation: { isRequired: true, min: 0 } }), currencyCode: text(),
    reason: text(), conditionNote: text(), actorId: text(), committedAt: timestamp(), sourceSnapshot: json(), destinations: json(),
    sourceInventoryLot: relationship({ ref: 'InventoryLot' }), sourceProduct: relationship({ ref: 'Product' }), destinationProduct: relationship({ ref: 'Product' }),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields,
  },
});
