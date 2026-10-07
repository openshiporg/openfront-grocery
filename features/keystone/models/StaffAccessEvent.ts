import { list } from '@keystone-6/core';
import { text, json, relationship } from '@keystone-6/core/fields';
import { permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { trackingFields } from './trackingFields';
export const StaffAccessEvent = list({
  access: { operation: { query: permissions.canManageUsers, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: { store: relationship({ ref: 'Store' }), actor: relationship({ ref: 'User' }), subject: relationship({ ref: 'User.staffAccessEvents' }), invitation: relationship({ ref: 'StaffInvitation' }), action: text(), reason: text(), before: json(), after: json(), ...trackingFields },
});
