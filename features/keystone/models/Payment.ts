import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  select,
  timestamp,
  decimal,
  json,
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Payment = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManageOrders,
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { order: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { order: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      },
      delete: ({ session }) => permissions.canManageOrders({ session }),
    },
  },
  ui: {
    listView: {
      initialColumns: ["amount", "status", "paymentMethod", "order", "createdAt"],
    },
  },
  fields: {
    amount: decimal({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in dollars",
      },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Refunded", value: "refunded" },
        { label: "Partially Refunded", value: "partially_refunded" },
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
    }),

    paymentMethod: select({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit_card" },
        { label: "Debit Card", value: "debit_card" },
        { label: "Cash", value: "cash" },
        { label: "Gift Card", value: "gift_card" },
        { label: "Apple Pay", value: "apple_pay" },
        { label: "Google Pay", value: "google_pay" },
        { label: "EBT/SNAP", value: "ebt_snap" },
      ],
      defaultValue: "credit_card",
    }),

    providerPaymentId: text({
      isIndexed: 'unique',
      ui: {
        description: 'Provider payment identifier',
      },
    }),

    providerChargeId: text({
      ui: {
        description: 'Provider charge/capture identifier',
      },
    }),

    providerRefundId: text({
      ui: {
        description: 'Provider refund identifier',
      },
    }),

    providerData: json({
      defaultValue: {},
      ui: {
        description: 'Normalized provider payload and metadata',
      },
    }),

    // Card details (last 4 digits for reference)
    cardLast4: text({
      ui: {
        description: "Last 4 digits of card",
      },
    }),

    cardBrand: text({
      ui: {
        description: "Card brand (visa, mastercard, etc.)",
      },
    }),

    // Delivery tip handling
    deliveryTipAmount: decimal({
      precision: 10,
      scale: 2,
      defaultValue: "0.00",
      ui: {
        description: "Delivery tip amount included in payment",
      },
    }),

    // Timestamps
    processedAt: timestamp({
      ui: {
        description: "When payment was successfully processed",
      },
    }),

    // Metadata for errors or additional info
    errorMessage: text({
      ui: {
        description: "Error message if payment failed",
      },
    }),

    notes: text({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment",
      },
    }),

    // Relationships
    order: relationship({
      ref: "Order",
      ui: {
        displayMode: "select",
      },
    }),

    paymentProvider: relationship({
      ref: 'PaymentProvider.payments',
      ui: {
        displayMode: 'select',
      },
    }),

    processedBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who processed payment",
      },
    }),
    ...trackingFields,
  },
});
