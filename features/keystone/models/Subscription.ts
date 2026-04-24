import { list } from "@keystone-6/core";
import {
  text,
  select,
  integer,
  checkbox,
  float,
  timestamp,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const Subscription = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ({ session }) => {
        // Admins can see all subscriptions
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        // Users can only see their own subscriptions
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        // Admins can update all subscriptions
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        // Users can only update their own subscriptions
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        // Admins can delete all subscriptions
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        // Users can only delete their own subscriptions
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
      initialColumns: ["user", "product", "frequency", "nextDeliveryDate", "isActive"],
    },
  },
  fields: {
    // User who owns the subscription
    user: relationship({
      ref: "User",
      label: "User",
      ui: {
        description: "The user who owns this subscription",
      },
    }),
    // Product ID (text field)
    product: text({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product",
      ui: {
        description: "Product ID for the subscription",
      },
    }),
    // Quantity to deliver each time
    quantity: integer({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Quantity",
      ui: {
        description: "Number of items to deliver each time",
      },
    }),
    // Delivery frequency
    frequency: select({
      type: "enum",
      options: [
        { label: "Weekly", value: "weekly" },
        { label: "Biweekly", value: "biweekly" },
        { label: "Monthly", value: "monthly" },
      ],
      defaultValue: "weekly",
      validation: { isRequired: true },
      label: "Frequency",
      ui: {
        description: "How often to deliver this subscription",
      },
    }),
    // Next scheduled delivery date
    nextDeliveryDate: timestamp({
      label: "Next Delivery Date",
      ui: {
        description: "Date of the next scheduled delivery",
      },
    }),
    // Subscription discount percentage
    discount: float({
      label: "Discount",
      ui: {
        description: "Discount percentage applied to subscription orders (0-100)",
      },
      validation: { min: 0, max: 100 },
      defaultValue: 0,
    }),
    // Whether subscription is currently active
    isActive: checkbox({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this subscription is currently active",
      },
    }),
    // Paused until date (for temporary pauses)
    pausedUntil: timestamp({
      label: "Paused Until",
      ui: {
        description: "If set, subscription is paused until this date",
      },
    }),
    ...trackingFields,
  },
});
