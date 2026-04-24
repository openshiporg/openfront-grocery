import { list } from "@keystone-6/core";
import {
  integer,
  checkbox,
  timestamp,
  text,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const PickupSlot = list({
  access: {
    operation: {
      query: () => true,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders,
    },
  },
  ui: {
    listView: {
      initialColumns: ["date", "startTime", "endTime", "maxOrders", "currentOrders", "isAvailable"],
    },
  },
  fields: {
    date: timestamp({
      validation: { isRequired: true },
      label: "Date",
      ui: {
        description: "Date for this pickup slot",
      },
    }),
    startTime: text({
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this slot (e.g., '09:00')",
      },
    }),
    endTime: text({
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this slot (e.g., '10:00')",
      },
    }),
    maxOrders: integer({
      validation: { isRequired: true },
      defaultValue: 10,
      label: "Max Orders",
      ui: {
        description: "Maximum number of orders that can be scheduled for this slot",
      },
    }),
    currentOrders: integer({
      defaultValue: 0,
      label: "Current Orders",
      ui: {
        description: "Current number of orders scheduled for this slot",
      },
    }),
    isAvailable: checkbox({
      defaultValue: true,
      label: "Is Available",
      ui: {
        description: "Whether this slot is available for new orders",
      },
    }),
    ...trackingFields,
  },
});
