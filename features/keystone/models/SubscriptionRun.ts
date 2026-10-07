import { list } from '@keystone-6/core';
import { text, integer, json, select, relationship, timestamp } from '@keystone-6/core/fields';
import { isSignedIn, permissions } from '../access';
import { storeScopedFilter } from '../lib/storeAccess';
import { requiredRelationshipPrisma } from './relationshipConfig';
import { trackingFields } from './trackingFields';

export const SubscriptionRun = list({
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
    subscription: relationship({ ref: 'Subscription' }), store: relationship({ ref: 'Store', db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }), user: relationship({ ref: 'User' }),
    dueAt: timestamp({ validation: { isRequired: true } }), status: select({ options: ['awaiting_checkout', 'blocked_cart', 'blocked_stock', 'ordered', 'skipped', 'cancelled'], validation: { isRequired: true } }),
    product: relationship({ ref: 'Product' }), productTitle: text(), quantity: integer(), priceCents: integer(),
    cart: relationship({ ref: 'Cart' }), cartItemId: text(), order: relationship({ ref: 'Order' }), failureReason: text(), events: json(),
    ...trackingFields,
  },
});
