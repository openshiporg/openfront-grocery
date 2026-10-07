import { list } from '@keystone-6/core';
import { text, integer, json, select, relationship, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const SupplierCredit = list({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    identityKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), responseIdentityKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    kind: select({ options: ['claim', 'credit', 'debit'], defaultValue: 'claim' }), status: select({ options: ['open', 'accepted', 'rejected'], defaultValue: 'open' }),
    reference: text(), amountCents: integer(), claimedAmountCents: integer(), currencyCode: text(), reason: text(), evidence: text(), openedBy: text(), resolvedBy: text(), resolvedAt: timestamp(), events: json(),
    supplier: relationship({ ref: 'Supplier' }), invoice: relationship({ ref: 'SupplierInvoice' }), receipt: relationship({ ref: 'PurchaseReceipt' }),
    store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields,
  },
});
