import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  timestamp,
  checkbox,
  decimal,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { ownerScopedFilter } from '../lib/storeAccess';
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';

export const PriceAlert = list({
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
      initialColumns: ["user", "product", "targetPrice", "currentPrice", "isTriggered"],
    },
  },
  fields: {
    // User who created the price alert
    user: relationship({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "The user who created this price alert",
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
      ref: 'Product.priceAlerts',
      access: { create: () => false, update: () => false },
      label: 'Product',
    }),
    // Target price the user wants to be notified at
    targetPrice: decimal({
      validation: { isRequired: true },
      precision: 12,
      scale: 2,
      label: "Target Price",
      ui: {
        description: "Price threshold to trigger the alert",
      },
    }),
    // Current price of the product
    currentPrice: decimal({
      precision: 12,
      scale: 2,
      label: "Current Price",
      ui: {
        description: "Current price of the product",
      },
    }),
    // Whether the alert has been triggered
    isTriggered: checkbox({
      defaultValue: false,
      label: "Is Triggered",
      ui: {
        description: "Whether the price alert has been triggered",
      },
    }),
    // When the user was notified
    notifiedAt: timestamp({
      label: "Notified At",
      ui: {
        description: "When the user was notified about the price drop",
      },
    }),
    ...trackingFields,
  },
});
