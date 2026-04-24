import { list } from "@keystone-6/core";
import {
  text,
  checkbox,
  timestamp,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const OrderItemSubstitution = list({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders,
    },
  },
  ui: {
    labelField: "originalProduct",
    listView: {
      initialColumns: ["orderItem", "originalProduct", "substitutedProduct", "customerApproved"],
    },
  },
  fields: {
    orderItem: text({
      validation: { isRequired: true },
      label: "Order Item ID",
      ui: {
        description: "Reference to the order line item being substituted",
      },
    }),
    originalProduct: text({
      validation: { isRequired: true },
      label: "Original Product",
      ui: {
        description: "The originally ordered product identifier",
      },
    }),
    substitutedProduct: text({
      validation: { isRequired: true },
      label: "Substituted Product",
      ui: {
        description: "The product used as a substitute",
      },
    }),
    reason: text({
      label: "Reason",
      ui: {
        description: "Reason for the substitution",
        displayMode: "textarea",
      },
    }),
    customerApproved: checkbox({
      defaultValue: false,
      label: "Customer Approved",
      ui: {
        description: "Whether the customer has approved this substitution",
      },
    }),
    approvedAt: timestamp({
      label: "Approved At",
      ui: {
        description: "When the customer approved the substitution",
      },
    }),
    ...trackingFields,
  },
});
