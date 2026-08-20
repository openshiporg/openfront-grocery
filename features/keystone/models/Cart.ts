import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  timestamp,
  float,
  integer,
} from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma, uniqueRelationshipPrisma } from './relationshipConfig';
import { storeScopedFilter } from '../lib/storeAccess';

export const Cart = list({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter,
    },
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      const storeId = context.session?.data.store?.id || process.env.PUBLIC_STORE_ID || 'store_juniper';
      const store = await context.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, isActive: true } });
      if (!store?.isActive) throw new Error('An active store is required');
      return { ...resolvedData, store: { connect: { id: store.id } } };
    },
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["id", "customer", "sessionId", "itemCount", "createdAt"],
    },
  },
  fields: {
    // For logged-in users
    store: relationship({
      ref: 'Store.carts',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
    }),
    customer: relationship({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: uniqueRelationshipPrisma },
      ref: "User",
      label: "Customer",
      ui: {
        description: "The logged-in user who owns this cart",
      },
    }),
    // For guest users
    sessionId: text({
      label: "Session ID",
      isIndexed: 'unique',
      ui: {
        description: "Session identifier for guest carts",
      },
    }),
    // Cart items relationship
    items: relationship({
      ref: "CartItem.cart",
      many: true,
      label: "Cart Items",
    }),
    paymentSessions: relationship({
      ref: 'PaymentSession.cart',
      many: true,
      label: 'Payment Sessions',
    }),
    checkoutAttempts: relationship({ ref: 'CheckoutAttempt.cart', many: true }),
    // Calculated fields (cached for performance)
    itemCount: integer({
      defaultValue: 0,
      label: "Item Count",
      ui: {
        description: "Total number of items in cart",
      },
    }),
    subtotal: float({
      defaultValue: 0,
      label: "Legacy display subtotal",
      ui: {
        description: "Cart subtotal before tax and fees",
      },
    }),
    subtotalCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Authoritative subtotal (minor units)' }),
    // Cart expiration for guest carts
    expiresAt: timestamp({
      label: "Expires At",
      ui: {
        description: "When this cart expires (for guest carts)",
      },
    }),
    ...trackingFields,
  },
});
