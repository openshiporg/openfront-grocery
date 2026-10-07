import { list } from '@keystone-6/core';
import { text, integer, decimal, json, relationship } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const InventoryMovement = list({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    sequence: integer({ validation: { isRequired: true }, isIndexed: true }),
    sourceType: text({ validation: { isRequired: true } }), sourceId: text({ validation: { isRequired: true } }),
    reason: text({ validation: { isRequired: true } }), actorId: text(),
    quantityBefore: decimal({ precision: 18, scale: 3 }), quantityAfter: decimal({ precision: 18, scale: 3 }), quantityDelta: decimal({ precision: 18, scale: 3 }),
    productStockBefore: decimal({ precision: 18, scale: 3 }), productStockAfter: decimal({ precision: 18, scale: 3 }),
    metadata: json(), product: relationship({ ref: 'Product' }), inventoryLot: relationship({ ref: 'InventoryLot' }), order: relationship({ ref: 'Order' }),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields,
  },
});
