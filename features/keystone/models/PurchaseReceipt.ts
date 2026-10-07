import { list } from '@keystone-6/core';
import { text, integer, decimal, select, relationship, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const PurchaseReceipt = list({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    purchaseOrder: relationship({ ref: 'PurchaseOrder' }), poItem: relationship({ ref: 'POItem' }), inventoryLot: relationship({ ref: 'InventoryLot' }), supplier: relationship({ ref: 'Supplier' }), product: relationship({ ref: 'Product' }),
    supplierLotNumber: text({ isIndexed: true }), deliveryReference: text(), quantity: decimal({ precision: 18, scale: 3 }), targetQuantityReceived: decimal({ precision: 18, scale: 3 }), unitCostCents: integer(),
    conditionStatus: select({ options: ['accepted', 'inspection_pending', 'rejected'], validation: { isRequired: true } }), inspectionNote: text(), receivedBy: text(), expirationDate: timestamp(),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields,
  },
});
