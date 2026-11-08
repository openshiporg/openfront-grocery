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
import { currentMembershipStoreId, storeScopedFilter } from '../lib/storeAccess';
import { normalizeCouponCode } from '../lib/couponLookup';

function isStringList(value: unknown) {
  return value === null || value === undefined || (Array.isArray(value) && value.length <= 500 && value.every((item) => typeof item === 'string' && item.length <= 200));
}

function validateCouponInput(resolvedData: any, item: any, addValidationError: (message: string) => void) {
  if (resolvedData.code !== undefined && (!/^[A-Z0-9_-]{2,40}$/.test(String(resolvedData.code)))) {
    addValidationError('Coupon codes use 2–40 letters, numbers, hyphens or underscores.');
  }
  if (!isStringList(resolvedData.productCategories)) addValidationError('Departments must be a list of department handles.');
  if (!isStringList(resolvedData.excludedProducts)) addValidationError('Excluded products must be a list of product IDs.');
  const discountType = resolvedData.discountType ?? item?.discountType ?? 'percentage';
  const discountValue = resolvedData.discountValue !== undefined ? resolvedData.discountValue : item?.discountValue;
  if (discountType === 'percentage' && Number(discountValue || 0) > 100) {
    addValidationError('A percentage discount cannot be more than 100%.');
  }
  const validFrom = resolvedData.validFrom !== undefined ? resolvedData.validFrom : item?.validFrom;
  const validTo = resolvedData.validTo !== undefined ? resolvedData.validTo : item?.validTo;
  if (validFrom && validTo && new Date(validTo).getTime() <= new Date(validFrom).getTime()) {
    addValidationError('The coupon must end after it starts. Choose a "valid to" date later than "valid from".');
  }
  const maxUses = resolvedData.maxUses ?? item?.maxUses ?? 0;
  const currentUses = item?.currentUses ?? 0;
  if (Number(maxUses) > 0 && Number(maxUses) < Number(currentUses)) {
    addValidationError(`Maximum uses cannot be lower than the ${currentUses} redemptions already made.`);
  }
}

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
      const storeId = await currentMembershipStoreId({ session: context.session, context });
      if (!storeId) throw new Error('An active store is required');
      return {
        ...resolvedData,
        // One coupon identity: trimmed upper-case, the form checkout looks up.
        ...(typeof resolvedData.code === 'string' ? { code: normalizeCouponCode(resolvedData.code) } : {}),
        discountValueCents: resolvedData.discountValue !== undefined
          ? Math.round(Number(resolvedData.discountValue) * 100)
          : resolvedData.discountValueCents,
        minPurchaseCents: resolvedData.minPurchase !== undefined
          ? Math.round(Number(resolvedData.minPurchase || 0) * 100)
          : resolvedData.minPurchaseCents,
        store: { connect: { id: storeId } },
      };
    },
    validate: {
      create: async ({ resolvedData, addValidationError }) => validateCouponInput(resolvedData, null, addValidationError),
      update: async ({ resolvedData, item, addValidationError }) => validateCouponInput(resolvedData, item, addValidationError),
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
      label: "Discount",
      ui: {
        description: "Percent off (0–100) for a percentage coupon, or dollars off for a fixed-amount coupon.",
      },
      validation: { min: 0 },
    }),
    // Checkout and order finalisation charge from the cents copies; resolveInput derives them from the
    // dollar fields above, so the form shows dollars only.
    discountValueCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Fixed discount', ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } } }),
    minPurchase: float({
      label: "Minimum order",
      ui: {
        description: "Order subtotal in dollars needed to use this coupon. 0 means no minimum.",
      },
      validation: { min: 0 },
      defaultValue: 0,
    }),
    minPurchaseCents: integer({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: 'Minimum order', ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } } }),
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
        description: "Number of times this coupon has been redeemed. Counted by checkout and cancellations only.",
        itemView: { fieldMode: 'read' },
      },
      // Redemption counts are domain-owned (checkout consumption and cancellation
      // release); merchandising edits cannot reset or advance them.
      access: { create: () => false, update: () => false },
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
      label: "Departments",
      ui: {
        description: "Departments this coupon applies to. Leave empty for every department.",
      },
    }),
    // Which department identity productCategories names. Offers created before
    // aisles became Store departments keep their original (legacy department)
    // meaning; new offers use the department handles shoppers browse.
    categoryTaxonomy: select({
      type: 'string',
      options: [
        { label: 'Store departments', value: 'department_handle' },
        { label: "Product's own department (older coupons)", value: 'legacy_department' },
      ],
      defaultValue: 'department_handle',
      validation: { isRequired: true },
      label: 'Department matching',
      access: { update: () => false },
    }),
    excludedProducts: json({
      label: "Excluded products",
      ui: {
        description: "Products this coupon never discounts.",
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
