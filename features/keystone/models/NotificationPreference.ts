import { list } from "@keystone-6/core";
import {
  checkbox,
  json,
  relationship,
} from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { trackingFields } from "./trackingFields";

export const NotificationPreference = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn,
    },
    filter: {
      query: ({ session }) => {
        // Users can only see their own notification preferences
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        // Users can only update their own notification preferences
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        // Users can only delete their own notification preferences
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
    },
  },
  ui: {
    labelField: "user",
    listView: {
      initialColumns: ["user", "orderUpdates", "deliveryAlerts", "priceDrops", "backInStock", "weeklyDeals"],
    },
  },
  fields: {
    // User relationship
    user: relationship({
      ref: "User",
      label: "User",
      ui: {
        description: "The user these preferences belong to",
      },
    }),
    // Order updates notifications
    orderUpdates: checkbox({
      defaultValue: true,
      label: "Order Updates",
      ui: {
        description: "Receive notifications about order status changes",
      },
    }),
    // Delivery alerts
    deliveryAlerts: checkbox({
      defaultValue: true,
      label: "Delivery Alerts",
      ui: {
        description: "Receive notifications about delivery status and ETA",
      },
    }),
    // Price drop notifications
    priceDrops: checkbox({
      defaultValue: false,
      label: "Price Drops",
      ui: {
        description: "Receive notifications when favorited products go on sale",
      },
    }),
    // Back in stock notifications
    backInStock: checkbox({
      defaultValue: false,
      label: "Back in Stock",
      ui: {
        description: "Receive notifications when out-of-stock products become available",
      },
    }),
    // Weekly deals digest
    weeklyDeals: checkbox({
      defaultValue: false,
      label: "Weekly Deals",
      ui: {
        description: "Receive weekly digest of deals and promotions",
      },
    }),
    // Notification channels (JSON array: email/sms/push)
    channels: json({
      label: "Notification Channels",
      ui: {
        description: "JSON array of notification channels: ['email', 'sms', 'push']",
      },
      defaultValue: ["email"],
    }),
    ...trackingFields,
  },
});
