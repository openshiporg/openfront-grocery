import { list } from "@keystone-6/core";
import {
  text,
  checkbox,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const ParkingSpot = list({
  access: {
    operation: {
      query: () => true,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery,
    },
  },
  ui: {
    labelField: "spotNumber",
    listView: {
      initialColumns: ["spotNumber", "description", "isAccessible", "isAvailable"],
    },
  },
  fields: {
    spotNumber: text({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Spot Number",
      ui: {
        description: "Unique identifier for this parking spot (e.g., 'A1', 'B2')",
      },
    }),
    description: text({
      label: "Description",
      ui: {
        displayMode: "textarea",
        description: "Additional details about this spot location",
      },
    }),
    isAccessible: checkbox({
      defaultValue: false,
      label: "Is Accessible",
      ui: {
        description: "Whether this spot is ADA accessible",
      },
    }),
    isAvailable: checkbox({
      defaultValue: true,
      label: "Is Available",
      ui: {
        description: "Whether this spot is currently available for curbside pickup",
      },
    }),
    ...trackingFields,
  },
});
