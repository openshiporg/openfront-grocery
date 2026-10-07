import { list } from '@keystone-6/core';
import { text, json, relationship, select, timestamp } from '@keystone-6/core/fields';
import { isSignedIn, permissions } from '../access';
import { trackingFields } from './trackingFields';
export const CustomerPrivacyRequest = list({
  access: { operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false }, filter: { query: async ({ session, context }) => {
    if (!session?.itemId) return false;
    const user = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { storeId: true } });
    if (!user?.storeId) return false;
    return await permissions.canManageUsers({ session, context }) ? { store: { id: { equals: user.storeId } } } : { user: { id: { equals: session.itemId } } };
  } } },
  fields: { store: relationship({ ref: 'Store' }), user: relationship({ ref: 'User' }), kind: select({ options: ['export', 'erasure'] }), status: select({ options: ['requested', 'deferred', 'completed', 'rejected'], defaultValue: 'requested' }), policyVersion: text(), reviewReason: text(), reviewedBy: relationship({ ref: 'User' }), reviewedAt: timestamp(), eligibleAt: timestamp(), completedAt: timestamp(), resultSummary: json(), ...trackingFields },
});
