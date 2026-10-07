import { list } from '@keystone-6/core';
import { text, integer, json, select, relationship, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const SupplierInvoice = list({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    identityKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    invoiceNumber: text({ validation: { isRequired: true } }), supplierName: text(), currencyCode: text({ validation: { isRequired: true } }),
    invoiceDate: timestamp({ validation: { isRequired: true } }), dueDate: timestamp(), documentReference: text(),
    status: select({ options: ['captured', 'variance', 'approved', 'settled', 'voided'], defaultValue: 'captured' }),
    lines: json(), subtotalCents: integer(), taxCents: integer(), freightCents: integer(), grossCents: integer(), expectedCents: integer(), varianceCents: integer(),
    capturedBy: text(), approvedBy: text(), approvedAt: timestamp(), settledBy: text(), settledAt: timestamp(), settlement: json(), events: json(), inputFingerprint: text(),
    supplier: relationship({ ref: 'Supplier' }),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields,
  },
});
