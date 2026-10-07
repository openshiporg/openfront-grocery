import { list } from '@keystone-6/core';
import { text, json, select, relationship, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const InventoryRecall = list({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    reason: text({ validation: { isRequired: true } }), status: select({ options: ['open', 'closed'], defaultValue: 'open' }),
    scope: json(), affectedOrders: json(), events: json(), closure: json(), openedBy: text(), closedBy: text(), closedAt: timestamp(),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields,
  },
});
