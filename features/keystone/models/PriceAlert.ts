import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  timestamp,
  checkbox,
  decimal,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const PriceAlert = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ({ session }) => {
        // Users can only see their own price alerts
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        // Users can only update their own price alerts
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        // Users can only delete their own price alerts
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
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
      label: "Product",
      ui: {
        description: "Product ID to monitor for price changes",
      },
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
