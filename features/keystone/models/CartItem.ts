import { list } from "@keystone-6/core";
import {
  integer,
  relationship,
  timestamp,
  select,
  float,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";

export const CartItem = list({
  access: {
    operation: {
      query: () => true, // Public can view cart items
      create: () => true, // Anyone can create cart items
      update: () => true, // Update allowed
      delete: () => true, // Delete allowed
    },
    filter: {
      query: ({ session }) => {
        if (session?.itemId) {
          return {
            cart: {
              customer: { id: { equals: session.itemId } },
            },
          };
        }
        return {
          cart: {
            sessionId: { equals: '__guest_resolver_only__' },
          },
        };
      },
      update: ({ session }) => {
        if (session?.itemId) {
          return {
            cart: {
              customer: { id: { equals: session.itemId } },
            },
          };
        }
        return {
          cart: {
            sessionId: { equals: '__guest_resolver_only__' },
          },
        };
      },
      delete: ({ session }) => {
        if (session?.itemId) {
          return {
            cart: {
              customer: { id: { equals: session.itemId } },
            },
          };
        }
        return {
          cart: {
            sessionId: { equals: '__guest_resolver_only__' },
          },
        };
      },
    },
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["id", "cart", "product", "quantity", "subtotal", "addedAt"],
    },
  },
  fields: {
    // Cart relationship
    cart: relationship({
      ref: "Cart.items",
      label: "Cart",
      ui: {
        description: "The cart this item belongs to",
      },
    }),
    // Product relationship
    product: relationship({
      ref: "Product",
      label: "Product",
      ui: {
        description: "The product in this cart item",
      },
    }),
    // Quantity
    quantity: integer({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: {
        description: "Number of units in cart",
      },
    }),
    // Calculated subtotal for this item
    subtotal: float({
      defaultValue: 0,
      label: "Subtotal",
      ui: {
        description: "Price x Quantity",
      },
    }),
    // Grocery-specific: substitution preference
    substitutionPreference: select({
      type: "enum",
      options: [
        { label: "Allow Substitution", value: "allow" },
        { label: "Contact Me", value: "contact" },
        { label: "Remove Item", value: "remove" },
      ],
      defaultValue: "allow",
      label: "Substitution Preference",
      ui: {
        description: "What to do if item is out of stock during picking",
      },
    }),
    // When this item was added
    addedAt: timestamp({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Added At",
      ui: {
        description: "When this item was added to cart",
      },
    }),
    ...trackingFields,
  },
});
