import { list } from '@keystone-6/core';
import { text, json, relationship, select, timestamp } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { trackingFields } from './trackingFields';
export const StaffInvitation = list({
  access: { operation: { query: permissions.canManageUsers, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    store: relationship({ ref: 'Store' }), email: text({ validation: { isRequired: true } }), name: text({ validation: { isRequired: true } }),
    tokenHash: text({ isIndexed: 'unique', access: { read: () => false } }), capabilities: json(),
    status: select({ options: ['pending', 'accepted', 'revoked'], defaultValue: 'pending' }),
    expiresAt: timestamp({ validation: { isRequired: true } }), acceptedAt: timestamp(),
    invitedBy: relationship({ ref: 'User' }), acceptedUser: relationship({ ref: 'User' }),
    ...trackingFields,
  },
});
