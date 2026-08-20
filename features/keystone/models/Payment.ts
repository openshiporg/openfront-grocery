import { list } from "@keystone-6/core";
import {
  text,
  relationship,
  select,
  timestamp,
  decimal,
  integer,
  json,
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { storeScopedFilter } from '../lib/storeAccess';

export const Payment = list({
  access: {
    operation: {
      query: isSignedIn,
      // Payment rows and status transitions are domain-operation owned.
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: async ({ session, context }) => {
        const store = storeScopedFilter({ session });
        if (store === false) return false;
        if (await permissions.canManageOrders({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { order: { user: { id: { equals: session.itemId } } } }] };
        return false;
      },
      update: storeScopedFilter,
      delete: () => false,
    },
  },
  hooks: {
    validate: {
      delete: async ({ addValidationError }) => addValidationError('Payment evidence cannot be deleted'),
      update: async ({ resolvedData, addValidationError }) => {
        if (resolvedData.amount !== undefined || resolvedData.order !== undefined || resolvedData.paymentProvider !== undefined || resolvedData.providerPaymentId !== undefined) {
          addValidationError('Payment amount, ownership, provider, and provider identity are immutable');
        }
      },
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
      ui: { description: "Legacy display amount; amountCents is authoritative" },
    }),
    amountCents: integer({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      label: 'Payment amount (minor units)',
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
      ui: { description: "Legacy display tip; deliveryTipCents is authoritative" },
    }),
    deliveryTipCents: integer({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      label: 'Delivery tip (minor units)',
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
    store: relationship({
      ref: 'Store.payments',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
    }),
    order: relationship({
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Order.payments",
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

    refunds: relationship({
      ref: 'PaymentRefund.payment',
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
    }),

    webhookEvents: relationship({
      ref: 'PaymentWebhookEvent.payment',
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: 'read' } },
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
