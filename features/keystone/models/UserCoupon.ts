import { list } from "@keystone-6/core";
import {
  relationship,
  timestamp,
  checkbox,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions } from "../access";
import { ownerScopedFilter } from '../lib/storeAccess';

export const UserCoupon = list({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: permissions.canManageUsers,
    },
    filter: {
      query: ownerScopedFilter('user'),
      update: ownerScopedFilter('user'),
      delete: ownerScopedFilter('user'),
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
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "User who clipped this coupon",
      },
    }),
    coupon: relationship({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
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
