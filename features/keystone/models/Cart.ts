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

export const Cart = list({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }),
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders,
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
