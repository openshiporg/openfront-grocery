import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  timestamp,
  float,
  integer,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";

export const Cart = list({
  access: {
    operation: {
      query: () => true, // Public can view carts (with filter for own cart)
      create: () => true, // Anyone can create a cart (guest or logged in)
      update: () => true, // Update allowed with filter
      delete: () => true, // Delete allowed with filter
    },
    filter: {
      query: ({ session }) => {
        if (session?.itemId) {
          return {
            OR: [
              { customer: { id: { equals: session.itemId } } },
              {
                AND: [
                  { customer: { id: { equals: null } } },
                  { sessionId: { equals: '__guest_resolver_only__' } },
                ],
              },
            ],
          };
        }
        return { sessionId: { equals: '__guest_resolver_only__' } };
      },
      update: ({ session }) => {
        if (session?.itemId) {
          return { customer: { id: { equals: session.itemId } } };
        }
        return { sessionId: { equals: '__guest_resolver_only__' } };
      },
      delete: ({ session }) => {
        if (session?.itemId) {
          return { customer: { id: { equals: session.itemId } } };
        }
        return { sessionId: { equals: '__guest_resolver_only__' } };
      },
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
    customer: relationship({
      ref: "User",
      label: "Customer",
      ui: {
        description: "The logged-in user who owns this cart",
      },
    }),
    // For guest users
    sessionId: text({
      label: "Session ID",
      isIndexed: true,
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
      label: "Subtotal",
      ui: {
        description: "Cart subtotal before tax and fees",
      },
    }),
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
