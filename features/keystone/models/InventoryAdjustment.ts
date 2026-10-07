import { list } from '@keystone-6/core';
import { decimal, relationship, select, text } from '@keystone-6/core/fields';

import { permissions } from '../access';
import { trackingFields } from './trackingFields';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { storeScopedFilter } from '../lib/storeAccess';

export const InventoryAdjustment = list({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter },
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    reason: select({
      type: 'enum',
      options: [
        { label: 'Cycle count', value: 'cycle_count' },
        { label: 'Damage', value: 'damage' },
        { label: 'Spoilage', value: 'spoilage' },
        { label: 'Correction', value: 'correction' },
      ],
      validation: { isRequired: true },
    }),
    quantityBefore: decimal({ precision: 18, scale: 3, validation: { isRequired: true } }),
    quantityAfter: decimal({ precision: 18, scale: 3, validation: { isRequired: true } }),
    quantityDelta: decimal({ precision: 18, scale: 3, validation: { isRequired: true } }),
    productStockBefore: decimal({ precision: 18, scale: 3, validation: { isRequired: true } }),
    productStockAfter: decimal({ precision: 18, scale: 3, validation: { isRequired: true } }),
    note: text(),
    store: relationship({
      ref: 'Store.inventoryAdjustments',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    product: relationship({ ref: 'Product' }),
    inventoryLot: relationship({ ref: 'InventoryLot' }),
    adjustedBy: relationship({ ref: 'User' }),
    ...trackingFields,
  },
});
