import { list } from '@keystone-6/core';
import { text, decimal, json, select, relationship, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const InventoryCount = list({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: select({ options: ['observed', 'recounted', 'approved'], defaultValue: 'observed' }),
    inventoryLot: relationship({ ref: 'InventoryLot' }), product: relationship({ ref: 'Product' }),
    expectedQuantity: decimal({ precision: 18, scale: 3 }), observedQuantity: decimal({ precision: 18, scale: 3 }), recountQuantity: decimal({ precision: 18, scale: 3 }),
    observedBy: text(), recountedBy: text(), approvedBy: text(), reason: text(), events: json(), approvedAt: timestamp(),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields,
  },
});
