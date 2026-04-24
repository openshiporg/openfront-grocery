import { list } from "@keystone-6/core";
import {
  text,
  select,
  timestamp,
  relationship,
  json,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const DeliveryRoute = list({
  access: {
    operation: {
      query: permissions.canManageDelivery,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery,
    },
  },
  ui: {
    listView: {
      initialColumns: ["driver", "date", "timeWindow", "status"],
    },
  },
  fields: {
    date: timestamp({
      validation: { isRequired: true },
      label: "Delivery Date",
    }),
    timeWindow: select({
      type: "enum",
      options: [
        { label: "8 AM - 10 AM", value: "time_8_10" },
        { label: "10 AM - 12 PM", value: "time_10_12" },
        { label: "12 PM - 2 PM", value: "time_12_14" },
        { label: "2 PM - 4 PM", value: "time_14_16" },
        { label: "4 PM - 6 PM", value: "time_16_18" },
        { label: "6 PM - 8 PM", value: "time_18_20" },
      ],
      validation: { isRequired: true },
      label: "Time Window",
      ui: {
        description: "Delivery time slot",
      },
    }),
    stops: json({
      label: "Stops",
      ui: {
        description: "JSON array with optimized delivery sequence",
        views: require.resolve("@keystone-6/core/fields/types/json/views"),
      },
    }),
    status: select({
      type: "enum",
      options: [
        { label: "Planning", value: "planning" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
      ],
      defaultValue: "planning",
      label: "Status",
    }),
    startedAt: timestamp({
      label: "Started At",
      ui: {
        description: "When the driver started this route",
      },
    }),
    completedAt: timestamp({
      label: "Completed At",
      ui: {
        description: "When all deliveries were completed",
      },
    }),
    // Relationships
    driver: relationship({
      ref: "User",
      label: "Driver",
      ui: {
        description: "User assigned to drive this route",
      },
    }),
    orders: relationship({
      ref: "Order.deliveryRoute",
      many: true,
      label: "Orders",
      ui: {
        description: "Orders to be delivered on this route",
      },
    }),
    ...trackingFields,
  },
});
