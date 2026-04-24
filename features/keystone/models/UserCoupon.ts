import { list } from "@keystone-6/core";
import {
  relationship,
  timestamp,
  checkbox,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { isSignedIn, permissions } from "../access";

export const UserCoupon = list({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManageUsers,
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        // Users can only see their own clipped coupons
        return {
          user: {
            id: { equals: session?.itemId },
          },
        };
      },
      update: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        // Users can only update their own clipped coupons
        return {
          user: {
            id: { equals: session?.itemId },
          },
        };
      },
    },
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["user", "coupon", "clippedAt", "used", "usedAt"],
    },
  },
  fields: {
    user: relationship({
      ref: "User",
      label: "User",
      ui: {
        description: "User who clipped this coupon",
      },
    }),
    coupon: relationship({
      ref: "Coupon.userCoupons",
      label: "Coupon",
      ui: {
        description: "The coupon that was clipped",
      },
    }),
    clippedAt: timestamp({
      label: "Clipped At",
      ui: {
        description: "When the user clipped this coupon",
      },
      defaultValue: { kind: "now" },
    }),
    usedAt: timestamp({
      label: "Used At",
      ui: {
        description: "When the coupon was used in an order",
      },
    }),
    used: checkbox({
      defaultValue: false,
      label: "Used",
      ui: {
        description: "Whether this coupon has been used",
      },
    }),
    ...trackingFields,
  },
});
