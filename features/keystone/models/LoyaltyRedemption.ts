import { list } from '@keystone-6/core';
import { text, integer, json, select, relationship, timestamp } from '@keystone-6/core/fields';
import { isSignedIn, permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { trackingFields } from './trackingFields';

export const LoyaltyRedemption = list({
  access: {
    operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false },
    filter: {
      query: async ({ session, context }) => {
        const store = await storeScopedFilter({ session, context });
        if (store === false) return false;
        return await permissions.canManageOrders({ session, context })
          ? store
          : { AND: [store, { user: { id: { equals: session!.itemId } } }] };
      },
    },
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    points: integer({ validation: { isRequired: true, min: 1 } }), discountCents: integer({ validation: { isRequired: true, min: 1 } }),
    status: select({ options: ['issued', 'used', 'reversed'], defaultValue: 'issued' }),
    store: relationship({ ref: 'Store' }), user: relationship({ ref: 'User' }), program: relationship({ ref: 'LoyaltyProgram' }), coupon: relationship({ ref: 'Coupon' }), order: relationship({ ref: 'Order' }),
    usedAt: timestamp(), events: json(),
    ...trackingFields,
  },
});
