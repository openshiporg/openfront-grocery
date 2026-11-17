import { list } from '@keystone-6/core';
import { decimal, json, relationship } from '@keystone-6/core/fields';
import { isSignedIn, permissions } from '../access';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';
import { nestedRelatedStoreScopedFilter } from '../lib/storeAccess';

export const OrderLineInventoryAllocation = list({
  access: {
    operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false },
    filter: {
      // Staff see the store's allocations; a shopper sees only allocations on their own orders.
      query: async ({ session, context }) => {
        const store = await nestedRelatedStoreScopedFilter('lineItem', 'order')({ session, context });
        if (store === false) return false;
        if (await permissions.canAccessDashboard({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { lineItem: { order: { user: { id: { equals: session.itemId } } } } }] };
        return false;
      },
    },
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
      // Nullable on read: roles without InventoryLot access cannot resolve it.
      graphql: { isNonNull: { create: true } },
      access: { create: () => false, update: () => false },
    }),
    store: relationship({
      ref: 'Store.orderLineInventoryAllocations',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    quantity: decimal({ precision: 18, scale: 3, validation: { isRequired: true, min: "0.001" }, access: { create: () => false, update: () => false } }),
    provenance: json({ access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
});
