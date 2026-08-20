import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  timestamp,
  checkbox,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { ownerScopedFilter } from '../lib/storeAccess';
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';

export const BackInStockAlert = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ownerScopedFilter('user'),
      update: ownerScopedFilter('user'),
      delete: ownerScopedFilter('user'),
    },
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) throw new Error('An authenticated owner is required');
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
    },
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["user", "product", "isActive", "createdAt", "notifiedAt"],
    },
  },
  fields: {
    // User who created the back-in-stock alert
    user: relationship({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "The user who wants to be notified when product is back in stock",
      },
    }),
    // Product ID (text field as specified)
    product: text({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product display snapshot",
      },
    }),
    productRef: relationship({
      ref: 'Product.backInStockAlerts',
      access: { create: () => false, update: () => false },
      label: 'Product',
    }),
    // When the user was notified
    notifiedAt: timestamp({
      label: "Notified At",
      ui: {
        description: "When the user was notified about the product being back in stock",
      },
    }),
    // Whether the alert is still active
    isActive: checkbox({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this back-in-stock alert is still active",
      },
    }),
    ...trackingFields,
  },
});
