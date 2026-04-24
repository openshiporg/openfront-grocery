import { list } from "@keystone-6/core";
import {
  text,
  select,
  integer,
  float,
  checkbox,
  timestamp,
  relationship,
  json,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const Order = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders,
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
    },
  },
  ui: {
    labelField: "displayId",
    listView: {
      initialColumns: ["displayId", "status", "email", "deliveryDate", "deliveryTimeWindow"],
    },
  },
  fields: {
    displayId: integer({
      validation: { isRequired: true },
      label: "Order Number",
    }),
    email: text({
      validation: { isRequired: true },
      label: "Customer Email",
    }),
    status: select({
      type: "enum",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Picking", value: "picking" },
        { label: "Packed", value: "packed" },
        { label: "Out for Delivery", value: "out_for_delivery" },
        { label: "Delivered", value: "delivered" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      label: "Status",
    }),
    taxRate: float({
      label: "Tax Rate",
    }),
    canceledAt: timestamp({
      label: "Cancelled At",
    }),
    metadata: json(),
    noNotification: checkbox({
      defaultValue: false,
      label: "Suppress Notifications",
    }),

    // Delivery time window fields (grocery-specific)
    deliveryDate: timestamp({
      validation: { isRequired: true },
      label: "Delivery Date",
      ui: {
        description: "Scheduled delivery date",
      },
    }),
    deliveryTimeWindow: select({
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
      label: "Delivery Time Window",
      ui: {
        description: "Customer's selected delivery time slot",
      },
    }),
    deliveryInstructions: text({
      ui: {
        displayMode: "textarea",
        description: "Special delivery instructions from customer",
      },
      label: "Delivery Instructions",
    }),
    substitutionPreference: select({
      type: "enum",
      options: [
        { label: "Call Me", value: "call_me" },
        { label: "Best Match", value: "best_match" },
        { label: "Refund", value: "refund" },
      ],
      defaultValue: "best_match",
      label: "Substitution Preference",
      ui: {
        description: "What to do if an item is out of stock",
      },
    }),

    // Relationships
    user: relationship({
      ref: "User",
      label: "Customer",
    }),
    shippingAddress: relationship({
      ref: "Address",
      label: "Shipping Address",
    }),
    billingAddress: relationship({
      ref: "Address",
      label: "Billing Address",
    }),
    lineItems: relationship({
      ref: "OrderLineItem.order",
      many: true,
      label: "Line Items",
    }),
    deliveryRoute: relationship({
      ref: "DeliveryRoute.orders",
      label: "Delivery Route",
    }),
    ...trackingFields,
  },
});
