import { list } from "@keystone-6/core";
import {
  text,
  select,
  float,
  integer,
  checkbox,
  timestamp,
  json,
  relationship,
} from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipPrisma } from './relationshipConfig';
import { isSignedIn, permissions } from "../access";
import { storeScopedFilter } from '../lib/storeAccess';

export const Coupon = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts,
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter,
    },
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) throw new Error('An active store is required');
      return {
        ...resolvedData,
        discountValueCents: resolvedData.discountValue !== undefined
          ? Math.round(Number(resolvedData.discountValue) * 100)
          : resolvedData.discountValueCents,
        minPurchaseCents: resolvedData.minPurchase !== undefined
          ? Math.round(Number(resolvedData.minPurchase || 0) * 100)
          : resolvedData.minPurchaseCents,
        store: { connect: { id: context.session.data.store.id } },
      };
    },
  },
  ui: {
    labelField: "code",
    listView: {
      initialColumns: ["code", "discountType", "discountValue", "isActive", "validFrom", "validTo"],
    },
  },
  fields: {
    code: text({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Coupon Code",
      ui: {
        description: "Unique coupon code that customers will enter",
      },
    }),
    discountType: select({
      type: "enum",
      options: [
        { label: "Percentage", value: "percentage" },
        { label: "Fixed Amount", value: "fixed" },
        { label: "Buy One Get One", value: "bogo" },
      ],
      defaultValue: "percentage",
      validation: { isRequired: true },
      label: "Discount Type",
      ui: {
        description: "Type of discount applied by this coupon",
      },
    }),
    discountValue: float({
      label: "Discount Value",
      ui: {
        description: "Percentage (0-100) or fixed dollar amount",
      },
      validation: { min: 0 },
    }),
    discountValueCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Authoritative fixed discount (minor units)' }),
    minPurchase: float({
      label: "Legacy display minimum purchase",
      ui: {
        description: "Minimum order amount required to use this coupon",
      },
      validation: { min: 0 },
      defaultValue: 0,
    }),
    minPurchaseCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Authoritative minimum purchase (minor units)' }),
    maxUses: integer({
      label: "Maximum Uses",
      ui: {
        description: "Total number of times this coupon can be used (0 = unlimited)",
      },
      validation: { min: 0 },
      defaultValue: 0,
    }),
    currentUses: integer({
      label: "Current Uses",
      ui: {
        description: "Number of times this coupon has been used",
      },
      validation: { min: 0 },
      defaultValue: 0,
    }),
    validFrom: timestamp({
      label: "Valid From",
      ui: {
        description: "Date when coupon becomes active",
      },
    }),
    validTo: timestamp({
      label: "Valid To",
      ui: {
        description: "Date when coupon expires",
      },
    }),
    productCategories: json({
      label: "Product Categories",
      ui: {
        description: "JSON array of department/category slugs this coupon applies to (empty = all)",
      },
    }),
    excludedProducts: json({
      label: "Excluded Products",
      ui: {
        description: "JSON array of product IDs excluded from this coupon",
      },
    }),
    isActive: checkbox({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this coupon is currently active",
      },
    }),

    // Relationships
    store: relationship({
      ref: 'Store.coupons',
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false },
    }),
    userCoupons: relationship({
      ref: "UserCoupon.coupon",
      many: true,
      label: "User Coupons",
      ui: {
        description: "Coupons clipped by users",
      },
    }),
    ...trackingFields,
  },
});
