import { list } from '@keystone-6/core';
import { integer, json, relationship } from '@keystone-6/core/fields';
import { isSignedIn } from '../access';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';
import { nestedRelatedStoreScopedFilter } from '../lib/storeAccess';

export const OrderLineInventoryAllocation = list({
  access: {
    operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false },
    filter: { query: nestedRelatedStoreScopedFilter('lineItem', 'order') },
  },
  fields: {
    lineItem: relationship({
      ref: 'OrderLineItem.inventoryAllocations',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    inventoryLot: relationship({
      ref: 'InventoryLot.orderLineAllocations',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    store: relationship({
      ref: 'Store.orderLineInventoryAllocations',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    quantity: integer({ validation: { isRequired: true, min: 1 }, access: { create: () => false, update: () => false } }),
    provenance: json({ access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
});
