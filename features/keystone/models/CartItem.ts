import { list } from "@keystone-6/core";
import {
  integer,
  relationship,
  timestamp,
  select,
  float,
} from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { relatedStoreScopedFilter } from '../lib/storeAccess';

export const CartItem = list({
  db: {
    extendPrismaSchema: (schema) => schema.replace(/\n}$/, '\n  @@unique([cartId, productId])\n}'),
  },
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: relatedStoreScopedFilter('cart'),
      delete: relatedStoreScopedFilter('cart'),
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
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Cart.items",
      label: "Cart",
      ui: {
        description: "The cart this item belongs to",
      },
    }),
    // Product relationship
    product: relationship({
      ref: "Product",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
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
      label: "Legacy display subtotal",
      ui: {
        description: "Price x Quantity",
      },
    }),
    subtotalCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Authoritative subtotal (minor units)' }),
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
