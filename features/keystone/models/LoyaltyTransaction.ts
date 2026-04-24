import { list } from "@keystone-6/core";
import {
  text,
  integer,
  select,
  relationship,
  timestamp,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const LoyaltyTransaction = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders,
    },
    filter: {
      query: ({ session }) => {
        // Admins can see all transactions
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        // Users can only see their own transactions
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
    },
  },
  ui: {
    labelField: "description",
    listView: {
      initialColumns: ["user", "points", "type", "transactionDate", "balanceAfter"],
    },
  },
  fields: {
    // User who owns this transaction
    user: relationship({
      ref: "User",
      label: "User",
      ui: {
        description: "The user this transaction belongs to",
      },
    }),
    // Points awarded or redeemed (positive for earned, negative for redeemed)
    points: integer({
      validation: { isRequired: true },
      label: "Points",
      ui: {
        description: "Points earned (positive) or redeemed (negative)",
      },
    }),
    // Transaction type
    type: select({
      type: "enum",
      options: [
        { label: "Earned - Purchase", value: "earned_purchase" },
        { label: "Earned - Bonus", value: "earned_bonus" },
        { label: "Earned - Referral", value: "earned_referral" },
        { label: "Earned - Birthday", value: "earned_birthday" },
        { label: "Redeemed - Discount", value: "redeemed_discount" },
        { label: "Redeemed - Reward", value: "redeemed_reward" },
        { label: "Expired", value: "expired" },
        { label: "Adjusted", value: "adjusted" },
        { label: "Refund - Deducted", value: "refund_deducted" },
      ],
      validation: { isRequired: true },
      label: "Transaction Type",
      ui: {
        description: "Type of loyalty transaction",
      },
    }),
    // Description of the transaction
    description: text({
      validation: { isRequired: true },
      label: "Description",
      ui: {
        description: "Description of what this transaction is for",
        displayMode: "textarea",
      },
    }),
    // Related order (if applicable)
    order: relationship({
      ref: "Order",
      label: "Order",
      ui: {
        description: "Order associated with this transaction (if applicable)",
      },
    }),
    // Balance after this transaction
    balanceAfter: integer({
      validation: { isRequired: true },
      label: "Balance After",
      ui: {
        description: "User's points balance after this transaction",
      },
    }),
    // When the transaction occurred
    transactionDate: timestamp({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Transaction Date",
      ui: {
        description: "When this transaction occurred",
      },
    }),
    // Expiration date (for earned points)
    expiresAt: timestamp({
      label: "Expires At",
      ui: {
        description: "When these points expire (if applicable)",
      },
    }),
    ...trackingFields,
  },
});
