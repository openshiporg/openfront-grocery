import { list } from "@keystone-6/core";
import {
  integer,
  checkbox,
  timestamp,
  text,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const DeliverySlot = list({
  access: {
    operation: {
      query: () => true, // Logged in users can see available slots
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery,
    },
    filter: {
      query: ({ session }) => {
        // Admins can see all slots
        if (permissions.canManageDelivery({ session })) {
          return true;
        }
        // Regular users can only see available slots
        return {
          isActive: { equals: true },
        };
      },
    },
  },
  ui: {
    listView: {
      initialColumns: ["date", "startTime", "endTime", "capacity", "currentBookings", "isActive"],
    },
  },
  fields: {
    // Date of the delivery slot
    date: timestamp({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Date",
      ui: {
        description: "Date for this delivery time window",
      },
    }),
    // Start time of the delivery window
    startTime: text({
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this delivery window (e.g., '09:00')",
      },
    }),
    // End time of the delivery window
    endTime: text({
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this delivery window (e.g., '11:00')",
      },
    }),
    // Maximum number of deliveries for this slot
    capacity: integer({
      validation: { isRequired: true, min: 1 },
      defaultValue: 10,
      label: "Capacity",
      ui: {
        description: "Maximum number of deliveries that can be scheduled for this slot",
      },
    }),
    // Current number of deliveries booked
    currentBookings: integer({
      defaultValue: 0,
      validation: { min: 0 },
      label: "Current Bookings",
      ui: {
        description: "Current number of deliveries booked for this slot",
      },
    }),
    // Whether the slot is active and available for booking
    isActive: checkbox({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this delivery slot is active and available for booking",
      },
    }),
    // Delivery fee for this slot (e.g., premium for express slots)
    deliveryFee: integer({
      defaultValue: 0,
      validation: { min: 0 },
      label: "Delivery Fee (cents)",
      ui: {
        description: "Delivery fee in cents for this time slot (0 for free delivery)",
      },
    }),
    ...trackingFields,
  },
});
