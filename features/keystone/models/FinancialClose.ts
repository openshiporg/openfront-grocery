import { list } from '@keystone-6/core';
import { json, relationship, select, text, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { trackingFields } from './trackingFields';

export const FinancialClose = list({
  access: { operation: { query: permissions.canManagePayments, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    store: relationship({ ref: 'Store' }), recordedBy: relationship({ ref: 'User' }),
    periodStart: timestamp({ validation: { isRequired: true } }), periodEnd: timestamp({ validation: { isRequired: true } }),
    timezone: text({ validation: { isRequired: true } }), cutoff: timestamp({ validation: { isRequired: true } }),
    status: select({ options: ['reconciled', 'closed_with_exceptions'], validation: { isRequired: true } }),
    note: text(), contentHash: text({ validation: { isRequired: true } }), snapshot: json(),
    ...trackingFields,
  },
});
