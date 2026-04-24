import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  timestamp,
  checkbox,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const BackInStockAlert = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ({ session }) => {
        // Users can only see their own back-in-stock alerts
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        // Users can only update their own back-in-stock alerts
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        // Users can only delete their own back-in-stock alerts
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
      initialColumns: ["user", "product", "isActive", "createdAt", "notifiedAt"],
    },
  },
  fields: {
    // User who created the back-in-stock alert
    user: relationship({
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
      label: "Product",
      ui: {
        description: "Product ID to monitor for stock availability",
      },
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
