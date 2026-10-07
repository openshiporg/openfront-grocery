import { list } from '@keystone-6/core';
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { trackingFields } from './trackingFields';

export const SettlementMatch = list({
  access: { operation: { query: permissions.canManagePayments, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    sourceKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    store: relationship({ ref: 'Store' }), recordedBy: relationship({ ref: 'User' }), payment: relationship({ ref: 'Payment' }),
    providerCode: text({ validation: { isRequired: true } }), statementReference: text({ validation: { isRequired: true } }), entryReference: text({ validation: { isRequired: true } }),
    paymentReference: text({ validation: { isRequired: true } }), refundReference: text(), payoutReference: text(), currencyCode: text(),
    entryType: select({ options: ['capture', 'refund'], validation: { isRequired: true } }),
    amountCents: integer({ validation: { isRequired: true, min: 0 } }), feeCents: integer({ validation: { isRequired: true, min: 0 } }), netCents: integer({ validation: { isRequired: true } }),
    settledAt: timestamp({ validation: { isRequired: true } }),
    status: select({ options: ['matched', 'unresolved'], defaultValue: 'unresolved' }),
    reason: text(), evidence: json(),
    ...trackingFields,
  },
});
