"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core45 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/Address.ts
var import_core = require("@keystone-6/core");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/access.ts
async function requireFreshCapability(context, capability) {
  const session = context.session;
  if (!session?.itemId) throw new Error("Authentication required");
  const sudoContext = context.sudo();
  if (!context.prisma?.$queryRaw || !sudoContext?.query?.User?.findOne) {
    return { user: session.data, storeId: session.data.store?.id };
  }
  const user = await sudoContext.query.User.findOne({
    where: { id: session.itemId },
    query: `id store { id isActive } role { ${capability} }`
  });
  if (!user?.store?.isActive || !user.role?.[capability]) throw new Error(`Missing current capability: ${capability}`);
  return { user, storeId: user.store.id };
}
function isSignedIn({ session }) {
  return Boolean(session);
}
function currentPermission(capability) {
  return async ({ session, context }) => {
    if (!session?.itemId || !context?.prisma?.user) return false;
    const user = await context.prisma.user.findUnique({
      where: { id: session.itemId },
      select: { store: { select: { isActive: true } }, role: { select: { [capability]: true } } }
    });
    return Boolean(user?.store?.isActive && user.role?.[capability]);
  };
}
var permissions = {
  canManageProducts: currentPermission("canManageProducts"),
  canManageOrders: currentPermission("canManageOrders"),
  canManageInventory: currentPermission("canManageInventory"),
  canManageSuppliers: currentPermission("canManageSuppliers"),
  canManageDelivery: currentPermission("canManageDelivery"),
  canManageUsers: currentPermission("canManageUsers"),
  canManagePayments: currentPermission("canManagePayments"),
  canManageOnboarding: currentPermission("canManageOnboarding"),
  canAccessDashboard: currentPermission("canAccessDashboard")
};

// features/keystone/lib/storeAccess.ts
function sessionStoreId(session) {
  return session?.data.store?.id || null;
}
function currentStoreScopedFilter({ session }) {
  const storeId = sessionStoreId(session);
  return storeId ? { id: { equals: storeId } } : false;
}
function publicStoreScopedFilter() {
  const storeId = process.env.PUBLIC_STORE_ID || "store_juniper";
  return { store: { id: { equals: storeId } } };
}
function storeScopedFilter({ session }) {
  const storeId = sessionStoreId(session);
  return storeId ? { store: { id: { equals: storeId } } } : false;
}
function relatedStoreScopedFilter(relation) {
  return ({ session }) => {
    const storeId = sessionStoreId(session);
    return storeId ? { [relation]: { store: { id: { equals: storeId } } } } : false;
  };
}
function nestedRelatedStoreScopedFilter(...relations) {
  return ({ session }) => {
    const storeId = sessionStoreId(session);
    if (!storeId) return false;
    return relations.reduceRight(
      (value, relation) => ({ [relation]: value }),
      { store: { id: { equals: storeId } } }
    );
  };
}
function ownerStoreScopedFilter(ownerField = "user") {
  return ({ session }) => {
    const storeId = sessionStoreId(session);
    return storeId ? { [ownerField]: { store: { id: { equals: storeId } } } } : false;
  };
}
function ownerScopedFilter(ownerField = "user") {
  return ({ session }) => session?.itemId ? { [ownerField]: { id: { equals: session.itemId } } } : false;
}

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/models/Address.ts
var Address = (0, import_core.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: async ({ session, context }) => {
        const store = ownerStoreScopedFilter("user")({ session });
        if (store === false) return false;
        if (await permissions.canManageUsers({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { user: { id: { equals: session.itemId } } }] };
        return false;
      },
      update: ownerScopedFilter("user"),
      delete: ownerScopedFilter("user")
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) return resolvedData;
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
    }
  },
  ui: {
    listView: {
      initialColumns: ["firstName", "lastName", "city", "postalCode"]
    }
  },
  fields: {
    firstName: (0, import_fields2.text)({
      label: "First Name"
    }),
    lastName: (0, import_fields2.text)({
      label: "Last Name"
    }),
    company: (0, import_fields2.text)({
      label: "Company"
    }),
    address1: (0, import_fields2.text)({
      validation: { isRequired: true },
      label: "Address Line 1"
    }),
    address2: (0, import_fields2.text)({
      label: "Address Line 2"
    }),
    city: (0, import_fields2.text)({
      validation: { isRequired: true },
      label: "City"
    }),
    province: (0, import_fields2.text)({
      label: "Province/State"
    }),
    postalCode: (0, import_fields2.text)({
      validation: { isRequired: true },
      label: "Postal Code"
    }),
    phone: (0, import_fields2.text)({
      label: "Phone"
    }),
    // Relationships
    user: (0, import_fields2.relationship)({
      access: { create: () => false, update: () => false },
      ref: "User",
      label: "User"
    }),
    ...trackingFields
  }
});

// features/keystone/models/BackInStockAlert.ts
var import_core2 = require("@keystone-6/core");
var import_fields3 = require("@keystone-6/core/fields");

// features/keystone/models/relationshipConfig.ts
function requiredRelationshipPrisma(field) {
  return field.replace(/(\b\w+\s+\w+)\?(\s+@relation)/, "$1$2").replace(/(\n\s*\w+Id\s+\w+)\?(\s+@map)/, "$1$2");
}
function uniqueRelationshipPrisma(field) {
  return field.replace(
    /(\n\s*\w+Id\s+\w+\?[^\n]*)(\n|$)/,
    (_match, scalarLine, ending) => `${scalarLine.trimEnd()} @unique${ending}`
  );
}
function requiredUniqueRelationshipPrisma(field) {
  return requiredRelationshipPrisma(field).replace(
    /(\n\s*\w+Id\s+\w+[^\n]*)(\n|$)/,
    (_match, scalarLine, ending) => `${scalarLine.trimEnd()} @unique${ending}`
  );
}

// features/keystone/models/BackInStockAlert.ts
var BackInStockAlert = (0, import_core2.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ownerScopedFilter("user"),
      update: ownerScopedFilter("user"),
      delete: ownerScopedFilter("user")
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) throw new Error("An authenticated owner is required");
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
    }
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["user", "product", "isActive", "createdAt", "notifiedAt"]
    }
  },
  fields: {
    // User who created the back-in-stock alert
    user: (0, import_fields3.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "The user who wants to be notified when product is back in stock"
      }
    }),
    // Product ID (text field as specified)
    product: (0, import_fields3.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product display snapshot"
      }
    }),
    productRef: (0, import_fields3.relationship)({
      ref: "Product.backInStockAlerts",
      access: { create: () => false, update: () => false },
      label: "Product"
    }),
    // When the user was notified
    notifiedAt: (0, import_fields3.timestamp)({
      label: "Notified At",
      ui: {
        description: "When the user was notified about the product being back in stock"
      }
    }),
    // Whether the alert is still active
    isActive: (0, import_fields3.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this back-in-stock alert is still active"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Cart.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");
var Cart = (0, import_core3.list)({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      const storeId = context.session?.data.store?.id || process.env.PUBLIC_STORE_ID || "store_juniper";
      const store = await context.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, isActive: true } });
      if (!store?.isActive) throw new Error("An active store is required");
      return { ...resolvedData, store: { connect: { id: store.id } } };
    }
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["id", "customer", "sessionId", "itemCount", "createdAt"]
    }
  },
  fields: {
    // For logged-in users
    store: (0, import_fields4.relationship)({
      ref: "Store.carts",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    customer: (0, import_fields4.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: uniqueRelationshipPrisma },
      ref: "User",
      label: "Customer",
      ui: {
        description: "The logged-in user who owns this cart"
      }
    }),
    // For guest users
    sessionId: (0, import_fields4.text)({
      label: "Session ID",
      isIndexed: "unique",
      ui: {
        description: "Session identifier for guest carts"
      }
    }),
    // Cart items relationship
    items: (0, import_fields4.relationship)({
      ref: "CartItem.cart",
      many: true,
      label: "Cart Items"
    }),
    paymentSessions: (0, import_fields4.relationship)({
      ref: "PaymentSession.cart",
      many: true,
      label: "Payment Sessions"
    }),
    checkoutAttempts: (0, import_fields4.relationship)({ ref: "CheckoutAttempt.cart", many: true }),
    // Calculated fields (cached for performance)
    itemCount: (0, import_fields4.integer)({
      defaultValue: 0,
      label: "Item Count",
      ui: {
        description: "Total number of items in cart"
      }
    }),
    subtotal: (0, import_fields4.float)({
      defaultValue: 0,
      label: "Legacy display subtotal",
      ui: {
        description: "Cart subtotal before tax and fees"
      }
    }),
    subtotalCents: (0, import_fields4.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative subtotal (minor units)" }),
    // Cart expiration for guest carts
    expiresAt: (0, import_fields4.timestamp)({
      label: "Expires At",
      ui: {
        description: "When this cart expires (for guest carts)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/CheckoutAttempt.ts
var import_core4 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var CheckoutAttempt = (0, import_core4.list)({
  access: {
    operation: { query: permissions.canManageOrders, create: () => false, update: () => false, delete: () => false },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter }
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields5.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { update: () => false } }),
    providerCode: (0, import_fields5.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    providerPaymentId: (0, import_fields5.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    amountCents: (0, import_fields5.integer)({ validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    currencyCode: (0, import_fields5.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    status: (0, import_fields5.select)({
      type: "enum",
      options: [
        { label: "Pending settlement verification", value: "pending" },
        { label: "Settled pending finalize", value: "settled_pending_finalize" },
        { label: "Finalizing", value: "finalizing" },
        { label: "Finalized", value: "finalized" },
        { label: "Compensation required", value: "compensation_required" },
        { label: "Compensation processing", value: "compensation_processing" },
        { label: "Compensated", value: "compensated" },
        { label: "Failed", value: "failed" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true }
    }),
    attempts: (0, import_fields5.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    fencingToken: (0, import_fields5.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    leaseToken: (0, import_fields5.text)({ db: { isNullable: true }, access: { update: () => false } }),
    leaseExpiresAt: (0, import_fields5.timestamp)({ access: { update: () => false } }),
    lastError: (0, import_fields5.text)({ access: { update: () => false } }),
    requestData: (0, import_fields5.json)({ defaultValue: {}, access: { update: () => false } }),
    settledAt: (0, import_fields5.timestamp)(),
    finalizedAt: (0, import_fields5.timestamp)(),
    compensationAt: (0, import_fields5.timestamp)(),
    store: (0, import_fields5.relationship)({ ref: "Store.checkoutAttempts", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    cart: (0, import_fields5.relationship)({ ref: "Cart.checkoutAttempts", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    paymentSession: (0, import_fields5.relationship)({ ref: "PaymentSession.checkoutAttempts", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    order: (0, import_fields5.relationship)({ ref: "Order.checkoutAttempts", access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/CartItem.ts
var import_core5 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
var CartItem = (0, import_core5.list)({
  db: {
    extendPrismaSchema: (schema) => schema.replace(/\n}$/, "\n  @@unique([cartId, productId])\n}")
  },
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: relatedStoreScopedFilter("cart"),
      delete: relatedStoreScopedFilter("cart")
    }
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["id", "cart", "product", "quantity", "subtotal", "addedAt"]
    }
  },
  fields: {
    // Cart relationship
    cart: (0, import_fields6.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Cart.items",
      label: "Cart",
      ui: {
        description: "The cart this item belongs to"
      }
    }),
    // Product relationship
    product: (0, import_fields6.relationship)({
      ref: "Product",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      label: "Product",
      ui: {
        description: "The product in this cart item"
      }
    }),
    // Quantity
    quantity: (0, import_fields6.integer)({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: {
        description: "Number of units in cart"
      }
    }),
    // Calculated subtotal for this item
    subtotal: (0, import_fields6.float)({
      defaultValue: 0,
      label: "Legacy display subtotal",
      ui: {
        description: "Price x Quantity"
      }
    }),
    subtotalCents: (0, import_fields6.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative subtotal (minor units)" }),
    // Grocery-specific: substitution preference
    substitutionPreference: (0, import_fields6.select)({
      type: "enum",
      options: [
        { label: "Allow Substitution", value: "allow" },
        { label: "Contact Me", value: "contact" },
        { label: "Remove Item", value: "remove" }
      ],
      defaultValue: "allow",
      label: "Substitution Preference",
      ui: {
        description: "What to do if item is out of stock during picking"
      }
    }),
    // When this item was added
    addedAt: (0, import_fields6.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Added At",
      ui: {
        description: "When this item was added to cart"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Coupon.ts
var import_core6 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");
var Coupon = (0, import_core6.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) throw new Error("An active store is required");
      return {
        ...resolvedData,
        discountValueCents: resolvedData.discountValue !== void 0 ? Math.round(Number(resolvedData.discountValue) * 100) : resolvedData.discountValueCents,
        minPurchaseCents: resolvedData.minPurchase !== void 0 ? Math.round(Number(resolvedData.minPurchase || 0) * 100) : resolvedData.minPurchaseCents,
        store: { connect: { id: context.session.data.store.id } }
      };
    }
  },
  ui: {
    labelField: "code",
    listView: {
      initialColumns: ["code", "discountType", "discountValue", "isActive", "validFrom", "validTo"]
    }
  },
  fields: {
    code: (0, import_fields7.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Coupon Code",
      ui: {
        description: "Unique coupon code that customers will enter"
      }
    }),
    discountType: (0, import_fields7.select)({
      type: "enum",
      options: [
        { label: "Percentage", value: "percentage" },
        { label: "Fixed Amount", value: "fixed" },
        { label: "Buy One Get One", value: "bogo" }
      ],
      defaultValue: "percentage",
      validation: { isRequired: true },
      label: "Discount Type",
      ui: {
        description: "Type of discount applied by this coupon"
      }
    }),
    discountValue: (0, import_fields7.float)({
      label: "Discount Value",
      ui: {
        description: "Percentage (0-100) or fixed dollar amount"
      },
      validation: { min: 0 }
    }),
    discountValueCents: (0, import_fields7.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative fixed discount (minor units)" }),
    minPurchase: (0, import_fields7.float)({
      label: "Legacy display minimum purchase",
      ui: {
        description: "Minimum order amount required to use this coupon"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    minPurchaseCents: (0, import_fields7.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative minimum purchase (minor units)" }),
    maxUses: (0, import_fields7.integer)({
      label: "Maximum Uses",
      ui: {
        description: "Total number of times this coupon can be used (0 = unlimited)"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    currentUses: (0, import_fields7.integer)({
      label: "Current Uses",
      ui: {
        description: "Number of times this coupon has been used"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    validFrom: (0, import_fields7.timestamp)({
      label: "Valid From",
      ui: {
        description: "Date when coupon becomes active"
      }
    }),
    validTo: (0, import_fields7.timestamp)({
      label: "Valid To",
      ui: {
        description: "Date when coupon expires"
      }
    }),
    productCategories: (0, import_fields7.json)({
      label: "Product Categories",
      ui: {
        description: "JSON array of department/category slugs this coupon applies to (empty = all)"
      }
    }),
    excludedProducts: (0, import_fields7.json)({
      label: "Excluded Products",
      ui: {
        description: "JSON array of product IDs excluded from this coupon"
      }
    }),
    isActive: (0, import_fields7.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this coupon is currently active"
      }
    }),
    // Relationships
    store: (0, import_fields7.relationship)({
      ref: "Store.coupons",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false }
    }),
    userCoupons: (0, import_fields7.relationship)({
      ref: "UserCoupon.coupon",
      many: true,
      label: "User Coupons",
      ui: {
        description: "Coupons clipped by users"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Department.ts
var import_core7 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var Department = (0, import_core7.list)({
  access: {
    operation: {
      query: () => true,
      // Public can read departments
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    },
    filter: {
      query: async ({ session, context }) => await permissions.canManageProducts({ session, context }) ? storeScopedFilter({ session }) : publicStoreScopedFilter(),
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) throw new Error("An active store is required");
      return { ...resolvedData, store: { connect: { id: context.session.data.store.id } } };
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "handle", "temperatureZone", "sortOrder", "isActive"]
    }
  },
  fields: {
    name: (0, import_fields8.text)({
      validation: { isRequired: true },
      label: "Department Name",
      ui: {
        description: "e.g., Produce, Meat, Dairy, Bakery, Frozen, etc."
      }
    }),
    handle: (0, import_fields8.text)({
      isIndexed: "unique",
      label: "Handle",
      ui: {
        description: "URL-friendly identifier (e.g., 'produce', 'meat-seafood')"
      }
    }),
    description: (0, import_fields8.text)({
      ui: {
        displayMode: "textarea",
        description: "Brief description shown on storefront"
      }
    }),
    imageUrl: (0, import_fields8.text)({
      label: "Image URL",
      ui: {
        description: "URL of the department image"
      }
    }),
    sortOrder: (0, import_fields8.integer)({
      defaultValue: 0,
      label: "Sort Order",
      ui: {
        description: "Display order on storefront (lower numbers first)"
      }
    }),
    isActive: (0, import_fields8.checkbox)({
      defaultValue: true,
      label: "Active",
      ui: {
        description: "Show this department on the storefront"
      }
    }),
    temperatureZone: (0, import_fields8.select)({
      type: "enum",
      options: [
        { label: "Ambient", value: "ambient" },
        { label: "Refrigerated", value: "refrigerated" },
        { label: "Frozen", value: "frozen" }
      ],
      defaultValue: "ambient",
      label: "Temperature Zone",
      ui: {
        description: "Storage temperature requirements"
      }
    }),
    requiredLicenses: (0, import_fields8.multiselect)({
      access: { read: permissions.canManageProducts },
      type: "enum",
      options: [
        { label: "Alcohol License", value: "alcohol" },
        { label: "Tobacco License", value: "tobacco" },
        { label: "Pharmacy License", value: "pharmacy" }
      ],
      label: "Required Licenses",
      ui: {
        description: "Special licenses required to sell items in this department"
      }
    }),
    // Relationships
    store: (0, import_fields8.relationship)({
      ref: "Store.departments",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false }
    }),
    manager: (0, import_fields8.relationship)({
      access: { read: permissions.canManageProducts },
      ref: "User",
      label: "Department Manager",
      ui: {
        description: "User responsible for this department"
      }
    }),
    products: (0, import_fields8.relationship)({
      ref: "Product.departmentRef",
      many: true,
      label: "Products"
    }),
    ...trackingFields
  }
});

// features/keystone/models/DeliveryRoute.ts
var import_core8 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var DeliveryRoute = (0, import_core8.list)({
  access: {
    operation: {
      query: permissions.canManageDelivery,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter }
  },
  ui: {
    listView: {
      initialColumns: ["driver", "date", "timeWindow", "status"]
    }
  },
  fields: {
    date: (0, import_fields9.timestamp)({
      validation: { isRequired: true },
      label: "Delivery Date"
    }),
    timeWindow: (0, import_fields9.select)({
      type: "enum",
      options: [
        { label: "8 AM - 10 AM", value: "time_8_10" },
        { label: "10 AM - 12 PM", value: "time_10_12" },
        { label: "12 PM - 2 PM", value: "time_12_14" },
        { label: "2 PM - 4 PM", value: "time_14_16" },
        { label: "4 PM - 6 PM", value: "time_16_18" },
        { label: "6 PM - 8 PM", value: "time_18_20" }
      ],
      validation: { isRequired: true },
      label: "Time Window",
      ui: {
        description: "Delivery time slot"
      }
    }),
    stops: (0, import_fields9.json)({
      label: "Stops",
      ui: {
        description: "JSON array with optimized delivery sequence",
        views: require.resolve("@keystone-6/core/fields/types/json/views")
      }
    }),
    status: (0, import_fields9.select)({
      type: "enum",
      options: [
        { label: "Planning", value: "planning" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" }
      ],
      defaultValue: "planning",
      label: "Status"
    }),
    startedAt: (0, import_fields9.timestamp)({
      label: "Started At",
      ui: {
        description: "When the driver started this route"
      }
    }),
    completedAt: (0, import_fields9.timestamp)({
      label: "Completed At",
      ui: {
        description: "When all deliveries were completed"
      }
    }),
    // Relationships
    store: (0, import_fields9.relationship)({
      ref: "Store.deliveryRoutes",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    driver: (0, import_fields9.relationship)({
      ref: "User",
      label: "Driver",
      ui: {
        description: "User assigned to drive this route"
      }
    }),
    orders: (0, import_fields9.relationship)({
      ref: "Order.deliveryRoute",
      many: true,
      label: "Orders",
      ui: {
        description: "Orders to be delivered on this route"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/DeliverySlot.ts
var import_core9 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var DeliverySlot = (0, import_core9.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) return resolvedData;
      return { ...resolvedData, store: { connect: { id: context.session.data.store.id } } };
    },
    validate: { delete: async ({ item, addValidationError }) => {
      if (Number(item.currentBookings || 0) > 0) addValidationError("Booked delivery slots cannot be deleted");
    } }
  },
  ui: {
    listView: {
      initialColumns: ["date", "startTime", "endTime", "capacity", "currentBookings", "isActive"]
    }
  },
  fields: {
    store: (0, import_fields10.relationship)({
      ref: "Store.deliverySlots",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageDelivery, update: () => false }
    }),
    orders: (0, import_fields10.relationship)({ ref: "Order.deliverySlot", many: true, access: { update: () => false } }),
    // Date of the delivery slot
    date: (0, import_fields10.timestamp)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Date",
      ui: {
        description: "Date for this delivery time window"
      }
    }),
    // Start time of the delivery window
    startTime: (0, import_fields10.text)({
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this delivery window (e.g., '09:00')"
      }
    }),
    // End time of the delivery window
    endTime: (0, import_fields10.text)({
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this delivery window (e.g., '11:00')"
      }
    }),
    // Maximum number of deliveries for this slot
    capacity: (0, import_fields10.integer)({
      access: { update: () => false },
      validation: { isRequired: true, min: 1 },
      defaultValue: 10,
      label: "Capacity",
      ui: {
        description: "Maximum number of deliveries that can be scheduled for this slot"
      }
    }),
    // Current number of deliveries booked
    currentBookings: (0, import_fields10.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      validation: { min: 0 },
      label: "Current Bookings",
      ui: {
        description: "Current number of deliveries booked for this slot"
      }
    }),
    // Whether the slot is active and available for booking
    isActive: (0, import_fields10.checkbox)({
      access: { update: () => false },
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this delivery slot is active and available for booking"
      }
    }),
    // Delivery fee for this slot (e.g., premium for express slots)
    deliveryFee: (0, import_fields10.integer)({
      access: { update: () => false },
      defaultValue: 0,
      validation: { min: 0 },
      label: "Delivery Fee (cents)",
      ui: {
        description: "Delivery fee in cents for this time slot (0 for free delivery)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/FavoriteProduct.ts
var import_core10 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
var FavoriteProduct = (0, import_core10.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ownerScopedFilter("user"),
      update: ownerScopedFilter("user"),
      delete: ownerScopedFilter("user")
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) throw new Error("An authenticated owner is required");
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
    }
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["user", "product", "favoritedAt"]
    }
  },
  fields: {
    // User who favorited the product
    user: (0, import_fields11.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "The user who favorited this product"
      }
    }),
    // Product ID (text field as specified)
    product: (0, import_fields11.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product display snapshot"
      }
    }),
    productRef: (0, import_fields11.relationship)({
      ref: "Product.favoriteProducts",
      access: { create: () => false, update: () => false },
      label: "Product"
    }),
    // When the product was favorited
    favoritedAt: (0, import_fields11.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Favorited At",
      ui: {
        description: "When this product was added to favorites"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/GroceryOutboxEvent.ts
var import_core11 = require("@keystone-6/core");
var import_fields12 = require("@keystone-6/core/fields");
var DELIVERY_FIELDS = /* @__PURE__ */ new Set([
  "status",
  "attempts",
  "claimToken",
  "claimedAt",
  "deliveredAt",
  "lastError"
]);
var GroceryOutboxEvent = (0, import_core11.list)({
  access: {
    operation: {
      query: permissions.canManageOnboarding,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter }
  },
  hooks: {
    validate: {
      update: async ({ resolvedData, addValidationError }) => {
        const invalid = Object.keys(resolvedData).filter((key2) => !DELIVERY_FIELDS.has(key2));
        if (invalid.length) addValidationError("Outbox event identity and payload are immutable");
      },
      delete: async ({ addValidationError }) => {
        addValidationError("Outbox event evidence cannot be deleted");
      }
    }
  },
  ui: {
    labelField: "eventKey",
    listView: { initialColumns: ["eventType", "aggregateType", "aggregateId", "status", "attempts", "occurredAt"] }
  },
  fields: {
    store: (0, import_fields12.relationship)({
      ref: "Store.outboxEvents",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    eventKey: (0, import_fields12.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { update: () => false } }),
    eventType: (0, import_fields12.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    aggregateType: (0, import_fields12.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    aggregateId: (0, import_fields12.text)({ validation: { isRequired: true }, isIndexed: true, access: { update: () => false } }),
    schemaVersion: (0, import_fields12.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 }, access: { update: () => false } }),
    payload: (0, import_fields12.json)({ access: { update: () => false } }),
    payloadHash: (0, import_fields12.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    occurredAt: (0, import_fields12.timestamp)({ validation: { isRequired: true }, isIndexed: true, access: { update: () => false } }),
    status: (0, import_fields12.text)({ defaultValue: "pending", isIndexed: true }),
    attempts: (0, import_fields12.integer)({ defaultValue: 0, validation: { min: 0 } }),
    claimToken: (0, import_fields12.text)(),
    claimedAt: (0, import_fields12.timestamp)(),
    deliveredAt: (0, import_fields12.timestamp)(),
    lastError: (0, import_fields12.text)({ ui: { displayMode: "textarea" } }),
    ...trackingFields
  }
});

// features/keystone/models/InventoryLot.ts
var import_core12 = require("@keystone-6/core");
var import_fields13 = require("@keystone-6/core/fields");
var InventoryLot = (0, import_core12.list)({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter }
  },
  ui: {
    labelField: "lotNumber",
    listView: {
      initialColumns: ["lotNumber", "product", "expirationDate", "quantityRemaining", "supplier"]
    }
  },
  fields: {
    lotNumber: (0, import_fields13.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Lot Number",
      ui: {
        description: "Unique identifier for this inventory lot"
      }
    }),
    expirationDate: (0, import_fields13.timestamp)({
      validation: { isRequired: true },
      label: "Expiration Date",
      ui: {
        description: "Date when this lot expires"
      }
    }),
    receivedDate: (0, import_fields13.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Received Date",
      ui: {
        description: "Date this lot was received"
      }
    }),
    quantity: (0, import_fields13.integer)({
      validation: { isRequired: true, min: 0 },
      label: "Original Quantity",
      ui: {
        description: "Total units received in this lot"
      }
    }),
    quantityRemaining: (0, import_fields13.integer)({
      validation: { isRequired: true, min: 0 },
      label: "Quantity Remaining",
      ui: {
        description: "Units still available in this lot"
      }
    }),
    costPerUnit: (0, import_fields13.float)({
      validation: { isRequired: true },
      label: "Cost Per Unit (legacy display)",
      ui: { description: "Legacy display value; costPerUnitCents is authoritative" }
    }),
    costPerUnitCents: (0, import_fields13.integer)({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: "Cost Per Unit (minor units)"
    }),
    location: (0, import_fields13.text)({
      label: "Location",
      ui: {
        description: "Warehouse zone/bin location (e.g., A-1-3)"
      }
    }),
    // Relationships
    store: (0, import_fields13.relationship)({
      ref: "Store.inventoryLots",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    product: (0, import_fields13.relationship)({
      ref: "Product.inventoryLots",
      label: "Product"
    }),
    supplier: (0, import_fields13.relationship)({
      ref: "Supplier.inventoryLots",
      label: "Supplier"
    }),
    orderLineAllocations: (0, import_fields13.relationship)({
      ref: "OrderLineInventoryAllocation.inventoryLot",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    ...trackingFields
  }
});

// features/keystone/models/InventoryAdjustment.ts
var import_core13 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
var InventoryAdjustment = (0, import_core13.list)({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter }
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields14.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    reason: (0, import_fields14.select)({
      type: "enum",
      options: [
        { label: "Cycle count", value: "cycle_count" },
        { label: "Damage", value: "damage" },
        { label: "Spoilage", value: "spoilage" },
        { label: "Correction", value: "correction" }
      ],
      validation: { isRequired: true }
    }),
    quantityBefore: (0, import_fields14.integer)({ validation: { isRequired: true } }),
    quantityAfter: (0, import_fields14.integer)({ validation: { isRequired: true } }),
    quantityDelta: (0, import_fields14.integer)({ validation: { isRequired: true } }),
    productStockBefore: (0, import_fields14.integer)({ validation: { isRequired: true } }),
    productStockAfter: (0, import_fields14.integer)({ validation: { isRequired: true } }),
    note: (0, import_fields14.text)(),
    store: (0, import_fields14.relationship)({
      ref: "Store.inventoryAdjustments",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    product: (0, import_fields14.relationship)({ ref: "Product" }),
    inventoryLot: (0, import_fields14.relationship)({ ref: "InventoryLot" }),
    adjustedBy: (0, import_fields14.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/LoyaltyProgram.ts
var import_core14 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");
var LoyaltyProgram = (0, import_core14.list)({
  access: {
    operation: {
      query: () => true,
      create: permissions.canManageUsers,
      update: permissions.canManageUsers,
      delete: permissions.canManageUsers
    },
    filter: {
      query: ({ session }) => session?.itemId ? storeScopedFilter({ session }) : publicStoreScopedFilter(),
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ operation, resolvedData, context }) => {
      if (operation !== "create") return resolvedData;
      const storeId = context.session?.data.store?.id;
      if (!storeId) throw new Error("An active store is required");
      return { ...resolvedData, store: { connect: { id: storeId } } };
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "pointsPerDollar", "isActive"]
    }
  },
  fields: {
    store: (0, import_fields15.relationship)({
      ref: "Store.loyaltyPrograms",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      // Public loyalty projections do not expose the authenticated Store row.
      graphql: { isNonNull: { create: true } },
      access: { create: () => false, update: () => false }
    }),
    // Program name
    name: (0, import_fields15.text)({
      validation: { isRequired: true },
      label: "Program Name",
      ui: {
        description: "Name of the loyalty program (e.g., 'Grocery Rewards', 'Fresh Points')"
      }
    }),
    // Points earned per dollar spent
    pointsPerDollar: (0, import_fields15.float)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 1,
      label: "Points Per Dollar",
      ui: {
        description: "How many points customers earn per dollar spent"
      }
    }),
    // Tier configuration and thresholds
    tierConfiguration: (0, import_fields15.json)({
      label: "Tier Configuration",
      ui: {
        description: 'JSON configuration for tier levels, thresholds, and benefits. Example: [{"name":"Bronze","threshold":0,"benefits":["1x points"]},{"name":"Silver","threshold":500,"benefits":["1.5x points","Free delivery over $50"]},{"name":"Gold","threshold":2000,"benefits":["2x points","Free delivery","Birthday rewards"]},{"name":"Platinum","threshold":5000,"benefits":["3x points","Free delivery","Exclusive deals","Early access"]}]',
        views: "./admin/json-view",
        createView: {
          fieldMode: "edit"
        }
      }
    }),
    // Point redemption rules
    redemptionRules: (0, import_fields15.json)({
      label: "Redemption Rules",
      ui: {
        description: 'JSON configuration for point redemption rules. Example: {"pointsPerDollar":100,"minimumRedemption":100,"maximumRedemption":5000}',
        views: "./admin/json-view",
        createView: {
          fieldMode: "edit"
        }
      }
    }),
    // Points expiration configuration
    expirationRules: (0, import_fields15.json)({
      label: "Expiration Rules",
      ui: {
        description: 'JSON configuration for point expiration. Example: {"enabled":true,"expirationDays":365,"warningDays":30}',
        views: "./admin/json-view",
        createView: {
          fieldMode: "edit"
        }
      }
    }),
    // Additional benefits per tier
    tierBenefits: (0, import_fields15.json)({
      label: "Tier Benefits",
      ui: {
        description: "Additional tier-specific benefits like free delivery thresholds, birthday rewards, etc.",
        views: "./admin/json-view",
        createView: {
          fieldMode: "edit"
        }
      }
    }),
    // Whether the program is currently active
    isActive: (0, import_fields15.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this loyalty program is currently active"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/LoyaltyTransaction.ts
var import_core15 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
var LoyaltyTransaction = (0, import_core15.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: async ({ session, context }) => {
        const store = ownerStoreScopedFilter("user")({ session });
        if (store === false) return false;
        if (await permissions.canManageOrders({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { user: { id: { equals: session.itemId } } }] };
        return false;
      },
      update: ownerStoreScopedFilter("user"),
      delete: ownerStoreScopedFilter("user")
    }
  },
  ui: {
    labelField: "description",
    listView: {
      initialColumns: ["user", "points", "type", "transactionDate", "balanceAfter"]
    }
  },
  fields: {
    // User who owns this transaction
    user: (0, import_fields16.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user this transaction belongs to"
      }
    }),
    // Points awarded or redeemed (positive for earned, negative for redeemed)
    points: (0, import_fields16.integer)({
      validation: { isRequired: true },
      label: "Points",
      ui: {
        description: "Points earned (positive) or redeemed (negative)"
      }
    }),
    // Transaction type
    type: (0, import_fields16.select)({
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
        { label: "Refund - Deducted", value: "refund_deducted" }
      ],
      validation: { isRequired: true },
      label: "Transaction Type",
      ui: {
        description: "Type of loyalty transaction"
      }
    }),
    // Description of the transaction
    description: (0, import_fields16.text)({
      validation: { isRequired: true },
      label: "Description",
      ui: {
        description: "Description of what this transaction is for",
        displayMode: "textarea"
      }
    }),
    // Related order (if applicable)
    order: (0, import_fields16.relationship)({
      ref: "Order",
      label: "Order",
      ui: {
        description: "Order associated with this transaction (if applicable)"
      }
    }),
    // Balance after this transaction
    balanceAfter: (0, import_fields16.integer)({
      validation: { isRequired: true },
      label: "Balance After",
      ui: {
        description: "User's points balance after this transaction"
      }
    }),
    // When the transaction occurred
    transactionDate: (0, import_fields16.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Transaction Date",
      ui: {
        description: "When this transaction occurred"
      }
    }),
    // Expiration date (for earned points)
    expiresAt: (0, import_fields16.timestamp)({
      label: "Expires At",
      ui: {
        description: "When these points expire (if applicable)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/NotificationPreference.ts
var import_core16 = require("@keystone-6/core");
var import_fields17 = require("@keystone-6/core/fields");
var NotificationPreference = (0, import_core16.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ownerScopedFilter("user"),
      update: ownerScopedFilter("user"),
      delete: ownerScopedFilter("user")
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) throw new Error("An authenticated owner is required");
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
    }
  },
  ui: {
    labelField: "user",
    listView: {
      initialColumns: ["user", "orderUpdates", "deliveryAlerts", "priceDrops", "backInStock", "weeklyDeals"]
    }
  },
  fields: {
    // User relationship
    user: (0, import_fields17.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "The user these preferences belong to"
      }
    }),
    // Order updates notifications
    orderUpdates: (0, import_fields17.checkbox)({
      defaultValue: true,
      label: "Order Updates",
      ui: {
        description: "Receive notifications about order status changes"
      }
    }),
    // Delivery alerts
    deliveryAlerts: (0, import_fields17.checkbox)({
      defaultValue: true,
      label: "Delivery Alerts",
      ui: {
        description: "Receive notifications about delivery status and ETA"
      }
    }),
    // Price drop notifications
    priceDrops: (0, import_fields17.checkbox)({
      defaultValue: false,
      label: "Price Drops",
      ui: {
        description: "Receive notifications when favorited products go on sale"
      }
    }),
    // Back in stock notifications
    backInStock: (0, import_fields17.checkbox)({
      defaultValue: false,
      label: "Back in Stock",
      ui: {
        description: "Receive notifications when out-of-stock products become available"
      }
    }),
    // Weekly deals digest
    weeklyDeals: (0, import_fields17.checkbox)({
      defaultValue: false,
      label: "Weekly Deals",
      ui: {
        description: "Receive weekly digest of deals and promotions"
      }
    }),
    // Notification channels (JSON array: email/sms/push)
    channels: (0, import_fields17.json)({
      label: "Notification Channels",
      ui: {
        description: "JSON array of notification channels: ['email', 'sms', 'push']"
      },
      defaultValue: ["email"]
    }),
    ...trackingFields
  }
});

// features/keystone/models/Order.ts
var import_core17 = require("@keystone-6/core");
var import_fields18 = require("@keystone-6/core/fields");
function canUpdateUnroutedOrder({ item }) {
  return !item.deliveryRouteId;
}
function calendarDay(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}
var Order = (0, import_core17.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: async ({ session, context }) => {
        const store = storeScopedFilter({ session });
        if (store === false) return false;
        if (await permissions.canManageOrders({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { user: { id: { equals: session.itemId } } }] };
        return false;
      },
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    validate: {
      update: async ({ item, resolvedData, context, addValidationError }) => {
        const current = item;
        if (!current.deliveryRouteId) return;
        const route = await context.sudo().query.DeliveryRoute.findOne({
          where: { id: current.deliveryRouteId },
          query: "id status date timeWindow"
        });
        if (!route) {
          addValidationError("Routed orders must retain their delivery route");
          return;
        }
        const expectedStatus = route.status === "planning" ? "packed" : route.status === "in_progress" ? "out_for_delivery" : "delivered";
        const nextStatus = resolvedData.status ?? current.status;
        if (nextStatus !== expectedStatus) {
          addValidationError(`Routed order status must remain ${expectedStatus}`);
        }
        const nextDeliveryDate = resolvedData.deliveryDate ?? current.deliveryDate;
        if (calendarDay(nextDeliveryDate) !== calendarDay(route.date)) {
          addValidationError("Routed order delivery date must match its route");
        }
        const nextTimeWindow = resolvedData.deliveryTimeWindow ?? current.deliveryTimeWindow;
        if (nextTimeWindow !== route.timeWindow) {
          addValidationError("Routed order delivery window must match its route");
        }
        if (resolvedData.metadata !== void 0) {
          const previousMetadata = current.metadata || {};
          const nextMetadata = resolvedData.metadata || {};
          if (nextMetadata.deliveryRouteId !== current.deliveryRouteId) {
            addValidationError("Routed order metadata must retain its delivery route");
          }
          for (const key2 of ["routedAt", "dispatchedAt", "deliveredAt"]) {
            if (previousMetadata[key2] && nextMetadata[key2] !== previousMetadata[key2]) {
              addValidationError(`Routed order metadata must retain ${key2}`);
            }
          }
        }
      },
      delete: async ({ item, addValidationError }) => {
        const current = item;
        if (current.deliveryRouteId) {
          addValidationError("Routed orders cannot be deleted");
        }
      }
    }
  },
  ui: {
    labelField: "displayId",
    listView: {
      initialColumns: ["displayId", "status", "email", "deliveryDate", "deliveryTimeWindow"]
    }
  },
  fields: {
    displayId: (0, import_fields18.integer)({
      isIndexed: "unique",
      validation: { isRequired: true },
      label: "Order Number"
    }),
    email: (0, import_fields18.text)({
      validation: { isRequired: true },
      label: "Customer Email"
    }),
    status: (0, import_fields18.select)({
      access: { create: () => false, update: () => false },
      type: "enum",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Picking", value: "picking" },
        { label: "Packed", value: "packed" },
        { label: "Out for Delivery", value: "out_for_delivery" },
        { label: "Delivered", value: "delivered" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      label: "Status"
    }),
    taxRate: (0, import_fields18.float)({
      label: "Tax Rate"
    }),
    currencyCode: (0, import_fields18.text)({ defaultValue: "USD", validation: { isRequired: true } }),
    subtotalCents: (0, import_fields18.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    taxCents: (0, import_fields18.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    deliveryFeeCents: (0, import_fields18.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    discountCents: (0, import_fields18.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    totalCents: (0, import_fields18.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    canceledAt: (0, import_fields18.timestamp)({
      access: { create: () => false, update: () => false },
      label: "Cancelled At"
    }),
    metadata: (0, import_fields18.json)({ access: { create: () => false, update: () => false } }),
    noNotification: (0, import_fields18.checkbox)({
      defaultValue: false,
      label: "Suppress Notifications"
    }),
    // Delivery time window fields (grocery-specific)
    deliveryDate: (0, import_fields18.timestamp)({
      access: { update: canUpdateUnroutedOrder },
      validation: { isRequired: true },
      label: "Delivery Date",
      ui: {
        description: "Scheduled delivery date"
      }
    }),
    deliveryTimeWindow: (0, import_fields18.select)({
      access: { update: canUpdateUnroutedOrder },
      type: "enum",
      options: [
        { label: "8 AM - 10 AM", value: "time_8_10" },
        { label: "10 AM - 12 PM", value: "time_10_12" },
        { label: "12 PM - 2 PM", value: "time_12_14" },
        { label: "2 PM - 4 PM", value: "time_14_16" },
        { label: "4 PM - 6 PM", value: "time_16_18" },
        { label: "6 PM - 8 PM", value: "time_18_20" }
      ],
      validation: { isRequired: true },
      label: "Delivery Time Window",
      ui: {
        description: "Customer's selected delivery time slot"
      }
    }),
    deliveryInstructions: (0, import_fields18.text)({
      ui: {
        displayMode: "textarea",
        description: "Special delivery instructions from customer"
      },
      label: "Delivery Instructions"
    }),
    substitutionPreference: (0, import_fields18.select)({
      type: "enum",
      options: [
        { label: "Call Me", value: "call_me" },
        { label: "Best Match", value: "best_match" },
        { label: "Refund", value: "refund" }
      ],
      defaultValue: "best_match",
      label: "Substitution Preference",
      ui: {
        description: "What to do if an item is out of stock"
      }
    }),
    // Relationships
    store: (0, import_fields18.relationship)({
      ref: "Store.orders",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    user: (0, import_fields18.relationship)({
      ref: "User",
      label: "Customer"
    }),
    shippingAddress: (0, import_fields18.relationship)({
      ref: "Address",
      label: "Shipping Address"
    }),
    billingAddress: (0, import_fields18.relationship)({
      ref: "Address",
      label: "Billing Address"
    }),
    checkoutAttempts: (0, import_fields18.relationship)({ ref: "CheckoutAttempt.order", many: true, access: { update: () => false }, ui: { itemView: { fieldMode: "read" } } }),
    payments: (0, import_fields18.relationship)({
      ref: "Payment.order",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    lineItems: (0, import_fields18.relationship)({
      ref: "OrderLineItem.order",
      many: true,
      label: "Line Items"
    }),
    deliverySlot: (0, import_fields18.relationship)({ ref: "DeliverySlot.orders", access: { update: () => false } }),
    pickupSlot: (0, import_fields18.relationship)({ ref: "PickupSlot.orders", access: { update: () => false } }),
    deliveryRoute: (0, import_fields18.relationship)({
      access: { update: () => false },
      ref: "DeliveryRoute.orders",
      label: "Delivery Route"
    }),
    ...trackingFields
  }
});

// features/keystone/models/OrderItemSubstitution.ts
var import_core18 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
function normalizeText(value) {
  return typeof value === "string" ? value.trim() : value;
}
var OrderItemSubstitution = (0, import_core18.list)({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: { query: nestedRelatedStoreScopedFilter("lineItem", "order"), update: nestedRelatedStoreScopedFilter("lineItem", "order"), delete: nestedRelatedStoreScopedFilter("lineItem", "order") }
  },
  hooks: {
    resolveInput: {
      create: async ({ resolvedData }) => ({
        ...resolvedData,
        orderItem: normalizeText(resolvedData.orderItem),
        originalProduct: normalizeText(resolvedData.originalProduct),
        substitutedProduct: normalizeText(resolvedData.substitutedProduct),
        reason: normalizeText(resolvedData.reason),
        idempotencyKey: normalizeText(resolvedData.idempotencyKey),
        approvedAt: resolvedData.customerApproved ? (/* @__PURE__ */ new Date()).toISOString() : null
      }),
      update: async ({ resolvedData, item }) => ({
        ...resolvedData,
        orderItem: normalizeText(resolvedData.orderItem),
        originalProduct: normalizeText(resolvedData.originalProduct),
        substitutedProduct: normalizeText(resolvedData.substitutedProduct),
        reason: normalizeText(resolvedData.reason),
        idempotencyKey: normalizeText(resolvedData.idempotencyKey),
        approvedAt: resolvedData.customerApproved === void 0 ? void 0 : resolvedData.customerApproved ? item.approvedAt || (/* @__PURE__ */ new Date()).toISOString() : null
      })
    },
    validate: {
      create: async ({ resolvedData, addValidationError }) => {
        const lineItemId = resolvedData.lineItem?.connect?.id;
        if (!lineItemId || resolvedData.orderItem !== lineItemId) {
          addValidationError("Substitution line-item relation and snapshot ID must match");
        }
        if (!resolvedData.idempotencyKey || String(resolvedData.idempotencyKey).length < 12) {
          addValidationError("A valid substitution idempotency key is required");
        }
      },
      update: async ({ addValidationError }) => {
        addValidationError("Substitution evidence is append-only and cannot be updated");
      },
      delete: async ({ addValidationError }) => {
        addValidationError("Substitution evidence cannot be deleted");
      }
    },
    beforeOperation: {
      create: async ({ context }) => {
        if (!await permissions.canManageOrders({ session: context.session, context })) {
          throw new Error("You do not have permission to record substitutions");
        }
      },
      update: async ({ context }) => {
        if (!await permissions.canManageOrders({ session: context.session, context })) {
          throw new Error("You do not have permission to record substitutions");
        }
      }
    }
  },
  ui: {
    labelField: "originalProduct",
    listView: {
      initialColumns: ["orderItem", "originalProduct", "substitutedProduct", "customerApproved"]
    }
  },
  fields: {
    idempotencyKey: (0, import_fields19.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      access: { update: () => false }
    }),
    orderItem: (0, import_fields19.text)({
      validation: { isRequired: true },
      access: { update: () => false },
      label: "Order Item ID Snapshot",
      ui: { itemView: { fieldMode: "read" } }
    }),
    lineItem: (0, import_fields19.relationship)({
      ref: "OrderLineItem.substitutions",
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    recordedBy: (0, import_fields19.relationship)({
      ref: "User",
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    originalProduct: (0, import_fields19.text)({
      validation: { isRequired: true },
      access: { update: () => false },
      label: "Original Product Snapshot",
      ui: { itemView: { fieldMode: "read" } }
    }),
    substitutedProduct: (0, import_fields19.text)({
      validation: { isRequired: true },
      access: { update: () => false },
      label: "Substituted Product Snapshot"
    }),
    reason: (0, import_fields19.text)({
      access: { update: () => false },
      ui: { displayMode: "textarea", itemView: { fieldMode: "read" } }
    }),
    customerApproved: (0, import_fields19.checkbox)({
      access: { update: () => false },
      defaultValue: false,
      ui: { itemView: { fieldMode: "read" } }
    }),
    approvedAt: (0, import_fields19.timestamp)({ access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/OrderLineItem.ts
var import_core19 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var OrderLineItem = (0, import_core19.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: async ({ session, context }) => {
        const store = relatedStoreScopedFilter("order")({ session });
        if (store === false) return false;
        if (await permissions.canManageOrders({ session, context })) return store;
        if (session?.itemId) return { AND: [store, { order: { user: { id: { equals: session.itemId } } } }] };
        return false;
      },
      update: relatedStoreScopedFilter("order"),
      delete: relatedStoreScopedFilter("order")
    }
  },
  ui: {
    listView: {
      initialColumns: ["title", "quantity", "unitPrice", "order"]
    }
  },
  fields: {
    title: (0, import_fields20.text)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Product Title",
      ui: { itemView: { fieldMode: "read" } }
    }),
    sku: (0, import_fields20.text)({
      access: { update: () => false },
      label: "SKU",
      ui: { itemView: { fieldMode: "read" } }
    }),
    quantity: (0, import_fields20.integer)({
      access: { update: () => false },
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: { itemView: { fieldMode: "read" } }
    }),
    unitPrice: (0, import_fields20.float)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Legacy display unit price",
      ui: { itemView: { fieldMode: "read" } }
    }),
    unitPriceCents: (0, import_fields20.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative unit price (minor units)" }),
    thumbnail: (0, import_fields20.text)({
      access: { update: () => false },
      label: "Thumbnail URL",
      ui: { itemView: { fieldMode: "read" } }
    }),
    metadata: (0, import_fields20.json)({
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    // Relationships
    order: (0, import_fields20.relationship)({
      access: { update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Order.lineItems",
      label: "Order",
      ui: { itemView: { fieldMode: "read" } }
    }),
    product: (0, import_fields20.relationship)({
      access: { update: () => false },
      ref: "Product",
      label: "Product",
      ui: { itemView: { fieldMode: "read" } }
    }),
    // Track which inventory lot was used (for FEFO)
    inventoryLot: (0, import_fields20.relationship)({
      access: { update: () => false },
      ref: "InventoryLot",
      label: "Inventory Lot",
      ui: {
        description: "Inventory lot used to fulfill this line item",
        itemView: { fieldMode: "read" }
      }
    }),
    inventoryAllocations: (0, import_fields20.relationship)({
      ref: "OrderLineInventoryAllocation.lineItem",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    substitutions: (0, import_fields20.relationship)({
      access: { update: () => false },
      ref: "OrderItemSubstitution.lineItem",
      many: true,
      label: "Substitution Evidence",
      ui: { itemView: { fieldMode: "read" } }
    }),
    ...trackingFields
  }
});

// features/keystone/models/OrderLineInventoryAllocation.ts
var import_core20 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
var OrderLineInventoryAllocation = (0, import_core20.list)({
  access: {
    operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false },
    filter: { query: nestedRelatedStoreScopedFilter("lineItem", "order") }
  },
  fields: {
    lineItem: (0, import_fields21.relationship)({
      ref: "OrderLineItem.inventoryAllocations",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    inventoryLot: (0, import_fields21.relationship)({
      ref: "InventoryLot.orderLineAllocations",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    store: (0, import_fields21.relationship)({
      ref: "Store.orderLineInventoryAllocations",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    quantity: (0, import_fields21.integer)({ validation: { isRequired: true, min: 1 }, access: { create: () => false, update: () => false } }),
    provenance: (0, import_fields21.json)({ access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/ParkingSpot.ts
var import_core21 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
var ParkingSpot = (0, import_core21.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: () => false
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) throw new Error("An active store is required");
      return { ...resolvedData, store: { connect: { id: context.session.data.store.id } } };
    }
  },
  ui: {
    labelField: "spotNumber",
    listView: {
      initialColumns: ["spotNumber", "description", "isAccessible", "isAvailable"]
    }
  },
  fields: {
    store: (0, import_fields22.relationship)({
      ref: "Store.parkingSpots",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageDelivery, update: () => false }
    }),
    spotNumber: (0, import_fields22.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Spot Number",
      ui: {
        description: "Unique identifier for this parking spot (e.g., 'A1', 'B2')"
      }
    }),
    description: (0, import_fields22.text)({
      label: "Description",
      ui: {
        displayMode: "textarea",
        description: "Additional details about this spot location"
      }
    }),
    isAccessible: (0, import_fields22.checkbox)({
      defaultValue: false,
      label: "Is Accessible",
      ui: {
        description: "Whether this spot is ADA accessible"
      }
    }),
    isAvailable: (0, import_fields22.checkbox)({
      access: { update: () => false },
      defaultValue: true,
      label: "Is Available",
      ui: {
        description: "Whether this spot is currently available for curbside pickup"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Payment.ts
var import_core22 = require("@keystone-6/core");
var import_fields23 = require("@keystone-6/core/fields");
var Payment = (0, import_core22.list)({
  access: {
    operation: {
      query: isSignedIn,
      // Payment rows and status transitions are domain-operation owned.
      create: () => false,
      update: () => false,
      delete: () => false
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
      delete: () => false
    }
  },
  hooks: {
    validate: {
      delete: async ({ addValidationError }) => addValidationError("Payment evidence cannot be deleted"),
      update: async ({ resolvedData, addValidationError }) => {
        if (resolvedData.amount !== void 0 || resolvedData.order !== void 0 || resolvedData.paymentProvider !== void 0 || resolvedData.providerPaymentId !== void 0) {
          addValidationError("Payment amount, ownership, provider, and provider identity are immutable");
        }
      }
    }
  },
  ui: {
    listView: {
      initialColumns: ["amount", "status", "paymentMethod", "order", "createdAt"]
    }
  },
  fields: {
    amount: (0, import_fields23.decimal)({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      ui: { description: "Legacy display amount; amountCents is authoritative" }
    }),
    amountCents: (0, import_fields23.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      label: "Payment amount (minor units)"
    }),
    status: (0, import_fields23.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Processing", value: "processing" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Refunded", value: "refunded" },
        { label: "Partially Refunded", value: "partially_refunded" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true }
    }),
    paymentMethod: (0, import_fields23.select)({
      type: "string",
      options: [
        { label: "Credit Card", value: "credit_card" },
        { label: "Debit Card", value: "debit_card" },
        { label: "Cash", value: "cash" },
        { label: "Gift Card", value: "gift_card" },
        { label: "Apple Pay", value: "apple_pay" },
        { label: "Google Pay", value: "google_pay" },
        { label: "EBT/SNAP", value: "ebt_snap" }
      ],
      defaultValue: "credit_card"
    }),
    providerPaymentId: (0, import_fields23.text)({
      isIndexed: "unique",
      ui: {
        description: "Provider payment identifier"
      }
    }),
    providerChargeId: (0, import_fields23.text)({
      ui: {
        description: "Provider charge/capture identifier"
      }
    }),
    providerRefundId: (0, import_fields23.text)({
      ui: {
        description: "Provider refund identifier"
      }
    }),
    providerData: (0, import_fields23.json)({
      defaultValue: {},
      ui: {
        description: "Normalized provider payload and metadata"
      }
    }),
    // Card details (last 4 digits for reference)
    cardLast4: (0, import_fields23.text)({
      ui: {
        description: "Last 4 digits of card"
      }
    }),
    cardBrand: (0, import_fields23.text)({
      ui: {
        description: "Card brand (visa, mastercard, etc.)"
      }
    }),
    // Delivery tip handling
    deliveryTipAmount: (0, import_fields23.decimal)({
      precision: 10,
      scale: 2,
      defaultValue: "0.00",
      ui: { description: "Legacy display tip; deliveryTipCents is authoritative" }
    }),
    deliveryTipCents: (0, import_fields23.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      label: "Delivery tip (minor units)"
    }),
    // Timestamps
    processedAt: (0, import_fields23.timestamp)({
      ui: {
        description: "When payment was successfully processed"
      }
    }),
    // Metadata for errors or additional info
    errorMessage: (0, import_fields23.text)({
      ui: {
        description: "Error message if payment failed"
      }
    }),
    notes: (0, import_fields23.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    // Relationships
    store: (0, import_fields23.relationship)({
      ref: "Store.payments",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    order: (0, import_fields23.relationship)({
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Order.payments",
      ui: {
        displayMode: "select"
      }
    }),
    paymentProvider: (0, import_fields23.relationship)({
      ref: "PaymentProvider.payments",
      ui: {
        displayMode: "select"
      }
    }),
    refunds: (0, import_fields23.relationship)({
      ref: "PaymentRefund.payment",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    webhookEvents: (0, import_fields23.relationship)({
      ref: "PaymentWebhookEvent.payment",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    processedBy: (0, import_fields23.relationship)({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who processed payment"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentProvider.ts
var import_core23 = require("@keystone-6/core");
var import_fields24 = require("@keystone-6/core/fields");
var PaymentProvider = (0, import_core23.list)({
  access: {
    // This is an immutable deployment-wide adapter registry populated only by
    // onboarding/seed code. Tenant operators cannot alter another Store's
    // checkout configuration through generic CRUD.
    operation: { query: () => false, create: () => false, update: () => false, delete: () => false }
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "isInstalled"]
    }
  },
  fields: {
    name: (0, import_fields24.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields24.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: "Payment provider code must start with pp_"
        }
      }
    }),
    isInstalled: (0, import_fields24.checkbox)({
      defaultValue: true
    }),
    metadata: (0, import_fields24.json)({
      defaultValue: {},
      ui: {
        description: "Non-secret display metadata only. Adapter secrets are read from server environment variables."
      }
    }),
    payments: (0, import_fields24.relationship)({
      ref: "Payment.paymentProvider",
      many: true
    }),
    sessions: (0, import_fields24.relationship)({
      ref: "PaymentSession.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentRefund.ts
var import_core24 = require("@keystone-6/core");
var import_fields25 = require("@keystone-6/core/fields");
var PaymentRefund = (0, import_core24.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: { query: relatedStoreScopedFilter("payment"), update: relatedStoreScopedFilter("payment"), delete: relatedStoreScopedFilter("payment") }
  },
  hooks: {
    validate: {
      update: async ({ resolvedData, addValidationError }) => {
        const immutableFields = [
          "idempotencyKey",
          "amount",
          "amountCents",
          "payment",
          "providerCode",
          "providerPaymentId",
          "requestedBy"
        ];
        if (immutableFields.some((field) => resolvedData[field] !== void 0)) {
          addValidationError("Refund request and ownership evidence are immutable");
        }
      },
      delete: async ({ addValidationError }) => {
        addValidationError("Refund evidence cannot be deleted");
      }
    }
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields25.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { update: () => false } }),
    amount: (0, import_fields25.decimal)({ precision: 10, scale: 2, validation: { isRequired: true }, access: { update: () => false } }),
    amountCents: (0, import_fields25.integer)({ validation: { isRequired: true, min: 1 }, access: { update: () => false } }),
    status: (0, import_fields25.select)({
      type: "enum",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Canceled", value: "canceled" }
      ],
      defaultValue: "processing",
      validation: { isRequired: true }
    }),
    providerCode: (0, import_fields25.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    providerPaymentId: (0, import_fields25.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    providerRefundId: (0, import_fields25.text)({ access: { update: () => false } }),
    providerStatus: (0, import_fields25.text)({ access: { update: () => false } }),
    providerData: (0, import_fields25.json)({ defaultValue: {}, access: { update: () => false } }),
    providerEventId: (0, import_fields25.text)({ db: { isNullable: true }, access: { update: () => false } }),
    providerEventCreatedAt: (0, import_fields25.timestamp)({ db: { isNullable: true }, access: { update: () => false } }),
    providerEventVersion: (0, import_fields25.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    failureMessage: (0, import_fields25.text)({ access: { update: () => false } }),
    reconciliationAttempts: (0, import_fields25.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    reconciliationOwner: (0, import_fields25.text)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationToken: (0, import_fields25.text)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationLeaseExpiresAt: (0, import_fields25.timestamp)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationNextAttemptAt: (0, import_fields25.timestamp)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationDeadLetterAt: (0, import_fields25.timestamp)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationLastError: (0, import_fields25.text)({ db: { isNullable: true }, access: { update: () => false } }),
    requestedAt: (0, import_fields25.timestamp)({ validation: { isRequired: true }, access: { update: () => false } }),
    processedAt: (0, import_fields25.timestamp)({ access: { update: () => false } }),
    payment: (0, import_fields25.relationship)({
      ref: "Payment.refunds",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    requestedBy: (0, import_fields25.relationship)({
      ref: "User.paymentRefunds",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentSession.ts
var import_core25 = require("@keystone-6/core");
var import_fields26 = require("@keystone-6/core/fields");
var PaymentSession = (0, import_core25.list)({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: relatedStoreScopedFilter("cart"),
      update: relatedStoreScopedFilter("cart"),
      delete: relatedStoreScopedFilter("cart")
    }
  },
  ui: {
    listView: {
      initialColumns: ["paymentProvider", "amount", "isSelected", "isInitiated"]
    }
  },
  fields: {
    isSelected: (0, import_fields26.checkbox)({ defaultValue: false }),
    isInitiated: (0, import_fields26.checkbox)({ defaultValue: false }),
    amount: (0, import_fields26.decimal)({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      defaultValue: "0.00"
    }),
    amountCents: (0, import_fields26.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { create: () => false, update: () => false } }),
    reservedOrderDisplayId: (0, import_fields26.integer)({ db: { isNullable: true }, isIndexed: "unique", access: { create: () => false, update: () => false }, validation: { min: 1 }, label: "Reserved order number" }),
    data: (0, import_fields26.json)({ defaultValue: {} }),
    idempotencyKey: (0, import_fields26.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { create: () => false, update: () => false } }),
    cart: (0, import_fields26.relationship)({ ref: "Cart.paymentSessions", access: { create: () => false, update: () => false } }),
    checkoutAttempts: (0, import_fields26.relationship)({ ref: "CheckoutAttempt.paymentSession", many: true }),
    paymentProvider: (0, import_fields26.relationship)({ ref: "PaymentProvider.sessions" }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentWebhookEvent.ts
var import_core26 = require("@keystone-6/core");
var import_fields27 = require("@keystone-6/core/fields");
var PaymentWebhookEvent = (0, import_core26.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter }
  },
  ui: {
    isHidden: true
  },
  fields: {
    replayKey: (0, import_fields27.text)({
      isIndexed: "unique",
      validation: { isRequired: true }
    }),
    providerCode: (0, import_fields27.text)({
      validation: { isRequired: true },
      isIndexed: true
    }),
    providerEventId: (0, import_fields27.text)({
      validation: { isRequired: true },
      isIndexed: true
    }),
    providerCreatedAt: (0, import_fields27.timestamp)({ db: { isNullable: true } }),
    providerVersion: (0, import_fields27.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    eventType: (0, import_fields27.text)({
      validation: { isRequired: true }
    }),
    payloadHash: (0, import_fields27.text)({
      validation: { isRequired: true }
    }),
    claimToken: (0, import_fields27.text)({
      validation: { isRequired: true },
      access: { read: permissions.canManagePayments }
    }),
    status: (0, import_fields27.select)({
      type: "enum",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Unmatched", value: "unmatched" }
      ],
      defaultValue: "processing",
      validation: { isRequired: true }
    }),
    paymentRecordId: (0, import_fields27.text)(),
    store: (0, import_fields27.relationship)({
      ref: "Store.paymentWebhookEvents",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    payment: (0, import_fields27.relationship)({
      ref: "Payment.webhookEvents",
      access: { update: () => false }
    }),
    processedAt: (0, import_fields27.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/PickupSlot.ts
var import_core27 = require("@keystone-6/core");
var import_fields28 = require("@keystone-6/core/fields");
var PickupSlot = (0, import_core27.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) return resolvedData;
      return { ...resolvedData, store: { connect: { id: context.session.data.store.id } } };
    },
    validate: { delete: async ({ item, addValidationError }) => {
      if (Number(item.currentOrders || 0) > 0) addValidationError("Booked pickup slots cannot be deleted");
    } }
  },
  ui: {
    listView: {
      initialColumns: ["date", "startTime", "endTime", "maxOrders", "currentOrders", "isAvailable"]
    }
  },
  fields: {
    store: (0, import_fields28.relationship)({
      ref: "Store.pickupSlots",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageDelivery, update: () => false }
    }),
    orders: (0, import_fields28.relationship)({ ref: "Order.pickupSlot", many: true, access: { update: () => false } }),
    date: (0, import_fields28.timestamp)({
      validation: { isRequired: true },
      label: "Date",
      ui: {
        description: "Date for this pickup slot"
      }
    }),
    startTime: (0, import_fields28.text)({
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this slot (e.g., '09:00')"
      }
    }),
    endTime: (0, import_fields28.text)({
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this slot (e.g., '10:00')"
      }
    }),
    maxOrders: (0, import_fields28.integer)({
      access: { update: () => false },
      validation: { isRequired: true },
      defaultValue: 10,
      label: "Max Orders",
      ui: {
        description: "Maximum number of orders that can be scheduled for this slot"
      }
    }),
    currentOrders: (0, import_fields28.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      label: "Current Orders",
      ui: {
        description: "Current number of orders scheduled for this slot"
      }
    }),
    isActive: (0, import_fields28.checkbox)({
      access: { update: () => false },
      defaultValue: true,
      label: "Operationally active",
      ui: { description: "Operator-owned slot state; capacity changes never reopen a closed slot" }
    }),
    isAvailable: (0, import_fields28.checkbox)({
      access: { update: () => false },
      defaultValue: true,
      label: "Has capacity",
      ui: {
        description: "Derived from operational state and remaining capacity"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/POItem.ts
var import_core28 = require("@keystone-6/core");
var import_fields29 = require("@keystone-6/core/fields");
var POItem = (0, import_core28.list)({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: () => false,
      update: permissions.canManageInventory,
      delete: () => false
    },
    filter: { query: relatedStoreScopedFilter("purchaseOrder"), update: relatedStoreScopedFilter("purchaseOrder"), delete: relatedStoreScopedFilter("purchaseOrder") }
  },
  hooks: {
    validate: {
      create: async ({ resolvedData, context, addValidationError }) => {
        const purchaseOrderId = resolvedData.purchaseOrder?.connect?.id;
        const purchaseOrder = purchaseOrderId ? await context.sudo().query.PurchaseOrder.findOne({
          where: { id: String(purchaseOrderId) },
          query: "status"
        }) : null;
        if (purchaseOrder?.status !== "draft") {
          addValidationError("Purchase order items can only be added to draft purchase orders");
        }
      },
      delete: async ({ item, context, addValidationError }) => {
        const poItem = await context.sudo().query.POItem.findOne({
          where: { id: String(item.id) },
          query: "purchaseOrder { status }"
        });
        if (poItem?.purchaseOrder?.status !== "draft") {
          addValidationError("Purchase order items can only be deleted from draft purchase orders");
        }
      }
    }
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["product", "quantity", "unitCost", "purchaseOrder"]
    }
  },
  fields: {
    productTitle: (0, import_fields29.text)({
      access: { create: () => false, update: () => false },
      validation: { isRequired: true },
      label: "Product Title Snapshot"
    }),
    productSku: (0, import_fields29.text)({
      access: { create: () => false, update: () => false },
      label: "Product SKU Snapshot"
    }),
    quantity: (0, import_fields29.integer)({
      access: { update: () => false },
      validation: { isRequired: true, min: 1 },
      label: "Quantity"
    }),
    unitCost: (0, import_fields29.float)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Unit Cost (legacy display)",
      ui: { description: "Legacy display value; unitCostCents is authoritative" }
    }),
    unitCostCents: (0, import_fields29.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      label: "Unit Cost (minor units)"
    }),
    quantityReceived: (0, import_fields29.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      label: "Quantity Received",
      ui: {
        description: "Actual quantity received (may differ from ordered)"
      }
    }),
    // Relationships
    purchaseOrder: (0, import_fields29.relationship)({
      access: { update: () => false },
      ref: "PurchaseOrder.items",
      label: "Purchase Order"
    }),
    product: (0, import_fields29.relationship)({
      access: { update: () => false },
      ref: "Product",
      label: "Product"
    }),
    ...trackingFields
  }
});

// features/keystone/models/PriceAlert.ts
var import_core29 = require("@keystone-6/core");
var import_fields30 = require("@keystone-6/core/fields");
var PriceAlert = (0, import_core29.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ownerScopedFilter("user"),
      update: ownerScopedFilter("user"),
      delete: ownerScopedFilter("user")
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) throw new Error("An authenticated owner is required");
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
    }
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["user", "product", "targetPrice", "currentPrice", "isTriggered"]
    }
  },
  fields: {
    // User who created the price alert
    user: (0, import_fields30.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "The user who created this price alert"
      }
    }),
    // Product ID (text field as specified)
    product: (0, import_fields30.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product display snapshot"
      }
    }),
    productRef: (0, import_fields30.relationship)({
      ref: "Product.priceAlerts",
      access: { create: () => false, update: () => false },
      label: "Product"
    }),
    // Target price the user wants to be notified at
    targetPrice: (0, import_fields30.decimal)({
      validation: { isRequired: true },
      precision: 12,
      scale: 2,
      label: "Target Price",
      ui: {
        description: "Price threshold to trigger the alert"
      }
    }),
    // Current price of the product
    currentPrice: (0, import_fields30.decimal)({
      precision: 12,
      scale: 2,
      label: "Current Price",
      ui: {
        description: "Current price of the product"
      }
    }),
    // Whether the alert has been triggered
    isTriggered: (0, import_fields30.checkbox)({
      defaultValue: false,
      label: "Is Triggered",
      ui: {
        description: "Whether the price alert has been triggered"
      }
    }),
    // When the user was notified
    notifiedAt: (0, import_fields30.timestamp)({
      label: "Notified At",
      ui: {
        description: "When the user was notified about the price drop"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Product.ts
var import_core30 = require("@keystone-6/core");
var import_fields31 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");
var Product = (0, import_core30.list)({
  access: {
    operation: {
      query: () => true,
      // Public can view products
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    },
    filter: {
      query: async ({ session, context }) => {
        const store = storeScopedFilter({ session });
        if (await permissions.canManageProducts({ session, context })) return store;
        return { AND: [publicStoreScopedFilter(), { status: { equals: "published" } }] };
      },
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) return resolvedData;
      return {
        ...resolvedData,
        priceCents: resolvedData.price !== void 0 ? Math.round(Number(resolvedData.price) * 100) : resolvedData.priceCents,
        costPriceCents: resolvedData.costPrice !== void 0 ? Math.round(Number(resolvedData.costPrice) * 100) : resolvedData.costPriceCents,
        store: { connect: { id: context.session.data.store.id } }
      };
    },
    validate: {
      create: async ({ resolvedData, context, addValidationError }) => {
        const storeId = context.session?.data.store?.id;
        const supplierId = resolvedData.supplier?.connect?.id;
        const departmentId = resolvedData.departmentRef?.connect?.id;
        if (supplierId) {
          const supplier = await context.prisma.supplier.findUnique({ where: { id: String(supplierId) }, select: { storeId: true } });
          if (!supplier || supplier.storeId !== storeId) addValidationError("Supplier must belong to the active store");
        }
        if (departmentId) {
          const department = await context.prisma.department.findUnique({ where: { id: String(departmentId) }, select: { storeId: true } });
          if (!department || department.storeId !== storeId) addValidationError("Department must belong to the active store");
        }
      },
      update: async ({ resolvedData, context, addValidationError }) => {
        const storeId = context.session?.data.store?.id;
        const supplierId = resolvedData.supplier?.connect?.id;
        const departmentId = resolvedData.departmentRef?.connect?.id;
        if (supplierId) {
          const supplier = await context.prisma.supplier.findUnique({ where: { id: String(supplierId) }, select: { storeId: true } });
          if (!supplier || supplier.storeId !== storeId) addValidationError("Supplier must belong to the active store");
        }
        if (departmentId) {
          const department = await context.prisma.department.findUnique({ where: { id: String(departmentId) }, select: { storeId: true } });
          if (!department || department.storeId !== storeId) addValidationError("Department must belong to the active store");
        }
      },
      delete: async ({ item, context, addValidationError }) => {
        const productId = String(item.id);
        const [lotCount, poItemCount, orderLineItemCount, cartItemCount, shoppingListItemCount, subscriptionCount, recipeIngredientCount, favoriteProductCount, alertCount] = await Promise.all([
          context.prisma.inventoryLot.count({ where: { productId } }),
          context.prisma.pOItem.count({ where: { productId } }),
          context.prisma.orderLineItem.count({ where: { productId } }),
          context.prisma.cartItem.count({ where: { productId } }),
          context.prisma.shoppingListItem.count({ where: { productRefId: productId } }),
          context.prisma.subscription.count({ where: { productRefId: productId } }),
          context.prisma.recipeIngredient.count({ where: { productRefId: productId } }),
          context.prisma.favoriteProduct.count({ where: { productRefId: productId } }),
          Promise.all([
            context.prisma.backInStockAlert.count({ where: { productRefId: productId } }),
            context.prisma.priceAlert.count({ where: { productRefId: productId } })
          ]).then(([backInStock, price]) => backInStock + price)
        ]);
        if (Number(item.stockQuantity || 0) > 0 || lotCount > 0) {
          addValidationError("Stocked products must be archived instead of deleted");
        }
        if (poItemCount > 0) {
          addValidationError("Products referenced by purchase orders must be archived instead of deleted");
        }
        if (orderLineItemCount > 0) {
          addValidationError("Products referenced by order history must be archived instead of deleted");
        }
        if (cartItemCount + shoppingListItemCount + subscriptionCount + recipeIngredientCount + favoriteProductCount + alertCount > 0) {
          addValidationError("Product catalog references cannot be deleted");
        }
      }
    }
  },
  ui: {
    labelField: "title",
    listView: {
      initialColumns: ["title", "department", "pricingMethod", "isPerishable", "status"]
    }
  },
  fields: {
    title: (0, import_fields31.text)({
      validation: { isRequired: true },
      label: "Product Title"
    }),
    description: (0, import_fields_document.document)({
      formatting: true,
      links: true,
      dividers: true,
      layouts: [
        [1, 1],
        [1, 1, 1]
      ]
    }),
    handle: (0, import_fields31.text)({
      isIndexed: "unique",
      label: "Handle",
      ui: {
        description: "URL-friendly identifier"
      }
    }),
    sku: (0, import_fields31.text)({
      label: "SKU",
      ui: {
        description: "Stock Keeping Unit"
      }
    }),
    status: (0, import_fields31.select)({
      type: "enum",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" }
      ],
      defaultValue: "draft",
      validation: { isRequired: true }
    }),
    metadata: (0, import_fields31.json)({ access: { read: permissions.canManageProducts } }),
    // Pricing fields
    price: (0, import_fields31.float)({
      label: "Legacy display price (USD)",
      ui: {
        description: "Product price in dollars"
      },
      validation: { min: 0 }
    }),
    priceCents: (0, import_fields31.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative price (minor units)" }),
    compareAtPrice: (0, import_fields31.float)({
      label: "Compare at Price",
      ui: {
        description: "Original price for sale items"
      },
      validation: { min: 0 }
    }),
    costPrice: (0, import_fields31.float)({
      access: { read: permissions.canManageProducts },
      label: "Cost Price",
      ui: {
        description: "Cost to purchase from supplier"
      },
      validation: { min: 0 }
    }),
    costPriceCents: (0, import_fields31.integer)({ access: { read: permissions.canManageProducts, create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative cost (minor units)" }),
    // Inventory fields
    inStock: (0, import_fields31.checkbox)({
      access: { read: permissions.canManageProducts, create: () => false, update: () => false },
      defaultValue: false,
      label: "In Stock",
      ui: {
        description: "Reporting cache only; public sellability is derived from Store-owned unexpired inventory lots"
      }
    }),
    stockQuantity: (0, import_fields31.integer)({
      access: {
        read: permissions.canManageProducts,
        create: () => false,
        update: () => false
      },
      defaultValue: 0,
      label: "Stock Quantity",
      ui: {
        description: "Reporting cache only; public sellable quantity is derived from Store-owned unexpired inventory lots"
      },
      validation: { min: 0 }
    }),
    lowStockThreshold: (0, import_fields31.integer)({
      access: { read: permissions.canManageProducts },
      defaultValue: 10,
      label: "Low Stock Threshold",
      ui: {
        description: "Alert when stock falls below this number"
      }
    }),
    // Media
    imageUrl: (0, import_fields31.text)({
      label: "Image URL",
      ui: {
        description: "Main product image URL"
      }
    }),
    thumbnailUrl: (0, import_fields31.text)({
      label: "Thumbnail URL",
      ui: {
        description: "Small product thumbnail URL"
      }
    }),
    // Grocery-specific fields
    department: (0, import_fields31.select)({
      type: "enum",
      options: [
        { label: "Produce", value: "produce" },
        { label: "Meat", value: "meat" },
        { label: "Seafood", value: "seafood" },
        { label: "Dairy", value: "dairy" },
        { label: "Bakery", value: "bakery" },
        { label: "Deli", value: "deli" },
        { label: "Frozen", value: "frozen" },
        { label: "Pantry", value: "pantry" },
        { label: "Beverages", value: "beverages" },
        { label: "Snacks", value: "snacks" },
        { label: "Health & Beauty", value: "health_beauty" },
        { label: "Household", value: "household" }
      ],
      label: "Department",
      ui: {
        description: "Store department for this product"
      }
    }),
    isPerishable: (0, import_fields31.checkbox)({
      defaultValue: false,
      label: "Perishable",
      ui: {
        description: "Product requires refrigeration or has expiration date"
      }
    }),
    shelfLife: (0, import_fields31.integer)({
      label: "Shelf Life (days)",
      ui: {
        description: "Number of days product remains fresh"
      }
    }),
    pricingMethod: (0, import_fields31.select)({
      type: "enum",
      options: [
        { label: "Per Unit", value: "unit" },
        { label: "Per Weight", value: "weight" },
        { label: "Per Volume", value: "volume" }
      ],
      defaultValue: "unit",
      label: "Pricing Method",
      ui: {
        description: "How this product is priced"
      }
    }),
    unitOfMeasure: (0, import_fields31.select)({
      type: "enum",
      options: [
        { label: "Each", value: "each" },
        { label: "Pound (lb)", value: "lb" },
        { label: "Ounce (oz)", value: "oz" },
        { label: "Kilogram (kg)", value: "kg" },
        { label: "Gram (g)", value: "g" },
        { label: "Liter (L)", value: "L" },
        { label: "Milliliter (mL)", value: "mL" },
        { label: "Gallon", value: "gallon" },
        { label: "Quart", value: "quart" },
        { label: "Pint", value: "pint" }
      ],
      defaultValue: "each",
      label: "Unit of Measure"
    }),
    organicCertified: (0, import_fields31.checkbox)({
      defaultValue: false,
      label: "Organic Certified",
      ui: {
        description: "Product is certified organic"
      }
    }),
    allergens: (0, import_fields31.multiselect)({
      type: "enum",
      options: [
        { label: "Milk", value: "milk" },
        { label: "Eggs", value: "eggs" },
        { label: "Fish", value: "fish" },
        { label: "Shellfish", value: "shellfish" },
        { label: "Tree Nuts", value: "tree_nuts" },
        { label: "Peanuts", value: "peanuts" },
        { label: "Wheat", value: "wheat" },
        { label: "Soybeans", value: "soybeans" },
        { label: "Sesame", value: "sesame" }
      ],
      label: "Allergens",
      ui: {
        description: "Common allergens contained in this product"
      }
    }),
    // Relationships
    store: (0, import_fields31.relationship)({
      ref: "Store.products",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false }
    }),
    supplier: (0, import_fields31.relationship)({
      access: { read: permissions.canManageProducts },
      ref: "Supplier.products",
      label: "Supplier"
    }),
    departmentRef: (0, import_fields31.relationship)({
      ref: "Department.products",
      label: "Department Reference"
    }),
    inventoryLots: (0, import_fields31.relationship)({
      access: {
        read: permissions.canManageProducts,
        update: () => false
      },
      ref: "InventoryLot.product",
      many: true,
      label: "Inventory Lots"
    }),
    favoriteProducts: (0, import_fields31.relationship)({ ref: "FavoriteProduct.productRef", many: true, access: { update: () => false } }),
    backInStockAlerts: (0, import_fields31.relationship)({ ref: "BackInStockAlert.productRef", many: true, access: { update: () => false } }),
    priceAlerts: (0, import_fields31.relationship)({ ref: "PriceAlert.productRef", many: true, access: { update: () => false } }),
    shoppingListItems: (0, import_fields31.relationship)({ ref: "ShoppingListItem.productRef", many: true, access: { update: () => false } }),
    subscriptions: (0, import_fields31.relationship)({ ref: "Subscription.productRef", many: true, access: { update: () => false } }),
    recipeIngredients: (0, import_fields31.relationship)({ ref: "RecipeIngredient.productRef", many: true, access: { update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/PurchaseOrder.ts
var import_core31 = require("@keystone-6/core");
var import_fields32 = require("@keystone-6/core/fields");
function canUpdateDraftPurchaseOrder({ item }) {
  return item.status === "draft";
}
var PurchaseOrder = (0, import_core31.list)({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: () => false,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory
    },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter }
  },
  hooks: {
    validate: {
      delete: async ({ item, context, addValidationError }) => {
        const purchaseOrderId = String(item.id);
        const [purchaseOrder, itemCount] = await Promise.all([
          context.sudo().query.PurchaseOrder.findOne({
            where: { id: purchaseOrderId },
            query: "status"
          }),
          context.prisma.pOItem.count({ where: { purchaseOrderId } })
        ]);
        if (purchaseOrder?.status !== "draft") {
          addValidationError("Only draft purchase orders can be deleted");
        }
        if (itemCount > 0) {
          addValidationError("Draft purchase orders with items cannot be deleted");
        }
      }
    }
  },
  ui: {
    labelField: "poNumber",
    listView: {
      initialColumns: ["poNumber", "supplier", "orderDate", "status", "totalAmount"]
    }
  },
  fields: {
    poNumber: (0, import_fields32.text)({
      access: { update: () => false },
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "PO Number",
      ui: {
        description: "Generated transactionally by the purchase-order draft workflow"
      }
    }),
    idempotencyKey: (0, import_fields32.text)({
      isIndexed: "unique",
      db: { isNullable: true },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: "hidden" } }
    }),
    supplierName: (0, import_fields32.text)({
      access: { create: () => false, update: () => false },
      validation: { isRequired: true },
      label: "Supplier Name Snapshot"
    }),
    supplierEmail: (0, import_fields32.text)({
      access: { create: () => false, update: () => false },
      label: "Supplier Email Snapshot"
    }),
    orderDate: (0, import_fields32.timestamp)({
      access: { update: () => false },
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Order Date"
    }),
    expectedDeliveryDate: (0, import_fields32.timestamp)({
      access: { update: canUpdateDraftPurchaseOrder },
      label: "Expected Delivery Date",
      ui: {
        description: "When we expect to receive this order"
      }
    }),
    status: (0, import_fields32.select)({
      access: { create: () => false, update: () => false },
      type: "enum",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Sent", value: "sent" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Received", value: "received" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "draft",
      label: "Status"
    }),
    totalAmount: (0, import_fields32.float)({
      access: { update: () => false },
      label: "Total Amount (legacy display)",
      ui: { description: "Legacy display value; totalAmountCents is authoritative" }
    }),
    totalAmountCents: (0, import_fields32.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      label: "Total Amount (minor units)"
    }),
    receivedAt: (0, import_fields32.timestamp)({
      access: { create: () => false, update: () => false },
      label: "Received At",
      ui: {
        description: "When the order was actually received"
      }
    }),
    notes: (0, import_fields32.text)({
      access: { update: canUpdateDraftPurchaseOrder },
      ui: {
        displayMode: "textarea"
      },
      label: "Notes"
    }),
    // Relationships
    store: (0, import_fields32.relationship)({
      ref: "Store.purchaseOrders",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    supplier: (0, import_fields32.relationship)({
      access: { update: () => false },
      ref: "Supplier.purchaseOrders",
      label: "Supplier"
    }),
    items: (0, import_fields32.relationship)({
      access: { update: () => false },
      ref: "POItem.purchaseOrder",
      many: true,
      label: "Items",
      ui: {
        displayMode: "cards",
        cardFields: ["product", "quantity", "unitCost"],
        inlineCreate: { fields: ["product", "quantity", "unitCost"] },
        inlineEdit: { fields: ["product", "quantity", "unitCost"] }
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Recipe.ts
var import_core32 = require("@keystone-6/core");
var import_fields33 = require("@keystone-6/core/fields");
var Recipe = (0, import_core32.list)({
  // Recipes are retained as a dormant migration-compatible model, not part of
  // the bounded launch surface. Keep global legacy rows inaccessible.
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  ui: {
    isHidden: true,
    labelField: "name",
    listView: {
      initialColumns: ["name", "prepTime", "cookTime", "servings", "difficulty"]
    }
  },
  fields: {
    name: (0, import_fields33.text)({
      validation: { isRequired: true },
      label: "Recipe Name"
    }),
    description: (0, import_fields33.text)({
      label: "Description",
      ui: {
        description: "Brief description of the recipe",
        displayMode: "textarea"
      }
    }),
    instructions: (0, import_fields33.text)({
      validation: { isRequired: true },
      label: "Instructions",
      ui: {
        description: "Step-by-step cooking instructions",
        displayMode: "textarea"
      }
    }),
    prepTime: (0, import_fields33.integer)({
      label: "Prep Time (minutes)",
      ui: {
        description: "Time required for preparation"
      },
      validation: { min: 0 }
    }),
    cookTime: (0, import_fields33.integer)({
      label: "Cook Time (minutes)",
      ui: {
        description: "Time required for cooking"
      },
      validation: { min: 0 }
    }),
    servings: (0, import_fields33.integer)({
      label: "Servings",
      ui: {
        description: "Number of servings this recipe makes"
      },
      validation: { min: 1 }
    }),
    difficulty: (0, import_fields33.select)({
      type: "enum",
      options: [
        { label: "Easy", value: "easy" },
        { label: "Medium", value: "medium" },
        { label: "Hard", value: "hard" }
      ],
      defaultValue: "medium",
      label: "Difficulty",
      ui: {
        description: "Difficulty level of the recipe"
      }
    }),
    image: (0, import_fields33.text)({
      label: "Image URL",
      ui: {
        description: "URL for the recipe image"
      }
    }),
    categories: (0, import_fields33.json)({
      label: "Categories",
      ui: {
        description: "JSON array of recipe categories (e.g., breakfast, dinner, vegetarian)"
      }
    }),
    // Ingredients relationship
    ingredients: (0, import_fields33.relationship)({
      ref: "RecipeIngredient.recipe",
      many: true,
      label: "Ingredients",
      ui: {
        description: "Ingredients needed for this recipe"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/RecipeIngredient.ts
var import_core33 = require("@keystone-6/core");
var import_fields34 = require("@keystone-6/core/fields");
var RecipeIngredient = (0, import_core33.list)({
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  ui: {
    isHidden: true,
    labelField: "product",
    listView: {
      initialColumns: ["recipe", "product", "quantity", "unit", "isOptional"]
    }
  },
  fields: {
    // Recipe relationship
    recipe: (0, import_fields34.relationship)({
      ref: "Recipe.ingredients",
      label: "Recipe",
      ui: {
        description: "The recipe this ingredient belongs to"
      }
    }),
    // Product ID (text field as specified)
    product: (0, import_fields34.text)({
      validation: { isRequired: true },
      label: "Product Snapshot",
      ui: {
        description: "Legacy product identifier snapshot"
      }
    }),
    productRef: (0, import_fields34.relationship)({
      ref: "Product.recipeIngredients",
      access: { update: () => false },
      label: "Product"
    }),
    // Quantity needed
    quantity: (0, import_fields34.float)({
      validation: { isRequired: true, min: 0 },
      label: "Quantity",
      ui: {
        description: "Amount of the ingredient needed"
      }
    }),
    // Unit of measurement
    unit: (0, import_fields34.text)({
      label: "Unit",
      ui: {
        description: "Unit of measurement (e.g., 'cups', 'tbsp', 'oz', 'pieces')"
      }
    }),
    // Additional notes
    notes: (0, import_fields34.text)({
      label: "Notes",
      ui: {
        description: "Additional notes (e.g., 'diced', 'melted', 'room temperature')",
        displayMode: "textarea"
      }
    }),
    // Whether the ingredient is optional
    isOptional: (0, import_fields34.checkbox)({
      defaultValue: false,
      label: "Is Optional",
      ui: {
        description: "Whether this ingredient is optional for the recipe"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/RateLimitBucket.ts
var import_core34 = require("@keystone-6/core");
var import_fields35 = require("@keystone-6/core/fields");
var RateLimitBucket = (0, import_core34.list)({
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields35.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    windowStartedAt: (0, import_fields35.timestamp)({ validation: { isRequired: true } }),
    requestCount: (0, import_fields35.integer)({ validation: { isRequired: true, min: 0 } }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core35 = require("@keystone-6/core");
var import_fields36 = require("@keystone-6/core/fields");

// features/keystone/lib/runtimeConfig.ts
var PLACEHOLDER_VALUES = /* @__PURE__ */ new Set([
  "",
  "change-me",
  "changeme",
  "secret",
  "test",
  "keystone",
  "keystone-test",
  "this secret should only be used in testing"
]);
function required(name) {
  const value = process.env[name]?.trim();
  if (!value || PLACEHOLDER_VALUES.has(value.toLowerCase())) {
    throw new Error(`${name} is required and cannot use a placeholder value`);
  }
  return value;
}
function isProduction() {
  return process.env.NODE_ENV === "production";
}
function getDatabaseUrl() {
  if (isProduction()) {
    const value = required("DATABASE_URL");
    if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error("DATABASE_URL must be a PostgreSQL URL in production");
    return value;
  }
  return process.env.DATABASE_URL || "file:./keystone.db";
}
function getSessionSecret() {
  const value = isProduction() ? required("SESSION_SECRET") : process.env.SESSION_SECRET || "local-development-only-session-secret";
  if (value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return value;
}
function getPublicStoreId() {
  const value = process.env.PUBLIC_STORE_ID?.trim() || "store_juniper";
  if (isProduction() && value === "store_juniper" && !process.env.PUBLIC_STORE_ID) throw new Error("PUBLIC_STORE_ID is required in production");
  return value;
}
function getCanonicalSiteUrl() {
  const value = required("NEXT_PUBLIC_SITE_URL");
  const parsed = new URL(value);
  if (isProduction() && parsed.protocol !== "https:") throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production");
  return value.replace(/\/$/, "");
}
function isStripeEnabled() {
  const value = process.env.STRIPE_ENABLED?.trim().toLowerCase();
  if (isProduction() && value !== "true" && value !== "false") {
    throw new Error("STRIPE_ENABLED must be explicitly true or false in production");
  }
  return value === "true";
}
function assertProductionPaymentConfig() {
  if (!isProduction()) return;
  if (isStripeEnabled()) {
    const secretKey = required("STRIPE_SECRET_KEY");
    required("STRIPE_WEBHOOK_SECRET");
    const publishableKey = required("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    if (!secretKey.startsWith("sk_live_")) throw new Error("STRIPE_SECRET_KEY must be a live-mode key in production");
    if (!publishableKey.startsWith("pk_live_")) throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a live-mode key in production");
  }
  if (process.env.TRUSTED_PROXY !== "true") throw new Error("TRUSTED_PROXY=true is required in production for rate-limit identity");
  required("TRUSTED_PROXY_IDENTITY_SECRET");
}
function getStorageConfig() {
  if (!isProduction()) {
    return {
      bucketName: process.env.S3_BUCKET_NAME || "keystone-test",
      region: process.env.S3_REGION || "ap-southeast-2",
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "keystone",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "keystone",
      endpoint: process.env.S3_ENDPOINT || "https://sfo3.digitaloceanspaces.com"
    };
  }
  return {
    bucketName: required("S3_BUCKET_NAME"),
    region: required("S3_REGION"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    endpoint: required("S3_ENDPOINT")
  };
}
function getSessionMaxAge() {
  const configured = Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 24 * 7);
  if (!Number.isInteger(configured) || configured < 900 || configured > 60 * 60 * 24 * 30) {
    throw new Error("SESSION_MAX_AGE_SECONDS must be between 900 seconds and 30 days");
  }
  return configured;
}

// features/keystone/models/Role.ts
var Role = (0, import_core35.list)({
  access: {
    // Role administration is domain-owned. Generic CRUD must not trust
    // capability claims cached in a stateless session after revocation.
    operation: { query: ({ session }) => Boolean(session?.itemId), create: () => false, update: () => false, delete: () => false },
    filter: {
      query: ({ session }) => session?.itemId ? { assignedTo: { some: { id: { equals: session.itemId } } } } : false,
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: {
      create: async ({ resolvedData, context }) => {
        if (!context.session?.itemId) {
          const userCount = await context.prisma.user.count();
          const bootstrapStore = userCount === 0 ? await context.prisma.store.findUnique({ where: { id: getPublicStoreId() }, select: { id: true, isActive: true } }) : null;
          if (!bootstrapStore?.isActive) throw new Error("Active store scope is required");
          return { ...resolvedData, store: { connect: { id: bootstrapStore.id } } };
        }
        const user = await context.prisma.user.findUnique({
          where: { id: context.session.itemId },
          select: { store: { select: { id: true, isActive: true } } }
        });
        if (!user?.store?.isActive) throw new Error("Active store scope is required");
        return { ...resolvedData, store: { connect: { id: user.store.id } } };
      }
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "canManageProducts", "canManageOrders", "canManageInventory", "canManageOnboarding", "canAccessDashboard"]
    }
  },
  fields: {
    name: (0, import_fields36.text)({
      validation: { isRequired: true },
      label: "Role Name"
    }),
    // Permission flags
    canManageProducts: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Manage Products"
    }),
    canManageOrders: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Manage Orders"
    }),
    canManagePayments: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Manage Payments"
    }),
    canManageInventory: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Manage Inventory"
    }),
    canManageSuppliers: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Manage Suppliers"
    }),
    canManageDelivery: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Manage Delivery Routes"
    }),
    canManageUsers: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Manage Users"
    }),
    canManageOnboarding: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Manage Onboarding"
    }),
    canAccessDashboard: (0, import_fields36.checkbox)({
      defaultValue: false,
      label: "Can Access Dashboard"
    }),
    // Relationships
    store: (0, import_fields36.relationship)({
      ref: "Store.roles",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    assignedTo: (0, import_fields36.relationship)({
      ref: "User.role",
      many: true,
      access: { update: () => false },
      label: "Assigned To"
    }),
    ...trackingFields
  }
});

// features/keystone/models/ShoppingList.ts
var import_core36 = require("@keystone-6/core");
var import_fields37 = require("@keystone-6/core/fields");
var ShoppingList = (0, import_core36.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: ({ session }) => {
        const store = ownerStoreScopedFilter("user")({ session });
        return session?.itemId && store !== false ? { AND: [store, { user: { id: { equals: session.itemId } } }] } : false;
      },
      update: ({ session }) => {
        const store = ownerStoreScopedFilter("user")({ session });
        return session?.itemId && store !== false ? { AND: [store, { user: { id: { equals: session.itemId } } }] } : false;
      },
      delete: ({ session }) => {
        const store = ownerStoreScopedFilter("user")({ session });
        return session?.itemId && store !== false ? { AND: [store, { user: { id: { equals: session.itemId } } }] } : false;
      }
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "user", "isDefault", "createdAt"]
    }
  },
  fields: {
    // Owner of the shopping list
    user: (0, import_fields37.relationship)({
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
      ref: "User",
      label: "User",
      ui: {
        description: "The user who owns this shopping list"
      }
    }),
    // Name of the shopping list
    name: (0, import_fields37.text)({
      validation: { isRequired: true },
      label: "Name",
      ui: {
        description: "Name of the shopping list (e.g., 'Weekly Groceries', 'Party Supplies')"
      }
    }),
    // Whether this is the user's default list
    isDefault: (0, import_fields37.checkbox)({
      defaultValue: false,
      label: "Default List",
      ui: {
        description: "Whether this is the user's default shopping list"
      }
    }),
    // Items in this shopping list
    items: (0, import_fields37.relationship)({
      ref: "ShoppingListItem.list",
      many: true,
      label: "Items",
      ui: {
        description: "Items in this shopping list"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/ShoppingListItem.ts
var import_core37 = require("@keystone-6/core");
var import_fields38 = require("@keystone-6/core/fields");
var ShoppingListItem = (0, import_core37.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: ({ session }) => {
        if (session?.itemId) {
          return { list: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (session?.itemId) {
          return { list: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (session?.itemId) {
          return { list: { user: { id: { equals: session.itemId } } } };
        }
        return false;
      }
    }
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["product", "list", "quantity", "unit", "checked", "addedAt"]
    }
  },
  fields: {
    // Shopping list this item belongs to
    list: (0, import_fields38.relationship)({
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
      ref: "ShoppingList.items",
      label: "Shopping List",
      ui: {
        description: "The shopping list this item belongs to"
      }
    }),
    // Product name or ID
    product: (0, import_fields38.text)({
      validation: { isRequired: true },
      label: "Product Snapshot",
      ui: {
        description: "Legacy product name snapshot"
      }
    }),
    productRef: (0, import_fields38.relationship)({
      ref: "Product.shoppingListItems",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
      label: "Product"
    }),
    // Quantity needed
    quantity: (0, import_fields38.integer)({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: {
        description: "Number of units needed"
      }
    }),
    // Unit of measurement
    unit: (0, import_fields38.text)({
      label: "Unit",
      ui: {
        description: "Unit of measurement (e.g., 'lbs', 'oz', 'each', 'dozen')"
      }
    }),
    // Whether the item has been checked off
    checked: (0, import_fields38.checkbox)({
      defaultValue: false,
      label: "Checked",
      ui: {
        description: "Whether this item has been checked off the list"
      }
    }),
    // Additional notes
    notes: (0, import_fields38.text)({
      label: "Notes",
      ui: {
        description: "Additional notes (e.g., 'organic only', 'brand preference')",
        displayMode: "textarea"
      }
    }),
    // When the item was added
    addedAt: (0, import_fields38.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Added At",
      ui: {
        description: "When this item was added to the list"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Subscription.ts
var import_core38 = require("@keystone-6/core");
var import_fields39 = require("@keystone-6/core/fields");
async function subscriptionAccessFilter({ session, context }) {
  const store = ownerStoreScopedFilter("user")({ session });
  if (store === false) return false;
  if (await permissions.canManageOrders({ session, context })) return store;
  return session?.itemId ? { AND: [store, { user: { id: { equals: session.itemId } } }] } : false;
}
var Subscription = (0, import_core38.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: subscriptionAccessFilter,
      update: subscriptionAccessFilter,
      delete: subscriptionAccessFilter
    }
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["user", "product", "frequency", "nextDeliveryDate", "isActive"]
    }
  },
  fields: {
    // User who owns the subscription
    user: (0, import_fields39.relationship)({
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false },
      ref: "User",
      label: "User",
      ui: {
        description: "The user who owns this subscription"
      }
    }),
    // Product ID (text field)
    product: (0, import_fields39.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product handle snapshot"
      }
    }),
    productRef: (0, import_fields39.relationship)({
      ref: "Product.subscriptions",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
      label: "Product"
    }),
    // Quantity to deliver each time
    quantity: (0, import_fields39.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Quantity",
      ui: {
        description: "Number of items to deliver each time"
      }
    }),
    // Delivery frequency
    frequency: (0, import_fields39.select)({
      type: "enum",
      options: [
        { label: "Weekly", value: "weekly" },
        { label: "Biweekly", value: "biweekly" },
        { label: "Monthly", value: "monthly" }
      ],
      defaultValue: "weekly",
      validation: { isRequired: true },
      label: "Frequency",
      ui: {
        description: "How often to deliver this subscription"
      }
    }),
    // Next scheduled delivery date
    nextDeliveryDate: (0, import_fields39.timestamp)({
      label: "Next Delivery Date",
      ui: {
        description: "Date of the next scheduled delivery"
      }
    }),
    // Subscription discount percentage
    discount: (0, import_fields39.float)({
      label: "Discount percentage (legacy display)",
      ui: { description: "Legacy display value; discountBps is authoritative" },
      validation: { min: 0, max: 100 },
      defaultValue: 0
    }),
    discountBps: (0, import_fields39.integer)({
      defaultValue: 0,
      validation: { isRequired: true, min: 0, max: 1e4 },
      access: { create: () => false, update: () => false },
      label: "Discount (basis points)"
    }),
    // Whether subscription is currently active
    isActive: (0, import_fields39.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this subscription is currently active"
      }
    }),
    // Paused until date (for temporary pauses)
    pausedUntil: (0, import_fields39.timestamp)({
      label: "Paused Until",
      ui: {
        description: "If set, subscription is paused until this date"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/SubstitutionPreference.ts
var import_core39 = require("@keystone-6/core");
var import_fields40 = require("@keystone-6/core/fields");
var SubstitutionPreference = (0, import_core39.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ownerScopedFilter("user"),
      update: ownerScopedFilter("user"),
      delete: ownerScopedFilter("user")
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.itemId) throw new Error("An authenticated owner is required");
      return { ...resolvedData, user: { connect: { id: context.session.itemId } } };
    }
  },
  ui: {
    labelField: "user",
    listView: {
      initialColumns: ["user", "allowSubstitutions", "preferSimilarBrand", "contactBeforeSubstitute"]
    }
  },
  fields: {
    // User who owns these preferences
    user: (0, import_fields40.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "The user these preferences belong to"
      }
    }),
    // Whether to allow substitutions at all
    allowSubstitutions: (0, import_fields40.checkbox)({
      defaultValue: true,
      label: "Allow Substitutions",
      ui: {
        description: "Whether to allow product substitutions when items are out of stock"
      }
    }),
    // Prefer same brand when substituting
    preferSimilarBrand: (0, import_fields40.checkbox)({
      defaultValue: true,
      label: "Prefer Similar Brand",
      ui: {
        description: "When substituting, prefer the same brand if possible"
      }
    }),
    // Prefer same size when substituting
    preferSimilarSize: (0, import_fields40.checkbox)({
      defaultValue: true,
      label: "Prefer Similar Size",
      ui: {
        description: "When substituting, prefer similar size/quantity if possible"
      }
    }),
    // Contact before substituting
    contactBeforeSubstitute: (0, import_fields40.checkbox)({
      defaultValue: false,
      label: "Contact Before Substitute",
      ui: {
        description: "Contact the customer before making any substitution"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Store.ts
var import_core40 = require("@keystone-6/core");
var import_fields41 = require("@keystone-6/core/fields");
var Store = (0, import_core40.list)({
  access: {
    operation: {
      query: ({ session }) => Boolean(session?.itemId),
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: { query: currentStoreScopedFilter, update: currentStoreScopedFilter, delete: currentStoreScopedFilter }
  },
  hooks: {
    resolveInput: async ({ resolvedData }) => ({
      ...resolvedData,
      code: typeof resolvedData.code === "string" ? resolvedData.code.trim().toLowerCase() : resolvedData.code,
      name: typeof resolvedData.name === "string" ? resolvedData.name.trim() : resolvedData.name
    }),
    validate: {
      delete: async ({ addValidationError }) => addValidationError("Stores with operational evidence cannot be deleted")
    }
  },
  ui: { labelField: "name", listView: { initialColumns: ["code", "name", "timezone", "isActive"] } },
  fields: {
    code: (0, import_fields41.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { update: () => false } }),
    name: (0, import_fields41.text)({ validation: { isRequired: true } }),
    timezone: (0, import_fields41.text)({ defaultValue: "America/Los_Angeles" }),
    currencyCode: (0, import_fields41.text)({ defaultValue: "USD" }),
    isActive: (0, import_fields41.checkbox)({ defaultValue: true }),
    users: (0, import_fields41.relationship)({ ref: "User.store", many: true }),
    roles: (0, import_fields41.relationship)({ ref: "Role.store", many: true }),
    settings: (0, import_fields41.relationship)({ ref: "StoreSettings.store", many: true }),
    loyaltyPrograms: (0, import_fields41.relationship)({ ref: "LoyaltyProgram.store", many: true }),
    carts: (0, import_fields41.relationship)({ ref: "Cart.store", many: true }),
    orders: (0, import_fields41.relationship)({ ref: "Order.store", many: true }),
    products: (0, import_fields41.relationship)({ ref: "Product.store", many: true }),
    departments: (0, import_fields41.relationship)({ ref: "Department.store", many: true }),
    coupons: (0, import_fields41.relationship)({ ref: "Coupon.store", many: true }),
    suppliers: (0, import_fields41.relationship)({ ref: "Supplier.store", many: true }),
    inventoryLots: (0, import_fields41.relationship)({ ref: "InventoryLot.store", many: true }),
    inventoryAdjustments: (0, import_fields41.relationship)({ ref: "InventoryAdjustment.store", many: true }),
    checkoutAttempts: (0, import_fields41.relationship)({ ref: "CheckoutAttempt.store", many: true }),
    deliverySlots: (0, import_fields41.relationship)({ ref: "DeliverySlot.store", many: true }),
    pickupSlots: (0, import_fields41.relationship)({ ref: "PickupSlot.store", many: true }),
    parkingSpots: (0, import_fields41.relationship)({ ref: "ParkingSpot.store", many: true }),
    deliveryRoutes: (0, import_fields41.relationship)({ ref: "DeliveryRoute.store", many: true }),
    purchaseOrders: (0, import_fields41.relationship)({ ref: "PurchaseOrder.store", many: true }),
    payments: (0, import_fields41.relationship)({ ref: "Payment.store", many: true }),
    orderLineInventoryAllocations: (0, import_fields41.relationship)({ ref: "OrderLineInventoryAllocation.store", many: true }),
    paymentWebhookEvents: (0, import_fields41.relationship)({ ref: "PaymentWebhookEvent.store", many: true }),
    outboxEvents: (0, import_fields41.relationship)({ ref: "GroceryOutboxEvent.store", many: true }),
    ...trackingFields
  }
});

// features/keystone/models/StoreSettings.ts
var import_core41 = require("@keystone-6/core");
var import_fields42 = require("@keystone-6/core/fields");

// features/keystone/lib/storeTime.ts
function zonedDateKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function zonedStartOfDateKey(key2, timeZone) {
  assertValidTimeZone(timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key2)) throw new Error("Store date key must use YYYY-MM-DD");
  const [year, month, day] = key2.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(candidate));
    const part = (type) => Number(parts.find((entry) => entry.type === type)?.value || 0);
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    candidate -= represented - target;
  }
  return new Date(candidate);
}
function zonedStartOfDay(value, timeZone) {
  return zonedStartOfDateKey(zonedDateKey(value, timeZone), timeZone);
}
function zonedDateTimeForDateKey(key2, time, timeZone) {
  assertValidTimeZone(timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key2)) throw new Error("Store date key must use YYYY-MM-DD");
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!timeMatch || Number(timeMatch[1]) > 23 || Number(timeMatch[2]) > 59) {
    throw new Error("Store time must use valid HH:mm");
  }
  const [year, month, day] = key2.split("-").map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(candidate));
    const part = (type) => Number(parts.find((entry) => entry.type === type)?.value || 0);
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    candidate -= represented - target;
  }
  const result = new Date(candidate);
  if (zonedDateKey(result, timeZone) !== key2 || zonedMinuteOfDay(result, timeZone) !== hour * 60 + minute) {
    throw new Error("Store-local time does not exist in the configured timezone");
  }
  return result;
}
function zonedDateKeyOffset(value, timeZone, days) {
  assertValidTimeZone(timeZone);
  const [year, month, day] = zonedDateKey(value, timeZone).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day + Math.trunc(days)));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
}
function zonedMinuteOfDay(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const part = (type) => Number(parts.find((entry) => entry.type === type)?.value || 0);
  return part("hour") * 60 + part("minute");
}
function slotMinute(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Fulfillment slot time must use HH:mm");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("Fulfillment slot time is invalid");
  return hour * 60 + minute;
}
function assertValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(/* @__PURE__ */ new Date());
  } catch {
    throw new Error("Store timezone must be a valid IANA timezone");
  }
}
function isLiveFulfillmentSlot(slot, timeZone, now = /* @__PURE__ */ new Date()) {
  assertValidTimeZone(timeZone);
  const slotDate = zonedDateKey(slot.date, timeZone);
  const today = zonedDateKey(now, timeZone);
  if (slotDate < today) return false;
  return slotDate !== today || slotMinute(slot.endTime) > zonedMinuteOfDay(now, timeZone);
}
function isSlotWithinDays(slot, timeZone, days, now = /* @__PURE__ */ new Date()) {
  if (!isLiveFulfillmentSlot(slot, timeZone, now)) return false;
  const slotDate = zonedDateKey(slot.date, timeZone);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + days);
  return slotDate <= zonedDateKey(end, timeZone);
}

// features/keystone/lib/rollingFulfillment.ts
var DEFAULT_HORIZON_DAYS = 7;
var MAX_HORIZON_DAYS = 14;
var DEFAULT_CUTOFF_MINUTES = 120;
var MAX_POLICY_SLOTS = 500;
var DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function integer26(value, fallback, minimum, maximum) {
  const candidate = Number(value);
  return Number.isInteger(candidate) ? Math.min(maximum, Math.max(minimum, candidate)) : fallback;
}
function validDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = /* @__PURE__ */ new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function timeMinute(value) {
  if (typeof value !== "string") return null;
  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (twentyFourHour) {
    const hour2 = Number(twentyFourHour[1]);
    const minute2 = Number(twentyFourHour[2]);
    return hour2 <= 23 && minute2 <= 59 ? hour2 * 60 + minute2 : null;
  }
  const twelveHour = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(value.trim());
  if (!twelveHour) return null;
  const hour = Number(twelveHour[1]);
  const minute = Number(twelveHour[2] || 0);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return (hour % 12 + (twelveHour[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + minute;
}
function minuteTime(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
function parseRange(value) {
  if (typeof value === "string") {
    const match = /^(.+?)\s+[\-–]\s+(.+)$/.exec(value.trim());
    if (!match) return null;
    const start2 = timeMinute(match[1]);
    const end2 = timeMinute(match[2]);
    return start2 !== null && end2 !== null && end2 > start2 ? { start: start2, end: end2 } : null;
  }
  const source = record(value);
  if (!source) return null;
  const start = timeMinute(source.open ?? source.start);
  const end = timeMinute(source.close ?? source.end);
  return start !== null && end !== null && end > start ? { start, end } : null;
}
function parseDayRanges(value) {
  if (typeof value === "string") {
    if (/^closed$/i.test(value.trim())) return [];
    const range = parseRange(value);
    return range ? [range] : [];
  }
  if (Array.isArray(value)) return value.flatMap((candidate) => {
    const range = parseRange(candidate);
    return range ? [range] : [];
  });
  const source = record(value);
  if (!source || source.enabled === false) return [];
  const ranges = Array.isArray(source.ranges) ? source.ranges : [source];
  return ranges.flatMap((candidate) => {
    const range = parseRange(candidate);
    return range ? [range] : [];
  });
}
function operatingRanges(hours, dateKey) {
  const source = record(hours);
  if (!source) return [];
  const policy = record(source.fulfillmentPolicy);
  const specialHours = record(policy?.specialHours);
  const day = DAY_KEYS[(/* @__PURE__ */ new Date(`${dateKey}T12:00:00.000Z`)).getUTCDay()];
  return parseDayRanges(specialHours && Object.hasOwn(specialHours, dateKey) ? specialHours[dateKey] : source[day]);
}
function dateKeyFor(value, timeZone) {
  return validDateKey(value) ? value : zonedDateKey(value, timeZone);
}
function templateKey(template) {
  return `${template.startTime}:${template.endTime}`;
}
function validTemplateTimes(startTime, endTime) {
  const start = timeMinute(startTime);
  const end = timeMinute(endTime);
  return typeof startTime === "string" && typeof endTime === "string" && start !== null && end !== null && end > start;
}
function deliveryTemplate(value) {
  const source = record(value);
  const capacity = Number(source?.capacity);
  const deliveryFee = Number(source?.deliveryFee ?? 0);
  if (!source || !validTemplateTimes(source.startTime, source.endTime) || !Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(deliveryFee) || deliveryFee < 0 || Object.hasOwn(source, "isActive") && typeof source.isActive !== "boolean") return null;
  return {
    startTime: minuteTime(timeMinute(source.startTime)),
    endTime: minuteTime(timeMinute(source.endTime)),
    capacity,
    deliveryFee,
    isActive: source.isActive !== false
  };
}
function pickupTemplate(value) {
  const source = record(value);
  const maxOrders = Number(source?.maxOrders);
  if (!source || !validTemplateTimes(source.startTime, source.endTime) || !Number.isInteger(maxOrders) || maxOrders < 1 || Object.hasOwn(source, "isActive") && typeof source.isActive !== "boolean") return null;
  return {
    startTime: minuteTime(timeMinute(source.startTime)),
    endTime: minuteTime(timeMinute(source.endTime)),
    maxOrders,
    isActive: source.isActive !== false
  };
}
function latestTemplates(slots, map) {
  const sorted = [...slots].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime() || new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime() || right.id.localeCompare(left.id)
  );
  const templates = /* @__PURE__ */ new Map();
  for (const slot of sorted) {
    const candidate = map(slot);
    if (candidate && !templates.has(templateKey(candidate))) templates.set(templateKey(candidate), candidate);
  }
  return Array.from(templates.values());
}
function assertValidRollingFulfillmentPolicy(hours) {
  const source = record(hours);
  if (!source) throw new Error("Store hours must be an object");
  if (!Object.hasOwn(source, "fulfillmentPolicy")) return;
  const configured = record(source.fulfillmentPolicy);
  if (!configured) throw new Error("Store fulfillment policy must be an object");
  for (const [field, minimum, maximum] of [
    ["horizonDays", 1, MAX_HORIZON_DAYS],
    ["cutoffMinutes", 0, 24 * 60]
  ]) {
    if (!Object.hasOwn(configured, field)) continue;
    const value = Number(configured[field]);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`Store fulfillment ${field} must be an integer from ${minimum} to ${maximum}`);
    }
  }
  if (Object.hasOwn(configured, "blackoutDates")) {
    if (!Array.isArray(configured.blackoutDates) || !configured.blackoutDates.every(validDateKey)) {
      throw new Error("Store fulfillment blackout dates must use real YYYY-MM-DD dates");
    }
  }
  if (Object.hasOwn(configured, "specialHours")) {
    const specialHours = record(configured.specialHours);
    if (!specialHours || Object.keys(specialHours).some((key2) => !validDateKey(key2))) {
      throw new Error("Store fulfillment special hours must be keyed by real YYYY-MM-DD dates");
    }
  }
  if (Object.hasOwn(configured, "deliveryWindows")) {
    if (!Array.isArray(configured.deliveryWindows) || configured.deliveryWindows.some((value) => !deliveryTemplate(value))) {
      throw new Error("Store fulfillment delivery windows require valid time, capacity, fee, and active state");
    }
  }
  if (Object.hasOwn(configured, "pickupWindows")) {
    if (!Array.isArray(configured.pickupWindows) || configured.pickupWindows.some((value) => !pickupTemplate(value))) {
      throw new Error("Store fulfillment pickup windows require valid time, capacity, and active state");
    }
  }
}
function resolveRollingFulfillmentPolicy({
  hours,
  deliverySlots,
  pickupSlots
}) {
  const source = record(hours);
  const configured = record(source?.fulfillmentPolicy);
  const blackoutDates = new Set(
    Array.isArray(configured?.blackoutDates) ? configured.blackoutDates.filter(validDateKey) : []
  );
  const fallbackDelivery = latestTemplates(deliverySlots, (slot) => deliveryTemplate(slot));
  const fallbackPickup = latestTemplates(pickupSlots, (slot) => pickupTemplate(slot));
  const deliveryTemplates = configured && Object.hasOwn(configured, "deliveryWindows") ? (Array.isArray(configured.deliveryWindows) ? configured.deliveryWindows : []).flatMap((value) => {
    const template = deliveryTemplate(value);
    return template ? [template] : [];
  }) : fallbackDelivery;
  const pickupTemplates = configured && Object.hasOwn(configured, "pickupWindows") ? (Array.isArray(configured.pickupWindows) ? configured.pickupWindows : []).flatMap((value) => {
    const template = pickupTemplate(value);
    return template ? [template] : [];
  }) : fallbackPickup;
  return {
    horizonDays: integer26(configured?.horizonDays, DEFAULT_HORIZON_DAYS, 1, MAX_HORIZON_DAYS),
    cutoffMinutes: integer26(configured?.cutoffMinutes, DEFAULT_CUTOFF_MINUTES, 0, 24 * 60),
    blackoutDates,
    deliveryTemplates,
    pickupTemplates
  };
}
function evaluateFulfillmentWindow({
  hours,
  timeZone,
  date,
  startTime,
  endTime,
  now = /* @__PURE__ */ new Date(),
  applyCutoff = true
}) {
  try {
    assertValidTimeZone(timeZone);
    assertValidRollingFulfillmentPolicy(hours);
    if (!validTemplateTimes(startTime, endTime)) return { allowed: false, reason: "invalid" };
    const dateKey = dateKeyFor(date, timeZone);
    const policy = resolveRollingFulfillmentPolicy({ hours, deliverySlots: [], pickupSlots: [] });
    const today = zonedDateKey(now, timeZone);
    const horizonEnd = zonedDateKeyOffset(now, timeZone, policy.horizonDays - 1);
    if (dateKey < today || dateKey > horizonEnd) return { allowed: false, reason: "outside_horizon" };
    if (policy.blackoutDates.has(dateKey)) return { allowed: false, reason: "blackout" };
    const ranges = operatingRanges(hours, dateKey);
    if (!ranges.length) return { allowed: false, reason: "closed" };
    const start = timeMinute(startTime);
    const end = timeMinute(endTime);
    if (!ranges.some((range) => start >= range.start && end <= range.end)) {
      return { allowed: false, reason: "outside_hours" };
    }
    if (applyCutoff) {
      const startsAt = zonedDateTimeForDateKey(dateKey, minuteTime(start), timeZone);
      if (startsAt.getTime() <= now.getTime() + policy.cutoffMinutes * 6e4) {
        return { allowed: false, reason: "cutoff" };
      }
    }
    return { allowed: true, reason: "available" };
  } catch {
    return { allowed: false, reason: "invalid" };
  }
}
function planRollingFulfillmentAvailability({
  hours,
  timeZone,
  deliverySlots,
  pickupSlots,
  requestedDays,
  now = /* @__PURE__ */ new Date()
}) {
  assertValidTimeZone(timeZone);
  assertValidRollingFulfillmentPolicy(hours);
  const policy = resolveRollingFulfillmentPolicy({ hours, deliverySlots, pickupSlots });
  const days = Math.min(policy.horizonDays, integer26(requestedDays, DEFAULT_HORIZON_DAYS, 1, MAX_HORIZON_DAYS));
  const existingDelivery = new Set(deliverySlots.map((slot) => `${dateKeyFor(slot.date, timeZone)}:${templateKey(slot)}`));
  const existingPickup = new Set(pickupSlots.map((slot) => `${dateKeyFor(slot.date, timeZone)}:${templateKey(slot)}`));
  const deliveryCreates = [];
  const pickupCreates = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = zonedDateKeyOffset(now, timeZone, offset);
    const date = zonedStartOfDateKey(dateKey, timeZone);
    for (const template of policy.deliveryTemplates) {
      const key2 = `${dateKey}:${templateKey(template)}`;
      if (!template.isActive || existingDelivery.has(key2)) continue;
      if (!evaluateFulfillmentWindow({ hours, timeZone, date: dateKey, startTime: template.startTime, endTime: template.endTime, now }).allowed) continue;
      deliveryCreates.push({ ...template, date, currentBookings: 0 });
    }
    for (const template of policy.pickupTemplates) {
      const key2 = `${dateKey}:${templateKey(template)}`;
      if (!template.isActive || existingPickup.has(key2)) continue;
      if (!evaluateFulfillmentWindow({ hours, timeZone, date: dateKey, startTime: template.startTime, endTime: template.endTime, now }).allowed) continue;
      pickupCreates.push({ ...template, date, currentOrders: 0, isAvailable: true });
    }
  }
  return { policy, deliveryCreates, pickupCreates };
}
async function ensureRollingFulfillmentAvailability(context, store, requestedDays, now = /* @__PURE__ */ new Date()) {
  assertValidTimeZone(store.timezone);
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRaw`
      WITH rolling_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${`grocery-rolling-fulfillment:${store.id}`}, 0))
      )
      SELECT true AS locked FROM rolling_lock
    `;
    const [settings, deliverySlots, pickupSlots] = await Promise.all([
      tx.storeSettings.findFirst({ where: { storeId: store.id, isActive: true }, select: { hours: true } }),
      tx.deliverySlot.findMany({
        where: { storeId: store.id },
        orderBy: [{ date: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
        take: MAX_POLICY_SLOTS,
        select: { id: true, date: true, startTime: true, endTime: true, capacity: true, currentBookings: true, isActive: true, deliveryFee: true, updatedAt: true }
      }),
      tx.pickupSlot.findMany({
        where: { storeId: store.id },
        orderBy: [{ date: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
        take: MAX_POLICY_SLOTS,
        select: { id: true, date: true, startTime: true, endTime: true, maxOrders: true, currentOrders: true, isActive: true, isAvailable: true, updatedAt: true }
      })
    ]);
    if (!settings) return { hours: null, createdDelivery: 0, createdPickup: 0 };
    try {
      assertValidRollingFulfillmentPolicy(settings.hours);
    } catch {
      return { hours: null, createdDelivery: 0, createdPickup: 0 };
    }
    const plan = planRollingFulfillmentAvailability({
      hours: settings.hours,
      timeZone: store.timezone,
      deliverySlots: deliverySlots.map((slot) => ({ ...slot, deliveryFee: slot.deliveryFee || 0 })),
      pickupSlots,
      requestedDays,
      now
    });
    if (plan.deliveryCreates.length) {
      await tx.deliverySlot.createMany({
        data: plan.deliveryCreates.map((slot) => ({ ...slot, storeId: store.id }))
      });
    }
    if (plan.pickupCreates.length) {
      await tx.pickupSlot.createMany({
        data: plan.pickupCreates.map((slot) => ({ ...slot, storeId: store.id }))
      });
    }
    return {
      hours: settings.hours,
      createdDelivery: plan.deliveryCreates.length,
      createdPickup: plan.pickupCreates.length
    };
  });
}

// features/storefront/lib/branding.ts
var DEFAULT_STOREFRONT_BRAND_HUE = 35;
function normalizeStorefrontBrandHue(value) {
  if (value === null || value === void 0 || value === "" || typeof value === "string" && !value.trim()) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new Error("Storefront brand hue must be a finite number");
  const integer29 = Math.round(numeric);
  return (integer29 % 360 + 360) % 360;
}
function effectiveStorefrontBrandHue(value) {
  return normalizeStorefrontBrandHue(value) ?? DEFAULT_STOREFRONT_BRAND_HUE;
}

// features/keystone/models/StoreSettings.ts
var StoreSettings = (0, import_core41.list)({
  db: { idField: { kind: "autoincrement" } },
  access: {
    operation: {
      query: ({ session }) => Boolean(session?.itemId),
      create: () => false,
      update: permissions.canManageOnboarding,
      delete: () => false
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    validateInput: async ({ resolvedData, addValidationError }) => {
      if (resolvedData.timezone !== void 0) {
        try {
          assertValidTimeZone(String(resolvedData.timezone));
        } catch (error) {
          addValidationError(error instanceof Error ? error.message : "Store timezone is invalid");
        }
      }
      if (resolvedData.hours !== void 0) {
        try {
          assertValidRollingFulfillmentPolicy(resolvedData.hours);
        } catch (error) {
          addValidationError(error instanceof Error ? error.message : "Store fulfillment policy is invalid");
        }
      }
    },
    resolveInput: async ({ operation, resolvedData, context }) => {
      const data = { ...resolvedData };
      if ("brandHue" in data) data.brandHue = normalizeStorefrontBrandHue(data.brandHue);
      if (operation !== "create") return data;
      const storeId = context.session?.data.store?.id;
      if (!storeId) throw new Error("An active store is required");
      return { ...data, store: { connect: { id: storeId } } };
    },
    afterOperation: async ({ operation, item, resolvedData, context }) => {
      if (operation !== "update") return;
      const storeId = item.storeId;
      if (!storeId) throw new Error("Store settings are missing ownership");
      const data = Object.fromEntries(Object.entries({
        name: resolvedData.name,
        timezone: resolvedData.timezone,
        currencyCode: resolvedData.currencyCode,
        isActive: resolvedData.isActive
      }).filter(([, value]) => value !== void 0));
      if (Object.keys(data).length) await context.prisma.store.update({ where: { id: storeId }, data });
    }
  },
  graphql: { plural: "storeSettingsItems" },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "contactEmail", "contactPhone", "isActive"]
    }
  },
  fields: {
    store: (0, import_fields42.relationship)({
      ref: "Store.settings",
      db: { extendPrismaSchema: requiredUniqueRelationshipPrisma },
      graphql: { isNonNull: { create: true } },
      access: { create: () => false, update: () => false }
    }),
    name: (0, import_fields42.text)({ validation: { isRequired: true }, defaultValue: "Juniper Market" }),
    tagline: (0, import_fields42.text)({ defaultValue: "Neighborhood grocery \xB7 delivery & curbside pickup" }),
    homepageTitle: (0, import_fields42.text)({ defaultValue: "Fresh from the neighborhood" }),
    homepageDescription: (0, import_fields42.text)({
      defaultValue: "Seasonal produce, pantry staples, and household essentials selected for everyday shopping.",
      ui: { displayMode: "textarea" }
    }),
    contactEmail: (0, import_fields42.text)({ defaultValue: "hello@junipermarket.example" }),
    contactPhone: (0, import_fields42.text)({ defaultValue: "(415) 555-0148" }),
    address: (0, import_fields42.text)({ defaultValue: "184 Juniper Street, San Francisco, CA 94107" }),
    logoUrl: (0, import_fields42.text)({ defaultValue: "/logo.svg" }),
    brandHue: (0, import_fields42.integer)({
      validation: { min: 0, max: 359 },
      label: "Storefront brand hue (0\u2013359)",
      ui: { description: "Leave unset to use the explicit storefront default. Use Platform Settings to choose a supported preset." }
    }),
    currencyCode: (0, import_fields42.text)({ access: { update: () => false }, defaultValue: "USD" }),
    taxRateBps: (0, import_fields42.integer)({ defaultValue: 875, validation: { isRequired: true, min: 0, max: 1e4 }, label: "Default tax rate (basis points)" }),
    locale: (0, import_fields42.text)({ defaultValue: "en-US" }),
    timezone: (0, import_fields42.text)({ defaultValue: "America/Los_Angeles" }),
    countryCode: (0, import_fields42.text)({ defaultValue: "US" }),
    hours: (0, import_fields42.json)({
      defaultValue: {
        monday: "8:00 AM - 8:00 PM",
        tuesday: "8:00 AM - 8:00 PM",
        wednesday: "8:00 AM - 8:00 PM",
        thursday: "8:00 AM - 8:00 PM",
        friday: "8:00 AM - 9:00 PM",
        saturday: "8:00 AM - 9:00 PM",
        sunday: "9:00 AM - 7:00 PM"
      }
    }),
    isActive: (0, import_fields42.checkbox)({ access: { update: () => false }, defaultValue: true }),
    ...trackingFields
  }
});

// features/keystone/models/Supplier.ts
var import_core42 = require("@keystone-6/core");
var import_fields43 = require("@keystone-6/core/fields");
var Supplier = (0, import_core42.list)({
  access: {
    operation: {
      query: permissions.canManageSuppliers,
      create: permissions.canManageSuppliers,
      update: permissions.canManageSuppliers,
      delete: permissions.canManageSuppliers
    },
    filter: {
      query: storeScopedFilter,
      update: storeScopedFilter,
      delete: storeScopedFilter
    }
  },
  hooks: {
    resolveInput: async ({ resolvedData, context }) => {
      if (!context.session?.data.store?.id) throw new Error("An active store is required");
      return { ...resolvedData, store: { connect: { id: context.session.data.store.id } } };
    },
    validate: {
      delete: async ({ item, context, addValidationError }) => {
        const [lotCount, purchaseOrderCount, productCount] = await Promise.all([
          context.prisma.inventoryLot.count({ where: { supplierId: String(item.id) } }),
          context.prisma.purchaseOrder.count({ where: { supplierId: String(item.id) } }),
          context.prisma.product.count({ where: { supplierId: String(item.id) } })
        ]);
        if (lotCount > 0 || purchaseOrderCount > 0 || productCount > 0) {
          addValidationError("Suppliers with products, inventory, or purchase orders cannot be deleted");
        }
      }
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "contactName", "email", "paymentTerms"]
    }
  },
  fields: {
    name: (0, import_fields43.text)({
      validation: { isRequired: true },
      label: "Supplier Name"
    }),
    contactName: (0, import_fields43.text)({
      label: "Contact Name"
    }),
    email: (0, import_fields43.text)({
      validation: { isRequired: true },
      label: "Email"
    }),
    phone: (0, import_fields43.text)({
      label: "Phone"
    }),
    paymentTerms: (0, import_fields43.select)({
      type: "enum",
      options: [
        { label: "Net 30", value: "net_30" },
        { label: "Net 60", value: "net_60" },
        { label: "Cash on Delivery", value: "cod" }
      ],
      defaultValue: "net_30",
      label: "Payment Terms"
    }),
    deliveryDays: (0, import_fields43.multiselect)({
      type: "enum",
      options: [
        { label: "Monday", value: "mon" },
        { label: "Tuesday", value: "tue" },
        { label: "Wednesday", value: "wed" },
        { label: "Thursday", value: "thu" },
        { label: "Friday", value: "fri" },
        { label: "Saturday", value: "sat" },
        { label: "Sunday", value: "sun" }
      ],
      label: "Delivery Days",
      ui: {
        description: "Days of the week supplier delivers"
      }
    }),
    minimumOrder: (0, import_fields43.float)({
      access: { update: () => false },
      label: "Minimum Order Amount (legacy display)",
      ui: { description: "Legacy display value; minimumOrderCents is authoritative" }
    }),
    minimumOrderCents: (0, import_fields43.integer)({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: "Minimum Order (minor units)"
    }),
    // Relationships
    store: (0, import_fields43.relationship)({
      ref: "Store.suppliers",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageSuppliers, update: () => false }
    }),
    products: (0, import_fields43.relationship)({
      access: { update: () => false },
      ref: "Product.supplier",
      many: true,
      label: "Products"
    }),
    inventoryLots: (0, import_fields43.relationship)({
      access: { update: () => false },
      ref: "InventoryLot.supplier",
      many: true,
      label: "Inventory Lots"
    }),
    purchaseOrders: (0, import_fields43.relationship)({
      access: { update: () => false },
      ref: "PurchaseOrder.supplier",
      many: true,
      label: "Purchase Orders"
    }),
    ...trackingFields
  }
});

// features/keystone/models/User.ts
var import_core43 = require("@keystone-6/core");
var import_access37 = require("@keystone-6/core/access");
var import_fields44 = require("@keystone-6/core/fields");
var User = (0, import_core43.list)({
  access: {
    operation: {
      query: isSignedIn,
      // Account creation is intentionally closed at the generic list boundary.
      // A future public signup flow must use a dedicated, rate-limited contract.
      create: () => false,
      update: isSignedIn,
      // Customer provisioning and staff lifecycle are dedicated mutations.
      // Generic deletion must never trust stale stateless-session capabilities.
      delete: () => false
    },
    filter: {
      query: ({ session }) => {
        const store = storeScopedFilter({ session });
        return store === false ? false : { AND: [store, { id: { equals: session?.itemId } }] };
      },
      update: ({ session }) => {
        const store = storeScopedFilter({ session });
        return store === false ? false : { AND: [store, { id: { equals: session?.itemId } }] };
      },
      delete: storeScopedFilter
    }
  },
  hooks: {
    validate: {
      update: async ({ item, resolvedData, context, addValidationError }) => {
        const roleId = resolvedData.role?.connect?.id;
        if (!roleId) return;
        const role = await context.prisma.role.findUnique({ where: { id: roleId }, select: { storeId: true } });
        if (!role?.storeId || role.storeId !== item.storeId) {
          addValidationError("Role must belong to the same Store as the User");
        }
      },
      delete: async ({ item, context, addValidationError }) => {
        const [routeCount, refundCount] = await Promise.all([
          context.prisma.deliveryRoute.count({ where: { driverId: String(item.id) } }),
          context.prisma.paymentRefund.count({ where: { requestedById: String(item.id) } })
        ]);
        if (routeCount > 0) {
          addValidationError("Users assigned as delivery route drivers cannot be deleted");
        }
        if (refundCount > 0) {
          addValidationError("Users recorded on refund evidence cannot be deleted");
        }
      }
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "email", "role", "onboardingStatus"]
    }
  },
  fields: {
    name: (0, import_fields44.text)({
      validation: { isRequired: true },
      label: "Name"
    }),
    email: (0, import_fields44.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Email"
    }),
    password: (0, import_fields44.password)({
      validation: { isRequired: true },
      access: {
        read: import_access37.denyAll,
        update: ({ session, item }) => session?.itemId === item.id
      }
    }),
    store: (0, import_fields44.relationship)({
      ref: "Store.users",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    role: (0, import_fields44.relationship)({
      access: { create: () => false, update: () => false },
      ref: "Role.assignedTo",
      label: "Role"
    }),
    paymentRefunds: (0, import_fields44.relationship)({
      ref: "PaymentRefund.requestedBy",
      many: true,
      access: { update: () => false }
    }),
    onboardingStatus: (0, import_fields44.select)({
      type: "enum",
      options: [
        { label: "Not Started", value: "not_started" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" },
        { label: "Dismissed", value: "dismissed" }
      ],
      defaultValue: "not_started",
      label: "Onboarding Status"
    }),
    ...trackingFields
  }
});

// features/keystone/models/UserCoupon.ts
var import_core44 = require("@keystone-6/core");
var import_fields45 = require("@keystone-6/core/fields");
var UserCoupon = (0, import_core44.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: permissions.canManageUsers
    },
    filter: {
      query: ownerScopedFilter("user"),
      update: ownerScopedFilter("user"),
      delete: ownerScopedFilter("user")
    }
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["user", "coupon", "clippedAt", "used", "usedAt"]
    }
  },
  fields: {
    user: (0, import_fields45.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "User who clipped this coupon"
      }
    }),
    coupon: (0, import_fields45.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Coupon.userCoupons",
      label: "Coupon",
      ui: {
        description: "The coupon that was clipped"
      }
    }),
    clippedAt: (0, import_fields45.timestamp)({
      label: "Clipped At",
      ui: {
        description: "When the user clipped this coupon"
      },
      defaultValue: { kind: "now" }
    }),
    usedAt: (0, import_fields45.timestamp)({
      label: "Used At",
      ui: {
        description: "When the coupon was used in an order"
      }
    }),
    used: (0, import_fields45.checkbox)({
      defaultValue: false,
      label: "Used",
      ui: {
        description: "Whether this coupon has been used"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/index.ts
var models = {
  Address,
  BackInStockAlert,
  Cart,
  CheckoutAttempt,
  CartItem,
  Coupon,
  Department,
  DeliveryRoute,
  DeliverySlot,
  FavoriteProduct,
  GroceryOutboxEvent,
  InventoryLot,
  InventoryAdjustment,
  LoyaltyProgram,
  LoyaltyTransaction,
  NotificationPreference,
  Order,
  OrderItemSubstitution,
  OrderLineItem,
  OrderLineInventoryAllocation,
  ParkingSpot,
  Payment,
  PaymentProvider,
  PaymentRefund,
  PaymentSession,
  PaymentWebhookEvent,
  PickupSlot,
  POItem,
  PriceAlert,
  Product,
  PurchaseOrder,
  Recipe,
  RecipeIngredient,
  RateLimitBucket,
  Role,
  ShoppingList,
  ShoppingListItem,
  Subscription,
  SubstitutionPreference,
  Store,
  StoreSettings,
  Supplier,
  User,
  UserCoupon
};

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");
var import_graphql = require("graphql");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(root, { data }, context) {
  const sudoContext = context.sudo();
  const session = context.session;
  if (!session?.itemId) {
    throw new Error("Not authenticated");
  }
  const existingUser = await sudoContext.query.User.findOne({
    where: { id: session.itemId },
    query: "id email"
  });
  if (!existingUser) {
    throw new Error("User not found");
  }
  return await sudoContext.db.User.updateOne({
    where: { id: session.itemId },
    data
  });
}
var updateActiveUser_default = updateActiveUser;

// features/keystone/lib/storeScope.ts
var JUNIPER_STORE_ID = "store_juniper";
async function requireSessionStore(context) {
  if (!context.session?.itemId) throw new Error("Store-scoped operation requires authentication");
  const user = await context.prisma.user.findUnique({
    where: { id: context.session.itemId },
    select: { storeId: true, store: { select: { id: true, code: true, name: true, isActive: true, timezone: true, currencyCode: true } } }
  });
  if (!user?.storeId || !user.store?.isActive) throw new Error("Active store scope is required");
  return user.store;
}
async function publicStore(context) {
  const publicStoreId2 = process.env.PUBLIC_STORE_ID || JUNIPER_STORE_ID;
  const store = await context.prisma.store.findFirst({ where: { id: publicStoreId2, isActive: true } });
  if (!store) throw new Error("No active grocery store is configured");
  return store;
}

// features/keystone/lib/sellableInventory.ts
function deriveSellableQuantity(product, storeId, now = /* @__PURE__ */ new Date()) {
  if (product.store?.id !== storeId) return 0;
  const unexpiredLotQuantity = (product.inventoryLots || []).reduce((total, lot) => {
    if (lot.store?.id !== storeId) return total;
    const remaining = Math.max(0, Math.trunc(Number(lot.quantityRemaining || 0)));
    const expiresAt = new Date(lot.expirationDate).getTime();
    return remaining > 0 && Number.isFinite(expiresAt) && expiresAt > now.getTime() ? total + remaining : total;
  }, 0);
  return unexpiredLotQuantity;
}
function sellableInventoryMessage(productName, sellableQuantity) {
  return sellableQuantity > 0 ? `Only ${sellableQuantity} ${sellableQuantity === 1 ? "unit is" : "units are"} currently available for ${productName}` : `${productName} is out of stock because no unexpired inventory is available. Remove it from your basket or request a back-in-stock alert.`;
}
function assertSellableQuantity(product, storeId, requestedQuantity, now = /* @__PURE__ */ new Date()) {
  const sellableQuantity = deriveSellableQuantity(product, storeId, now);
  if (sellableQuantity < requestedQuantity) {
    throw new Error(sellableInventoryMessage(product.title || "Product", sellableQuantity));
  }
  return sellableQuantity;
}
function planSellableLotAllocation(lots, storeId, requestedQuantity, productName, now = /* @__PURE__ */ new Date()) {
  let remaining = requestedQuantity;
  const allocations = [];
  const candidates = [...lots].filter((lot) => lot.store?.id === storeId && Number(lot.quantityRemaining || 0) > 0 && new Date(lot.expirationDate).getTime() > now.getTime()).sort((left, right) => new Date(left.expirationDate).getTime() - new Date(right.expirationDate).getTime() || String(left.id || "").localeCompare(String(right.id || "")));
  for (const lot of candidates) {
    if (remaining === 0) break;
    const quantity = Math.min(remaining, Math.trunc(Number(lot.quantityRemaining || 0)));
    allocations.push({ lot, quantity });
    remaining -= quantity;
  }
  if (remaining > 0) {
    const sellableQuantity = requestedQuantity - remaining;
    throw new Error(sellableInventoryMessage(productName, sellableQuantity));
  }
  return allocations;
}
async function requireSellableStoreProduct(context, productId, storeId, now = /* @__PURE__ */ new Date()) {
  const product = await context.sudo().query.Product.findOne({
    where: { id: productId },
    query: `
      id title handle sku status store { id } price priceCents costPrice costPriceCents
      department imageUrl thumbnailUrl pricingMethod unitOfMeasure
      inventoryLots { expirationDate quantityRemaining store { id } }
    `
  });
  if (!product || product.store?.id !== storeId) throw new Error("Product is not available in the active store");
  if (product.status !== "published") throw new Error("Product is not available for public checkout");
  const sellableQuantity = deriveSellableQuantity(product, storeId, now);
  return {
    ...product,
    sellableQuantity,
    stockQuantity: sellableQuantity,
    inStock: sellableQuantity > 0
  };
}

// features/keystone/lib/catalogAccess.ts
async function requireStoreProduct(context, productId, storeId, options = {}) {
  if (options.publishedOnly === false) {
    throw new Error("Storefront product authority requires a published product");
  }
  return requireSellableStoreProduct(context, productId, storeId);
}
function assertProductStore(product, storeId) {
  if (product.store?.id !== storeId) throw new Error("Related product must belong to the active store");
}

// features/keystone/lib/storeMoney.ts
function normalizeTaxRateBps(value) {
  const rate = Number(value);
  if (!Number.isInteger(rate) || rate < 0 || rate > 1e4) {
    throw new Error("Store tax rate must be an integer between 0 and 10000 basis points");
  }
  return rate;
}
async function getStoreTaxRateBps(context, storeId) {
  const settings = await context.prisma.storeSettings.findUnique({
    where: { storeId },
    select: { taxRateBps: true }
  });
  if (!settings) throw new Error("Store tax settings are unavailable");
  return normalizeTaxRateBps(settings.taxRateBps);
}
function calculateTaxCents(subtotalCents, taxRateBps) {
  return Math.round(subtotalCents * normalizeTaxRateBps(taxRateBps) / 1e4);
}

// features/keystone/mutations/cartOperations.ts
var DELIVERY_FEE = 0;
function requireGuestSessionId(sessionId) {
  const trimmed = sessionId?.trim();
  if (!trimmed) {
    throw new Error("No session ID provided for guest cart");
  }
  return trimmed;
}
function assertCartAccess(cart, context, sessionId) {
  if (!cart) {
    throw new Error("Cart not found");
  }
  if (context.session?.itemId) {
    if (cart.customer?.id !== context.session.itemId) {
      throw new Error("You do not have access to this cart");
    }
    return;
  }
  const guestSessionId = requireGuestSessionId(sessionId);
  if (cart.customer?.id || cart.sessionId !== guestSessionId) {
    throw new Error("You do not have access to this cart");
  }
}
var CART_QUERY = `
  id
  store { id }
  sessionId
  expiresAt
  customer { id }
  itemCount
  subtotal
  items {
    id
    quantity
    subtotal
    substitutionPreference
    product {
      id title handle price priceCents imageUrl status
      store { id }
      inventoryLots { expirationDate quantityRemaining store { id } }
      pricingMethod unitOfMeasure
    }
  }
`;
async function getOrCreateCart(context, sessionId) {
  const store = context.session?.itemId ? await requireSessionStore(context) : await publicStore(context);
  const ownerId = context.session?.itemId || null;
  const guestSessionId = ownerId ? null : requireGuestSessionId(sessionId);
  const identity = ownerId ? `user:${ownerId}` : `guest:${guestSessionId}`;
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-cart-identity'), hashtext($1))",
      identity
    );
    const sudoContext = transactionContext.sudo();
    const carts = await sudoContext.query.Cart.findMany({
      where: ownerId ? { customer: { id: { equals: ownerId } } } : { sessionId: { equals: guestSessionId } },
      take: 2,
      query: CART_QUERY
    });
    if (carts.length > 1) throw new Error("Cart identity is ambiguous");
    const existing = carts[0] || null;
    if (existing) {
      if (existing.store?.id !== store.id) throw new Error("Cart belongs to another Store");
      const expired = !ownerId && existing.expiresAt && new Date(existing.expiresAt).getTime() <= Date.now();
      if (!expired) return existing;
      await transactionContext.prisma.cartItem.deleteMany({ where: { cartId: existing.id } });
      await transactionContext.prisma.cart.update({ where: { id: existing.id }, data: { sessionId: `expired:${existing.id}:${Date.now()}`, itemCount: 0, subtotal: 0, subtotalCents: 0 } });
    }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
    return sudoContext.query.Cart.createOne({
      data: {
        store: { connect: { id: store.id } },
        ...ownerId ? { customer: { connect: { id: ownerId } }, sessionId: `user:${ownerId}` } : { sessionId: guestSessionId, expiresAt: expiresAt.toISOString() },
        itemCount: 0,
        subtotal: 0,
        subtotalCents: 0
      },
      query: CART_QUERY
    });
  });
}
async function withLockedCart(context, cartId, operation) {
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', cartId);
    const cart = await transactionContext.sudo().query.Cart.findOne({ where: { id: cartId }, query: CART_QUERY });
    if (!cart) throw new Error("Cart not found");
    return operation(transactionContext, cart);
  });
}
async function recalculateCart(context, cartId) {
  const sudoContext = context.sudo();
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      store { id }
      sessionId
      customer { id }
      subtotalCents
      items {
        id
        quantity
        product {
          id
          price
          priceCents
        }
      }
    `
  });
  if (!cart) {
    throw new Error("Cart not found");
  }
  let subtotalCents = 0;
  let itemCount = 0;
  for (const item of cart.items) {
    const itemSubtotalCents = Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity;
    subtotalCents += itemSubtotalCents;
    itemCount += item.quantity;
    const itemSubtotal = itemSubtotalCents / 100;
    await sudoContext.query.CartItem.updateOne({
      where: { id: item.id },
      data: { subtotal: itemSubtotal, subtotalCents: Math.round(itemSubtotal * 100) }
    });
  }
  await sudoContext.query.Cart.updateOne({
    where: { id: cartId },
    data: {
      subtotal: subtotalCents / 100,
      subtotalCents,
      itemCount
    }
  });
  return { subtotal: subtotalCents / 100, subtotalCents, itemCount };
}
async function formatCartResponse(cart, context) {
  const subtotalCents = Number(cart.subtotalCents ?? Math.round(Number(cart.subtotal || 0) * 100));
  const subtotal = subtotalCents / 100;
  const taxRateBps = await getStoreTaxRateBps(context, cart.store?.id);
  const taxCents = calculateTaxCents(subtotalCents, taxRateBps);
  const tax = taxCents / 100;
  const total = (subtotalCents + taxCents) / 100 + DELIVERY_FEE;
  return {
    id: cart.id,
    items: cart.items.map((item) => {
      const sellableQuantity = item.product ? deriveSellableQuantity(item.product, cart.store?.id) : 0;
      return {
        id: item.id,
        quantity: item.quantity,
        subtotal: item.subtotal,
        substitutionPreference: item.substitutionPreference,
        product: {
          id: item.product?.id,
          name: item.product?.title,
          handle: item.product?.handle,
          price: item.product?.price,
          unitPrice: item.product?.price,
          unit: item.product?.unitOfMeasure,
          imageUrl: item.product?.imageUrl,
          inStock: item.product?.status === "published" && sellableQuantity >= item.quantity,
          stockQuantity: sellableQuantity
        }
      };
    }),
    subtotal,
    tax: Math.round(tax * 100) / 100,
    deliveryFee: DELIVERY_FEE,
    total: Math.round(total * 100) / 100,
    itemCount: cart.itemCount || 0
  };
}
async function getCart(root, { sessionId }, context) {
  try {
    const cart = await getOrCreateCart(context, sessionId);
    return formatCartResponse(cart, context);
  } catch (error) {
    console.error("Error getting cart:", error);
    return null;
  }
}
async function addToCart(root, {
  productId,
  quantity,
  sessionId
}, context) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Cart quantity must be a positive integer");
  const identityCart = await getOrCreateCart(context, sessionId);
  return withLockedCart(context, identityCart.id, async (transactionContext, cart) => {
    assertCartAccess(cart, context, sessionId);
    const sudoContext = transactionContext.sudo();
    const product = await requireStoreProduct(transactionContext, productId, cart.store.id, { publishedOnly: true });
    const existingItem = cart.items.find((item) => item.product?.id === productId);
    if (!existingItem && cart.items.length >= 200) throw new Error("Cart cannot exceed 200 distinct products");
    const newQuantity = (existingItem?.quantity || 0) + quantity;
    assertSellableQuantity(product, cart.store.id, newQuantity);
    const unitPriceCents = Number(product.priceCents || Math.round(Number(product.price || 0) * 100));
    if (existingItem) {
      await sudoContext.query.CartItem.updateOne({ where: { id: existingItem.id }, data: { quantity: newQuantity } });
    } else {
      await sudoContext.query.CartItem.createOne({
        data: {
          cart: { connect: { id: cart.id } },
          product: { connect: { id: productId } },
          quantity,
          subtotal: unitPriceCents * quantity / 100,
          subtotalCents: unitPriceCents * quantity
        }
      });
    }
    await recalculateCart(transactionContext, cart.id);
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}
async function updateCartItem(root, {
  itemId,
  quantity,
  sessionId
}, context) {
  if (!Number.isInteger(quantity)) throw new Error("Cart quantity must be a whole number");
  const initial = await context.sudo().query.CartItem.findOne({ where: { id: itemId }, query: "id cart { id }" });
  if (!initial?.cart?.id) throw new Error("Cart item not found");
  return withLockedCart(context, initial.cart.id, async (transactionContext, cart) => {
    const sudoContext = transactionContext.sudo();
    const cartItem = await sudoContext.query.CartItem.findOne({
      where: { id: itemId },
      query: "id cart { id sessionId store { id } customer { id } } product { id store { id } status }"
    });
    if (!cartItem || cartItem.cart?.id !== cart.id) throw new Error("Cart item not found");
    assertCartAccess(cartItem.cart, context, sessionId);
    assertProductStore(cartItem.product, cart.store.id);
    if (cartItem.product?.status !== "published") throw new Error("Product is not available for public checkout");
    const product = await requireStoreProduct(transactionContext, cartItem.product.id, cart.store.id, { publishedOnly: true });
    if (quantity > 0) assertSellableQuantity(product, cart.store.id, quantity);
    if (quantity <= 0) await sudoContext.query.CartItem.deleteOne({ where: { id: itemId } });
    else await sudoContext.query.CartItem.updateOne({ where: { id: itemId }, data: { quantity } });
    await recalculateCart(transactionContext, cart.id);
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}
async function removeFromCart(root, { itemId, sessionId }, context) {
  const initial = await context.sudo().query.CartItem.findOne({ where: { id: itemId }, query: "id cart { id }" });
  if (!initial?.cart?.id) throw new Error("Cart item not found");
  return withLockedCart(context, initial.cart.id, async (transactionContext, cart) => {
    assertCartAccess(cart, context, sessionId);
    const sudoContext = transactionContext.sudo();
    const current = await sudoContext.query.CartItem.findOne({ where: { id: itemId }, query: "id cart { id }" });
    if (!current || current.cart?.id !== cart.id) throw new Error("Cart item not found");
    await sudoContext.query.CartItem.deleteOne({ where: { id: itemId } });
    await recalculateCart(transactionContext, cart.id);
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}
async function clearCart(root, { sessionId }, context) {
  const identityCart = await getOrCreateCart(context, sessionId);
  return withLockedCart(context, identityCart.id, async (transactionContext, cart) => {
    assertCartAccess(cart, context, sessionId);
    const sudoContext = transactionContext.sudo();
    for (const item of cart.items) await sudoContext.query.CartItem.deleteOne({ where: { id: item.id } });
    await sudoContext.query.Cart.updateOne({ where: { id: cart.id }, data: { subtotal: 0, subtotalCents: 0, itemCount: 0 } });
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}
async function mergeGuestCart(root, { guestSessionId }, context) {
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to merge cart");
  }
  const sudoContext = context.sudo();
  const store = await requireSessionStore(context);
  const guestCarts = await sudoContext.query.Cart.findMany({
    where: { sessionId: { equals: guestSessionId } },
    query: `
      id
      sessionId
      expiresAt
      store { id }
      customer { id }
      items {
        id
        quantity
        product { id status store { id } }
      }
    `
  });
  if (guestCarts.length === 0) {
    const userCart2 = await getOrCreateCart(context);
    return formatCartResponse(userCart2, context);
  }
  if (guestCarts.length > 1) throw new Error("Guest cart identity is ambiguous");
  const guestCart = guestCarts[0];
  assertCartAccess(guestCart, { ...context, session: void 0 }, guestSessionId);
  if (guestCart.store?.id !== store.id) throw new Error("Guest cart belongs to another Store");
  if (guestCart.expiresAt && new Date(guestCart.expiresAt).getTime() <= Date.now()) throw new Error("Guest cart session has expired");
  if (guestCart.items.some((item) => !item.product || item.product.store?.id !== store.id || item.product.status !== "published")) {
    throw new Error("Guest cart contains a product unavailable to the active Store");
  }
  const userCart = await getOrCreateCart(context);
  return context.transaction(async (transactionContext) => {
    const ids = [guestCart.id, userCart.id].sort();
    for (const id of ids) await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', id);
    const txSudo = transactionContext.sudo();
    const [currentGuest, currentUser] = await Promise.all([
      txSudo.query.Cart.findOne({ where: { id: guestCart.id }, query: CART_QUERY }),
      txSudo.query.Cart.findOne({ where: { id: userCart.id }, query: CART_QUERY })
    ]);
    if (!currentGuest || currentGuest.store?.id !== store.id || !currentUser || currentUser.store?.id !== store.id) {
      throw new Error("Cart merge ownership changed");
    }
    for (const guestItem of currentGuest.items) {
      const existingItem = currentUser.items.find((item) => item.product?.id === guestItem.product?.id);
      const quantity = guestItem.quantity + (existingItem?.quantity || 0);
      const product = await requireStoreProduct(transactionContext, guestItem.product?.id, store.id, { publishedOnly: true });
      assertSellableQuantity(product, store.id, quantity);
      if (existingItem) {
        await txSudo.query.CartItem.updateOne({ where: { id: existingItem.id }, data: { quantity } });
        await txSudo.query.CartItem.deleteOne({ where: { id: guestItem.id } });
      } else {
        await txSudo.query.CartItem.updateOne({ where: { id: guestItem.id }, data: { cart: { connect: { id: currentUser.id } } } });
      }
    }
    await transactionContext.prisma.cart.update({ where: { id: currentGuest.id }, data: { sessionId: `merged:${currentGuest.id}:${Date.now()}`, itemCount: 0, subtotal: 0, subtotalCents: 0 } });
    await recalculateCart(transactionContext, currentUser.id);
    const updated = await txSudo.query.Cart.findOne({ where: { id: currentUser.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}
async function updateSubstitutionPreference(root, {
  itemId,
  preference,
  sessionId
}, context) {
  if (!["allow", "contact", "remove"].includes(preference)) throw new Error("Unsupported substitution preference");
  const initial = await context.sudo().query.CartItem.findOne({ where: { id: itemId }, query: "id cart { id }" });
  if (!initial?.cart?.id) throw new Error("Cart item not found");
  return withLockedCart(context, initial.cart.id, async (transactionContext, cart) => {
    assertCartAccess(cart, context, sessionId);
    const sudoContext = transactionContext.sudo();
    const current = await sudoContext.query.CartItem.findOne({ where: { id: itemId }, query: "id cart { id }" });
    if (!current || current.cart?.id !== cart.id) throw new Error("Cart item not found");
    await sudoContext.query.CartItem.updateOne({
      where: { id: itemId },
      data: { substitutionPreference: preference }
    });
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}

// features/keystone/mutations/clipCoupon.ts
async function getClippedCoupons(root, args, context) {
  if (!context.session?.itemId) {
    return [];
  }
  const sudoContext = context.sudo();
  const userCoupons = await sudoContext.query.UserCoupon.findMany({
    where: {
      user: { id: { equals: context.session.itemId } },
      used: { equals: false }
    },
    query: `
      id
      clippedAt
      coupon {
        id
        code
        discountType
        discountValue
        minPurchase
        validFrom
        validTo
        isActive
        productCategories
      }
    `
  });
  const now = /* @__PURE__ */ new Date();
  return userCoupons.filter((uc) => {
    const coupon = uc.coupon;
    if (!coupon.isActive) return false;
    if (coupon.validTo && new Date(coupon.validTo) < now) return false;
    return true;
  }).map((uc) => ({
    id: uc.id,
    clippedAt: uc.clippedAt,
    coupon: {
      id: uc.coupon.id,
      code: uc.coupon.code,
      discountType: uc.coupon.discountType,
      discountValue: uc.coupon.discountValue,
      minPurchase: uc.coupon.minPurchase,
      validTo: uc.coupon.validTo,
      productCategories: uc.coupon.productCategories
    }
  }));
}

// features/keystone/mutations/manageShoppingList.ts
async function getShoppingListForUser(context, listId) {
  const sudoContext = context.sudo();
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to manage shopping lists");
  }
  const list45 = await sudoContext.query.ShoppingList.findOne({
    where: { id: listId },
    query: `
      id
      name
      isDefault
      user { id }
      items {
        id
        product
        quantity
        unit
        checked
        notes
        addedAt
      }
    `
  });
  if (!list45) {
    throw new Error("Shopping list not found");
  }
  if (list45.user?.id !== context.session.itemId) {
    throw new Error("Not authorized to access this shopping list");
  }
  return list45;
}
function formatShoppingListResponse(list45) {
  return {
    id: list45.id,
    name: list45.name,
    isDefault: list45.isDefault,
    items: list45.items.map((item) => ({
      id: item.id,
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      notes: item.notes,
      addedAt: item.addedAt
    })),
    itemCount: list45.items.length,
    checkedCount: list45.items.filter((item) => item.checked).length
  };
}
async function addToList(root, {
  listId,
  product,
  quantity,
  unit,
  notes
}, context) {
  const sudoContext = context.sudo();
  const store = await requireSessionStore(context);
  const matchingProducts = await sudoContext.query.Product.findMany({
    where: { AND: [{ store: { id: { equals: store.id } } }, { status: { equals: "published" } }, { OR: [{ id: { equals: product } }, { handle: { equals: product } }, { title: { equals: product } }] }] },
    query: "id title handle store { id }",
    take: 2
  });
  const productRecord = matchingProducts[0];
  if (!productRecord) throw new Error("Shopping-list items must reference a catalog product");
  const list45 = await getShoppingListForUser(context, listId);
  const existingItem = list45.items.find(
    (item) => item.product.toLowerCase() === product.toLowerCase()
  );
  if (existingItem) {
    const requestedQuantity = quantity || 1;
    await sudoContext.query.ShoppingListItem.updateOne({
      where: { id: existingItem.id },
      data: {
        quantity: requestedQuantity,
        ...unit && { unit },
        ...notes && notes !== existingItem.notes ? { notes } : {},
        productRef: { connect: { id: productRecord.id } }
      }
    });
  } else {
    await sudoContext.query.ShoppingListItem.createOne({
      data: {
        list: { connect: { id: listId } },
        product: productRecord.title,
        productRef: { connect: { id: productRecord.id } },
        quantity: quantity || 1,
        unit: unit || "each",
        notes: notes || "",
        checked: false,
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  const updatedList = await getShoppingListForUser(context, listId);
  return formatShoppingListResponse(updatedList);
}
async function removeFromList(root, { listId, itemId }, context) {
  const sudoContext = context.sudo();
  await getShoppingListForUser(context, listId);
  const item = await sudoContext.query.ShoppingListItem.findOne({
    where: { id: itemId },
    query: "id list { id }"
  });
  if (!item) {
    const updatedList2 = await getShoppingListForUser(context, listId);
    return formatShoppingListResponse(updatedList2);
  }
  if (item.list?.id !== listId) {
    throw new Error("Item does not belong to this shopping list");
  }
  await sudoContext.query.ShoppingListItem.deleteOne({
    where: { id: itemId }
  });
  const updatedList = await getShoppingListForUser(context, listId);
  return formatShoppingListResponse(updatedList);
}
async function updateListItemQuantity(root, {
  listId,
  itemId,
  quantity
}, context) {
  const sudoContext = context.sudo();
  await getShoppingListForUser(context, listId);
  const item = await sudoContext.query.ShoppingListItem.findOne({
    where: { id: itemId },
    query: "id list { id }"
  });
  if (!item) {
    throw new Error("Item not found");
  }
  if (item.list?.id !== listId) {
    throw new Error("Item does not belong to this shopping list");
  }
  if (quantity <= 0) {
    await sudoContext.query.ShoppingListItem.deleteOne({
      where: { id: itemId }
    });
  } else {
    await sudoContext.query.ShoppingListItem.updateOne({
      where: { id: itemId },
      data: { quantity }
    });
  }
  const updatedList = await getShoppingListForUser(context, listId);
  return formatShoppingListResponse(updatedList);
}
async function toggleListItemChecked(root, { listId, itemId }, context) {
  const sudoContext = context.sudo();
  await getShoppingListForUser(context, listId);
  const item = await sudoContext.query.ShoppingListItem.findOne({
    where: { id: itemId },
    query: "id list { id } checked"
  });
  if (!item) {
    throw new Error("Item not found");
  }
  if (item.list?.id !== listId) {
    throw new Error("Item does not belong to this shopping list");
  }
  await sudoContext.query.ShoppingListItem.updateOne({
    where: { id: itemId },
    data: { checked: !item.checked }
  });
  const updatedList = await getShoppingListForUser(context, listId);
  return formatShoppingListResponse(updatedList);
}
async function addListToCart(root, { listId, sessionId }, context) {
  const sudoContext = context.sudo();
  const store = await requireSessionStore(context);
  const list45 = await getShoppingListForUser(context, listId);
  const uncheckedItems = list45.items.filter((item) => !item.checked);
  if (uncheckedItems.length === 0) {
    return {
      success: true,
      message: "No unchecked items to add to cart",
      addedCount: 0,
      skippedCount: 0,
      skippedItems: []
    };
  }
  let addedCount = 0;
  const skippedItems = [];
  for (const item of uncheckedItems) {
    const products = await sudoContext.query.Product.findMany({
      where: {
        AND: [
          { store: { id: { equals: store.id } } },
          { status: { equals: "published" } },
          { OR: [
            { title: { contains: item.product, mode: "insensitive" } },
            { title: { equals: item.product, mode: "insensitive" } }
          ] }
        ]
      },
      query: "id title store { id }",
      take: 1
    });
    if (products.length === 0) {
      skippedItems.push(item.product);
      continue;
    }
    const product = products[0];
    try {
      await addToCart(null, { productId: product.id, quantity: item.quantity, sessionId }, context);
      addedCount++;
    } catch (error) {
      skippedItems.push(`${item.product} (${error instanceof Error ? error.message : "unavailable"})`);
    }
  }
  return {
    success: true,
    message: `Added ${addedCount} items to cart${skippedItems.length > 0 ? `, skipped ${skippedItems.length}` : ""}`,
    addedCount,
    skippedCount: skippedItems.length,
    skippedItems
  };
}

// features/keystone/mutations/manageShoppingLists.ts
function requireUser(context) {
  if (!context.session?.itemId) throw new Error("Must be logged in to manage shopping lists");
  return context.session.itemId;
}
async function createShoppingList(_root, { name }, context) {
  const userId = requireUser(context);
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Shopping list name is required");
  const sudoContext = context.sudo();
  const existing = await sudoContext.query.ShoppingList.findMany({
    where: {
      user: { id: { equals: userId } },
      name: { equals: normalizedName, mode: "insensitive" }
    },
    take: 1,
    query: "id name isDefault updatedAt items { id product quantity unit checked notes addedAt }"
  });
  if (existing[0]) return existing[0];
  return sudoContext.query.ShoppingList.createOne({
    data: { name: normalizedName, user: { connect: { id: userId } } },
    query: "id name isDefault updatedAt items { id product quantity unit checked notes addedAt }"
  });
}
async function deleteShoppingList(_root, { listId }, context) {
  const userId = requireUser(context);
  const sudoContext = context.sudo();
  const list45 = await sudoContext.query.ShoppingList.findOne({
    where: { id: listId },
    query: "id user { id } items { id }"
  });
  if (!list45) return { success: true, listId };
  if (list45.user?.id !== userId) throw new Error("Not authorized to delete this shopping list");
  for (const item of list45.items || []) {
    await sudoContext.query.ShoppingListItem.deleteOne({ where: { id: item.id } });
  }
  await sudoContext.query.ShoppingList.deleteOne({ where: { id: listId } });
  return { success: true, listId };
}

// features/keystone/mutations/getAvailablePickupSlots.ts
async function deliveryStore(context) {
  return requireFreshCapability(context, "canManageDelivery");
}
function slotResult(slot) {
  const currentOrders = slot.currentOrders || 0;
  return {
    id: slot.id,
    date: slot.date.toISOString(),
    startTime: slot.startTime,
    endTime: slot.endTime,
    availableCapacity: Math.max(0, slot.maxOrders - currentOrders),
    maxOrders: slot.maxOrders,
    currentOrders,
    isAvailable: Boolean(slot.isAvailable)
  };
}
async function getAvailablePickupSlots(_root, { days = 7, minCapacity = 1 }, context) {
  const { storeId } = await deliveryStore(context);
  const store = await context.prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } });
  if (!store) throw new Error("Active store was not found");
  const boundedDays2 = Math.min(14, Math.max(1, Math.trunc(days)));
  const boundedCapacity = Math.max(1, Math.trunc(minCapacity));
  const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1e3);
  const endDate = new Date(Date.now() + (boundedDays2 + 2) * 24 * 60 * 60 * 1e3);
  const slots = await context.prisma.pickupSlot.findMany({
    where: {
      storeId,
      date: { gte: startDate, lt: endDate },
      isActive: true,
      isAvailable: true
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 200,
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      maxOrders: true,
      currentOrders: true,
      isActive: true,
      isAvailable: true
    }
  });
  return slots.filter((slot) => isSlotWithinDays(slot, store.timezone, boundedDays2)).map(slotResult).filter((slot) => slot.availableCapacity >= boundedCapacity);
}
async function getPickupSlotsByDate(root, args, context) {
  const slots = await getAvailablePickupSlots(root, args, context);
  const storeId = context.session?.data.store?.id;
  const store = storeId ? await context.prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } }) : null;
  if (!store) throw new Error("Active store was not found");
  const grouped = /* @__PURE__ */ new Map();
  for (const slot of slots) {
    const date = zonedDateKey(slot.date, store.timezone);
    grouped.set(date, [...grouped.get(date) || [], slot]);
  }
  return Array.from(grouped, ([date, daySlots]) => ({
    date,
    slots: daySlots,
    totalSlots: daySlots.length,
    totalAvailableCapacity: daySlots.reduce((sum, slot) => sum + slot.availableCapacity, 0)
  }));
}

// features/keystone/utils/guestOrderToken.ts
var import_node_crypto = require("node:crypto");
var TOKEN_VERSION = "v2";
var LEGACY_TOKEN_VERSION = "v1";
var DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
var CLOCK_SKEW_SECONDS = 5 * 60;
function tokenSecret() {
  return process.env.SESSION_SECRET || "this secret should only be used in testing";
}
function maxAgeSeconds() {
  const configured = Number.parseInt(process.env.GUEST_ORDER_TOKEN_MAX_AGE_SECONDS || "", 10);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_AGE_SECONDS;
}
function v2Signature(orderId, sessionId, issuedAtSeconds) {
  return (0, import_node_crypto.createHmac)("sha256", tokenSecret()).update(`${TOKEN_VERSION}:${orderId}:${sessionId}:${issuedAtSeconds}`).digest("base64url");
}
function v1Signature(orderId, sessionId) {
  return (0, import_node_crypto.createHmac)("sha256", tokenSecret()).update(`${LEGACY_TOKEN_VERSION}:${orderId}:${sessionId}`).digest("base64url");
}
function signaturesMatch(expectedSignature, suppliedSignature) {
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && (0, import_node_crypto.timingSafeEqual)(expected, supplied);
}
function createGuestOrderToken(orderId, sessionId, issuedAtSeconds = Math.floor(Date.now() / 1e3)) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    throw new Error("Guest order token requires a session ID");
  }
  if (!Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds <= 0) {
    throw new Error("Guest order token requires a valid issue time");
  }
  return `${TOKEN_VERSION}.${issuedAtSeconds}.${v2Signature(
    orderId,
    normalizedSessionId,
    issuedAtSeconds
  )}`;
}
function verifyGuestOrderToken(orderId, sessionId, token, nowSeconds = Math.floor(Date.now() / 1e3), orderCreatedAt) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) return false;
  const parts = token.split(".");
  if (parts[0] === TOKEN_VERSION) {
    const issuedAtSeconds = Number.parseInt(parts[1] || "", 10);
    const suppliedSignature = parts[2];
    if (parts.length !== 3 || !Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds <= 0 || !suppliedSignature || issuedAtSeconds > nowSeconds + CLOCK_SKEW_SECONDS || nowSeconds - issuedAtSeconds > maxAgeSeconds()) {
      return false;
    }
    return signaturesMatch(
      v2Signature(orderId, normalizedSessionId, issuedAtSeconds),
      suppliedSignature
    );
  }
  if (parts[0] === LEGACY_TOKEN_VERSION) {
    const suppliedSignature = parts[1];
    if (parts.length !== 2 || !suppliedSignature || !orderCreatedAt) return false;
    const createdAtSeconds = Math.floor(new Date(orderCreatedAt).getTime() / 1e3);
    if (!Number.isSafeInteger(createdAtSeconds) || createdAtSeconds <= 0 || createdAtSeconds > nowSeconds + CLOCK_SKEW_SECONDS || nowSeconds - createdAtSeconds > maxAgeSeconds()) {
      return false;
    }
    return signaturesMatch(v1Signature(orderId, normalizedSessionId), suppliedSignature);
  }
  return false;
}

// features/keystone/utils/serializableTransaction.ts
function isSerializableConflict(error) {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error;
  return candidate.code === "P2034" || candidate.code === "P2002" || /serialization|write conflict|deadlock|unique constraint/i.test(candidate.message || "");
}
async function withSerializableRetry(operation, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isSerializableConflict(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
  throw lastError;
}

// features/keystone/mutations/customerCheckIn.ts
async function assertCanManageDelivery(context) {
  return requireFreshCapability(context, "canManageDelivery");
}
async function checkInOwnedPickupOrder(args, ownership, context) {
  const vehicleDescription = args.vehicleDescription?.trim() || "";
  if (vehicleDescription.length > 200) throw new Error("Vehicle description must be 200 characters or less");
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', args.orderId);
    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      select: { id: true, displayId: true, status: true, userId: true, storeId: true, metadata: true, createdAt: true, store: { select: { isActive: true } } }
    });
    if (!order?.store?.isActive) throw new Error("Pickup order not found");
    if (ownership.kind === "customer") {
      if (order.userId !== ownership.userId || order.storeId !== ownership.storeId) throw new Error("Pickup order not found");
    } else {
      const guestSessionId = String(order.metadata?.guestSessionId || "");
      if (order.userId || guestSessionId !== ownership.sessionId.trim() || !verifyGuestOrderToken(order.id, ownership.sessionId, ownership.token, void 0, order.createdAt)) throw new Error("Pickup order not found");
    }
    const metadata = order.metadata || {};
    if (metadata.fulfillmentMethod !== "pickup") throw new Error("Only pickup orders can check in");
    if (!metadata.readyForPickup) throw new Error("This pickup order is not marked ready yet");
    if (order.status !== "packed") {
      if (order.status === "delivered") throw new Error("This order has already been picked up");
      if (order.status === "cancelled") throw new Error("This order has been cancelled");
      throw new Error(`Order cannot be checked in with status: ${order.status}`);
    }
    if (metadata.customerArrived) {
      const existingSpot = metadata.parkingSpotId ? await tx.parkingSpot.findUnique({ where: { id: metadata.parkingSpotId } }) : null;
      return {
        success: true,
        orderId: order.id,
        orderNumber: order.displayId,
        status: "checked_in",
        parkingSpot: existingSpot ? {
          id: existingSpot.id,
          spotNumber: existingSpot.spotNumber,
          description: existingSpot.description || void 0,
          isAccessible: Boolean(existingSpot.isAccessible)
        } : null,
        estimatedWaitMinutes: Number(metadata.estimatedWaitMinutes || 0),
        message: existingSpot ? `Already checked in at spot ${existingSpot.spotNumber}.` : "Already checked in."
      };
    }
    let parkingSpot = null;
    if (args.parkingSpotId) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "ParkingSpot" WHERE "id" = $1 FOR UPDATE', args.parkingSpotId);
      parkingSpot = await tx.parkingSpot.findUnique({ where: { id: args.parkingSpotId } });
      if (!parkingSpot || parkingSpot.storeId !== order.storeId) throw new Error("Parking spot not found");
      if (!parkingSpot.isAvailable) throw new Error("Selected parking spot is not available");
    }
    const checkInTime = (/* @__PURE__ */ new Date()).toISOString();
    const waitingOrders = await tx.order.findMany({
      where: { storeId: order.storeId, status: "packed", id: { not: order.id } },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { metadata: true }
    });
    const ordersAhead = waitingOrders.filter((waiting) => {
      const waitingMetadata = waiting.metadata || {};
      return Boolean(waitingMetadata.customerArrived && waitingMetadata.checkInTime && new Date(waitingMetadata.checkInTime) < new Date(checkInTime));
    }).length;
    const estimatedWaitMinutes = ordersAhead * 3;
    if (parkingSpot) await tx.parkingSpot.update({ where: { id: parkingSpot.id }, data: { isAvailable: false } });
    await tx.order.update({
      where: { id: order.id },
      data: {
        metadata: {
          ...metadata,
          checkInTime,
          parkingSpotId: parkingSpot?.id || null,
          parkingSpotNumber: parkingSpot?.spotNumber || null,
          vehicleDescription: vehicleDescription || null,
          customerArrived: true,
          pickupCheckedInAt: checkInTime,
          estimatedWaitMinutes
        }
      }
    });
    return {
      success: true,
      orderId: order.id,
      orderNumber: order.displayId,
      status: "checked_in",
      parkingSpot: parkingSpot ? {
        id: parkingSpot.id,
        spotNumber: parkingSpot.spotNumber,
        description: parkingSpot.description || void 0,
        isAccessible: Boolean(parkingSpot.isAccessible)
      } : null,
      estimatedWaitMinutes,
      message: parkingSpot ? `Checked in at spot ${parkingSpot.spotNumber}. Estimated wait: ${estimatedWaitMinutes} minutes.` : `Checked in successfully. Estimated wait: ${estimatedWaitMinutes} minutes.`
    };
  }, { isolationLevel: "ReadCommitted" });
}
async function customerCheckIn(_root, args, context) {
  if (!context.session?.itemId) throw new Error("Sign in to check in for pickup");
  const store = await requireSessionStore(context);
  return checkInOwnedPickupOrder(args, { kind: "customer", userId: context.session.itemId, storeId: store.id }, context);
}
async function guestCustomerCheckIn(_root, args, context) {
  return checkInOwnedPickupOrder(args, { kind: "guest", sessionId: args.sessionId, token: args.token }, context);
}
async function getAvailableParkingSpots(root, { accessibleOnly }, context) {
  const { storeId } = await assertCanManageDelivery(context);
  const sudoContext = context.sudo();
  const where = {
    AND: [
      { store: { id: { equals: storeId } } },
      { isAvailable: { equals: true } }
    ]
  };
  if (accessibleOnly) {
    where.isAccessible = { equals: true };
  }
  const spots = await sudoContext.query.ParkingSpot.findMany({
    where,
    query: "id spotNumber description isAccessible isAvailable",
    orderBy: [{ spotNumber: "asc" }]
  });
  return spots.map((spot) => ({
    id: spot.id,
    spotNumber: spot.spotNumber,
    description: spot.description,
    isAccessible: spot.isAccessible,
    isAvailable: spot.isAvailable
  }));
}
async function completePickupHandoff(context, orderId, expectedParkingSpotId) {
  const { storeId } = await assertCanManageDelivery(context);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, displayId: true, status: true, metadata: true, storeId: true }
    });
    if (!order || order.storeId !== storeId) throw new Error("Order not found in active store");
    const metadata = order.metadata || {};
    if (metadata.fulfillmentMethod !== "pickup") throw new Error("Only pickup orders can use counter or curbside handoff");
    if (order.status !== "packed" && order.status !== "delivered") throw new Error("Pickup order must be packed before handoff");
    if (metadata.readyForPickup !== true && order.status !== "delivered") throw new Error("Pickup order must be marked ready before handoff");
    const parkingSpotId = typeof metadata.parkingSpotId === "string" ? metadata.parkingSpotId : null;
    if (expectedParkingSpotId && parkingSpotId !== expectedParkingSpotId) {
      throw new Error("Parking spot does not belong to this order check-in");
    }
    let spotNumber = null;
    if (parkingSpotId) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "ParkingSpot" WHERE "id" = $1 FOR UPDATE', parkingSpotId);
      const spot = await tx.parkingSpot.findUnique({ where: { id: parkingSpotId }, select: { storeId: true, spotNumber: true } });
      if (!spot || spot.storeId !== storeId) throw new Error("Parking spot not found in active store");
      spotNumber = spot.spotNumber;
      if (order.status !== "delivered") await tx.parkingSpot.update({ where: { id: parkingSpotId }, data: { isAvailable: true } });
    }
    if (order.status !== "delivered") {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "delivered",
          metadata: {
            ...metadata,
            deliveryTime: (/* @__PURE__ */ new Date()).toISOString(),
            handoffCompletedBy: context.session?.itemId || "staff",
            parkingSpotReleased: Boolean(parkingSpotId)
          }
        }
      });
    }
    return { order, parkingSpotId, spotNumber };
  }, { isolationLevel: "Serializable" }));
}
async function releaseParkingSpot(_root, { parkingSpotId, orderId }, context) {
  const result = await completePickupHandoff(context, orderId, parkingSpotId);
  return {
    success: true,
    parkingSpotId,
    spotNumber: result.spotNumber || parkingSpotId,
    orderId,
    message: `Parking spot ${result.spotNumber || parkingSpotId} released. Order marked as delivered.`
  };
}
async function completeOrderHandoff(_root, { orderId }, context) {
  const result = await completePickupHandoff(context, orderId);
  return {
    success: true,
    orderId,
    orderNumber: result.order.displayId,
    status: "delivered",
    message: `Order #${result.order.displayId} has been handed off successfully.`
  };
}

// features/keystone/mutations/submitGroceryOrder.ts
var import_node_crypto5 = require("node:crypto");

// features/integrations/payment/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  capturePaymentFunction: () => capturePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  refundPaymentFunction: () => refundPaymentFunction
});
var import_stripe = __toESM(require("stripe"));
var getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error("Stripe secret key not configured");
  }
  return new import_stripe.default(stripeKey, {
    apiVersion: "2025-08-27.basil"
  });
};
async function createPaymentFunction({ cart, amount, currency, idempotencyKey }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    automatic_payment_methods: {
      enabled: true
    },
    metadata: {
      cartId: cart?.id || "",
      sessionId: cart?.sessionId || ""
    }
  }, idempotencyKey ? { idempotencyKey } : void 0);
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id
  };
}
async function capturePaymentFunction({ paymentId, amount }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    amount_to_capture: amount
  });
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_captured,
    data: paymentIntent
  };
}
async function refundPaymentFunction({ paymentId, amount, idempotencyKey }) {
  const stripe = getStripeClient();
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentId,
      amount
    },
    idempotencyKey ? { idempotencyKey } : void 0
  );
  return {
    status: refund.status,
    amount: refund.amount,
    data: refund
  };
}
async function getPaymentStatusFunction({ paymentId }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    data: paymentIntent
  };
}
async function generatePaymentLinkFunction({ paymentId }) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}
async function handleWebhookFunction({ rawBody, headers }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }
  const signature2 = headers["stripe-signature"];
  if (!signature2 || !rawBody) {
    throw new Error("Stripe webhook signature and raw body are required");
  }
  try {
    const stripeEvent = import_stripe.default.webhooks.constructEvent(
      rawBody,
      signature2,
      webhookSecret
    );
    return {
      isValid: true,
      event: stripeEvent,
      eventId: stripeEvent.id,
      type: stripeEvent.type,
      resource: stripeEvent.data.object
    };
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err?.message || "Unknown error"}`);
  }
}

// features/integrations/payment/test.ts
var test_exports = {};
__export(test_exports, {
  capturePaymentFunction: () => capturePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  createTestPaymentWebhookSignature: () => createTestPaymentWebhookSignature,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  refundPaymentFunction: () => refundPaymentFunction2
});
var import_node_crypto2 = require("node:crypto");
var TEST_PROVIDER_SECRET_ENV = "GROCERY_PAYMENT_TEST_SECRET";
function secret() {
  const value = process.env[TEST_PROVIDER_SECRET_ENV];
  if (!value) throw new Error(`${TEST_PROVIDER_SECRET_ENV} is required for the local payment adapter`);
  return value;
}
function signature(rawBody) {
  return (0, import_node_crypto2.createHmac)("sha256", secret()).update(rawBody).digest("hex");
}
async function createPaymentFunction2({ amount, currency, idempotencyKey }) {
  secret();
  const paymentIntentId = `test_pi_${Buffer.from(idempotencyKey || `${currency}:${amount}:${Date.now()}`).toString("base64url")}`;
  return { clientSecret: `${paymentIntentId}_secret`, paymentIntentId, amount, currency: currency.toLowerCase() };
}
async function capturePaymentFunction2({ paymentId, amount }) {
  secret();
  return { status: "succeeded", amount: amount ?? 0, data: { id: paymentId, status: "succeeded" } };
}
async function refundPaymentFunction2({ paymentId, amount, idempotencyKey }) {
  secret();
  if (process.env.GROCERY_TEST_PROVIDER_TIMEOUT === "true") await new Promise((resolve) => setTimeout(resolve, 250));
  if (!paymentId) throw new Error("Test payment id is required");
  const refundedAmount = amount ?? Number((await getPaymentStatusFunction2({ paymentId })).amount || 0);
  return {
    status: "succeeded",
    amount: refundedAmount,
    data: { id: `test_re_${Buffer.from(idempotencyKey || paymentId).toString("base64url")}`, paymentId, amount: refundedAmount, fullRefund: amount === void 0, idempotencyKey }
  };
}
async function getPaymentStatusFunction2({ paymentId }) {
  secret();
  let amount = 0;
  let currency = "usd";
  if (paymentId.startsWith("test_pi_")) {
    try {
      const decoded = Buffer.from(paymentId.slice("test_pi_".length), "base64url").toString("utf8");
      const last = decoded.split(":").at(-1);
      if (last && /^\d+$/.test(last)) amount = Number(last);
    } catch {
    }
  }
  return { status: "succeeded", amount, currency, data: { id: paymentId, status: "succeeded", amount, currency } };
}
async function generatePaymentLinkFunction2({ paymentId }) {
  secret();
  return `https://test-payments.local/payments/${encodeURIComponent(paymentId)}`;
}
async function handleWebhookFunction2({ rawBody, headers }) {
  const expected = signature(rawBody);
  const received = headers["x-grocery-test-signature"];
  if (!received || received.length !== expected.length || !(0, import_node_crypto2.timingSafeEqual)(Buffer.from(received), Buffer.from(expected))) {
    throw new Error("Test payment webhook signature verification failed");
  }
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error("Test payment webhook body must be JSON");
  }
  if (!payload?.id || !payload?.type) throw new Error("Test payment webhook event id and type are required");
  return {
    isValid: true,
    event: payload,
    eventId: payload.id,
    type: payload.type,
    resource: payload.data?.object || payload.data || null
  };
}
function createTestPaymentWebhookSignature(rawBody) {
  return signature(rawBody);
}

// features/integrations/payment/index.ts
var STRIPE_PROVIDER_CODE = "pp_stripe_default";
var TEST_PROVIDER_CODE = "pp_test_default";
var paymentProviderAdapters = {
  [STRIPE_PROVIDER_CODE]: stripe_exports,
  [TEST_PROVIDER_CODE]: test_exports
};
var paymentProviderDefinitions = {
  [STRIPE_PROVIDER_CODE]: {
    adapter: paymentProviderAdapters[STRIPE_PROVIDER_CODE],
    publicCheckout: true,
    credentialEnv: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
  },
  [TEST_PROVIDER_CODE]: {
    adapter: paymentProviderAdapters[TEST_PROVIDER_CODE],
    publicCheckout: false,
    credentialEnv: ["GROCERY_PAYMENT_TEST_SECRET"]
  }
};
function getPaymentProviderDefinition(providerCode) {
  const definition = paymentProviderDefinitions[providerCode];
  if (!definition) throw new Error(`Unsupported payment provider: ${providerCode}`);
  return definition;
}
function getPaymentProviderAdapter(providerCode) {
  const adapter = paymentProviderAdapters[providerCode];
  if (!adapter) throw new Error(`Unsupported payment provider: ${providerCode}`);
  return adapter;
}
function assertPublicPaymentProvider(providerCode) {
  const definition = getPaymentProviderDefinition(providerCode);
  if (!definition.publicCheckout && !(providerCode === TEST_PROVIDER_CODE && process.env.NODE_ENV !== "production" && process.env.GROCERY_PAYMENT_TEST_SECRET)) {
    throw new Error(`Payment provider ${providerCode} is not enabled for public checkout`);
  }
}

// features/keystone/utils/paymentProviderAdapter.ts
async function executeAdapterFunction({
  provider,
  functionName,
  args
}) {
  if (!provider?.isInstalled) {
    throw new Error(`Payment provider ${provider?.code || "unknown"} is not installed`);
  }
  const adapter = getPaymentProviderAdapter(provider.code);
  return adapter[functionName](args);
}
async function createPayment({ provider, cart, order, amount, currency, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency, idempotencyKey }
  });
}
async function refundPayment({ provider, paymentId, amount, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "refundPaymentFunction",
    args: { paymentId, amount, idempotencyKey }
  });
}
async function getPaymentStatus({ provider, paymentId }) {
  return executeAdapterFunction({
    provider,
    functionName: "getPaymentStatusFunction",
    args: { paymentId }
  });
}
async function verifyPaymentWebhook({
  providerCode,
  rawBody,
  headers
}) {
  const adapter = getPaymentProviderAdapter(providerCode);
  return adapter.handleWebhookFunction({ rawBody, headers });
}

// features/keystone/lib/groceryOutbox.ts
var import_node_crypto3 = require("node:crypto");
function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key2, entry]) => [key2, canonicalValue(entry)])
    );
  }
  return value;
}
function canonicalGroceryOutboxPayload(payload) {
  return JSON.stringify(canonicalValue(payload));
}
function groceryOutboxPayloadHash(payload) {
  return (0, import_node_crypto3.createHash)("sha256").update(canonicalGroceryOutboxPayload(payload)).digest("hex");
}
async function enqueueGroceryOutboxEvent(tx, envelope) {
  const payloadHash = groceryOutboxPayloadHash(envelope.payload);
  await tx.$queryRawUnsafe(
    `SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext('grocery-outbox'), hashtext($1))`,
    envelope.eventKey
  );
  const existing = await tx.groceryOutboxEvent.findUnique({ where: { eventKey: envelope.eventKey } });
  if (existing) {
    const matches = existing.storeId === envelope.storeId && existing.eventType === envelope.eventType && existing.aggregateType === envelope.aggregateType && existing.aggregateId === envelope.aggregateId && existing.payloadHash === payloadHash;
    if (!matches) throw new Error("Outbox event key was reused with a different immutable snapshot");
    return { event: existing, created: false };
  }
  const event = await tx.groceryOutboxEvent.create({
    data: {
      storeId: envelope.storeId,
      eventKey: envelope.eventKey,
      eventType: envelope.eventType,
      aggregateType: envelope.aggregateType,
      aggregateId: envelope.aggregateId,
      schemaVersion: envelope.schemaVersion || 1,
      occurredAt: new Date(envelope.occurredAt),
      payload: envelope.payload,
      payloadHash,
      status: "pending",
      attempts: 0
    }
  });
  return { event, created: true };
}
function newGroceryOutboxClaimToken(workerId) {
  return `${workerId}:${(0, import_node_crypto3.randomUUID)()}`;
}

// features/keystone/lib/couponPricing.ts
function calculateCouponDiscount(coupon, items, now = /* @__PURE__ */ new Date()) {
  if (!coupon.isActive) throw new Error(`Coupon ${coupon.code} is inactive`);
  if (coupon.validFrom && new Date(coupon.validFrom) > now) throw new Error(`Coupon ${coupon.code} is not yet valid`);
  if (coupon.validTo && new Date(coupon.validTo) < now) throw new Error(`Coupon ${coupon.code} has expired`);
  if ((coupon.maxUses || 0) > 0 && (coupon.currentUses || 0) >= (coupon.maxUses || 0)) throw new Error(`Coupon ${coupon.code} has reached its maximum uses`);
  const subtotalCents = items.reduce((sum, item) => sum + Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity, 0);
  const minPurchaseCents = Number(coupon.minPurchaseCents || Math.round(Number(coupon.minPurchase || 0) * 100));
  if (minPurchaseCents && subtotalCents < minPurchaseCents) throw new Error(`Coupon ${coupon.code} requires a minimum purchase of ${(minPurchaseCents / 100).toFixed(2)}`);
  const categories = Array.isArray(coupon.productCategories) ? coupon.productCategories : [];
  const excluded = Array.isArray(coupon.excludedProducts) ? coupon.excludedProducts : [];
  const eligible = items.filter((item) => {
    const product = item.product;
    if (!product?.id) return false;
    if (categories.length && !categories.includes(product.department)) return false;
    if (excluded.includes(product.id)) return false;
    return true;
  });
  const eligibleSubtotalCents = eligible.reduce((sum, item) => sum + Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity, 0);
  let discountCents = 0;
  if (coupon.discountType === "percentage") discountCents = Math.round(eligibleSubtotalCents * (Number(coupon.discountValue) / 100));
  else if (coupon.discountType === "fixed") discountCents = Number(coupon.discountValueCents || Math.round(Number(coupon.discountValue) * 100));
  else if (coupon.discountType === "bogo") discountCents = eligible.reduce((sum, item) => sum + Math.floor(item.quantity / 2) * Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)), 0);
  else throw new Error(`Unsupported coupon type ${coupon.discountType}`);
  return Math.max(0, Math.min(subtotalCents, discountCents)) / 100;
}

// features/keystone/utils/checkoutAttemptLease.ts
var import_node_crypto4 = require("node:crypto");
var CHECKOUT_RECONCILIATION_LEASE_MS = 3e4;
function boundedLeaseMs(value) {
  if (value === void 0) return CHECKOUT_RECONCILIATION_LEASE_MS;
  if (!Number.isInteger(value) || value < 10 || value > 12e4) throw new Error("Invalid checkout reconciliation lease");
  return value;
}
function rowToLease(row) {
  return {
    id: row.id,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    providerCode: row.providerCode,
    providerPaymentId: row.providerPaymentId,
    amountCents: Number(row.amountCents),
    currencyCode: row.currencyCode,
    requestData: row.requestData,
    storeId: row.storeId,
    cartId: row.cartId,
    cartCustomerId: row.cartCustomerId || null,
    paymentSessionId: row.paymentSessionId,
    orderId: row.orderId || null,
    fencingToken: Number(row.fencingToken),
    leaseToken: row.leaseToken
  };
}
var RETURNING = `
  ca."id", ca."status", ca."idempotencyKey", ca."providerCode", ca."providerPaymentId",
  ca."amountCents", ca."currencyCode", ca."requestData", ca."store" AS "storeId",
  ca."cart" AS "cartId", c."customer" AS "cartCustomerId", ca."paymentSession" AS "paymentSessionId",
  ca."order" AS "orderId", ca."fencingToken", ca."leaseToken"
`;
async function claimCheckoutAttempt(db, attemptId, action, options = {}) {
  const leaseToken = (0, import_node_crypto4.randomUUID)();
  const leaseMs = boundedLeaseMs(options.leaseMs);
  const nextStatus = action === "finalize" ? "finalizing" : "compensation_processing";
  let rows;
  if (options.expected) {
    rows = await db.$queryRawUnsafe(
      `UPDATE "CheckoutAttempt" ca
       SET "status" = $3::"CheckoutAttemptStatusType",
           "leaseToken" = $2,
           "leaseExpiresAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
           "fencingToken" = ca."fencingToken" + 1,
           "attempts" = ca."attempts" + 1
       FROM "Cart" c
       WHERE ca."id" = $1 AND ca."cart" = c."id" AND ca."order" IS NULL
         AND ca."status" = 'finalizing'
         AND ca."leaseToken" = $5 AND ca."fencingToken" = $6
         AND ca."leaseExpiresAt" > NOW()
       RETURNING ${RETURNING}`,
      attemptId,
      leaseToken,
      nextStatus,
      leaseMs,
      options.expected.leaseToken,
      options.expected.fencingToken
    );
  } else if (action === "finalize") {
    rows = await db.$queryRawUnsafe(
      `UPDATE "CheckoutAttempt" ca
       SET "status" = $2::"CheckoutAttemptStatusType",
           "leaseToken" = $3,
           "leaseExpiresAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
           "fencingToken" = ca."fencingToken" + 1,
           "attempts" = ca."attempts" + 1
       FROM "Cart" c
       WHERE ca."id" = $1 AND ca."cart" = c."id" AND ca."order" IS NULL
         AND ca."status" IN ('pending', 'settled_pending_finalize', 'finalizing')
         AND (ca."leaseExpiresAt" IS NULL OR ca."leaseExpiresAt" <= NOW())
       RETURNING ${RETURNING}`,
      attemptId,
      nextStatus,
      leaseToken,
      leaseMs
    );
  } else {
    rows = await db.$queryRawUnsafe(
      `UPDATE "CheckoutAttempt" ca
       SET "status" = $2::"CheckoutAttemptStatusType",
           "leaseToken" = $3,
           "leaseExpiresAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
           "fencingToken" = ca."fencingToken" + 1,
           "attempts" = ca."attempts" + 1
       FROM "Cart" c
       WHERE ca."id" = $1 AND ca."cart" = c."id" AND ca."order" IS NULL
         AND ca."status" IN ('compensation_required', 'compensation_processing')
         AND (ca."leaseExpiresAt" IS NULL OR ca."leaseExpiresAt" <= NOW())
       RETURNING ${RETURNING}`,
      attemptId,
      nextStatus,
      leaseToken,
      leaseMs
    );
  }
  return rows[0] ? rowToLease(rows[0]) : null;
}
async function assertFinalizationLease(db, lease) {
  const rows = await db.$queryRawUnsafe(
    `SELECT "status", "order", "leaseToken", "fencingToken"
     FROM "CheckoutAttempt" WHERE "id" = $1 FOR UPDATE`,
    lease.id
  );
  const row = rows[0];
  if (!row || row.status !== "finalizing" || row.order || row.leaseToken !== lease.leaseToken || Number(row.fencingToken) !== lease.fencingToken) {
    throw new Error("Checkout reconciliation lease was fenced before finalization");
  }
}
async function refreshFinalizationSettlement(db, lease, amountCents, currencyCode) {
  const rows = await db.$queryRawUnsafe(
    `UPDATE "CheckoutAttempt"
     SET "amountCents" = $2, "currencyCode" = $3, "settledAt" = COALESCE("settledAt", NOW())
     WHERE "id" = $1 AND "status" = 'finalizing' AND "order" IS NULL
       AND "leaseToken" = $4 AND "fencingToken" = $5
     RETURNING "id"`,
    lease.id,
    amountCents,
    currencyCode,
    lease.leaseToken,
    lease.fencingToken
  );
  if (!rows[0]) throw new Error("Checkout reconciliation lease was fenced before settlement refresh");
}
async function finalizeCheckoutAttempt(db, lease, orderId) {
  const rows = await db.$queryRawUnsafe(
    `UPDATE "CheckoutAttempt"
     SET "status" = 'finalized', "finalizedAt" = NOW(), "order" = $2,
         "leaseToken" = NULL, "leaseExpiresAt" = NULL
     WHERE "id" = $1 AND "status" = 'finalizing' AND "order" IS NULL
       AND "leaseToken" = $3 AND "fencingToken" = $4
     RETURNING "id"`,
    lease.id,
    orderId,
    lease.leaseToken,
    lease.fencingToken
  );
  if (!rows[0]) throw new Error("Checkout reconciliation lease was fenced at finalization");
}
async function releaseCheckoutAttemptLease(db, lease, status) {
  await db.$queryRawUnsafe(
    `UPDATE "CheckoutAttempt"
     SET "status" = $2::"CheckoutAttemptStatusType", "leaseToken" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = NOW()
     WHERE "id" = $1 AND "order" IS NULL AND "status" IN ('finalizing', 'compensation_processing')
       AND "leaseToken" = $3 AND "fencingToken" = $4`,
    lease.id,
    status,
    lease.leaseToken,
    lease.fencingToken
  );
}
async function completeCompensation(db, lease, status, message) {
  const rows = await db.$queryRawUnsafe(
    `UPDATE "CheckoutAttempt"
     SET "status" = $2::"CheckoutAttemptStatusType",
         "compensationAt" = CASE WHEN $2 = 'compensated' THEN NOW() ELSE "compensationAt" END,
         "lastError" = $3, "leaseToken" = NULL, "leaseExpiresAt" = NULL
     WHERE "id" = $1 AND "status" = 'compensation_processing' AND "order" IS NULL
       AND "leaseToken" = $4 AND "fencingToken" = $5
     RETURNING "id"`,
    lease.id,
    status,
    message,
    lease.leaseToken,
    lease.fencingToken
  );
  return Boolean(rows[0]);
}

// features/keystone/mutations/submitGroceryOrder.ts
async function ensureCheckoutAttempt(context, data, cart, session, providerPaymentId) {
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const idempotencyKey = `checkout:${data.paymentSessionId}`;
    const attempts = await tx.$queryRawUnsafe(
      `INSERT INTO "CheckoutAttempt" (
         "id", "idempotencyKey", "providerCode", "providerPaymentId",
         "amountCents", "currencyCode", "status", "attempts", "requestData",
         "store", "cart", "paymentSession", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, 'usd', 'pending', 0, $6::jsonb, $7, $8, $9, NOW(), NOW())
       ON CONFLICT ("idempotencyKey") DO UPDATE
         SET "requestData" = CASE
           WHEN "CheckoutAttempt"."status" IN ('pending', 'settled_pending_finalize') AND "CheckoutAttempt"."order" IS NULL
             THEN EXCLUDED."requestData"
           ELSE "CheckoutAttempt"."requestData"
         END
       RETURNING "id", "status"::text AS "status", "order" AS "orderId"`,
      (0, import_node_crypto5.randomUUID)(),
      idempotencyKey,
      session.paymentProvider.code,
      providerPaymentId,
      Number(session.amountCents || Math.round(Number(session.amount || 0) * 100)),
      JSON.stringify(data),
      cart.store.id,
      cart.id,
      session.id
    );
    if (!attempts[0]) throw new Error("Unable to establish checkout attempt");
    return attempts[0];
  });
}
async function markCheckoutAttemptSettled(context, attemptId, settled) {
  return context.transaction(async (transactionContext) => {
    const rows = await transactionContext.prisma.$queryRawUnsafe(
      `UPDATE "CheckoutAttempt"
       SET "status" = 'settled_pending_finalize', "amountCents" = $2, "currencyCode" = $3,
           "settledAt" = COALESCE("settledAt", NOW())
       WHERE "id" = $1 AND "order" IS NULL
         AND "status" IN ('pending', 'settled_pending_finalize')
       RETURNING "id", "status", "order" AS "orderId"`,
      attemptId,
      settled.amountCents,
      settled.currency
    );
    if (rows[0]) return rows[0];
    const existing = await transactionContext.prisma.checkoutAttempt.findUnique({ where: { id: attemptId }, select: { id: true, status: true, orderId: true } });
    if (existing?.status === "finalized" && existing.orderId) return existing;
    throw new Error(`Checkout attempt is already owned by another reconciliation path: ${existing?.status || "missing"}`);
  });
}
async function reserveOrderDisplayId(transactionContext) {
  await transactionContext.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-order-display-id'), hashtext('allocation'))");
  const [orderMax, sessionMax] = await Promise.all([
    transactionContext.prisma.order.aggregate({ _max: { displayId: true } }),
    transactionContext.prisma.paymentSession.aggregate({ _max: { reservedOrderDisplayId: true } })
  ]);
  return Math.max(orderMax._max.displayId || 0, sessionMax._max.reservedOrderDisplayId || 0) + 1;
}
function assertCartOwnership(cart, data, sessionUserId) {
  const cartOwnerId = cart.customer?.id || null;
  if (sessionUserId) {
    if (cartOwnerId !== sessionUserId) throw new Error("You do not have access to this cart");
    return;
  }
  if (!data.sessionId?.trim() || cartOwnerId || cart.sessionId !== data.sessionId.trim()) {
    throw new Error("You do not have access to this cart");
  }
}
function assertFulfillmentInput(data) {
  if (!/^\S+@\S+\.\S+$/.test(data.email.trim()) || data.email.length > 320) throw new Error("A valid checkout email is required");
  for (const [label, value] of [["first name", data.deliveryAddress.firstName], ["last name", data.deliveryAddress.lastName], ["phone", data.deliveryAddress.phone]]) {
    if (value.trim().length < 2 || value.length > 200) throw new Error(`A valid delivery ${label} is required`);
  }
  if (data.fulfillmentMethod === "delivery") {
    for (const [label, value] of [["address", data.deliveryAddress.address1], ["city", data.deliveryAddress.city], ["province", data.deliveryAddress.province], ["postal code", data.deliveryAddress.postalCode]]) {
      if (value.trim().length < 2 || value.length > 200) throw new Error(`A valid delivery ${label} is required`);
    }
  }
  if (data.fulfillmentMethod === "delivery" && !data.deliverySlotId) {
    throw new Error("Delivery orders require a delivery slot");
  }
  if (data.fulfillmentMethod === "pickup" && !data.pickupSlotId) {
    throw new Error("Pickup orders require a pickup slot");
  }
}
async function loadCart(sudoContext, cartId) {
  return sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      store { id }
      sessionId
      customer { id }
      items {
        id
        quantity
        subtotal
        substitutionPreference
        product {
          id
          title
          handle
          sku
          price
          priceCents
          department
          imageUrl
          status
          store { id }
          inventoryLots {
            id
            expirationDate
            quantityRemaining
            store { id }
          }
        }
      }
    `
  });
}
async function compensateFailedCheckout({
  context,
  provider,
  cause,
  attemptId,
  finalizationLease,
  compensationLease,
  forceFullRefund
}) {
  const causeMessage = cause instanceof Error ? cause.message : "Checkout finalization failed";
  const claim = compensationLease || await context.transaction(async (transactionContext) => {
    const claimed = await claimCheckoutAttempt(transactionContext.prisma, attemptId, "compensate", {
      expected: finalizationLease
    });
    if (!claimed) return null;
    await enqueueGroceryOutboxEvent(transactionContext.prisma, {
      storeId: claimed.storeId,
      eventKey: `checkout.compensation:${claimed.paymentSessionId}:requested`,
      eventType: "checkout.compensation.requested",
      aggregateType: "CheckoutAttempt",
      aggregateId: claimed.id,
      occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
      payload: { paymentSessionId: claimed.paymentSessionId, cartId: claimed.cartId, providerPaymentId: claimed.providerPaymentId, amountCents: claimed.amountCents }
    });
    return claimed;
  });
  if (!claim) return { claimed: false, status: "not_claimed" };
  const eventKey = `checkout.compensation:${claim.paymentSessionId}`;
  const paymentSessionBeforeRefund = await context.prisma.paymentSession.findUnique({
    where: { id: claim.paymentSessionId },
    select: { data: true }
  });
  const fullRefund = forceFullRefund === true || paymentSessionBeforeRefund?.data?.compensationFullRefund === true;
  let compensation;
  try {
    const result = await refundPayment({
      provider,
      paymentId: claim.providerPaymentId,
      amount: fullRefund ? void 0 : claim.amountCents,
      idempotencyKey: eventKey
    });
    compensation = {
      status: result.status === "succeeded" ? "refunded" : "refund_required",
      providerRefundId: result.data?.id,
      refundedAmountCents: Number.isInteger(Number(result.amount)) ? Number(result.amount) : void 0
    };
  } catch (refundError) {
    compensation = { status: "refund_required", error: refundError instanceof Error ? refundError.message : "Compensation refund failed" };
  }
  const recorded = await context.transaction(async (transactionContext) => {
    const terminalStatus = compensation.status === "refunded" ? "compensated" : "compensation_required";
    const applied = await completeCompensation(transactionContext.prisma, claim, terminalStatus, compensation.error || causeMessage);
    if (!applied) return false;
    const session = await transactionContext.prisma.paymentSession.findUnique({ where: { id: claim.paymentSessionId }, select: { data: true } });
    const { clientSecret: _discardedClientSecret, ...sessionEvidence } = session?.data || {};
    const data = {
      ...sessionEvidence,
      compensationStatus: compensation.status,
      compensationProviderRefundId: compensation.providerRefundId || null,
      compensationError: compensation.error || causeMessage,
      compensationAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await transactionContext.prisma.paymentSession.update({ where: { id: claim.paymentSessionId }, data: { data } });
    await enqueueGroceryOutboxEvent(transactionContext.prisma, {
      storeId: claim.storeId,
      eventKey: `${eventKey}:recorded:${compensation.status}:${compensation.providerRefundId || "none"}:${claim.fencingToken}`,
      eventType: "checkout.compensation.recorded",
      aggregateType: "PaymentSession",
      aggregateId: claim.paymentSessionId,
      occurredAt: (/* @__PURE__ */ new Date()).toISOString(),
      payload: { cartId: claim.cartId, providerPaymentId: claim.providerPaymentId, amountCents: fullRefund ? null : claim.amountCents, fullRefund, compensation }
    });
    return true;
  });
  return { claimed: recorded, status: recorded ? compensation.status === "refunded" ? "compensated" : "compensation_required" : "fenced" };
}
async function loadPaymentSession(sudoContext, paymentSessionId) {
  return sudoContext.query.PaymentSession.findOne({
    where: { id: paymentSessionId },
    query: `
      id
      amount
      amountCents
      isSelected
      isInitiated
      reservedOrderDisplayId
      data
      paymentProvider { id code isInstalled }
      cart { id }
    `
  });
}
async function lockCheckoutRows(transactionContext, data, finalizationLease) {
  const tx = transactionContext.prisma;
  if (finalizationLease) await assertFinalizationLease(tx, finalizationLease);
  await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', data.cartId);
  await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentSession" WHERE "id" = $1 FOR UPDATE', data.paymentSessionId);
  await tx.$queryRawUnsafe('SELECT "id" FROM "CartItem" WHERE "cart" = $1 ORDER BY "id" FOR UPDATE', data.cartId);
  if (data.deliverySlotId) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id" = $1 FOR UPDATE', data.deliverySlotId);
  }
  if (data.pickupSlotId) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', data.pickupSlotId);
  }
  if (data.couponCode?.trim()) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Coupon" WHERE "code" = $1 FOR UPDATE', data.couponCode.trim().toUpperCase());
  }
  const productRows = await tx.cartItem.findMany({
    where: { cartId: data.cartId },
    select: { productId: true }
  });
  const productIds = Array.from(new Set(productRows.flatMap((row) => row.productId ? [row.productId] : []))).sort();
  for (const productId of productIds) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "InventoryLot" WHERE "product" = $1 ORDER BY "expirationDate", "id" FOR UPDATE',
      productId
    );
  }
}
function fulfillmentWindow(startTime) {
  const startHour = Number.parseInt(startTime.slice(0, 2), 10);
  if (!Number.isFinite(startHour)) throw new Error("Selected fulfillment slot has an invalid start time");
  if (startHour < 10) return "time_8_10";
  if (startHour < 12) return "time_10_12";
  if (startHour < 14) return "time_12_14";
  if (startHour < 16) return "time_14_16";
  if (startHour < 18) return "time_16_18";
  return "time_18_20";
}
function calculateTotals(cart, deliverySlot, fulfillmentMethod, taxRateBps, discount = 0) {
  const subtotalCents = cart.items.reduce(
    (sum, item) => sum + Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity,
    0
  );
  const discountCents = Math.round(discount * 100);
  const taxCents = calculateTaxCents(Math.max(0, subtotalCents - discountCents), taxRateBps);
  const deliveryFeeCents = fulfillmentMethod === "delivery" ? Number(deliverySlot?.deliveryFee || 0) : 0;
  const totalCents = Math.max(0, subtotalCents + taxCents + deliveryFeeCents - discountCents);
  return {
    subtotal: subtotalCents / 100,
    subtotalCents,
    taxAmount: taxCents / 100,
    taxCents,
    deliveryFee: deliveryFeeCents / 100,
    deliveryFeeCents,
    discount,
    discountCents,
    orderTotal: totalCents / 100,
    totalCents
  };
}
async function commitGroceryOrder(data, context, settledPayment, attemptId, sessionUserIdOverride, finalizationLease) {
  const sessionUserId = sessionUserIdOverride === void 0 ? context.session?.itemId || null : sessionUserIdOverride;
  const fulfillmentMethod = data.fulfillmentMethod === "pickup" ? "pickup" : "delivery";
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await lockCheckoutRows(transactionContext, data, finalizationLease);
    if (finalizationLease) await refreshFinalizationSettlement(tx, finalizationLease, settledPayment.amountCents, settledPayment.currency);
    const sudoContext = transactionContext.sudo();
    const cart = await loadCart(sudoContext, data.cartId);
    if (!cart) throw new Error("Cart not found");
    const storeId = cart.store?.id;
    if (!storeId) throw new Error("Cart is missing an active store");
    assertCartOwnership(cart, data, sessionUserId);
    if (!cart.items?.length) throw new Error("Cart is empty or has already been submitted");
    const deliverySlot = fulfillmentMethod === "delivery" ? await sudoContext.query.DeliverySlot.findOne({
      where: { id: data.deliverySlotId },
      query: "id store { id } date startTime endTime capacity currentBookings isActive deliveryFee"
    }) : null;
    const pickupSlot = fulfillmentMethod === "pickup" ? await sudoContext.query.PickupSlot.findOne({
      where: { id: data.pickupSlotId },
      query: "id store { id } date startTime endTime maxOrders currentOrders isActive isAvailable"
    }) : null;
    if (fulfillmentMethod === "delivery" && (!deliverySlot || deliverySlot.store?.id !== storeId)) throw new Error("Selected delivery slot was not found in active store");
    if (fulfillmentMethod === "pickup" && (!pickupSlot || pickupSlot.store?.id !== storeId)) throw new Error("Selected pickup slot was not found in active store");
    const [store, storeSettings] = await Promise.all([
      tx.store.findUnique({ where: { id: storeId }, select: { timezone: true, isActive: true } }),
      tx.storeSettings.findFirst({ where: { storeId, isActive: true }, select: { hours: true } })
    ]);
    const selectedLiveSlot = deliverySlot || pickupSlot;
    if (!store?.isActive || !storeSettings || !selectedLiveSlot || !isLiveFulfillmentSlot(selectedLiveSlot, store.timezone)) {
      throw new Error("Selected fulfillment slot is no longer a live Store-local window");
    }
    const windowDecision = evaluateFulfillmentWindow({
      hours: storeSettings.hours,
      timeZone: store.timezone,
      date: selectedLiveSlot.date,
      startTime: selectedLiveSlot.startTime,
      endTime: selectedLiveSlot.endTime,
      applyCutoff: false
    });
    if (!windowDecision.allowed) {
      throw new Error("Selected fulfillment slot is outside current Store hours, blackout, or rolling horizon policy");
    }
    if (deliverySlot && (!deliverySlot.isActive || deliverySlot.currentBookings >= deliverySlot.capacity)) {
      throw new Error("Selected delivery slot is fully booked");
    }
    if (pickupSlot && (!pickupSlot.isActive || !pickupSlot.isAvailable || pickupSlot.currentOrders >= pickupSlot.maxOrders)) {
      throw new Error("Selected pickup slot is fully booked");
    }
    const inventoryCutoff = /* @__PURE__ */ new Date();
    for (const item of cart.items) {
      const product = item.product;
      if (!product || product.store?.id !== storeId || product.status !== "published") throw new Error("Cart contains an unavailable product");
      assertSellableQuantity(product, storeId, item.quantity, inventoryCutoff);
    }
    let coupon = null;
    let discount = 0;
    if (data.couponCode?.trim()) {
      coupon = await sudoContext.query.Coupon.findOne({
        where: { code: data.couponCode.trim().toUpperCase() },
        query: "id code discountType discountValue discountValueCents minPurchase minPurchaseCents validFrom validTo isActive maxUses currentUses productCategories excludedProducts store { id }"
      });
      if (!coupon || coupon.store?.id !== storeId) throw new Error("Coupon is not available for this store");
      discount = calculateCouponDiscount(coupon, cart.items);
    }
    const taxRateBps = await getStoreTaxRateBps(transactionContext, storeId);
    const totals = calculateTotals(cart, deliverySlot, fulfillmentMethod, taxRateBps, discount);
    if (Math.round(Number(data.expectedTotal) * 100) !== totals.totalCents) {
      throw new Error("Order total changed before checkout. Please review your cart and fulfillment slot.");
    }
    if (Math.round(Number(data.deliveryFee) * 100) !== totals.deliveryFeeCents) {
      throw new Error("Delivery fee changed before checkout. Please review your fulfillment slot.");
    }
    const selectedSession = await loadPaymentSession(sudoContext, data.paymentSessionId);
    if (!selectedSession || selectedSession.cart?.id !== cart.id || !selectedSession.isInitiated) {
      throw new Error("Selected payment session not found for this cart");
    }
    if ((selectedSession.data?.fulfillmentMethod || fulfillmentMethod) !== fulfillmentMethod) {
      throw new Error("Payment session fulfillment method does not match checkout");
    }
    if (fulfillmentMethod === "delivery" && selectedSession.data?.deliverySlotId !== data.deliverySlotId) {
      throw new Error("Payment session delivery slot does not match checkout delivery slot");
    }
    if (fulfillmentMethod === "pickup" && selectedSession.data?.pickupSlotId !== data.pickupSlotId) {
      throw new Error("Payment session pickup slot does not match checkout pickup slot");
    }
    if ((selectedSession.data?.couponCode || null) !== (data.couponCode?.trim().toUpperCase() || null)) {
      throw new Error("Payment session coupon does not match checkout");
    }
    if (Number(selectedSession.amountCents) !== totals.totalCents) {
      throw new Error("Payment session amount does not match order total");
    }
    const paymentProvider = selectedSession.paymentProvider;
    const providerPaymentId = selectedSession.data?.paymentIntentId || data.paymentIntentId;
    if (!paymentProvider?.isInstalled || paymentProvider.code !== settledPayment.providerCode) {
      throw new Error("Payment provider does not match the settled payment");
    }
    if (!providerPaymentId || providerPaymentId !== settledPayment.providerPaymentId) {
      throw new Error("Payment session provider id does not match the settled payment");
    }
    if (!["succeeded", "captured"].includes(settledPayment.status)) {
      throw new Error(`Payment is not settled: ${settledPayment.status}`);
    }
    const address = await sudoContext.db.Address.createOne({
      data: {
        firstName: data.deliveryAddress.firstName,
        lastName: data.deliveryAddress.lastName,
        address1: fulfillmentMethod === "pickup" ? "Curbside pickup" : data.deliveryAddress.address1,
        city: fulfillmentMethod === "pickup" ? "Store pickup" : data.deliveryAddress.city,
        province: fulfillmentMethod === "pickup" ? "N/A" : data.deliveryAddress.province,
        postalCode: fulfillmentMethod === "pickup" ? "N/A" : data.deliveryAddress.postalCode,
        phone: data.deliveryAddress.phone,
        user: sessionUserId ? { connect: { id: sessionUserId } } : void 0
      }
    });
    const selectedSlot = deliverySlot || pickupSlot;
    if (!selectedSlot) throw new Error("Selected fulfillment slot was not found in active store");
    const lineItemsSnapshot = cart.items.map((item) => ({
      id: item.id,
      title: item.product?.title || "Product",
      quantity: item.quantity,
      unitPrice: Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) / 100,
      unitPriceCents: Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)),
      thumbnail: item.product?.imageUrl || null,
      metadata: { substitutionPreference: item.substitutionPreference || null },
      product: item.product?.id ? { id: item.product.id, handle: item.product.handle || null } : null
    }));
    const displayId = selectedSession.reservedOrderDisplayId || await reserveOrderDisplayId(transactionContext);
    const order = await sudoContext.db.Order.createOne({
      data: {
        store: { connect: { id: storeId } },
        displayId,
        email: data.email,
        status: "pending",
        currencyCode: "USD",
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        deliveryFeeCents: totals.deliveryFeeCents,
        discountCents: totals.discountCents,
        totalCents: totals.totalCents,
        taxRate: taxRateBps / 1e4,
        deliveryDate: new Date(selectedSlot.date).toISOString(),
        deliveryTimeWindow: fulfillmentWindow(selectedSlot.startTime),
        substitutionPreference: data.substitutionPreference,
        deliveryInstructions: data.deliveryInstructions || void 0,
        metadata: {
          fulfillmentMethod,
          guestSessionId: sessionUserId ? null : data.sessionId?.trim() || null,
          deliverySlotId: data.deliverySlotId || null,
          pickupSlotId: data.pickupSlotId || null,
          ...totals,
          coupon: coupon ? { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount: discount } : null,
          lineItemsSnapshot,
          selectedFulfillmentSlot: selectedSlot ? { date: selectedSlot.date, startTime: selectedSlot.startTime, endTime: selectedSlot.endTime } : null
        },
        user: sessionUserId ? { connect: { id: sessionUserId } } : void 0,
        deliverySlot: data.deliverySlotId ? { connect: { id: data.deliverySlotId } } : void 0,
        pickupSlot: data.pickupSlotId ? { connect: { id: data.pickupSlotId } } : void 0,
        shippingAddress: { connect: { id: address.id } }
      }
    });
    for (const item of cart.items) {
      const product = item.product;
      const plannedAllocations = planSellableLotAllocation(
        product.inventoryLots || [],
        storeId,
        item.quantity,
        product.title || "Product",
        inventoryCutoff
      );
      const inventoryAllocations = [];
      for (const { lot, quantity } of plannedAllocations) {
        await sudoContext.db.InventoryLot.updateOne({
          where: { id: lot.id },
          data: { quantityRemaining: Number(lot.quantityRemaining || 0) - quantity }
        });
        inventoryAllocations.push({ lotId: lot.id, quantity });
      }
      const createdLineItem = await sudoContext.db.OrderLineItem.createOne({
        data: {
          title: product.title || "Product",
          sku: product.sku || void 0,
          quantity: item.quantity,
          unitPrice: Number(product.priceCents || Math.round(Number(product.price || 0) * 100)) / 100,
          unitPriceCents: Number(product.priceCents || Math.round(Number(product.price || 0) * 100)),
          thumbnail: product.imageUrl || void 0,
          order: { connect: { id: order.id } },
          product: { connect: { id: product.id } },
          inventoryLot: inventoryAllocations[0] ? { connect: { id: inventoryAllocations[0].lotId } } : void 0,
          metadata: {
            cartItemId: item.id,
            substitutionPreference: item.substitutionPreference || null,
            inventoryAllocations
          }
        }
      });
      for (const allocation of inventoryAllocations) {
        await sudoContext.db.OrderLineInventoryAllocation.createOne({
          data: {
            lineItem: { connect: { id: createdLineItem.id } },
            inventoryLot: { connect: { id: allocation.lotId } },
            store: { connect: { id: storeId } },
            quantity: allocation.quantity,
            provenance: { source: "checkout-fefo", cartItemId: item.id }
          }
        });
      }
      const nextSellableQuantity = Math.max(0, deriveSellableQuantity(product, storeId) - item.quantity);
      await sudoContext.db.Product.updateOne({
        where: { id: product.id },
        // Product stock fields remain an operator/reporting cache only. Heal
        // them from the lot authority after each FEFO allocation.
        data: { stockQuantity: nextSellableQuantity, inStock: nextSellableQuantity > 0 }
      });
    }
    if (deliverySlot && data.deliverySlotId) {
      const nextBookings = deliverySlot.currentBookings + 1;
      await sudoContext.db.DeliverySlot.updateOne({
        where: { id: data.deliverySlotId },
        data: { currentBookings: nextBookings }
      });
    }
    if (pickupSlot && data.pickupSlotId) {
      const nextOrders = pickupSlot.currentOrders + 1;
      await sudoContext.db.PickupSlot.updateOne({
        where: { id: data.pickupSlotId },
        data: { currentOrders: nextOrders, isAvailable: pickupSlot.isActive && nextOrders < pickupSlot.maxOrders }
      });
    }
    if (coupon) {
      await tx.coupon.update({ where: { id: coupon.id }, data: { currentUses: { increment: 1 } } });
      if (sessionUserId) {
        const clippedRows = await sudoContext.query.UserCoupon.findMany({ where: { user: { id: { equals: sessionUserId } }, coupon: { id: { equals: coupon.id } }, used: { equals: false } }, take: 1, query: "id" });
        const clipped = clippedRows[0];
        if (clipped) await sudoContext.db.UserCoupon.updateOne({ where: { id: clipped.id }, data: { used: true, usedAt: (/* @__PURE__ */ new Date()).toISOString() } });
      }
    }
    const { clientSecret: _discardedClientSecret, ...paymentSessionEvidence } = selectedSession.data || {};
    await sudoContext.db.Payment.createOne({
      data: {
        store: { connect: { id: storeId } },
        amount: totals.orderTotal.toFixed(2),
        amountCents: totals.totalCents,
        deliveryTipCents: 0,
        status: "succeeded",
        paymentMethod: "credit_card",
        providerPaymentId,
        providerData: {
          ...paymentSessionEvidence,
          status: settledPayment.status,
          providerCode: paymentProvider.code
        },
        processedAt: (/* @__PURE__ */ new Date()).toISOString(),
        order: { connect: { id: order.id } },
        paymentProvider: { connect: { id: paymentProvider.id } },
        processedBy: sessionUserId ? { connect: { id: sessionUserId } } : void 0
      }
    });
    await sudoContext.db.PaymentSession.updateOne({
      where: { id: selectedSession.id },
      data: { data: { ...paymentSessionEvidence, status: "completed" } }
    });
    for (const item of cart.items) {
      await sudoContext.db.CartItem.deleteOne({ where: { id: item.id } });
    }
    await transactionContext.prisma.cart.update({
      where: { id: cart.id },
      data: {
        customerId: null,
        sessionId: `checked-out:${cart.id}:${order.id}`,
        itemCount: 0,
        subtotal: 0,
        subtotalCents: 0
      }
    });
    if (finalizationLease) {
      await finalizeCheckoutAttempt(transactionContext.prisma, finalizationLease, order.id);
    } else if (attemptId) {
      throw new Error("Checkout attempt finalization requires an exclusive reconciliation lease");
    }
    return {
      orderId: order.id,
      displayId: order.displayId,
      guestOrderToken: !sessionUserId && data.sessionId?.trim() ? createGuestOrderToken(order.id, data.sessionId.trim()) : null
    };
  }, {
    isolationLevel: "ReadCommitted"
  }));
}
async function submitGroceryOrder(_root, { data }, context) {
  assertFulfillmentInput(data);
  const sessionUserId = context.session?.itemId || null;
  data.checkoutOwnerId = sessionUserId;
  const sudoContext = context.sudo();
  const [cart, selectedSession] = await Promise.all([
    loadCart(sudoContext, data.cartId),
    loadPaymentSession(sudoContext, data.paymentSessionId)
  ]);
  if (!cart) throw new Error("Cart not found");
  if (!selectedSession || selectedSession.cart?.id !== cart.id) {
    throw new Error("Selected payment session not found for this cart");
  }
  const existingAttempt = await context.prisma.checkoutAttempt.findUnique({
    where: { idempotencyKey: `checkout:${selectedSession.id}` },
    select: { status: true, orderId: true, requestData: true }
  });
  if (existingAttempt?.status === "finalized" && existingAttempt.orderId) {
    const originalRequest = existingAttempt.requestData || {};
    const ownsReplay = sessionUserId ? originalRequest.checkoutOwnerId === sessionUserId : Boolean(data.sessionId?.trim() && originalRequest.sessionId === data.sessionId.trim());
    if (!ownsReplay) throw new Error("You do not have access to this checkout attempt");
    return {
      success: true,
      orderId: existingAttempt.orderId,
      guestOrderToken: !sessionUserId && data.sessionId?.trim() ? createGuestOrderToken(existingAttempt.orderId, data.sessionId.trim()) : null
    };
  }
  assertCartOwnership(cart, data, sessionUserId);
  const paymentProvider = selectedSession.paymentProvider;
  if (!paymentProvider?.isInstalled) throw new Error("Payment provider missing from payment session");
  const providerPaymentId = selectedSession.data?.paymentIntentId || data.paymentIntentId;
  if (!providerPaymentId) throw new Error("Payment session is missing provider payment id");
  const attempt = await ensureCheckoutAttempt(context, data, cart, selectedSession, providerPaymentId);
  if (attempt.status === "finalized" && attempt.orderId) return { success: true, orderId: attempt.orderId, guestOrderToken: !sessionUserId && data.sessionId?.trim() ? createGuestOrderToken(attempt.orderId, data.sessionId.trim()) : null };
  if (["compensation_required", "compensation_processing", "compensated", "failed"].includes(attempt.status)) {
    throw new Error(`Checkout attempt cannot be finalized from ${attempt.status}`);
  }
  const paymentStatus = await getPaymentStatus({
    provider: paymentProvider,
    paymentId: providerPaymentId
  });
  const normalizedStatus = paymentStatus?.status || "unknown";
  if (!["succeeded", "captured"].includes(normalizedStatus)) {
    throw new Error(`Payment is not settled: ${normalizedStatus}`);
  }
  const expectedAmountCents = Number(selectedSession.amountCents || Math.round(Number(selectedSession.amount || 0) * 100));
  const settledAmountCents = Number(paymentStatus?.amount ?? 0);
  const settledCurrency = String(paymentStatus?.currency || selectedSession.data?.currency || "usd").toLowerCase();
  if (!Number.isInteger(settledAmountCents) || settledAmountCents !== expectedAmountCents || settledCurrency !== "usd") {
    throw new Error("Settled payment amount or currency does not match the checkout session");
  }
  const settledPayment = { providerCode: paymentProvider.code, providerPaymentId, status: normalizedStatus, amountCents: settledAmountCents, currency: settledCurrency };
  if (process.env.GROCERY_TEST_CRASH_AFTER_SETTLEMENT === "true" && process.env.NODE_ENV !== "production" && process.env.DATABASE_URL?.includes("_ephemeral_")) process.exitCode = 137, process.exit();
  await markCheckoutAttemptSettled(context, attempt.id, settledPayment);
  const finalizationLease = await context.transaction(async (transactionContext) => claimCheckoutAttempt(transactionContext.prisma, attempt.id, "finalize"));
  if (!finalizationLease) throw new Error("Checkout attempt is already being finalized by another worker");
  let committed;
  try {
    committed = await commitGroceryOrder(data, context, settledPayment, attempt.id, sessionUserId, finalizationLease);
  } catch (error) {
    await compensateFailedCheckout({ context, attemptId: attempt.id, provider: paymentProvider, cause: error, finalizationLease });
    throw new Error("Checkout could not be finalized; payment compensation was recorded");
  }
  return {
    success: true,
    ...committed,
    message: "Order submitted successfully"
  };
}

// features/keystone/mutations/initiatePaymentSession.ts
function fulfillmentWindow2(startTime) {
  const hour = Number.parseInt(startTime.slice(0, 2), 10);
  if (hour < 10) return "time_8_10";
  if (hour < 12) return "time_10_12";
  if (hour < 14) return "time_12_14";
  if (hour < 16) return "time_14_16";
  if (hour < 18) return "time_16_18";
  return "time_18_20";
}
async function initiatePaymentSession(root, { cartId, paymentProviderId, deliverySlotId, pickupSlotId, sessionId, couponCode, recovery }, context) {
  assertPublicPaymentProvider(paymentProviderId);
  const sudoContext = context.sudo();
  if (Boolean(deliverySlotId) === Boolean(pickupSlotId)) {
    throw new Error("Choose exactly one live delivery or pickup slot");
  }
  const requestedFulfillmentMethod = pickupSlotId ? "pickup" : "delivery";
  if (!/^\S+@\S+\.\S+$/.test(recovery?.email?.trim() || "") || recovery.email.length > 320) throw new Error("Checkout recovery requires a valid email");
  for (const value of [recovery.deliveryAddress?.firstName, recovery.deliveryAddress?.lastName, recovery.deliveryAddress?.phone]) {
    if (!value?.trim() || value.length > 200) throw new Error("Checkout recovery requires customer contact details");
  }
  if (requestedFulfillmentMethod === "delivery") {
    for (const value of [recovery.deliveryAddress.address1, recovery.deliveryAddress.city, recovery.deliveryAddress.province, recovery.deliveryAddress.postalCode]) {
      if (!value?.trim() || value.length > 200) throw new Error("Checkout recovery requires a valid delivery address");
    }
  }
  if (!["call_me", "best_match", "refund"].includes(recovery.substitutionPreference)) {
    throw new Error("Checkout recovery substitution preference is invalid");
  }
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      store { id timezone isActive }
      sessionId
      expiresAt
      customer { id }
      subtotal
      subtotalCents
      items { quantity product { id title price priceCents department status store { id } inventoryLots { id expirationDate quantityRemaining store { id } } } }
      paymentSessions {
        id
        isSelected
        isInitiated
        amount
        idempotencyKey
        paymentProvider {
          id
          code
        }
        data
      }
    `
  });
  if (!cart) {
    throw new Error("Cart not found");
  }
  if (context.session?.itemId) {
    if (cart.customer?.id !== context.session.itemId) {
      throw new Error("You do not have access to this cart");
    }
  } else if (!sessionId?.trim() || cart.customer?.id || cart.sessionId !== sessionId.trim()) {
    throw new Error("You do not have access to this cart");
  }
  if (!cart.store?.isActive) throw new Error("Cart store is unavailable");
  if (!context.session?.itemId && cart.expiresAt && new Date(cart.expiresAt).getTime() <= Date.now()) {
    throw new Error("Guest cart session has expired; start a new cart");
  }
  if (!cart.items?.length) throw new Error("Cart is empty");
  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: paymentProviderId },
    query: "id code isInstalled"
  });
  if (!provider || !provider.isInstalled) {
    throw new Error(`Payment provider ${paymentProviderId} not found or not installed`);
  }
  const deliverySlot = deliverySlotId ? await sudoContext.query.DeliverySlot.findOne({
    where: { id: deliverySlotId },
    query: "id date startTime endTime deliveryFee capacity currentBookings isActive store { id }"
  }) : null;
  const pickupSlot = pickupSlotId ? await sudoContext.query.PickupSlot.findOne({
    where: { id: pickupSlotId },
    query: "id date startTime endTime maxOrders currentOrders isActive isAvailable store { id }"
  }) : null;
  if (deliverySlotId && (!deliverySlot || deliverySlot.store?.id !== cart.store?.id)) {
    throw new Error("Selected delivery slot was not found in the active store");
  }
  if (pickupSlotId && (!pickupSlot || pickupSlot.store?.id !== cart.store?.id)) {
    throw new Error("Selected pickup slot was not found in the active store");
  }
  const selectedSlot = deliverySlot || pickupSlot;
  if (!selectedSlot || !isLiveFulfillmentSlot(selectedSlot, cart.store.timezone)) {
    throw new Error("Selected fulfillment slot is no longer a live Store-local window");
  }
  const storeSettings = await context.prisma.storeSettings.findFirst({
    where: { storeId: cart.store.id, isActive: true },
    select: { hours: true }
  });
  const windowDecision = evaluateFulfillmentWindow({
    hours: storeSettings?.hours,
    timeZone: cart.store.timezone,
    date: selectedSlot.date,
    startTime: selectedSlot.startTime,
    endTime: selectedSlot.endTime
  });
  if (!storeSettings || !windowDecision.allowed) {
    throw new Error("Selected fulfillment slot is outside current Store hours, blackout, horizon, or cutoff policy");
  }
  if (deliverySlot && !deliverySlot.isActive) {
    throw new Error("Selected delivery slot is no longer available");
  }
  if (pickupSlot && (!pickupSlot.isActive || !pickupSlot.isAvailable)) {
    throw new Error("Selected pickup slot is no longer available");
  }
  if (deliverySlot && deliverySlot.capacity - deliverySlot.currentBookings <= 0) {
    throw new Error("Selected delivery slot is fully booked");
  }
  if (pickupSlot && pickupSlot.maxOrders - pickupSlot.currentOrders <= 0) {
    throw new Error("Selected pickup slot is fully booked");
  }
  const fulfillmentMethod = pickupSlot ? "pickup" : "delivery";
  const now = /* @__PURE__ */ new Date();
  let subtotalCents = 0;
  for (const item of cart.items) {
    const product = item.product;
    if (!product || product.store?.id !== cart.store.id || product.status !== "published") {
      throw new Error("Cart contains a product that is no longer available");
    }
    assertSellableQuantity(product, cart.store.id, item.quantity, now);
    subtotalCents += Number(product.priceCents ?? Math.round(Number(product.price || 0) * 100)) * item.quantity;
  }
  const subtotalDollars = subtotalCents / 100;
  await sudoContext.db.Cart.updateOne({ where: { id: cart.id }, data: { subtotal: subtotalDollars, subtotalCents, itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0) } });
  const taxRateBps = await getStoreTaxRateBps(context, cart.store?.id);
  const deliveryFeeDollars = Number(((deliverySlot?.deliveryFee || 0) / 100).toFixed(2));
  let discountDollars = 0;
  let couponSnapshot = null;
  if (couponCode?.trim()) {
    const coupon = await sudoContext.query.Coupon.findOne({ where: { code: couponCode.trim().toUpperCase() }, query: "id code discountType discountValue discountValueCents minPurchase minPurchaseCents validFrom validTo isActive maxUses currentUses productCategories excludedProducts store { id }" });
    if (!coupon || coupon.store?.id !== cart.store?.id) throw new Error("Coupon is not available for this store");
    discountDollars = calculateCouponDiscount(coupon, cart.items || []);
    couponSnapshot = { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount: discountDollars };
  }
  const discountCents = Math.round(discountDollars * 100);
  const taxCents = calculateTaxCents(Math.max(0, subtotalCents - discountCents), taxRateBps);
  const taxDollars = taxCents / 100;
  const amountInCents = Math.max(0, subtotalCents + taxCents + Math.round(deliveryFeeDollars * 100) - discountCents);
  const totalDollars = amountInCents / 100;
  const slotKey = pickupSlotId ? `pickup:${pickupSlotId}` : `delivery:${deliverySlotId || "no-slot"}`;
  const couponIdentity = couponSnapshot ? `${couponSnapshot.id}:${couponSnapshot.code}` : "none";
  const idempotencyKey = `${cart.id}:${provider.code}:${slotKey}:coupon:${couponIdentity}:amount:${amountInCents}`;
  const sessionSelection = `
    id
    data
    amount
    amountCents
    reservedOrderDisplayId
    idempotencyKey
    isInitiated
    isSelected
    paymentProvider { id code }
  `;
  const claimData = {
    subtotal: subtotalDollars,
    tax: taxDollars,
    deliveryFee: deliveryFeeDollars,
    total: totalDollars,
    fulfillmentMethod,
    taxRateBps,
    fulfillmentSlot: {
      id: (pickupSlot || deliverySlot)?.id,
      date: (pickupSlot || deliverySlot)?.date,
      startTime: (pickupSlot || deliverySlot)?.startTime,
      endTime: (pickupSlot || deliverySlot)?.endTime
    },
    deliverySlotId: deliverySlotId || null,
    pickupSlotId: pickupSlotId || null,
    amountInCents,
    couponCode: couponCode?.trim().toUpperCase() || null,
    coupon: couponSnapshot,
    discount: discountDollars,
    currency: "usd"
  };
  const checkoutRequest = (paymentSessionId, providerPaymentId) => ({
    cartId: cart.id,
    paymentSessionId,
    paymentIntentId: providerPaymentId,
    sessionId: context.session?.itemId ? void 0 : sessionId?.trim(),
    couponCode: couponCode?.trim().toUpperCase() || void 0,
    email: recovery.email.trim(),
    deliveryAddress: recovery.deliveryAddress,
    deliveryDate: new Date(selectedSlot.date).toISOString(),
    deliveryTimeWindow: fulfillmentWindow2(selectedSlot.startTime),
    fulfillmentMethod,
    deliverySlotId: deliverySlotId || void 0,
    pickupSlotId: pickupSlotId || void 0,
    deliveryFee: deliveryFeeDollars,
    expectedTotal: totalDollars,
    substitutionPreference: recovery.substitutionPreference,
    deliveryInstructions: recovery.deliveryInstructions?.trim() || void 0,
    checkoutOwnerId: context.session?.itemId || null
  });
  let claim;
  try {
    claim = await context.transaction(async (transactionContext) => {
      await transactionContext.prisma.$queryRaw`
      WITH payment_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))
      )
      SELECT true AS locked FROM payment_lock
    `;
      await transactionContext.prisma.$queryRaw`SELECT "id" FROM "PaymentSession" WHERE "idempotencyKey" = ${idempotencyKey} FOR UPDATE`;
      const existingRows = await transactionContext.sudo().query.PaymentSession.findMany({
        where: { idempotencyKey: { equals: idempotencyKey } },
        take: 1,
        query: sessionSelection
      });
      const existing = existingRows[0] || null;
      const now2 = Date.now();
      const existingClaimedAt = Number(existing?.data?.claimedAt || 0);
      const existingStatus = existing?.data?.status;
      if (existing?.isInitiated && existingStatus === "ready") return { session: existing, shouldCreate: false };
      if (existing && existing.reservedOrderDisplayId && existingStatus !== "failed" && existingStatus !== "expired" && now2 - existingClaimedAt < 3e4) {
        return { session: existing, shouldCreate: false };
      }
      const baseData = { ...claimData, status: "initiating", claimedAt: now2 };
      const reservedOrderDisplayId = existing?.reservedOrderDisplayId || await (async () => {
        await transactionContext.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-order-display-id'), hashtext('allocation'))");
        const [orderMax, sessionMax] = await Promise.all([
          transactionContext.prisma.order.aggregate({ _max: { displayId: true } }),
          transactionContext.prisma.paymentSession.aggregate({ _max: { reservedOrderDisplayId: true } })
        ]);
        return Math.max(orderMax._max.displayId || 0, sessionMax._max.reservedOrderDisplayId || 0) + 1;
      })();
      if (existing) {
        const updated = await transactionContext.sudo().query.PaymentSession.updateOne({
          where: { id: existing.id },
          data: { isSelected: true, isInitiated: false, amountCents: amountInCents, reservedOrderDisplayId, data: baseData },
          query: sessionSelection
        });
        return { session: updated, shouldCreate: true };
      }
      const existingSelected = await transactionContext.sudo().query.PaymentSession.findMany({
        where: { cart: { id: { equals: cart.id } }, isSelected: { equals: true } },
        query: "id"
      });
      for (const selected of existingSelected) {
        await transactionContext.sudo().query.PaymentSession.updateOne({ where: { id: selected.id }, data: { isSelected: false } });
      }
      const created = await transactionContext.sudo().query.PaymentSession.createOne({
        data: {
          cart: { connect: { id: cart.id } },
          paymentProvider: { connect: { id: provider.id } },
          amount: totalDollars.toFixed(2),
          idempotencyKey,
          isSelected: true,
          isInitiated: false,
          amountCents: amountInCents,
          reservedOrderDisplayId,
          data: baseData
        },
        query: sessionSelection
      });
      return { session: created, shouldCreate: true };
    });
  } catch (error) {
    const candidate = error;
    const errorCode = candidate.code || candidate.extensions?.prisma?.code;
    if (errorCode !== "P2002") throw error;
    const winner = await sudoContext.query.PaymentSession.findMany({ where: { idempotencyKey: { equals: idempotencyKey } }, take: 1, query: sessionSelection });
    if (!winner[0]) throw error;
    claim = { session: winner[0], shouldCreate: false };
  }
  if (!claim.shouldCreate) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const ready = await sudoContext.query.PaymentSession.findOne({ where: { id: claim.session.id }, query: sessionSelection });
      if (ready?.isInitiated && ready.data?.status === "ready") {
        const providerPaymentId = ready.data?.paymentIntentId;
        if (!providerPaymentId) throw new Error("Payment session is missing a durable payment identity");
        await ensureCheckoutAttempt(context, checkoutRequest(ready.id, providerPaymentId), cart, ready, providerPaymentId);
        return ready;
      }
      if (ready?.data?.status === "failed") throw new Error(ready.data.error || "Payment session initiation failed");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Payment session is still being initialized; please retry without changing the cart or slot");
  }
  try {
    const sessionData = await createPayment({
      provider,
      cart,
      amount: amountInCents,
      currency: "usd",
      idempotencyKey
    });
    const ready = await sudoContext.query.PaymentSession.updateOne({
      where: { id: claim.session.id },
      data: {
        isSelected: true,
        isInitiated: true,
        amountCents: amountInCents,
        data: { ...claimData, ...sessionData, status: "attempt_pending", claimedAt: void 0 }
      },
      query: sessionSelection
    });
    const providerPaymentId = sessionData?.paymentIntentId;
    if (!providerPaymentId) throw new Error("Payment provider did not return a durable payment identity");
    await ensureCheckoutAttempt(context, checkoutRequest(ready.id, providerPaymentId), cart, ready, providerPaymentId);
    return sudoContext.query.PaymentSession.updateOne({
      where: { id: ready.id },
      data: { data: { ...claimData, ...sessionData, status: "ready", claimedAt: void 0 } },
      query: sessionSelection
    });
  } catch (error) {
    await sudoContext.query.PaymentSession.updateOne({
      where: { id: claim.session.id },
      data: { isInitiated: false, data: { ...claimData, status: "failed", error: error instanceof Error ? error.message : "Provider initiation failed" } }
    });
    throw error;
  }
}

// features/keystone/mutations/getGuestGroceryOrder.ts
async function getGuestGroceryOrder(root, { orderId, sessionId, token }, context) {
  const order = await context.sudo().db.Order.findOne({ where: { id: orderId } });
  if (!order || order.metadata?.guestSessionId !== sessionId.trim() || !verifyGuestOrderToken(orderId, sessionId, token, void 0, order.createdAt)) {
    throw new Error("Guest order not found");
  }
  const [shippingAddress, lineItems] = await Promise.all([
    order.shippingAddressId ? context.sudo().db.Address.findOne({ where: { id: order.shippingAddressId } }) : null,
    context.prisma.orderLineItem.findMany({
      where: { orderId: String(order.id) },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        quantity: true,
        unitPrice: true,
        unitPriceCents: true,
        thumbnail: true,
        metadata: true,
        product: { select: { id: true, handle: true } },
        substitutions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, originalProduct: true, substitutedProduct: true, reason: true, customerApproved: true, approvedAt: true }
        }
      }
    })
  ]);
  const lineItemsSnapshot = lineItems.map((line) => ({
    id: line.id,
    title: line.title,
    quantity: line.quantity,
    unitPrice: Number(line.unitPriceCents || Math.round(Number(line.unitPrice || 0) * 100)) / 100,
    unitPriceCents: line.unitPriceCents,
    thumbnail: line.thumbnail || null,
    product: line.product,
    metadata: {
      ...line.metadata || {},
      substitution: line.substitutions[0] ? { ...line.substitutions[0], approvedAt: line.substitutions[0].approvedAt?.toISOString() || null } : null
    }
  }));
  return {
    ...order,
    metadata: { ...order.metadata || {}, lineItemsSnapshot },
    shippingAddress,
    lineItems: []
  };
}

// features/keystone/mutations/handlePaymentProviderWebhook.ts
var import_node_crypto6 = require("node:crypto");

// features/keystone/lib/refundState.ts
function compareRefundEventOrder(left, right) {
  if (left.createdAtMs !== right.createdAtMs) return left.createdAtMs - right.createdAtMs;
  if (left.version !== right.version) return left.version - right.version;
  return left.eventId.localeCompare(right.eventId);
}
function shouldApplyRefundTransition(currentStatus, incomingStatus, currentOrder, incomingOrder) {
  if (currentStatus === "succeeded") return false;
  if (currentStatus !== "processing" && incomingStatus === "processing") return false;
  if (!currentOrder) return true;
  return compareRefundEventOrder(incomingOrder, currentOrder) > 0;
}

// features/keystone/lib/paymentState.ts
var SAME_INSTANT_PRIORITY = {
  processing: 1,
  failed: 2,
  cancelled: 2,
  succeeded: 3
};
function compareProviderPosition(left, right) {
  if (left.createdAtMs !== right.createdAtMs) return left.createdAtMs - right.createdAtMs;
  if (left.version !== right.version) return left.version - right.version;
  return 0;
}
function shouldApplyPaymentTransition(currentStatus, incomingStatus, currentOrder, incomingOrder) {
  if (currentStatus === "refunded" || currentStatus === "partially_refunded") return false;
  if (currentStatus === "succeeded") return incomingStatus === "succeeded" && Boolean(
    !currentOrder || compareProviderPosition(incomingOrder, currentOrder) > 0
  );
  if (!currentOrder) return true;
  const position = compareProviderPosition(incomingOrder, currentOrder);
  if (position !== 0) return position > 0;
  const currentProviderStatus = currentStatus === "pending" ? "processing" : currentStatus;
  const priorityDelta = SAME_INSTANT_PRIORITY[incomingStatus] - SAME_INSTANT_PRIORITY[currentProviderStatus];
  if (priorityDelta !== 0) return priorityDelta > 0;
  return incomingOrder.eventId.localeCompare(currentOrder.eventId) > 0;
}
function paymentEventOrderFromProviderData(providerData) {
  const evidence = providerData?.paymentWebhook;
  if (!evidence || typeof evidence.eventId !== "string") return null;
  const createdAtMs = Number(evidence.createdAtMs || 0);
  const version = Number(evidence.version || 0);
  if (!Number.isFinite(createdAtMs) || createdAtMs < 0 || !Number.isInteger(version) || version < 0) return null;
  return { createdAtMs, version, eventId: evidence.eventId };
}

// features/keystone/mutations/handlePaymentProviderWebhook.ts
function normalizePaymentId(resource) {
  return resource?.payment_intent || resource?.id || null;
}
function normalizePaymentStatus(eventType) {
  if (eventType === "payment_intent.succeeded" || eventType === "charge.succeeded") return "succeeded";
  if (eventType === "payment_intent.processing" || eventType === "charge.pending") return "processing";
  if (eventType === "payment_intent.payment_failed" || eventType === "charge.failed") return "failed";
  if (eventType === "payment_intent.canceled" || eventType === "payment_intent.cancelled") return "cancelled";
  return null;
}
function normalizeRefundStatus(eventType, resource) {
  if (!["refund.created", "refund.updated", "refund.failed", "refund.canceled", "refund.cancelled", "charge.refunded"].includes(eventType)) return null;
  const providerStatus = String(resource?.status || "").toLowerCase();
  if (providerStatus === "canceled" || providerStatus === "cancelled" || eventType === "refund.canceled" || eventType === "refund.cancelled") return "canceled";
  if (providerStatus === "failed" || eventType === "refund.failed") return "failed";
  if (providerStatus === "succeeded" || providerStatus === "paid" || eventType === "charge.refunded") return "succeeded";
  if (providerStatus === "pending" || providerStatus === "processing" || eventType === "refund.created" || eventType === "refund.updated") return "processing";
  return null;
}
function providerEventOrder(event, resource, eventId) {
  const createdValue = Number(event?.created ?? resource?.created ?? 0);
  const createdAtMs = Number.isFinite(createdValue) && createdValue > 0 ? createdValue < 1e10 ? createdValue * 1e3 : createdValue : 0;
  const versionValue = Number(event?.version ?? resource?.version ?? resource?.metadata?.version ?? createdValue ?? 0);
  return { createdAtMs, version: Number.isInteger(versionValue) && versionValue >= 0 ? versionValue : 0, eventId };
}
async function processPaymentProviderWebhook({ providerCode, rawBody, headers }, context) {
  if (!rawBody) throw new Error("Payment webhook raw body is required");
  const verified = await verifyPaymentWebhook({
    providerCode,
    rawBody,
    headers: headers || {}
  });
  const eventType = verified.type;
  const providerEventId = verified.eventId;
  const createdSeconds = Number(verified.event?.created || 0);
  if (createdSeconds && Math.abs(Date.now() - createdSeconds * 1e3) > 7 * 24 * 60 * 60 * 1e3) throw new Error("Payment webhook event is outside the replay window");
  if (!providerEventId) throw new Error("Payment webhook event id is required");
  const paymentId = normalizePaymentId(verified.resource);
  const status = normalizePaymentStatus(eventType);
  const refundStatus = normalizeRefundStatus(eventType, verified.resource);
  const replayKey = `${providerCode}:${providerEventId}`;
  const claimToken = (0, import_node_crypto6.randomUUID)();
  const payloadHash = (0, import_node_crypto6.createHash)("sha256").update(rawBody).digest("hex");
  const refundEventOrder = providerEventOrder(verified.event, verified.resource, providerEventId);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const provider = await tx.paymentProvider.findUnique({
      where: { code: providerCode },
      select: { id: true, code: true, isInstalled: true }
    });
    if (!provider?.isInstalled) {
      throw new Error(`Payment provider ${providerCode} not found or not installed`);
    }
    if (paymentId) await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "providerPaymentId" = $1 FOR UPDATE', paymentId);
    const knownPayment = paymentId ? await tx.payment.findUnique({
      where: { providerPaymentId: paymentId },
      select: { id: true, storeId: true, paymentProviderId: true, providerData: true, amountCents: true, status: true }
    }) : null;
    if (knownPayment && knownPayment.paymentProviderId !== provider.id) throw new Error("Payment provider does not match webhook provider");
    const eventStoreId = knownPayment?.storeId || process.env.PUBLIC_STORE_ID || "store_juniper";
    const store = await tx.store.findUnique({ where: { id: eventStoreId }, select: { id: true } });
    if (!store) throw new Error("Webhook event could not resolve a Store");
    const eventRecord = await tx.paymentWebhookEvent.upsert({
      where: { replayKey },
      update: {},
      create: {
        replayKey,
        providerCode,
        providerEventId,
        providerCreatedAt: refundEventOrder.createdAtMs ? new Date(refundEventOrder.createdAtMs) : null,
        providerVersion: refundEventOrder.version,
        eventType,
        payloadHash,
        claimToken,
        status: "processing",
        storeId: store.id
      },
      select: { id: true, claimToken: true, status: true, paymentRecordId: true }
    });
    if (eventRecord.claimToken !== claimToken) {
      return {
        success: true,
        duplicate: true,
        providerCode,
        eventType,
        paymentId,
        updatedPaymentId: eventRecord.paymentRecordId || null,
        message: "Payment webhook event was already claimed."
      };
    }
    let updatedPaymentId = null;
    let eventProcessingStatus = "unmatched";
    if (knownPayment && status) {
      updatedPaymentId = knownPayment.id;
      const currentPaymentOrder = paymentEventOrderFromProviderData(knownPayment.providerData);
      const apply = shouldApplyPaymentTransition(
        knownPayment.status,
        status,
        currentPaymentOrder,
        refundEventOrder
      );
      if (apply) {
        await tx.payment.update({
          where: { id: knownPayment.id },
          data: {
            status,
            providerData: {
              ...knownPayment.providerData || {},
              paymentWebhook: {
                eventId: providerEventId,
                eventType,
                status,
                createdAtMs: refundEventOrder.createdAtMs,
                version: refundEventOrder.version,
                payloadHash,
                receivedAt: (/* @__PURE__ */ new Date()).toISOString()
              }
            }
          }
        });
        eventProcessingStatus = "processed";
      } else {
        eventProcessingStatus = "ignored";
      }
    }
    if (knownPayment && refundStatus) {
      const resource = verified.resource || {};
      const refundId = resource.id || null;
      const resourceAmountCents = Number(resource.amount);
      const resourceCurrency = String(resource.currency || "usd").toLowerCase();
      const candidate = refundId ? await tx.paymentRefund.findFirst({ where: { paymentId: knownPayment.id, providerRefundId: refundId } }) : null;
      const evidenceMatches = Boolean(candidate && Number.isInteger(resourceAmountCents) && resourceAmountCents === candidate.amountCents && resourceCurrency === "usd");
      if (candidate && evidenceMatches) {
        await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', candidate.id);
        const refund = await tx.paymentRefund.findUnique({ where: { id: candidate.id } });
        if (refund) {
          const currentOrder = refund.providerEventId ? { createdAtMs: refund.providerEventCreatedAt?.getTime() || 0, version: refund.providerEventVersion || 0, eventId: refund.providerEventId } : null;
          const apply = shouldApplyRefundTransition(refund.status, refundStatus, currentOrder, refundEventOrder);
          if (apply) {
            await tx.paymentRefund.update({
              where: { id: refund.id },
              data: {
                status: refundStatus,
                providerStatus: String(resource.status || eventType).toLowerCase(),
                providerEventId,
                providerEventCreatedAt: refundEventOrder.createdAtMs ? new Date(refundEventOrder.createdAtMs) : null,
                providerEventVersion: refundEventOrder.version,
                processedAt: refundStatus === "processing" ? null : /* @__PURE__ */ new Date(),
                failureMessage: refundStatus === "failed" ? "Provider reported refund failure" : refundStatus === "canceled" ? "Provider canceled refund" : "",
                providerData: {
                  ...refund.providerData || {},
                  providerResponse: resource
                }
              }
            });
            if (refundStatus === "succeeded") {
              const aggregate = await tx.paymentRefund.aggregate({ where: { paymentId: knownPayment.id, status: "succeeded" }, _sum: { amountCents: true } });
              const refundedCents = Number(aggregate._sum.amountCents || 0);
              await tx.payment.update({ where: { id: knownPayment.id }, data: { status: refundedCents >= knownPayment.amountCents ? "refunded" : refundedCents > 0 ? "partially_refunded" : knownPayment.status } });
            }
          }
          updatedPaymentId = knownPayment.id;
          eventProcessingStatus = "processed";
        }
      }
    }
    await tx.paymentWebhookEvent.update({
      where: { id: eventRecord.id },
      data: {
        status: eventProcessingStatus,
        paymentRecordId: updatedPaymentId || "",
        payment: updatedPaymentId ? { connect: { id: updatedPaymentId } } : void 0,
        processedAt: /* @__PURE__ */ new Date()
      }
    });
    return {
      success: true,
      duplicate: false,
      providerCode: provider.code,
      eventType,
      paymentId,
      updatedPaymentId,
      message: updatedPaymentId ? "Payment webhook processed." : "Payment webhook accepted; no matching payment was updated."
    };
  }, { isolationLevel: "Serializable" }));
}
async function handlePaymentProviderWebhook(_root, args, context) {
  await requireFreshCapability(context, "canManagePayments");
  return processPaymentProviderWebhook(args, context);
}

// features/keystone/mutations/manageDeliveryRoutes.ts
async function assertCanManageDelivery2(context) {
  await requireFreshCapability(context, "canManageDelivery");
}
var DELIVERY_TIME_WINDOWS = /* @__PURE__ */ new Set([
  "time_8_10",
  "time_10_12",
  "time_12_14",
  "time_14_16",
  "time_16_18",
  "time_18_20"
]);
function deliveryDay(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}
function assertValidRouteInput(deliveryDate, deliveryTimeWindow, orderIds) {
  const parsedDate = new Date(deliveryDate);
  if (!Number.isFinite(parsedDate.getTime())) {
    throw new Error("A valid delivery date is required");
  }
  if (!DELIVERY_TIME_WINDOWS.has(deliveryTimeWindow)) {
    throw new Error("A valid delivery time window is required");
  }
  if (!orderIds.length) {
    throw new Error("Select at least one order for the route");
  }
  if (new Set(orderIds).size !== orderIds.length) {
    throw new Error("Each order can only appear once on a route");
  }
}
async function lockOrders(transactionContext, orderIds) {
  const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(", ");
  await transactionContext.prisma.$queryRawUnsafe(
    `SELECT "id" FROM "Order" WHERE "id" IN (${placeholders}) ORDER BY "id" FOR UPDATE`,
    ...orderIds
  );
}
async function lockRoute(transactionContext, routeId) {
  await transactionContext.prisma.$queryRawUnsafe(
    'SELECT "id" FROM "DeliveryRoute" WHERE "id" = $1 FOR UPDATE',
    routeId
  );
}
async function assertEligibleDriver(transactionContext, sudoContext, driverId, storeId) {
  await transactionContext.prisma.$queryRawUnsafe(
    'SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE',
    driverId
  );
  const driverRole = await sudoContext.query.User.findOne({
    where: { id: driverId },
    query: "id role { id }"
  });
  if (driverRole?.role?.id) {
    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "Role" WHERE "id" = $1 FOR UPDATE',
      driverRole.role.id
    );
  }
  const driver = await sudoContext.query.User.findOne({
    where: { id: driverId },
    query: "id store { id } role { canManageDelivery }"
  });
  if (driver?.store?.id !== storeId || !driver?.role?.canManageDelivery) {
    throw new Error("Assigned driver must have delivery permission");
  }
}
async function getOrderOrThrow(sudoContext, orderId, storeId) {
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: "id displayId status deliveryDate deliveryTimeWindow metadata store { id } deliveryRoute { id }"
  });
  if (order?.store?.id !== storeId) {
    throw new Error(`Order ${orderId} not found in active store`);
  }
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  return order;
}
async function createDeliveryRouteFromOrders(root, { deliveryDate, deliveryTimeWindow, orderIds, driverId }, context) {
  await assertCanManageDelivery2(context);
  assertValidRouteInput(deliveryDate, deliveryTimeWindow, orderIds);
  if (!driverId?.trim()) throw new Error("A delivery driver is required before routing orders");
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const sudoContext = transactionContext.sudo();
    await lockOrders(transactionContext, orderIds);
    await assertEligibleDriver(transactionContext, sudoContext, driverId, store.id);
    const orders = [];
    const existingRouteIds = /* @__PURE__ */ new Set();
    for (const orderId of orderIds) {
      const order = await getOrderOrThrow(sudoContext, orderId, store.id);
      const metadata = order.metadata || {};
      const existingRouteId = order.deliveryRoute?.id || metadata.deliveryRouteId;
      if (metadata.fulfillmentMethod !== "delivery") {
        throw new Error(`Order #${order.displayId} is not a delivery order`);
      }
      if (existingRouteId) {
        existingRouteIds.add(existingRouteId);
      } else if (order.status !== "packed") {
        throw new Error(`Order #${order.displayId} must be packed before routing`);
      }
      if (deliveryDay(order.deliveryDate) !== deliveryDay(deliveryDate)) {
        throw new Error(`Order #${order.displayId} is scheduled for a different delivery date`);
      }
      if (order.deliveryTimeWindow !== deliveryTimeWindow) {
        throw new Error(`Order #${order.displayId} is in a different delivery window`);
      }
      orders.push(order);
    }
    if (existingRouteIds.size > 0) {
      if (existingRouteIds.size === 1 && orders.every((order) => {
        const metadata = order.metadata || {};
        return (order.deliveryRoute?.id || metadata.deliveryRouteId) === Array.from(existingRouteIds)[0];
      })) {
        const existingRouteId = Array.from(existingRouteIds)[0];
        const existingRoute = await sudoContext.query.DeliveryRoute.findOne({
          where: { id: existingRouteId },
          query: "id status date timeWindow driver { id } orders { id }"
        });
        if (existingRoute && existingRoute.timeWindow === deliveryTimeWindow && new Date(existingRoute.date).toISOString() === new Date(deliveryDate).toISOString() && existingRoute.driver?.id === driverId && existingRoute.orders?.length === orders.length) {
          return {
            success: true,
            routeId: existingRoute.id,
            status: existingRoute.status,
            orderCount: orders.length,
            message: `Delivery route already exists with ${orders.length} orders.`
          };
        }
      }
      throw new Error("One or more orders are already assigned to a route");
    }
    const route = await sudoContext.query.DeliveryRoute.createOne({
      data: {
        store: { connect: { id: store.id } },
        date: new Date(deliveryDate).toISOString(),
        timeWindow: deliveryTimeWindow,
        status: "planning",
        driver: { connect: { id: driverId } },
        stops: orders.map((order, index) => ({
          orderId: order.id,
          displayId: order.displayId,
          sequence: index + 1,
          status: "planned"
        })),
        orders: {
          connect: orders.map((order) => ({ id: order.id }))
        }
      },
      query: "id date timeWindow status"
    });
    const routedAt = (/* @__PURE__ */ new Date()).toISOString();
    for (const order of orders) {
      await sudoContext.query.Order.updateOne({
        where: { id: order.id },
        data: {
          metadata: {
            ...order.metadata || {},
            deliveryRouteId: route.id,
            routedAt
          }
        }
      });
    }
    return {
      success: true,
      routeId: route.id,
      status: route.status,
      orderCount: orders.length,
      message: `Created delivery route with ${orders.length} orders.`
    };
  }, { isolationLevel: "ReadCommitted" }));
}
async function updateDeliveryRouteWorkflow(root, { routeId, status }, context) {
  await assertCanManageDelivery2(context);
  if (status !== "in_progress" && status !== "completed") {
    throw new Error("Route workflow status must be in_progress or completed");
  }
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const sudoContext = transactionContext.sudo();
    await lockRoute(transactionContext, routeId);
    const route = await sudoContext.query.DeliveryRoute.findOne({
      where: { id: routeId },
      query: `
        id
        status
        store { id }
        stops
        startedAt
        completedAt
        driver { id }
        orders {
          id
          displayId
          status
          metadata
        }
      `
    });
    if (!route || route.store?.id !== store.id) {
      throw new Error("Delivery route not found in active store");
    }
    if (route.status === status) {
      return {
        success: true,
        routeId,
        status,
        orderCount: route.orders?.length || 0,
        message: status === "in_progress" ? "Route already dispatched." : "Route already completed."
      };
    }
    if (route.status === "completed") {
      throw new Error("Completed routes cannot be changed");
    }
    if (status === "in_progress" && route.status !== "planning") {
      throw new Error("Only planning routes can be dispatched");
    }
    if (status === "completed" && route.status !== "in_progress") {
      throw new Error("Only in-progress routes can be completed");
    }
    if (status === "in_progress") {
      if (!route.driver?.id) throw new Error("Routes require an eligible driver before dispatch");
      await assertEligibleDriver(transactionContext, sudoContext, route.driver.id, store.id);
    }
    for (const order of route.orders || []) {
      const allowedStatuses = status === "in_progress" ? ["packed", "out_for_delivery"] : ["out_for_delivery", "delivered"];
      if (!allowedStatuses.includes(order.status)) {
        throw new Error(`Order #${order.displayId} is not ready for this route transition`);
      }
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await sudoContext.query.DeliveryRoute.updateOne({
      where: { id: routeId },
      data: {
        status,
        ...status === "in_progress" ? { startedAt: route.startedAt || now } : {},
        ...status === "completed" ? { completedAt: route.completedAt || now } : {},
        stops: (route.stops || []).map((stop) => ({
          ...stop,
          status: status === "in_progress" ? "out_for_delivery" : "delivered"
        }))
      }
    });
    const nextOrderStatus = status === "in_progress" ? "out_for_delivery" : "delivered";
    for (const order of route.orders || []) {
      await sudoContext.query.Order.updateOne({
        where: { id: order.id },
        data: {
          status: nextOrderStatus,
          metadata: {
            ...order.metadata || {},
            deliveryRouteId: routeId,
            ...status === "in_progress" ? { dispatchedAt: order.metadata?.dispatchedAt || now } : {},
            ...status === "completed" ? { deliveredAt: order.metadata?.deliveredAt || now } : {}
          }
        }
      });
    }
    return {
      success: true,
      routeId,
      status,
      orderCount: route.orders?.length || 0,
      message: status === "in_progress" ? "Route dispatched." : "Route completed."
    };
  }, { isolationLevel: "ReadCommitted" }));
}

// features/keystone/mutations/getPublicGroceryAvailability.ts
var MAX_DAYS = 14;
function boundedDays(days) {
  if (!Number.isInteger(days)) return 7;
  return Math.min(MAX_DAYS, Math.max(1, days));
}
async function resolvePublicGroceryAvailability(_root, { days }, context, now) {
  const store = await publicStore(context);
  const sudoContext = context.sudo();
  const requestedDays = boundedDays(days);
  const rolling = await ensureRollingFulfillmentAvailability(context, store, requestedDays, now);
  const today = zonedDateKey(now, store.timezone);
  const startDate = zonedStartOfDateKey(today, store.timezone);
  const endDate = zonedStartOfDateKey(zonedDateKeyOffset(now, store.timezone, requestedDays), store.timezone);
  const [deliverySlots, pickupSlots, parkingSpots] = await Promise.all([
    sudoContext.query.DeliverySlot.findMany({
      where: {
        AND: [
          { date: { gte: startDate.toISOString() } },
          { date: { lt: endDate.toISOString() } },
          { isActive: { equals: true } },
          { store: { id: { equals: store.id } } }
        ]
      },
      query: "id date startTime endTime capacity currentBookings deliveryFee",
      orderBy: [{ date: "asc" }, { startTime: "asc" }]
    }),
    sudoContext.query.PickupSlot.findMany({
      where: {
        AND: [
          { date: { gte: startDate.toISOString() } },
          { date: { lt: endDate.toISOString() } },
          { isActive: { equals: true } },
          { isAvailable: { equals: true } },
          { store: { id: { equals: store.id } } }
        ]
      },
      query: "id date startTime endTime maxOrders currentOrders",
      orderBy: [{ date: "asc" }, { startTime: "asc" }]
    }),
    sudoContext.query.ParkingSpot.findMany({
      where: { AND: [{ isAvailable: { equals: true } }, { store: { id: { equals: store.id } } }] },
      query: "id spotNumber description isAccessible",
      orderBy: [{ spotNumber: "asc" }]
    })
  ]);
  return {
    deliveryWindows: deliverySlots.flatMap((slot) => {
      const remainingCapacity = Math.max(0, slot.capacity - (slot.currentBookings || 0));
      const decision = evaluateFulfillmentWindow({
        hours: rolling.hours,
        timeZone: store.timezone,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        now
      });
      return remainingCapacity > 0 && decision.allowed ? [{
        id: slot.id,
        date: zonedDateKey(slot.date, store.timezone),
        startTime: slot.startTime,
        endTime: slot.endTime,
        feeCents: slot.deliveryFee || 0,
        remainingCapacity
      }] : [];
    }),
    pickupWindows: pickupSlots.flatMap((slot) => {
      const remainingCapacity = Math.max(0, slot.maxOrders - (slot.currentOrders || 0));
      const decision = evaluateFulfillmentWindow({
        hours: rolling.hours,
        timeZone: store.timezone,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        now
      });
      return remainingCapacity > 0 && decision.allowed ? [{
        id: slot.id,
        date: zonedDateKey(slot.date, store.timezone),
        startTime: slot.startTime,
        endTime: slot.endTime,
        remainingCapacity
      }] : [];
    }),
    parkingSpots: parkingSpots.map((spot) => ({
      id: spot.id,
      spotNumber: spot.spotNumber,
      description: spot.description,
      isAccessible: spot.isAccessible
    }))
  };
}
async function getPublicGroceryAvailability(root, args, context) {
  return resolvePublicGroceryAvailability(root, args, context, /* @__PURE__ */ new Date());
}

// features/keystone/mutations/getPublicGroceryCoupons.ts
async function getPublicGroceryCoupons(_root, _args, context) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const store = await publicStore(context);
  const coupons = await context.sudo().query.Coupon.findMany({
    where: {
      AND: [
        { isActive: { equals: true } },
        { store: { id: { equals: store.id } } },
        {
          OR: [
            { validFrom: { equals: null } },
            { validFrom: { lte: now } }
          ]
        },
        {
          OR: [
            { validTo: { equals: null } },
            { validTo: { gte: now } }
          ]
        }
      ]
    },
    query: `
      id
      code
      discountType
      discountValue
      minPurchase
      maxUses
      currentUses
      validTo
      productCategories
    `,
    orderBy: [{ validTo: "asc" }, { code: "asc" }]
  });
  return coupons.flatMap((coupon) => {
    const maxUses = Number(coupon.maxUses || 0);
    const currentUses = Number(coupon.currentUses || 0);
    if (maxUses > 0 && currentUses >= maxUses) return [];
    return [{
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue || 0,
      minPurchase: coupon.minPurchase || 0,
      validTo: coupon.validTo || null,
      productCategories: Array.isArray(coupon.productCategories) ? coupon.productCategories.filter((item) => typeof item === "string") : []
    }];
  });
}

// features/keystone/mutations/getPublicGroceryStorefrontSettings.ts
function optionalText(value) {
  const normalized = value?.trim();
  return normalized || null;
}
async function getPublicGroceryStorefrontSettings(_root, _args, context) {
  const store = await publicStore(context);
  const settings = await context.prisma.storeSettings.findUnique({
    where: { storeId: store.id },
    select: {
      id: true,
      name: true,
      tagline: true,
      homepageTitle: true,
      homepageDescription: true,
      contactEmail: true,
      contactPhone: true,
      address: true,
      logoUrl: true,
      brandHue: true,
      currencyCode: true,
      locale: true,
      timezone: true,
      countryCode: true,
      isActive: true
    }
  });
  if (!settings?.isActive) throw new Error("No active grocery storefront settings are configured");
  const name = optionalText(settings.name) || optionalText(store.name);
  if (!name) throw new Error("The active grocery storefront has no configured name");
  const brandHue = normalizeStorefrontBrandHue(settings.brandHue);
  return {
    id: String(settings.id),
    name,
    tagline: optionalText(settings.tagline),
    homepageTitle: optionalText(settings.homepageTitle),
    homepageDescription: optionalText(settings.homepageDescription),
    contactEmail: optionalText(settings.contactEmail),
    contactPhone: optionalText(settings.contactPhone),
    address: optionalText(settings.address),
    logoUrl: optionalText(settings.logoUrl),
    brandHue,
    effectiveBrandHue: effectiveStorefrontBrandHue(brandHue),
    currencyCode: optionalText(settings.currencyCode),
    locale: optionalText(settings.locale),
    timezone: optionalText(settings.timezone),
    countryCode: optionalText(settings.countryCode)
  };
}
async function updateGroceryStorefrontBrandHue(_root, args, context) {
  await requireFreshCapability(context, "canManageOnboarding");
  if (!Object.prototype.hasOwnProperty.call(args, "brandHue")) {
    throw new Error("Set brandHue to a hue or null to explicitly use the storefront default");
  }
  const brandHue = normalizeStorefrontBrandHue(args.brandHue);
  const store = await requireSessionStore(context);
  const settings = await context.prisma.storeSettings.update({
    where: { storeId: store.id },
    data: { brandHue },
    select: { brandHue: true }
  });
  return {
    brandHue: settings.brandHue,
    effectiveBrandHue: effectiveStorefrontBrandHue(settings.brandHue)
  };
}

// features/keystone/mutations/getPublicGroceryCatalog.ts
var PUBLIC_CATALOG_BOUND = 500;
var MAX_PAGE_SIZE = 100;
function boundedPage(args) {
  return {
    take: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(args.take || 24)))),
    skip: Math.max(0, Math.trunc(Number(args.skip || 0)))
  };
}
function mapCatalogProduct(product, storeId, requestedAlerts, now) {
  const sellableQuantity = deriveSellableQuantity(product, storeId, now);
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: product.description,
    sku: product.sku,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    unitOfMeasure: product.unitOfMeasure,
    pricingMethod: product.pricingMethod,
    imageUrl: product.imageUrl,
    thumbnailUrl: product.thumbnailUrl,
    isPerishable: product.isPerishable,
    shelfLife: product.shelfLife,
    organicCertified: product.organicCertified,
    allergens: Array.isArray(product.allergens) ? product.allergens : [],
    department: product.departmentRef,
    inStock: sellableQuantity > 0,
    stockQuantity: sellableQuantity,
    backInStockRequested: requestedAlerts.has(product.id),
    createdAt: product.createdAt.toISOString()
  };
}
function compareProducts(sort) {
  return (left, right) => {
    let result = 0;
    if (sort === "price-asc") result = Number(left.price || 0) - Number(right.price || 0);
    else if (sort === "price-desc") result = Number(right.price || 0) - Number(left.price || 0);
    else if (sort === "newest") result = String(right.createdAt).localeCompare(String(left.createdAt));
    else if (sort === "low-stock") result = left.stockQuantity - right.stockQuantity;
    else result = String(left.title).localeCompare(String(right.title));
    return result || String(left.title).localeCompare(String(right.title)) || left.id.localeCompare(right.id);
  };
}
async function loadCatalog(context, args, now) {
  const store = await publicStore(context);
  const where = { storeId: store.id, status: "published" };
  if (args.ids?.length) where.id = { in: Array.from(new Set(args.ids)).slice(0, MAX_PAGE_SIZE) };
  if (args.department?.trim()) where.departmentRef = { handle: args.department.trim() };
  if (args.search?.trim()) {
    const query = args.search.trim();
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { sku: { contains: query, mode: "insensitive" } },
      { handle: { contains: query, mode: "insensitive" } }
    ];
  }
  if (args.organic === true) where.organicCertified = true;
  const rows = await context.prisma.product.findMany({
    where,
    orderBy: [{ title: "asc" }, { id: "asc" }],
    take: PUBLIC_CATALOG_BOUND + 1,
    select: {
      id: true,
      title: true,
      handle: true,
      description: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      unitOfMeasure: true,
      pricingMethod: true,
      imageUrl: true,
      thumbnailUrl: true,
      isPerishable: true,
      shelfLife: true,
      organicCertified: true,
      allergens: true,
      createdAt: true,
      store: { select: { id: true } },
      departmentRef: { select: { id: true, name: true, handle: true, isActive: true } },
      inventoryLots: {
        where: { storeId: store.id, quantityRemaining: { gt: 0 }, expirationDate: { gt: now } },
        select: { expirationDate: true, quantityRemaining: true, store: { select: { id: true } } }
      }
    }
  });
  if (rows.length > PUBLIC_CATALOG_BOUND) throw new Error("Public grocery catalog exceeds the bounded launch projection");
  const requestedAlerts = /* @__PURE__ */ new Set();
  if (context.session?.itemId && rows.length) {
    const alerts = await context.prisma.backInStockAlert.findMany({
      where: {
        userId: context.session.itemId,
        productRefId: { in: rows.map((row) => row.id) },
        isActive: true,
        productRef: { storeId: store.id }
      },
      select: { productRefId: true }
    });
    for (const alert of alerts) if (alert.productRefId) requestedAlerts.add(alert.productRefId);
  }
  return {
    store,
    products: rows.map((row) => mapCatalogProduct(row, store.id, requestedAlerts, now))
  };
}
async function getPublicGroceryProducts(_root, args, context) {
  const now = /* @__PURE__ */ new Date();
  const { products } = await loadCatalog(context, args, now);
  const availability = args.availability || "in-stock";
  if (!["in-stock", "all", "low-stock"].includes(availability)) throw new Error("Unsupported catalog availability filter");
  const filtered = products.filter((product) => {
    if (availability === "all") return true;
    if (availability === "low-stock") return product.stockQuantity > 0 && product.stockQuantity < 10;
    return product.inStock;
  }).sort(compareProducts(args.sort));
  const { take, skip } = boundedPage(args);
  return { products: filtered.slice(skip, skip + take), totalCount: filtered.length };
}
async function getPublicGroceryProduct(_root, { handle }, context) {
  const normalized = handle.trim();
  if (!normalized) return null;
  const { products } = await loadCatalog(context, { search: normalized, availability: "all" }, /* @__PURE__ */ new Date());
  return products.find((product) => product.handle === normalized) || null;
}
async function requestGroceryBackInStockAlert(_root, { productId }, context) {
  if (!context.session?.itemId) throw new Error("Sign in to request a back-in-stock alert");
  const store = await requireSessionStore(context);
  const product = await context.prisma.product.findFirst({
    where: { id: productId, storeId: store.id, status: "published" },
    select: {
      id: true,
      title: true,
      store: { select: { id: true } },
      inventoryLots: {
        where: { storeId: store.id, quantityRemaining: { gt: 0 }, expirationDate: { gt: /* @__PURE__ */ new Date() } },
        select: { expirationDate: true, quantityRemaining: true, store: { select: { id: true } } }
      }
    }
  });
  if (!product) throw new Error("Product is not available in the active store");
  const sellableQuantity = deriveSellableQuantity(product, store.id);
  if (sellableQuantity > 0) {
    return { requested: false, reused: false, productId: product.id, message: `${product.title} is currently available` };
  }
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-back-in-stock'), hashtext($1))",
      `${context.session?.itemId}:${product.id}`
    );
    const existing = await transactionContext.prisma.backInStockAlert.findFirst({
      where: { userId: context.session?.itemId, productRefId: product.id, isActive: true },
      select: { id: true }
    });
    if (!existing) {
      await transactionContext.prisma.backInStockAlert.create({
        data: {
          userId: context.session?.itemId,
          productRefId: product.id,
          product: product.title,
          isActive: true
        }
      });
    }
    return {
      requested: true,
      reused: Boolean(existing),
      productId: product.id,
      message: existing ? "Back-in-stock alert is already active" : "Back-in-stock alert requested"
    };
  });
}

// features/platform/onboarding/lib/seed.json
var seed_default = {
  storeSettings: {
    name: "Juniper Market",
    tagline: "Neighborhood grocery \xB7 delivery & curbside pickup",
    homepageTitle: "Fresh from the neighborhood",
    homepageDescription: "Seasonal produce, pantry staples, and household essentials selected for everyday shopping.",
    contactEmail: "hello@junipermarket.example",
    contactPhone: "(415) 555-0148",
    address: "184 Juniper Street, San Francisco, CA 94107",
    logoUrl: "/logo.svg",
    brandHue: 35,
    currencyCode: "USD",
    taxRateBps: 875,
    locale: "en-US",
    timezone: "America/Los_Angeles",
    countryCode: "US",
    hours: {
      monday: "8:00 AM - 8:00 PM",
      tuesday: "8:00 AM - 8:00 PM",
      wednesday: "8:00 AM - 8:00 PM",
      thursday: "8:00 AM - 8:00 PM",
      friday: "8:00 AM - 9:00 PM",
      saturday: "8:00 AM - 9:00 PM",
      sunday: "9:00 AM - 7:00 PM",
      fulfillmentPolicy: {
        horizonDays: 7,
        cutoffMinutes: 120,
        blackoutDates: [],
        deliveryWindows: [
          { startTime: "08:00", endTime: "10:00", capacity: 20, deliveryFee: 0, isActive: true },
          { startTime: "10:00", endTime: "12:00", capacity: 20, deliveryFee: 299, isActive: true },
          { startTime: "12:00", endTime: "14:00", capacity: 18, deliveryFee: 499, isActive: true },
          { startTime: "16:00", endTime: "18:00", capacity: 24, deliveryFee: 699, isActive: true },
          { startTime: "18:00", endTime: "20:00", capacity: 16, deliveryFee: 399, isActive: true }
        ],
        pickupWindows: [
          { startTime: "09:00", endTime: "10:00", maxOrders: 12, isActive: true },
          { startTime: "11:00", endTime: "12:00", maxOrders: 12, isActive: true },
          { startTime: "13:00", endTime: "14:00", maxOrders: 12, isActive: true },
          { startTime: "16:00", endTime: "17:00", maxOrders: 16, isActive: true },
          { startTime: "18:00", endTime: "19:00", maxOrders: 12, isActive: true }
        ]
      }
    },
    isActive: true
  },
  departments: [
    {
      name: "Produce",
      handle: "produce",
      description: "Fresh fruits, vegetables, herbs, and grab-and-go produce.",
      imageUrl: "/images/produce-market.jpg",
      sortOrder: 1,
      temperatureZone: "ambient",
      requiredLicenses: []
    },
    {
      name: "Dairy & Eggs",
      handle: "dairy",
      description: "Milk, yogurt, eggs, butter, and refrigerated basics.",
      imageUrl: "/images/dairy-eggs.jpg",
      sortOrder: 2,
      temperatureZone: "refrigerated",
      requiredLicenses: []
    },
    {
      name: "Meat & Seafood",
      handle: "meat-seafood",
      description: "Fresh fish, premium cuts, and butcher counter staples.",
      imageUrl: "/images/meat-seafood-counter.jpg",
      sortOrder: 3,
      temperatureZone: "refrigerated",
      requiredLicenses: []
    },
    {
      name: "Bakery",
      handle: "bakery",
      description: "Fresh breads, pastries, and daily bakery picks.",
      imageUrl: "/images/bakery-bread.jpg",
      sortOrder: 4,
      temperatureZone: "ambient",
      requiredLicenses: []
    },
    {
      name: "Frozen",
      handle: "frozen",
      description: "Frozen fruit, vegetables, entrees, and ice cream.",
      imageUrl: "/images/frozen-aisle.jpg",
      sortOrder: 5,
      temperatureZone: "frozen",
      requiredLicenses: []
    },
    {
      name: "Pantry",
      handle: "pantry",
      description: "Rice, pasta, grains, canned goods, sauces, and staples.",
      imageUrl: "/images/pantry-shelves.jpg",
      sortOrder: 6,
      temperatureZone: "ambient",
      requiredLicenses: []
    }
  ],
  suppliers: [
    {
      name: "Local Harvest Co-op",
      contactName: "Maya Lopez",
      email: "local-harvest@example.com",
      phone: "415-555-1101",
      paymentTerms: "net_30",
      deliveryDays: [
        "mon",
        "wed",
        "fri"
      ],
      minimumOrder: 150
    },
    {
      name: "Bay Dairy",
      contactName: "Jordan Patel",
      email: "bay-dairy@example.com",
      phone: "415-555-2202",
      paymentTerms: "net_30",
      deliveryDays: [
        "mon",
        "thu",
        "sat"
      ],
      minimumOrder: 200
    },
    {
      name: "Ocean Catch Seafood",
      contactName: "Ava Nguyen",
      email: "ocean-catch@example.com",
      phone: "415-555-3303",
      paymentTerms: "cod",
      deliveryDays: [
        "tue",
        "thu",
        "sat"
      ],
      minimumOrder: 250
    }
  ],
  products: [
    {
      title: "Organic Bananas",
      handle: "organic-bananas",
      sku: "PROD-BAN-001",
      status: "published",
      price: 0.79,
      compareAtPrice: 0.99,
      costPrice: 0.39,
      inStock: true,
      stockQuantity: 120,
      lowStockThreshold: 20,
      imageUrl: "/images/organic-bananas.jpg",
      thumbnailUrl: "/images/organic-bananas.jpg",
      departmentCode: "produce",
      departmentHandle: "produce",
      supplierEmail: "local-harvest@example.com",
      isPerishable: true,
      shelfLife: 7,
      pricingMethod: "unit",
      unitOfMeasure: "each",
      organicCertified: true,
      allergens: []
    },
    {
      title: "Hass Avocados",
      handle: "avocados-hass",
      sku: "PROD-AVO-001",
      status: "published",
      price: 1.99,
      compareAtPrice: 2.29,
      costPrice: 1.1,
      inStock: true,
      stockQuantity: 80,
      lowStockThreshold: 12,
      imageUrl: "/images/avocados-hass.jpg",
      thumbnailUrl: "/images/avocados-hass.jpg",
      departmentCode: "produce",
      departmentHandle: "produce",
      supplierEmail: "local-harvest@example.com",
      isPerishable: true,
      shelfLife: 5,
      pricingMethod: "unit",
      unitOfMeasure: "each",
      organicCertified: false,
      allergens: []
    },
    {
      title: "Whole Milk",
      handle: "whole-milk-gallon",
      sku: "PROD-MILK-001",
      status: "published",
      price: 4.69,
      compareAtPrice: 4.99,
      costPrice: 2.65,
      inStock: true,
      stockQuantity: 42,
      lowStockThreshold: 10,
      imageUrl: "/images/whole-milk-gallon.jpg",
      thumbnailUrl: "/images/whole-milk-gallon.jpg",
      departmentCode: "dairy",
      departmentHandle: "dairy",
      supplierEmail: "bay-dairy@example.com",
      isPerishable: true,
      shelfLife: 10,
      pricingMethod: "unit",
      unitOfMeasure: "gallon",
      organicCertified: false,
      allergens: [
        "milk"
      ]
    },
    {
      title: "Plain Greek Yogurt",
      handle: "greek-yogurt-plain",
      sku: "PROD-YOG-001",
      status: "published",
      price: 5.49,
      compareAtPrice: 5.99,
      costPrice: 3.15,
      inStock: true,
      stockQuantity: 26,
      lowStockThreshold: 8,
      imageUrl: "/images/greek-yogurt-plain.jpg",
      thumbnailUrl: "/images/greek-yogurt-plain.jpg",
      departmentCode: "dairy",
      departmentHandle: "dairy",
      supplierEmail: "bay-dairy@example.com",
      isPerishable: true,
      shelfLife: 14,
      pricingMethod: "unit",
      unitOfMeasure: "each",
      organicCertified: false,
      allergens: [
        "milk"
      ]
    },
    {
      title: "Fresh Salmon Fillet",
      handle: "fresh-salmon-fillet",
      sku: "PROD-SAL-001",
      status: "published",
      price: 14.99,
      compareAtPrice: 16.49,
      costPrice: 9.25,
      inStock: true,
      stockQuantity: 18,
      lowStockThreshold: 6,
      imageUrl: "/images/fresh-salmon-fillet.jpg",
      thumbnailUrl: "/images/fresh-salmon-fillet.jpg",
      departmentCode: "meat",
      departmentHandle: "meat-seafood",
      supplierEmail: "ocean-catch@example.com",
      isPerishable: true,
      shelfLife: 4,
      pricingMethod: "unit",
      unitOfMeasure: "each",
      organicCertified: false,
      allergens: [
        "fish"
      ]
    },
    {
      title: "Sourdough Bread",
      handle: "sourdough-bread",
      sku: "PROD-BREAD-001",
      status: "published",
      price: 4.29,
      compareAtPrice: 4.79,
      costPrice: 2.05,
      inStock: true,
      stockQuantity: 24,
      lowStockThreshold: 6,
      imageUrl: "/images/sourdough-bread.jpg",
      thumbnailUrl: "/images/sourdough-bread.jpg",
      departmentCode: "bakery",
      departmentHandle: "bakery",
      supplierEmail: "local-harvest@example.com",
      isPerishable: true,
      shelfLife: 3,
      pricingMethod: "unit",
      unitOfMeasure: "each",
      organicCertified: false,
      allergens: [
        "wheat"
      ]
    },
    {
      title: "Frozen Blueberries",
      handle: "frozen-blueberries",
      sku: "PROD-BLUE-001",
      status: "published",
      price: 6.49,
      compareAtPrice: 6.99,
      costPrice: 3.85,
      inStock: true,
      stockQuantity: 34,
      lowStockThreshold: 8,
      imageUrl: "/images/frozen-blueberries.jpg",
      thumbnailUrl: "/images/frozen-blueberries.jpg",
      departmentCode: "frozen",
      departmentHandle: "frozen",
      supplierEmail: "local-harvest@example.com",
      isPerishable: true,
      shelfLife: 180,
      pricingMethod: "unit",
      unitOfMeasure: "each",
      organicCertified: true,
      allergens: []
    },
    {
      title: "Jasmine Rice",
      handle: "jasmine-rice",
      sku: "PROD-RICE-001",
      status: "published",
      price: 8.99,
      compareAtPrice: 9.49,
      costPrice: 5.2,
      inStock: true,
      stockQuantity: 54,
      lowStockThreshold: 12,
      imageUrl: "/images/jasmine-rice.jpg",
      thumbnailUrl: "/images/jasmine-rice.jpg",
      departmentCode: "pantry",
      departmentHandle: "pantry",
      supplierEmail: "local-harvest@example.com",
      isPerishable: false,
      shelfLife: 365,
      pricingMethod: "unit",
      unitOfMeasure: "lb",
      organicCertified: false,
      allergens: []
    }
  ],
  inventoryLots: [
    {
      lotNumber: "LOT-BAN-001",
      productHandle: "organic-bananas",
      supplierEmail: "local-harvest@example.com",
      expirationOffsetDays: 6,
      receivedOffsetDays: -1,
      quantity: 120,
      quantityRemaining: 110,
      costPerUnit: 0.39,
      location: "Produce A1"
    },
    {
      lotNumber: "LOT-AVO-001",
      productHandle: "avocados-hass",
      supplierEmail: "local-harvest@example.com",
      expirationOffsetDays: 5,
      receivedOffsetDays: -1,
      quantity: 80,
      quantityRemaining: 74,
      costPerUnit: 1.1,
      location: "Produce A2"
    },
    {
      lotNumber: "LOT-MILK-001",
      productHandle: "whole-milk-gallon",
      supplierEmail: "bay-dairy@example.com",
      expirationOffsetDays: 8,
      receivedOffsetDays: -2,
      quantity: 42,
      quantityRemaining: 34,
      costPerUnit: 2.65,
      location: "Cooler D1"
    },
    {
      lotNumber: "LOT-YOG-001",
      productHandle: "greek-yogurt-plain",
      supplierEmail: "bay-dairy@example.com",
      expirationOffsetDays: 12,
      receivedOffsetDays: -2,
      quantity: 26,
      quantityRemaining: 21,
      costPerUnit: 3.15,
      location: "Cooler D2"
    },
    {
      lotNumber: "LOT-SALMON-001",
      productHandle: "fresh-salmon-fillet",
      supplierEmail: "ocean-catch@example.com",
      expirationOffsetDays: 3,
      receivedOffsetDays: 0,
      quantity: 18,
      quantityRemaining: 15,
      costPerUnit: 9.25,
      location: "Seafood F1"
    },
    {
      lotNumber: "LOT-BREAD-001",
      productHandle: "sourdough-bread",
      supplierEmail: "local-harvest@example.com",
      expirationOffsetDays: 2,
      receivedOffsetDays: 0,
      quantity: 24,
      quantityRemaining: 20,
      costPerUnit: 2.05,
      location: "Bakery Shelf 1"
    },
    {
      lotNumber: "LOT-BLUE-001",
      productHandle: "frozen-blueberries",
      supplierEmail: "local-harvest@example.com",
      expirationOffsetDays: 120,
      receivedOffsetDays: -5,
      quantity: 34,
      quantityRemaining: 30,
      costPerUnit: 3.85,
      location: "Freezer B2"
    },
    {
      lotNumber: "LOT-RICE-001",
      productHandle: "jasmine-rice",
      supplierEmail: "local-harvest@example.com",
      expirationOffsetDays: 240,
      receivedOffsetDays: -7,
      quantity: 54,
      quantityRemaining: 48,
      costPerUnit: 5.2,
      location: "Pantry 4C"
    }
  ],
  deliverySlots: [
    {
      label: "AM Rush",
      dayOffset: 1,
      startTime: "08:00",
      endTime: "10:00",
      capacity: 20,
      currentBookings: 4,
      deliveryFee: 0,
      isActive: true
    },
    {
      label: "Late Morning",
      dayOffset: 1,
      startTime: "10:00",
      endTime: "12:00",
      capacity: 20,
      currentBookings: 8,
      deliveryFee: 299,
      isActive: true
    },
    {
      label: "Early Afternoon",
      dayOffset: 1,
      startTime: "12:00",
      endTime: "14:00",
      capacity: 18,
      currentBookings: 6,
      deliveryFee: 499,
      isActive: true
    },
    {
      label: "After Work",
      dayOffset: 1,
      startTime: "16:00",
      endTime: "18:00",
      capacity: 24,
      currentBookings: 10,
      deliveryFee: 699,
      isActive: true
    },
    {
      label: "Evening",
      dayOffset: 2,
      startTime: "18:00",
      endTime: "20:00",
      capacity: 16,
      currentBookings: 3,
      deliveryFee: 399,
      isActive: true
    }
  ],
  pickupSlots: [
    {
      label: "Curbside 9AM",
      dayOffset: 1,
      startTime: "09:00",
      endTime: "10:00",
      maxOrders: 12,
      currentOrders: 3,
      isAvailable: true
    },
    {
      label: "Curbside 11AM",
      dayOffset: 1,
      startTime: "11:00",
      endTime: "12:00",
      maxOrders: 12,
      currentOrders: 5,
      isAvailable: true
    },
    {
      label: "Curbside 1PM",
      dayOffset: 1,
      startTime: "13:00",
      endTime: "14:00",
      maxOrders: 12,
      currentOrders: 4,
      isAvailable: true
    },
    {
      label: "Curbside 4PM",
      dayOffset: 1,
      startTime: "16:00",
      endTime: "17:00",
      maxOrders: 16,
      currentOrders: 7,
      isAvailable: true
    },
    {
      label: "Curbside 6PM",
      dayOffset: 2,
      startTime: "18:00",
      endTime: "19:00",
      maxOrders: 12,
      currentOrders: 2,
      isAvailable: true
    }
  ],
  parkingSpots: [
    {
      spotNumber: "A1",
      description: "Front curbside lane",
      isAccessible: false,
      isAvailable: true
    },
    {
      spotNumber: "A2",
      description: "Front curbside lane",
      isAccessible: false,
      isAvailable: true
    },
    {
      spotNumber: "B1",
      description: "Side pickup lane",
      isAccessible: false,
      isAvailable: true
    },
    {
      spotNumber: "ADA-1",
      description: "Accessible curbside pickup",
      isAccessible: true,
      isAvailable: true
    }
  ],
  coupons: [
    {
      code: "WELCOME10",
      discountType: "percentage",
      discountValue: 10,
      minPurchase: 35,
      maxUses: 500,
      currentUses: 0,
      validFromOffsetDays: -1,
      validToOffsetDays: 30,
      productCategories: [],
      excludedProducts: [],
      isActive: true
    },
    {
      code: "FRESH5",
      discountType: "fixed",
      discountValue: 5,
      minPurchase: 25,
      maxUses: 250,
      currentUses: 0,
      validFromOffsetDays: -1,
      validToOffsetDays: 14,
      productCategories: [
        "produce",
        "dairy"
      ],
      excludedProducts: [],
      isActive: true
    }
  ],
  paymentProviders: [
    {
      name: "Stripe Checkout",
      code: "pp_stripe_default",
      isInstalled: true,
      metadata: {
        provider: "stripe",
        configuration: "server_environment"
      }
    }
  ]
};

// features/keystone/mutations/runGroceryOnboarding.ts
function relativeDate(days, hour = 12, minute = 0, now = /* @__PURE__ */ new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}
function startOfStoreDay(days, timeZone, now = /* @__PURE__ */ new Date()) {
  return zonedStartOfDateKey(zonedDateKeyOffset(now, timeZone, days), timeZone);
}
function assertSeed(seed) {
  if (!seed?.storeSettings?.name || !seed.departments?.length || !seed.products?.length) {
    throw new Error("Grocery onboarding requires store settings, departments, and products");
  }
  if (seed.storeSettings.currencyCode !== "USD") throw new Error("The bounded initial launch supports USD stores only");
  if (seed.storeSettings.isActive !== true) throw new Error("Onboarding cannot initialize an inactive Store");
  assertValidTimeZone(seed.storeSettings.timezone);
  assertValidRollingFulfillmentPolicy(seed.storeSettings.hours);
  const fulfillmentPolicy = resolveRollingFulfillmentPolicy({
    hours: seed.storeSettings.hours,
    deliverySlots: [],
    pickupSlots: []
  });
  if (!fulfillmentPolicy.deliveryTemplates.length || !fulfillmentPolicy.pickupTemplates.length) {
    throw new Error("Onboarding requires configured rolling delivery and pickup windows");
  }
  normalizeTaxRateBps(seed.storeSettings.taxRateBps);
  const handles = seed.products.map((product) => product.handle);
  if (new Set(handles).size !== handles.length) throw new Error("Product handles must be unique");
  for (const lot of seed.inventoryLots) {
    if (!Number.isInteger(lot.expirationOffsetDays) || lot.expirationOffsetDays < 1) {
      throw new Error(`Inventory lot ${lot.lotNumber} must expire relative to onboarding in the future`);
    }
    if (!Number.isInteger(lot.quantityRemaining) || lot.quantityRemaining < 0 || lot.quantityRemaining > lot.quantity) {
      throw new Error(`Inventory lot ${lot.lotNumber} has an invalid remaining quantity`);
    }
  }
  if (seed.paymentProviders?.length !== 1 || seed.paymentProviders[0]?.code !== "pp_stripe_default") {
    throw new Error("Onboarding requires exactly the static Stripe adapter registry entry");
  }
}
function providerInstalled(code) {
  return code === "pp_stripe_default" && Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
function publicProviderMetadata(metadata) {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return Object.fromEntries(Object.entries(source).filter(([key2]) => !/(secret|token|password|credential|key)/i.test(key2)));
}
async function runGroceryOnboardingTransaction(seed, context, failurePoint) {
  const userId = context.session?.itemId;
  if (!userId) throw new Error("You must be signed in to run grocery onboarding");
  assertSeed(seed);
  const store = await requireSessionStore(context);
  const launchCounts = {
    departments: seed.departments.length,
    suppliers: seed.suppliers.length,
    products: seed.products.length,
    inventoryLots: seed.inventoryLots.length,
    deliverySlots: seed.deliverySlots.length,
    pickupSlots: seed.pickupSlots.length,
    parkingSpots: seed.parkingSpots.length,
    paymentProviders: seed.paymentProviders.length,
    coupons: seed.coupons.length,
    loyaltyPrograms: 0,
    customers: 0,
    orders: 0
  };
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRaw`
      WITH onboarding_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended('openfront-grocery-onboarding', 0))
      )
      SELECT true AS locked FROM onboarding_lock
    `;
    const [actor, existingSettings] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { storeId: true, onboardingStatus: true } }),
      tx.storeSettings.findUnique({ where: { storeId: store.id }, select: { id: true } })
    ]);
    if (!actor || actor.storeId !== store.id) throw new Error("Onboarding actor is not owned by the active Store");
    if (existingSettings) {
      if (actor.onboardingStatus !== "completed") {
        await tx.user.update({ where: { id: userId }, data: { onboardingStatus: "completed" } });
      }
      const [departments, suppliers, products, inventoryLots, deliverySlots, pickupSlots, parkingSpots, paymentProviders, coupons] = await Promise.all([
        tx.department.count({ where: { storeId: store.id } }),
        tx.supplier.count({ where: { storeId: store.id } }),
        tx.product.count({ where: { storeId: store.id } }),
        tx.inventoryLot.count({ where: { storeId: store.id } }),
        tx.deliverySlot.count({ where: { storeId: store.id } }),
        tx.pickupSlot.count({ where: { storeId: store.id } }),
        tx.parkingSpot.count({ where: { storeId: store.id } }),
        tx.paymentProvider.count(),
        tx.coupon.count({ where: { storeId: store.id } })
      ]);
      return { completed: true, reused: true, counts: { ...launchCounts, departments, suppliers, products, inventoryLots, deliverySlots, pickupSlots, parkingSpots, paymentProviders, coupons } };
    }
    await tx.store.update({
      where: { id: store.id },
      data: {
        name: seed.storeSettings.name,
        timezone: seed.storeSettings.timezone,
        currencyCode: seed.storeSettings.currencyCode,
        isActive: seed.storeSettings.isActive
      }
    });
    await tx.storeSettings.upsert({
      where: { storeId: store.id },
      update: seed.storeSettings,
      create: { ...seed.storeSettings, storeId: store.id }
    });
    const departmentIds = /* @__PURE__ */ new Map();
    for (const department of seed.departments) {
      const conflict = await tx.department.findFirst({ where: { handle: department.handle }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Department handle ${department.handle} belongs to another store`);
      const existing = conflict;
      const row = existing ? await tx.department.update({ where: { id: existing.id }, data: {
        storeId: store.id,
        name: department.name,
        description: department.description,
        imageUrl: department.imageUrl,
        sortOrder: department.sortOrder,
        temperatureZone: department.temperatureZone,
        requiredLicenses: department.requiredLicenses,
        isActive: true
      }, select: { id: true } }) : await tx.department.create({
        data: { ...department, storeId: store.id, temperatureZone: department.temperatureZone, isActive: true },
        select: { id: true }
      });
      departmentIds.set(department.handle, row.id);
    }
    const supplierIds = /* @__PURE__ */ new Map();
    for (const supplier of seed.suppliers) {
      const conflict = await tx.supplier.findFirst({ where: { email: supplier.email }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Supplier ${supplier.email} belongs to another store`);
      const existing = conflict;
      const data = {
        name: supplier.name,
        contactName: supplier.contactName,
        email: supplier.email,
        phone: supplier.phone,
        paymentTerms: supplier.paymentTerms,
        deliveryDays: supplier.deliveryDays,
        minimumOrder: supplier.minimumOrder,
        minimumOrderCents: Math.round(supplier.minimumOrder * 100),
        storeId: store.id
      };
      const row = existing ? await tx.supplier.update({ where: { id: existing.id }, data, select: { id: true } }) : await tx.supplier.create({ data, select: { id: true } });
      supplierIds.set(supplier.email, row.id);
    }
    const productIds = /* @__PURE__ */ new Map();
    for (const product of seed.products) {
      const common = {
        title: product.title,
        sku: product.sku,
        status: product.status,
        price: product.price,
        priceCents: Math.round(product.price * 100),
        compareAtPrice: product.compareAtPrice,
        costPrice: product.costPrice,
        costPriceCents: Math.round(product.costPrice * 100),
        lowStockThreshold: product.lowStockThreshold,
        imageUrl: product.imageUrl,
        thumbnailUrl: product.thumbnailUrl,
        department: product.departmentCode,
        isPerishable: product.isPerishable,
        shelfLife: product.shelfLife,
        pricingMethod: product.pricingMethod,
        unitOfMeasure: product.unitOfMeasure,
        organicCertified: product.organicCertified,
        allergens: product.allergens,
        supplierId: supplierIds.get(product.supplierEmail),
        departmentRefId: departmentIds.get(product.departmentHandle),
        storeId: store.id
      };
      const conflict = await tx.product.findFirst({ where: { handle: product.handle }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Product handle ${product.handle} belongs to another store`);
      const existing = conflict;
      const row = existing ? await tx.product.update({ where: { id: existing.id }, data: common, select: { id: true } }) : await tx.product.create({ data: {
        ...common,
        handle: product.handle,
        inStock: product.inStock,
        stockQuantity: product.stockQuantity
      }, select: { id: true } });
      productIds.set(product.handle, row.id);
    }
    if (failurePoint === "after-products") throw new Error("Injected onboarding failure after products");
    for (const lot of seed.inventoryLots) {
      const common = {
        expirationDate: relativeDate(lot.expirationOffsetDays),
        receivedDate: relativeDate(lot.receivedOffsetDays, 9),
        quantity: lot.quantity,
        quantityRemaining: lot.quantityRemaining,
        costPerUnit: lot.costPerUnit,
        costPerUnitCents: Math.round(lot.costPerUnit * 100),
        location: lot.location,
        productId: productIds.get(lot.productHandle),
        supplierId: supplierIds.get(lot.supplierEmail),
        storeId: store.id
      };
      const existing = await tx.inventoryLot.findFirst({ where: { lotNumber: lot.lotNumber, storeId: store.id }, select: { id: true } });
      if (existing) await tx.inventoryLot.update({ where: { id: existing.id }, data: common });
      else await tx.inventoryLot.create({ data: { ...common, lotNumber: lot.lotNumber } });
    }
    const seededSellableByProduct = /* @__PURE__ */ new Map();
    for (const lot of seed.inventoryLots) {
      const productId = productIds.get(lot.productHandle);
      if (productId) seededSellableByProduct.set(productId, (seededSellableByProduct.get(productId) || 0) + lot.quantityRemaining);
    }
    for (const productId of productIds.values()) {
      const sellableQuantity = seededSellableByProduct.get(productId) || 0;
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: sellableQuantity, inStock: sellableQuantity > 0 }
      });
    }
    for (const slot of seed.deliverySlots) {
      const date = startOfStoreDay(slot.dayOffset, seed.storeSettings.timezone);
      const existing = await tx.deliverySlot.findFirst({
        where: { date, startTime: slot.startTime, endTime: slot.endTime, storeId: store.id },
        select: { id: true }
      });
      const common = {
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        deliveryFee: slot.deliveryFee,
        storeId: store.id
      };
      if (existing) await tx.deliverySlot.update({ where: { id: existing.id }, data: common });
      else await tx.deliverySlot.create({ data: { ...common, currentBookings: 0, isActive: slot.isActive } });
    }
    for (const slot of seed.pickupSlots) {
      const date = startOfStoreDay(slot.dayOffset, seed.storeSettings.timezone);
      const existing = await tx.pickupSlot.findFirst({
        where: { date, startTime: slot.startTime, endTime: slot.endTime, storeId: store.id },
        select: { id: true }
      });
      const common = { date, startTime: slot.startTime, endTime: slot.endTime, maxOrders: slot.maxOrders, isActive: slot.isAvailable, storeId: store.id };
      if (existing) await tx.pickupSlot.update({ where: { id: existing.id }, data: { ...common, isAvailable: slot.isAvailable } });
      else await tx.pickupSlot.create({ data: { ...common, currentOrders: 0, isAvailable: slot.isAvailable } });
    }
    for (const spot of seed.parkingSpots) {
      const conflict = await tx.parkingSpot.findFirst({ where: { spotNumber: spot.spotNumber }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Parking spot ${spot.spotNumber} belongs to another store`);
      const existing = conflict;
      if (existing) await tx.parkingSpot.update({ where: { id: existing.id }, data: { ...spot, storeId: store.id } });
      else await tx.parkingSpot.create({ data: { ...spot, storeId: store.id } });
    }
    for (const provider of seed.paymentProviders) {
      await tx.paymentProvider.upsert({
        where: { code: provider.code },
        update: { name: provider.name, isInstalled: providerInstalled(provider.code), metadata: publicProviderMetadata(provider.metadata) },
        create: { ...provider, isInstalled: providerInstalled(provider.code), metadata: publicProviderMetadata(provider.metadata) }
      });
    }
    for (const coupon of seed.coupons) {
      const common = {
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountValueCents: Math.round(coupon.discountValue * 100),
        minPurchase: coupon.minPurchase,
        minPurchaseCents: Math.round(coupon.minPurchase * 100),
        maxUses: coupon.maxUses,
        validFrom: relativeDate(coupon.validFromOffsetDays, 0),
        validTo: relativeDate(coupon.validToOffsetDays, 23, 59),
        productCategories: coupon.productCategories,
        excludedProducts: coupon.excludedProducts,
        isActive: coupon.isActive,
        storeId: store.id
      };
      const conflict = await tx.coupon.findFirst({ where: { code: coupon.code }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Coupon ${coupon.code} belongs to another store`);
      const existing = conflict;
      if (existing) await tx.coupon.update({ where: { id: existing.id }, data: common });
      else await tx.coupon.create({ data: { ...common, code: coupon.code, currentUses: coupon.currentUses } });
    }
    await tx.user.update({ where: { id: userId }, data: { onboardingStatus: "completed" } });
    return { completed: true, reused: false, counts: launchCounts };
  }, { timeout: 12e4, isolationLevel: "Serializable" });
}
async function runGroceryOnboarding(_root, args, context) {
  await requireFreshCapability(context, "canManageOnboarding");
  return runGroceryOnboardingTransaction(args.seed || seed_default, context);
}

// features/keystone/mutations/managePurchaseOrderReceiving.ts
async function assertCanManageInventory(context) {
  await requireFreshCapability(context, "canManageInventory");
}
function assertUniqueReceipts(receipts) {
  if (!receipts.length) throw new Error("At least one purchase order receipt is required");
  if (new Set(receipts.map((receipt) => receipt.poItemId)).size !== receipts.length) {
    throw new Error("Each purchase order item may appear only once per receipt request");
  }
  for (const receipt of receipts) {
    if (!Number.isInteger(receipt.targetQuantityReceived) || receipt.targetQuantityReceived < 0) {
      throw new Error("Received quantity targets must be non-negative integers");
    }
    if (!receipt.lotNumber.trim()) throw new Error("Each received item requires a lot number");
    const expirationDate = new Date(receipt.expirationDate);
    if (!Number.isFinite(expirationDate.getTime())) throw new Error("Each received item requires a valid expiration date");
    if (expirationDate.getTime() <= Date.now()) throw new Error("Inventory lot expiration date must be in the future");
  }
}
async function lockPurchaseOrder(transactionContext, purchaseOrderId) {
  const tx = transactionContext.prisma;
  await tx.$queryRawUnsafe(
    'SELECT "id" FROM "PurchaseOrder" WHERE "id" = $1 FOR UPDATE',
    purchaseOrderId
  );
  await tx.$queryRawUnsafe(
    'SELECT "id" FROM "POItem" WHERE "purchaseOrder" = $1 ORDER BY "id" FOR UPDATE',
    purchaseOrderId
  );
}
async function loadPurchaseOrder(sudoContext, purchaseOrderId, storeId) {
  const purchaseOrder = await sudoContext.query.PurchaseOrder.findOne({
    where: { id: purchaseOrderId },
    query: `
      id
      store { id }
      poNumber
      status
      receivedAt
      supplier { id }
      items {
        id
        quantity
        quantityReceived
        unitCost
        product { id title stockQuantity inStock }
      }
    `
  });
  return purchaseOrder?.store?.id === storeId ? purchaseOrder : null;
}
async function transitionPurchaseOrder(_root, { purchaseOrderId, status }, context) {
  await assertCanManageInventory(context);
  if (!["sent", "confirmed", "cancelled"].includes(status)) {
    throw new Error("Unsupported purchase order transition");
  }
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    await lockPurchaseOrder(transactionContext, purchaseOrderId);
    const sudoContext = transactionContext.sudo();
    const purchaseOrder = await loadPurchaseOrder(sudoContext, purchaseOrderId, store.id);
    if (!purchaseOrder) throw new Error("Purchase order not found in active store");
    if (purchaseOrder.status === status) {
      return { success: true, purchaseOrderId, status, receivedUnits: 0, message: `Purchase order already ${status}.` };
    }
    if (purchaseOrder.status === "received" || purchaseOrder.status === "cancelled") {
      throw new Error("Received and cancelled purchase orders are terminal");
    }
    const allowed = purchaseOrder.status === "draft" && (status === "sent" || status === "cancelled") || purchaseOrder.status === "sent" && (status === "confirmed" || status === "cancelled") || purchaseOrder.status === "confirmed" && status === "cancelled";
    if (!allowed) throw new Error(`Cannot move purchase order from ${purchaseOrder.status} to ${status}`);
    if (status === "cancelled" && purchaseOrder.items.some((item) => Number(item.quantityReceived || 0) > 0)) {
      throw new Error("A purchase order with received inventory cannot be cancelled");
    }
    await sudoContext.db.PurchaseOrder.updateOne({
      where: { id: purchaseOrderId },
      data: { status }
    });
    return { success: true, purchaseOrderId, status, receivedUnits: 0, message: `Purchase order moved to ${status}.` };
  }, { isolationLevel: "ReadCommitted" }));
}
async function receivePurchaseOrder(_root, { purchaseOrderId, receipts }, context) {
  await assertCanManageInventory(context);
  assertUniqueReceipts(receipts);
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    await lockPurchaseOrder(transactionContext, purchaseOrderId);
    const sudoContext = transactionContext.sudo();
    const purchaseOrder = await loadPurchaseOrder(sudoContext, purchaseOrderId, store.id);
    if (!purchaseOrder) throw new Error("Purchase order not found in active store");
    if (purchaseOrder.status === "draft" || purchaseOrder.status === "cancelled") {
      throw new Error("Only sent or confirmed purchase orders can receive inventory");
    }
    const itemsById = new Map(
      (purchaseOrder.items || []).map((item) => [item.id, item])
    );
    for (const receipt of receipts) {
      if (!itemsById.has(receipt.poItemId)) throw new Error("Receipt item does not belong to this purchase order");
    }
    const productIds = Array.from(new Set(receipts.map((receipt) => itemsById.get(receipt.poItemId).product?.id).filter(Boolean))).sort();
    for (const productId of productIds) {
      await transactionContext.prisma.$queryRawUnsafe(
        'SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE',
        productId
      );
      await transactionContext.prisma.$queryRawUnsafe(
        'SELECT "id" FROM "InventoryLot" WHERE "product" = $1 ORDER BY "id" FOR UPDATE',
        productId
      );
    }
    for (const lotNumber of receipts.map((receipt) => receipt.lotNumber.trim()).sort()) {
      await transactionContext.prisma.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext('grocery-po-lot'), hashtext($1))",
        lotNumber
      );
    }
    let receivedUnits = 0;
    const resultingTargets = /* @__PURE__ */ new Map();
    const productStock = /* @__PURE__ */ new Map();
    for (const item of purchaseOrder.items) {
      if (item.product?.id && !productStock.has(item.product.id)) {
        productStock.set(item.product.id, Number(item.product.stockQuantity || 0));
      }
    }
    for (const receipt of receipts) {
      const item = itemsById.get(receipt.poItemId);
      if (!item.product) throw new Error("Purchase order item is missing its product");
      const currentReceived = Number(item.quantityReceived || 0);
      if (receipt.targetQuantityReceived > item.quantity) {
        throw new Error(`Received quantity cannot exceed ordered quantity for ${item.product.title}`);
      }
      if (receipt.targetQuantityReceived < currentReceived) {
        throw new Error(`Received quantity cannot move backward for ${item.product.title}`);
      }
      const quantityDelta = receipt.targetQuantityReceived - item.quantityReceived;
      resultingTargets.set(item.id, receipt.targetQuantityReceived);
      if (quantityDelta === 0) continue;
      const lotNumber = receipt.lotNumber.trim();
      const existingLot = await transactionContext.prisma.inventoryLot.findUnique({
        where: { lotNumber },
        select: { id: true }
      });
      if (existingLot) throw new Error(`Inventory lot ${lotNumber} has already received inventory`);
      await sudoContext.db.InventoryLot.createOne({
        data: {
          store: { connect: { id: store.id } },
          lotNumber,
          expirationDate: new Date(receipt.expirationDate).toISOString(),
          receivedDate: (/* @__PURE__ */ new Date()).toISOString(),
          quantity: quantityDelta,
          quantityRemaining: quantityDelta,
          costPerUnit: item.unitCost,
          costPerUnitCents: Math.round(item.unitCost * 100),
          location: receipt.location?.trim() || void 0,
          product: { connect: { id: item.product.id } },
          supplier: purchaseOrder.supplier?.id ? { connect: { id: purchaseOrder.supplier.id } } : void 0
        }
      });
      const nextStock = (productStock.get(item.product.id) || 0) + quantityDelta;
      productStock.set(item.product.id, nextStock);
      await sudoContext.db.Product.updateOne({
        where: { id: item.product.id },
        data: { stockQuantity: nextStock, inStock: true }
      });
      await sudoContext.db.POItem.updateOne({
        where: { id: item.id },
        data: { quantityReceived: receipt.targetQuantityReceived }
      });
      receivedUnits += quantityDelta;
    }
    const fullyReceived = purchaseOrder.items.every(
      (item) => (resultingTargets.get(item.id) ?? Number(item.quantityReceived || 0)) === item.quantity
    );
    if (fullyReceived && purchaseOrder.status !== "received") {
      await sudoContext.db.PurchaseOrder.updateOne({
        where: { id: purchaseOrderId },
        data: {
          status: "received",
          receivedAt: purchaseOrder.receivedAt || (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    return {
      success: true,
      purchaseOrderId,
      status: fullyReceived ? "received" : purchaseOrder.status,
      receivedUnits,
      message: receivedUnits === 0 ? "Purchase order receipt was already applied." : `Received ${receivedUnits} unit${receivedUnits === 1 ? "" : "s"}.`
    };
  }, { isolationLevel: "ReadCommitted" }));
}

// features/keystone/mutations/createPurchaseOrderDraft.ts
function validateDraft(args) {
  if (args.idempotencyKey.trim().length < 12) throw new Error("A valid purchase order idempotency key is required");
  if (!args.supplierId) throw new Error("A supplier is required");
  if (!args.items.length) throw new Error("At least one purchase order item is required");
  if (new Set(args.items.map((item) => item.productId)).size !== args.items.length) {
    throw new Error("Each product may appear only once in a purchase order draft");
  }
  for (const item of args.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error("PO quantities must be positive integers");
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0 || Math.abs(item.unitCost * 100 - Math.round(item.unitCost * 100)) > 1e-8) {
      throw new Error("PO unit costs must be non-negative amounts with at most two decimal places");
    }
  }
  if (args.expectedDeliveryDate && !Number.isFinite(new Date(args.expectedDeliveryDate).getTime())) {
    throw new Error("Expected delivery date is invalid");
  }
}
async function createPurchaseOrderDraft(_root, args, context) {
  await requireFreshCapability(context, "canManageInventory");
  validateDraft(args);
  const idempotencyKey = args.idempotencyKey.trim();
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-po-draft'), hashtext('numbering'))"
    );
    const sudoContext = transactionContext.sudo();
    const existing = await sudoContext.query.PurchaseOrder.findOne({
      where: { idempotencyKey },
      query: "id poNumber status totalAmount store { id } items { id }"
    });
    if (existing && existing.store?.id !== store.id) throw new Error("Purchase order idempotency key belongs to another store");
    if (existing) {
      return {
        success: true,
        purchaseOrderId: existing.id,
        poNumber: existing.poNumber,
        status: existing.status,
        totalAmount: Number(existing.totalAmount || 0),
        itemCount: existing.items?.length || 0,
        reused: true
      };
    }
    const supplier = await tx.supplier.findUnique({
      where: { id: args.supplierId },
      select: { id: true, name: true, email: true, storeId: true }
    });
    if (!supplier || supplier.storeId !== store.id) throw new Error("Supplier not found in active store");
    const productIds = args.items.map((item) => item.productId).sort();
    for (const productId of productIds) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR SHARE', productId);
    }
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, storeId: store.id },
      select: { id: true, title: true, sku: true }
    });
    if (products.length !== productIds.length) throw new Error("One or more purchase order products were not found");
    const productsById = new Map(products.map((product) => [product.id, product]));
    const now = /* @__PURE__ */ new Date();
    const prefix = `PO-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const latest = await tx.purchaseOrder.findFirst({
      where: { poNumber: { startsWith: prefix } },
      orderBy: { poNumber: "desc" },
      select: { poNumber: true }
    });
    const latestSequence = Number.parseInt(latest?.poNumber.slice(prefix.length + 1) || "0", 10) || 0;
    const poNumber = `${prefix}-${String(latestSequence + 1).padStart(4, "0")}`;
    const totalAmountCents = args.items.reduce((sum, item) => sum + item.quantity * Math.round(item.unitCost * 100), 0);
    const totalAmount = totalAmountCents / 100;
    const purchaseOrder = await sudoContext.db.PurchaseOrder.createOne({
      data: {
        store: { connect: { id: store.id } },
        poNumber,
        idempotencyKey,
        status: "draft",
        supplierName: supplier.name,
        supplierEmail: supplier.email,
        orderDate: now.toISOString(),
        expectedDeliveryDate: args.expectedDeliveryDate ? new Date(args.expectedDeliveryDate).toISOString() : void 0,
        totalAmount,
        totalAmountCents,
        notes: args.notes?.trim() || void 0,
        supplier: { connect: { id: supplier.id } }
      }
    });
    for (const item of args.items) {
      const product = productsById.get(item.productId);
      await sudoContext.db.POItem.createOne({
        data: {
          productTitle: product.title,
          productSku: product.sku,
          quantity: item.quantity,
          unitCost: item.unitCost,
          unitCostCents: Math.round(item.unitCost * 100),
          quantityReceived: 0,
          purchaseOrder: { connect: { id: purchaseOrder.id } },
          product: { connect: { id: item.productId } }
        }
      });
    }
    return {
      success: true,
      purchaseOrderId: purchaseOrder.id,
      poNumber,
      status: "draft",
      totalAmount,
      itemCount: args.items.length,
      reused: false
    };
  }, { isolationLevel: "ReadCommitted" }));
}

// features/keystone/mutations/removePurchaseOrderDraftItem.ts
async function removePurchaseOrderDraftItem(_root, { purchaseOrderId, poItemId }, context) {
  const { storeId } = await requireFreshCapability(context, "canManageInventory");
  if (!purchaseOrderId || !poItemId) throw new Error("Purchase order and item are required");
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const sudoContext = transactionContext.sudo();
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "PurchaseOrder" WHERE "id" = $1 FOR UPDATE',
      purchaseOrderId
    );
    const purchaseOrder = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { id: true, status: true, totalAmount: true, storeId: true }
    });
    if (!purchaseOrder || purchaseOrder.storeId !== storeId) throw new Error("Purchase order not found in active store");
    if (purchaseOrder.status !== "draft") throw new Error("Only draft purchase orders can remove items");
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "POItem" WHERE "id" = $1 FOR UPDATE',
      poItemId
    );
    const items = await tx.pOItem.findMany({
      where: { purchaseOrderId },
      select: { id: true, quantity: true, unitCost: true, unitCostCents: true },
      orderBy: { id: "asc" }
    });
    const item = items.find((candidate) => candidate.id === poItemId);
    if (!item) {
      return {
        success: true,
        purchaseOrderId,
        removedItemId: poItemId,
        itemCount: items.length,
        totalAmount: Number(purchaseOrder.totalAmount || 0),
        reused: true
      };
    }
    if (items.length <= 1) throw new Error("Purchase order drafts must retain at least one item");
    const remainingItems = items.filter((candidate) => candidate.id !== poItemId);
    const totalAmountCents = remainingItems.reduce(
      (sum, candidate) => sum + candidate.quantity * candidate.unitCostCents,
      0
    );
    const totalAmount = totalAmountCents / 100;
    await sudoContext.db.POItem.deleteOne({ where: { id: poItemId } });
    await sudoContext.db.PurchaseOrder.updateOne({
      where: { id: purchaseOrderId },
      data: { totalAmount, totalAmountCents }
    });
    return {
      success: true,
      purchaseOrderId,
      removedItemId: poItemId,
      itemCount: remainingItems.length,
      totalAmount,
      reused: false
    };
  }, { isolationLevel: "ReadCommitted" }));
}

// features/keystone/mutations/adjustInventoryLot.ts
var REASONS = /* @__PURE__ */ new Set(["cycle_count", "damage", "spoilage", "correction"]);
async function adjustInventoryLot(_root, args, context) {
  const { storeId } = await requireFreshCapability(context, "canManageInventory");
  if (!Number.isInteger(args.targetQuantityRemaining) || args.targetQuantityRemaining < 0) {
    throw new Error("Target remaining quantity must be a non-negative integer");
  }
  if (!REASONS.has(args.reason)) throw new Error("Unsupported inventory adjustment reason");
  if (args.idempotencyKey.trim().length < 12) throw new Error("A valid inventory adjustment idempotency key is required");
  const idempotencyKey = args.idempotencyKey.trim();
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-inventory-adjustment'), hashtext($1))",
      idempotencyKey
    );
    const existing = await tx.inventoryAdjustment.findUnique({ where: { idempotencyKey } });
    if (existing && existing.storeId !== storeId) throw new Error("Inventory adjustment idempotency key belongs to another store");
    if (existing) {
      return {
        success: true,
        adjustmentId: existing.id,
        inventoryLotId: existing.inventoryLotId,
        productId: existing.productId,
        quantityDelta: existing.quantityDelta,
        quantityRemaining: existing.quantityAfter,
        productStock: existing.productStockAfter,
        reused: true
      };
    }
    await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', args.inventoryLotId);
    const lot = await tx.inventoryLot.findUnique({
      where: { id: args.inventoryLotId },
      select: { id: true, quantity: true, quantityRemaining: true, productId: true, storeId: true }
    });
    if (!lot || lot.storeId !== storeId) throw new Error("Inventory lot not found in active store");
    if (!lot?.productId) throw new Error("Inventory lot or related product not found");
    const activeAllocations = await tx.orderLineInventoryAllocation.count({
      where: {
        inventoryLotId: lot.id,
        lineItem: { order: { status: { notIn: ["delivered", "cancelled"] } } }
      }
    });
    if (activeAllocations > 0) {
      throw new Error("Inventory lots reserved by active orders must be released or fulfilled before adjustment");
    }
    await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', lot.productId);
    const product = await tx.product.findUnique({
      where: { id: lot.productId },
      select: { id: true, stockQuantity: true }
    });
    if (!product) throw new Error("Inventory product not found");
    if (args.targetQuantityRemaining > lot.quantity) {
      throw new Error("Target remaining quantity cannot exceed the received lot quantity");
    }
    const quantityBefore = lot.quantityRemaining;
    const quantityDelta = args.targetQuantityRemaining - quantityBefore;
    const productStockBefore = Number(product.stockQuantity || 0);
    const productStockAfter = productStockBefore + quantityDelta;
    if (productStockAfter < 0) throw new Error("Inventory adjustment would make product stock negative");
    const sudoContext = transactionContext.sudo();
    await sudoContext.db.InventoryLot.updateOne({
      where: { id: lot.id },
      data: { quantityRemaining: args.targetQuantityRemaining }
    });
    await sudoContext.db.Product.updateOne({
      where: { id: product.id },
      data: { stockQuantity: productStockAfter, inStock: productStockAfter > 0 }
    });
    const adjustment = await sudoContext.db.InventoryAdjustment.createOne({
      data: {
        idempotencyKey,
        reason: args.reason,
        quantityBefore,
        quantityAfter: args.targetQuantityRemaining,
        quantityDelta,
        productStockBefore,
        productStockAfter,
        note: args.note?.trim() || void 0,
        store: { connect: { id: storeId } },
        product: { connect: { id: product.id } },
        inventoryLot: { connect: { id: lot.id } },
        adjustedBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0
      }
    });
    return {
      success: true,
      adjustmentId: adjustment.id,
      inventoryLotId: lot.id,
      productId: product.id,
      quantityDelta,
      quantityRemaining: args.targetQuantityRemaining,
      productStock: productStockAfter,
      reused: false
    };
  }, { isolationLevel: "ReadCommitted" }));
}

// features/keystone/mutations/manageOrderFulfillment.ts
var NEXT_STATUS = {
  pending: "picking",
  picking: "packed"
};
async function assertCanManageOrders(context) {
  return requireFreshCapability(context, "canManageOrders");
}
async function advanceOrderFulfillment(_root, { orderId, target }, context) {
  const { storeId } = await assertCanManageOrders(context);
  if (!["picking", "packed", "ready_for_pickup"].includes(target)) {
    throw new Error("Unsupported fulfillment target");
  }
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE',
      orderId
    );
    const sudoContext = transactionContext.sudo();
    const order = await sudoContext.query.Order.findOne({
      where: { id: orderId },
      query: `
        id displayId status metadata substitutionPreference store { id } deliveryRoute { id }
        lineItems {
          id metadata
          substitutions(orderBy: { createdAt: desc }, take: 1) { customerApproved }
        }
      `
    });
    if (!order || order.store?.id !== storeId) throw new Error("Order not found in active store");
    if (order.deliveryRoute?.id) {
      throw new Error("Routed orders advance through the delivery route workflow");
    }
    const metadata = order.metadata || {};
    const fulfillmentMethod = metadata.fulfillmentMethod === "pickup" ? "pickup" : "delivery";
    const isReadyRetry = target === "ready_for_pickup" && metadata.readyForPickup === true;
    if (order.status === target || isReadyRetry) {
      return {
        success: true,
        orderId,
        status: order.status,
        stage: target,
        reused: true,
        message: "Fulfillment transition was already applied."
      };
    }
    const expectedTarget = order.status === "packed" && fulfillmentMethod === "pickup" ? "ready_for_pickup" : NEXT_STATUS[order.status];
    if (target !== expectedTarget) {
      throw new Error(`Cannot move fulfillment from ${order.status} to ${target}`);
    }
    if (target === "packed") {
      const unresolved = (order.lineItems || []).some((lineItem) => {
        const linePreference = lineItem.metadata?.substitutionPreference;
        const requiresApproval = linePreference === "contact" || order.substitutionPreference === "call_me";
        return requiresApproval && lineItem.substitutions?.length && lineItem.substitutions[0].customerApproved !== true;
      });
      if (unresolved) {
        throw new Error("Customer approval is required before packing substituted items");
      }
    }
    const settledPayments = await sudoContext.query.Payment.findMany({
      where: {
        order: { id: { equals: orderId } },
        status: { in: ["succeeded", "partially_refunded"] }
      },
      take: 1,
      query: "id"
    });
    if (!settledPayments.length) {
      throw new Error("Order fulfillment requires a succeeded payment");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const nextMetadata = {
      ...metadata,
      ...target === "picking" ? { pickingStartedAt: now } : {},
      ...target === "packed" ? { packedAt: now } : {},
      ...target === "ready_for_pickup" ? { readyForPickup: true, pickupReadyAt: now } : {}
    };
    const nextStatus = target === "ready_for_pickup" ? "packed" : target;
    await sudoContext.db.Order.updateOne({
      where: { id: orderId },
      data: { status: nextStatus, metadata: nextMetadata }
    });
    return {
      success: true,
      orderId,
      status: nextStatus,
      stage: target,
      reused: false,
      message: target === "ready_for_pickup" ? `Order #${order.displayId} is ready for pickup.` : `Order #${order.displayId} moved to ${target}.`
    };
  }, { isolationLevel: "ReadCommitted" }));
}

// features/keystone/mutations/cancelOrder.ts
function hasOutstandingSettledPayment(statuses) {
  return statuses.some((status) => status === "succeeded" || status === "partially_refunded");
}
async function cancelGroceryOrder(_root, { orderId, reason, idempotencyKey }, context) {
  await requireFreshCapability(context, "canManageOrders");
  const store = await requireSessionStore(context);
  const normalizedReason = reason.trim();
  const normalizedKey = idempotencyKey.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) throw new Error("Cancellation reason must be between 3 and 500 characters");
  if (normalizedKey.length < 12) throw new Error("Cancellation idempotency key is required");
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { select: { status: true } },
        lineItems: {
          select: {
            id: true,
            quantity: true,
            productId: true,
            inventoryLotId: true,
            inventoryAllocations: { select: { id: true, inventoryLotId: true, quantity: true } }
          }
        }
      }
    });
    if (!order || order.storeId !== store.id) throw new Error("Order not found in active store");
    const cancellation = order.metadata?.cancellation;
    if (order.status === "cancelled") {
      if (cancellation?.idempotencyKey !== normalizedKey) throw new Error("Order was already cancelled by another operation");
      return { success: true, orderId, status: "cancelled", reused: true };
    }
    if (order.deliveryRouteId || order.status === "out_for_delivery" || order.status === "delivered") {
      throw new Error("Dispatched or delivered orders cannot be cancelled");
    }
    if (!["pending", "picking", "packed"].includes(order.status)) throw new Error(`Order status ${order.status} cannot be cancelled`);
    if (hasOutstandingSettledPayment(order.payments.map((payment) => payment.status))) {
      throw new Error("Settled payments must be fully refunded through the refund workflow before cancelling the order");
    }
    const productIds = Array.from(new Set(order.lineItems.flatMap((line) => line.productId ? [line.productId] : []))).sort();
    const lotIds = Array.from(new Set(order.lineItems.flatMap((line) => {
      const allocated = line.inventoryAllocations.map((allocation) => allocation.inventoryLotId);
      return allocated.length ? allocated : line.inventoryLotId ? [line.inventoryLotId] : [];
    }))).sort();
    for (const productId of productIds) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
    for (const lotId of lotIds) await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
    if (order.deliverySlotId) await tx.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id" = $1 FOR UPDATE', order.deliverySlotId);
    if (order.pickupSlotId) await tx.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', order.pickupSlotId);
    const couponId = typeof order.metadata?.coupon?.id === "string" ? order.metadata.coupon.id : null;
    if (couponId) await tx.$queryRawUnsafe('SELECT "id" FROM "Coupon" WHERE "id" = $1 FOR UPDATE', couponId);
    for (const line of order.lineItems) {
      if (line.productId) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQuantity: { increment: line.quantity }, inStock: true }
        });
      }
      const allocations = line.inventoryAllocations.length ? line.inventoryAllocations : line.inventoryLotId ? [{ id: "", inventoryLotId: line.inventoryLotId, quantity: line.quantity }] : [];
      for (const allocation of allocations) {
        await tx.inventoryLot.update({ where: { id: allocation.inventoryLotId }, data: { quantityRemaining: { increment: allocation.quantity } } });
      }
      if (line.inventoryAllocations.length) {
        await tx.orderLineInventoryAllocation.deleteMany({ where: { lineItemId: line.id } });
      }
      if (line.inventoryLotId) await tx.orderLineItem.update({ where: { id: line.id }, data: { inventoryLotId: null } });
    }
    if (order.deliverySlotId) {
      const slot = await tx.deliverySlot.findUnique({ where: { id: order.deliverySlotId }, select: { currentBookings: true } });
      await tx.deliverySlot.update({ where: { id: order.deliverySlotId }, data: { currentBookings: Math.max(0, Number(slot?.currentBookings || 0) - 1) } });
    }
    if (order.pickupSlotId) {
      const slot = await tx.pickupSlot.findUnique({ where: { id: order.pickupSlotId }, select: { currentOrders: true, maxOrders: true, isActive: true } });
      const nextOrders = Math.max(0, Number(slot?.currentOrders || 0) - 1);
      await tx.pickupSlot.update({
        where: { id: order.pickupSlotId },
        data: { currentOrders: nextOrders, isAvailable: Boolean(slot?.isActive) && nextOrders < Number(slot?.maxOrders || 0) }
      });
    }
    const parkingSpotId = typeof order.metadata?.parkingSpotId === "string" ? order.metadata.parkingSpotId : null;
    if (parkingSpotId) {
      const spot = await tx.parkingSpot.findUnique({ where: { id: parkingSpotId }, select: { storeId: true } });
      if (spot?.storeId === store.id) await tx.parkingSpot.update({ where: { id: parkingSpotId }, data: { isAvailable: true } });
    }
    if (couponId) {
      const coupon = await tx.coupon.findUnique({ where: { id: couponId }, select: { storeId: true, currentUses: true } });
      if (coupon?.storeId === store.id) {
        await tx.coupon.update({ where: { id: couponId }, data: { currentUses: Math.max(0, Number(coupon.currentUses || 0) - 1) } });
      }
    }
    const cancelledAt = /* @__PURE__ */ new Date();
    const metadata = {
      ...order.metadata || {},
      cancellation: {
        idempotencyKey: normalizedKey,
        reason: normalizedReason,
        cancelledBy: context.session?.itemId,
        cancelledAt: cancelledAt.toISOString(),
        inventoryRestored: true,
        fulfillmentCapacityReleased: true,
        couponRedemptionReleased: Boolean(couponId)
      }
    };
    await tx.order.update({ where: { id: orderId }, data: { status: "cancelled", canceledAt: cancelledAt, metadata } });
    await enqueueGroceryOutboxEvent(tx, {
      storeId: store.id,
      eventKey: `order.cancelled:${orderId}:${normalizedKey}`,
      eventType: "order.cancelled",
      aggregateType: "Order",
      aggregateId: orderId,
      occurredAt: cancelledAt.toISOString(),
      payload: { orderId, reason: normalizedReason, idempotencyKey: normalizedKey, inventoryRestored: true, fulfillmentCapacityReleased: true, couponRedemptionReleased: Boolean(couponId) }
    });
    return { success: true, orderId, status: "cancelled", reused: false };
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/reconcileCheckoutAttempts.ts
function isSettled(status) {
  return status === "succeeded" || status === "captured";
}
async function reconcileCheckoutAttempts(_root, { limit = 20 }, context) {
  await requireFreshCapability(context, "canManageOrders");
  const store = await requireSessionStore(context);
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit))));
  const attempts = await context.prisma.checkoutAttempt.findMany({
    where: { storeId: store.id, status: { in: ["pending", "settled_pending_finalize", "finalizing", "compensation_required", "compensation_processing"] } },
    orderBy: { updatedAt: "asc" },
    take: boundedLimit,
    select: {
      id: true,
      status: true,
      providerCode: true
    }
  });
  const results = [];
  for (const attempt of attempts) {
    const provider = await context.prisma.paymentProvider.findUnique({
      where: { code: attempt.providerCode },
      select: { id: true, code: true, isInstalled: true, metadata: true }
    });
    if (!provider?.isInstalled) continue;
    const action = attempt.status === "compensation_required" || attempt.status === "compensation_processing" ? "compensate" : "finalize";
    const lease = await context.transaction(async (transactionContext) => claimCheckoutAttempt(transactionContext.prisma, attempt.id, action));
    if (!lease) continue;
    if (action === "compensate") {
      const compensation = await compensateFailedCheckout({
        context,
        attemptId: lease.id,
        provider,
        cause: new Error("Checkout compensation recovery"),
        compensationLease: lease
      });
      if (compensation.claimed) results.push({ id: lease.id, status: compensation.status, orderId: lease.orderId, action: "compensation" });
      continue;
    }
    const paymentStatus = await getPaymentStatus({ provider, paymentId: lease.providerPaymentId });
    if (!isSettled(String(paymentStatus?.status || ""))) {
      await context.transaction(async (transactionContext) => releaseCheckoutAttemptLease(
        transactionContext.prisma,
        lease,
        "pending"
      ));
      continue;
    }
    const amountCents = Number(paymentStatus?.amount || lease.amountCents);
    const currency = String(paymentStatus?.currency || lease.currencyCode).toLowerCase();
    if (!Number.isInteger(amountCents) || amountCents !== lease.amountCents || currency !== lease.currencyCode.toLowerCase()) {
      await context.transaction(async (transactionContext) => {
        const session = await transactionContext.prisma.paymentSession.findUnique({
          where: { id: lease.paymentSessionId },
          select: { data: true }
        });
        const { clientSecret: _discardedClientSecret, ...evidence } = session?.data || {};
        await transactionContext.prisma.paymentSession.update({
          where: { id: lease.paymentSessionId },
          data: {
            data: {
              ...evidence,
              compensationFullRefund: true,
              settlementMismatch: {
                expectedAmountCents: lease.amountCents,
                observedAmountCents: Number.isInteger(amountCents) ? amountCents : null,
                expectedCurrency: lease.currencyCode.toLowerCase(),
                observedCurrency: currency
              }
            }
          }
        });
      });
      const compensation = await compensateFailedCheckout({
        context,
        attemptId: lease.id,
        provider,
        cause: new Error("Provider settlement amount or currency did not match durable checkout attempt"),
        finalizationLease: lease,
        forceFullRefund: true
      });
      if (compensation.claimed) results.push({ id: lease.id, status: compensation.status, orderId: lease.orderId, action: "mismatch_compensation" });
      continue;
    }
    const request = lease.requestData;
    try {
      const committed = await commitGroceryOrder(
        request,
        context,
        { providerCode: lease.providerCode, providerPaymentId: lease.providerPaymentId, status: String(paymentStatus.status), amountCents, currency },
        lease.id,
        lease.cartCustomerId,
        lease
      );
      results.push({ id: lease.id, status: "finalized", orderId: committed.orderId, action: "finalize" });
    } catch (error) {
      const compensation = await compensateFailedCheckout({
        context,
        attemptId: lease.id,
        provider,
        cause: error,
        finalizationLease: lease
      });
      if (compensation.claimed) results.push({ id: lease.id, status: compensation.status, orderId: lease.orderId, action: "compensation" });
    }
  }
  return { processed: results.length, results };
}

// features/keystone/mutations/reconcilePaymentRefunds.ts
var import_node_crypto7 = require("node:crypto");
var REFUND_RECONCILIATION_LEASE_MS = 3e4;
var REFUND_RECONCILIATION_MAX_ATTEMPTS = 5;
var DEFAULT_PROVIDER_TIMEOUT_MS = 1e4;
function providerResultStatus(result) {
  const status = String(result?.status || "").toLowerCase();
  if (status === "succeeded" || status === "paid") return "succeeded";
  if (status === "pending" || status === "processing") return "processing";
  if (status === "canceled" || status === "cancelled") return "canceled";
  return "failed";
}
function retryDelayMs(attempts) {
  return Math.min(5 * 6e4, 1e4 * 2 ** Math.max(0, attempts - 1));
}
async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Payment provider reconciliation timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function claimNextRefund(context, owner, storeId) {
  const token = (0, import_node_crypto7.randomUUID)();
  const rows = await context.prisma.$queryRawUnsafe(
    `WITH candidate AS (
       SELECT r."id"
       FROM "PaymentRefund" r
       WHERE r."status" = 'processing'
         AND r."reconciliationDeadLetterAt" IS NULL
         AND (r."reconciliationNextAttemptAt" IS NULL OR r."reconciliationNextAttemptAt" <= NOW())
         AND (r."reconciliationLeaseExpiresAt" IS NULL OR r."reconciliationLeaseExpiresAt" <= NOW())
         AND EXISTS (SELECT 1 FROM "Payment" scoped_payment WHERE scoped_payment."id" = r."payment" AND scoped_payment."store" = $4)
       ORDER BY r."updatedAt", r."id"
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE "PaymentRefund" r
     SET "reconciliationOwner" = $1,
         "reconciliationToken" = $2,
         "reconciliationLeaseExpiresAt" = NOW() + ($3 * INTERVAL '1 millisecond'),
         "reconciliationAttempts" = r."reconciliationAttempts" + 1,
         "reconciliationLastError" = NULL
     FROM candidate c, "Payment" p, "PaymentProvider" pp
     WHERE r."id" = c."id" AND p."id" = r."payment" AND pp."id" = p."paymentProvider"
     RETURNING r."id", r."payment" AS "paymentId", p."store" AS "storeId", r."providerCode",
       r."providerPaymentId", r."amountCents", r."idempotencyKey", r."reconciliationAttempts" AS "attempts",
       pp."id" AS "providerId", pp."code" AS "providerProviderCode", pp."isInstalled" AS "providerInstalled", pp."metadata" AS "providerMetadata"`,
    owner,
    token,
    REFUND_RECONCILIATION_LEASE_MS,
    storeId
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    paymentId: row.paymentId,
    storeId: row.storeId,
    providerCode: row.providerCode,
    providerPaymentId: row.providerPaymentId,
    amountCents: Number(row.amountCents),
    idempotencyKey: row.idempotencyKey,
    provider: { id: row.providerId, code: row.providerProviderCode, isInstalled: row.providerInstalled, metadata: row.providerMetadata },
    owner,
    token,
    attempts: Number(row.attempts)
  };
}
async function releaseForRetry(context, claim, message) {
  const deadLetter = claim.attempts >= REFUND_RECONCILIATION_MAX_ATTEMPTS;
  await context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', claim.id);
    const current = await tx.paymentRefund.findUnique({ where: { id: claim.id }, select: { reconciliationOwner: true, reconciliationToken: true, status: true } });
    if (current?.status !== "processing" || current.reconciliationOwner !== claim.owner || current.reconciliationToken !== claim.token) return;
    await tx.paymentRefund.update({
      where: { id: claim.id },
      data: {
        reconciliationOwner: null,
        reconciliationToken: null,
        reconciliationLeaseExpiresAt: null,
        reconciliationNextAttemptAt: deadLetter ? null : new Date(Date.now() + retryDelayMs(claim.attempts)),
        reconciliationDeadLetterAt: deadLetter ? /* @__PURE__ */ new Date() : null,
        reconciliationLastError: message,
        failureMessage: deadLetter ? `Refund reconciliation dead-lettered after ${claim.attempts} attempts` : void 0
      }
    });
  });
  return deadLetter ? "dead_letter" : "retry";
}
async function completeClaim(context, claim, response) {
  const status = providerResultStatus(response);
  const providerRefundId = response?.data?.id || response?.id || null;
  if (response?.amount !== void 0 && Number(response.amount) !== claim.amountCents) {
    return releaseForRetry(context, claim, "Payment provider returned a mismatched refund amount");
  }
  if (response?.currency && String(response.currency).toLowerCase() !== "usd") {
    return releaseForRetry(context, claim, "Payment provider returned a mismatched refund currency");
  }
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', claim.id);
    const refund = await tx.paymentRefund.findUnique({ where: { id: claim.id } });
    if (!refund || refund.status !== "processing" || refund.reconciliationOwner !== claim.owner || refund.reconciliationToken !== claim.token) return "fenced";
    if (status === "processing") {
      await tx.paymentRefund.update({ where: { id: claim.id }, data: { reconciliationOwner: null, reconciliationToken: null, reconciliationLeaseExpiresAt: null, reconciliationNextAttemptAt: new Date(Date.now() + retryDelayMs(claim.attempts)), reconciliationLastError: "Provider still reports processing", providerStatus: "processing" } });
      return "retry";
    }
    await tx.paymentRefund.update({
      where: { id: claim.id },
      data: {
        status,
        providerRefundId,
        providerStatus: String(response?.status || status).toLowerCase(),
        providerData: response?.data || response || {},
        processedAt: /* @__PURE__ */ new Date(),
        failureMessage: status === "failed" ? "Provider reported refund failure" : status === "canceled" ? "Provider canceled refund" : "",
        reconciliationOwner: null,
        reconciliationToken: null,
        reconciliationLeaseExpiresAt: null,
        reconciliationNextAttemptAt: null,
        reconciliationLastError: null
      }
    });
    if (status === "succeeded") {
      const aggregate = await tx.paymentRefund.aggregate({ where: { paymentId: claim.paymentId, status: "succeeded" }, _sum: { amountCents: true } });
      const refundedCents = Number(aggregate._sum.amountCents || 0);
      const payment = await tx.payment.findUnique({ where: { id: claim.paymentId }, select: { amountCents: true, status: true, providerData: true } });
      const paymentCents = Number(payment?.amountCents || 0);
      await tx.payment.update({ where: { id: claim.paymentId }, data: { status: refundedCents >= paymentCents ? "refunded" : "partially_refunded", providerRefundId: providerRefundId || void 0, providerData: { ...payment?.providerData || {}, lastRefundId: providerRefundId, refundedAmountCents: refundedCents } } });
      await enqueueGroceryOutboxEvent(tx, { storeId: claim.storeId, eventKey: `payment-refund:${claim.id}:completed:v1`, eventType: "payment.refunded", aggregateType: "payment", aggregateId: claim.paymentId, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { paymentId: claim.paymentId, refundId: claim.id, amountCents: claim.amountCents, cumulativeRefundedCents: refundedCents, providerCode: claim.providerCode, providerPaymentId: claim.providerPaymentId, providerRefundId } });
    }
    return status;
  }, { isolationLevel: "Serializable" }));
}
async function runRefundReconciliationOnce(context, { limit = 20, owner }) {
  await requireFreshCapability(context, "canManagePayments");
  const store = await requireSessionStore(context);
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit))));
  const results = [];
  for (let index = 0; index < boundedLimit; index += 1) {
    const claim = await claimNextRefund(context, owner, store.id);
    if (!claim) break;
    if (!claim.provider.isInstalled) {
      results.push({ refundId: claim.id, status: await releaseForRetry(context, claim, "Refund provider is unavailable") });
      continue;
    }
    try {
      const providerTimeoutMs = Math.max(25, Number(process.env.REFUND_RECONCILIATION_PROVIDER_TIMEOUT_MS || DEFAULT_PROVIDER_TIMEOUT_MS));
      const response = await withTimeout(refundPayment({ provider: claim.provider, paymentId: claim.providerPaymentId, amount: claim.amountCents, idempotencyKey: claim.idempotencyKey }), providerTimeoutMs);
      results.push({ refundId: claim.id, status: await completeClaim(context, claim, response) });
    } catch (error) {
      results.push({ refundId: claim.id, status: await releaseForRetry(context, claim, error instanceof Error ? error.message : "Refund provider failed") });
    }
  }
  return { scanned: results.length, results };
}
async function reconcilePaymentRefunds(_root, { limit = 20 }, context) {
  return runRefundReconciliationOnce(context, { limit, owner: `manual:${context.session?.itemId || "unknown"}` });
}

// features/keystone/mutations/updateSupplierMinimumOrder.ts
async function updateSupplierMinimumOrder(_root, { supplierId, minimumOrderCents }, context) {
  await requireFreshCapability(context, "canManageSuppliers");
  const store = await requireSessionStore(context);
  if (!Number.isInteger(minimumOrderCents) || minimumOrderCents < 0) throw new Error("Minimum order must be a non-negative integer number of cents");
  return context.transaction(async (transactionContext) => {
    const supplier = await transactionContext.prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, storeId: true } });
    if (!supplier || supplier.storeId !== store.id) throw new Error("Supplier not found in active store");
    const updated = await transactionContext.prisma.supplier.update({ where: { id: supplier.id }, data: { minimumOrderCents, minimumOrder: minimumOrderCents / 100 }, select: { id: true, minimumOrder: true, minimumOrderCents: true } });
    return { success: true, ...updated };
  });
}

// features/keystone/mutations/manageOrderSubstitution.ts
function normalize(args) {
  const orderItemId = args.orderItemId.trim();
  const substitutedProduct = args.substitutedProduct.trim();
  const reason = args.reason?.trim() || "";
  const idempotencyKey = args.idempotencyKey.trim();
  if (!orderItemId) throw new Error("Order line item is required");
  if (!substitutedProduct || substitutedProduct.length > 200) {
    throw new Error("A substitution product snapshot between 1 and 200 characters is required");
  }
  if (substitutedProduct.toUpperCase() === "REMOVED") {
    throw new Error("Removed items require a refund operation before substitution evidence can be recorded");
  }
  if (reason.length > 1e3) throw new Error("Substitution reason cannot exceed 1000 characters");
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new Error("A valid substitution idempotency key is required");
  }
  return {
    orderItemId,
    substitutedProduct,
    reason,
    customerApproved: Boolean(args.customerApproved),
    idempotencyKey
  };
}
async function recordOrderItemSubstitution(_root, rawArgs, context) {
  await requireFreshCapability(context, "canManageOrders");
  const args = normalize(rawArgs);
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "OrderLineItem" WHERE "id" = $1 FOR UPDATE',
      args.orderItemId
    );
    const sudoContext = transactionContext.sudo();
    const lineItem = await sudoContext.query.OrderLineItem.findOne({
      where: { id: args.orderItemId },
      query: "id title order { id }"
    });
    if (!lineItem?.order?.id) throw new Error("Order line item not found");
    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE',
      lineItem.order.id
    );
    const order = await sudoContext.query.Order.findOne({
      where: { id: lineItem.order.id },
      query: "id status store { id }"
    });
    if (!order || order.store?.id !== store.id) throw new Error("Order not found in active store");
    if (order.status !== "picking") {
      throw new Error("Substitutions can only be recorded while an order is picking");
    }
    const settledPayment = await sudoContext.query.Payment.findMany({
      where: {
        order: { id: { equals: order.id } },
        status: { equals: "succeeded" }
      },
      take: 1,
      query: "id"
    });
    if (!settledPayment.length) throw new Error("Substitution requires a succeeded payment");
    const existing = (await sudoContext.query.OrderItemSubstitution.findMany({
      where: { idempotencyKey: { equals: args.idempotencyKey } },
      take: 1,
      query: "id orderItem originalProduct substitutedProduct reason customerApproved approvedAt createdAt lineItem { id } recordedBy { id }"
    }))[0];
    if (existing) {
      const matches = existing.lineItem?.id === args.orderItemId && existing.orderItem === args.orderItemId && existing.substitutedProduct === args.substitutedProduct && (existing.reason || "") === args.reason && Boolean(existing.customerApproved) === args.customerApproved;
      if (!matches) {
        throw new Error("Substitution idempotency key was reused with different substitution input");
      }
      await enqueueGroceryOutboxEvent(transactionContext.prisma, {
        storeId: store.id,
        eventKey: `substitution:${args.idempotencyKey}:recorded:v1`,
        eventType: "substitution.recorded",
        aggregateType: "order_line_item",
        aggregateId: args.orderItemId,
        occurredAt: new Date(existing.createdAt).toISOString(),
        payload: {
          substitutionId: existing.id,
          orderId: order.id,
          orderItemId: args.orderItemId,
          originalProduct: existing.originalProduct,
          substitutedProduct: existing.substitutedProduct,
          reason: existing.reason || "",
          customerApproved: Boolean(existing.customerApproved),
          approvedAt: existing.approvedAt ? new Date(existing.approvedAt).toISOString() : null,
          recordedById: existing.recordedBy?.id || null
        }
      });
      return {
        success: true,
        substitutionId: existing.id,
        orderItemId: args.orderItemId,
        customerApproved: Boolean(existing.customerApproved),
        approvedAt: existing.approvedAt || null,
        reused: true
      };
    }
    const substitution = await sudoContext.db.OrderItemSubstitution.createOne({
      data: {
        idempotencyKey: args.idempotencyKey,
        orderItem: args.orderItemId,
        lineItem: { connect: { id: args.orderItemId } },
        recordedBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0,
        originalProduct: lineItem.title,
        substitutedProduct: args.substitutedProduct,
        reason: args.reason,
        customerApproved: args.customerApproved
      }
    });
    await enqueueGroceryOutboxEvent(transactionContext.prisma, {
      storeId: store.id,
      eventKey: `substitution:${args.idempotencyKey}:recorded:v1`,
      eventType: "substitution.recorded",
      aggregateType: "order_line_item",
      aggregateId: args.orderItemId,
      occurredAt: new Date(substitution.createdAt).toISOString(),
      payload: {
        substitutionId: substitution.id,
        orderId: order.id,
        orderItemId: args.orderItemId,
        originalProduct: lineItem.title,
        substitutedProduct: args.substitutedProduct,
        reason: args.reason,
        customerApproved: args.customerApproved,
        approvedAt: substitution.approvedAt ? new Date(substitution.approvedAt).toISOString() : null,
        recordedById: context.session?.itemId || null
      }
    });
    if (process.env.GROCERY_SUBSTITUTION_ROLLBACK_PROOF === args.idempotencyKey) {
      throw new Error("Injected substitution rollback proof");
    }
    return {
      success: true,
      substitutionId: substitution.id,
      orderItemId: args.orderItemId,
      customerApproved: args.customerApproved,
      approvedAt: substitution.approvedAt ? new Date(substitution.approvedAt).toISOString() : null,
      reused: false
    };
  }, { isolationLevel: "ReadCommitted" }));
}

// features/keystone/mutations/managePaymentRefund.ts
function normalizeRefundRequest(args) {
  const paymentId = args.paymentId.trim();
  const idempotencyKey = args.idempotencyKey.trim();
  const amountCents = Number(args.amountCents);
  const reason = args.reason.trim();
  if (!paymentId) throw new Error("Payment is required");
  if (!Number.isInteger(amountCents) || amountCents < 1) throw new Error("Refund amount must be a positive integer number of cents");
  if (reason.length < 3 || reason.length > 500) throw new Error("A refund reason between 3 and 500 characters is required");
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new Error("A valid refund idempotency key is required");
  return { paymentId, amountCents, reason, idempotencyKey };
}
function centsToDollars(cents) {
  return (cents / 100).toFixed(2);
}
function providerResultStatus2(result) {
  const status = String(result?.status || "").toLowerCase();
  if (status === "succeeded" || status === "paid") return "succeeded";
  if (status === "pending" || status === "processing") return "processing";
  if (status === "canceled" || status === "cancelled") return "canceled";
  return "failed";
}
function refundResult(claim, status, providerRefundId, reused, message) {
  return {
    success: status === "succeeded",
    refundId: claim.refundId,
    paymentId: claim.paymentId,
    amountCents: claim.amountCents,
    status,
    providerRefundId,
    reused,
    message
  };
}
async function refundPaymentForOrder(_root, rawArgs, context) {
  await requireFreshCapability(context, "canManagePayments");
  const args = normalizeRefundRequest(rawArgs);
  const store = await requireSessionStore(context);
  const claim = await withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const payment = await tx.payment.findUnique({
      where: { id: args.paymentId },
      select: {
        id: true,
        amount: true,
        amountCents: true,
        status: true,
        storeId: true,
        providerPaymentId: true,
        paymentProvider: { select: { id: true, code: true, isInstalled: true } }
      }
    });
    if (!payment || payment.storeId !== store.id) throw new Error("Payment not found in active store");
    if (!payment.providerPaymentId || !payment.paymentProvider?.isInstalled) throw new Error("Payment provider settlement is unavailable");
    if (!["succeeded", "partially_refunded", "refunded"].includes(payment.status)) {
      throw new Error(`Only settled payments can be refunded: ${payment.status}`);
    }
    const paymentCents = Number(payment.amountCents || Math.round(Number(payment.amount) * 100));
    let existing = await tx.paymentRefund.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (existing) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', existing.id);
      existing = await tx.paymentRefund.findUnique({ where: { id: existing.id } });
      if (!existing) throw new Error("Refund evidence disappeared during claim");
      if (existing.paymentId !== payment.id || existing.amountCents !== args.amountCents || existing.providerData?.requestReason !== args.reason) {
        throw new Error("Refund idempotency key was reused with different payment, amount, or reason");
      }
      if (existing.status === "succeeded") {
        return {
          refundId: existing.id,
          paymentId: payment.id,
          storeId: store.id,
          provider: payment.paymentProvider,
          providerPaymentId: payment.providerPaymentId,
          amountCents: existing.amountCents,
          currencyCode: "usd",
          idempotencyKey: args.idempotencyKey,
          requestedAt: existing.requestedAt,
          status: existing.status,
          providerRefundId: existing.providerRefundId || null,
          reused: true,
          executeProvider: false
        };
      }
      const stale = existing.status === "processing" && Date.now() - new Date(existing.updatedAt).getTime() > 5 * 60 * 1e3;
      const shouldExecuteProvider = existing.status === "failed" || existing.status === "canceled" || stale;
      if (shouldExecuteProvider) {
        await tx.paymentRefund.update({
          where: { id: existing.id },
          data: {
            status: "processing",
            failureMessage: "",
            reconciliationOwner: null,
            reconciliationToken: null,
            reconciliationLeaseExpiresAt: null,
            reconciliationDeadLetterAt: null,
            reconciliationLastError: null
          }
        });
      }
      return {
        refundId: existing.id,
        paymentId: payment.id,
        storeId: store.id,
        provider: payment.paymentProvider,
        providerPaymentId: payment.providerPaymentId,
        amountCents: existing.amountCents,
        currencyCode: "usd",
        idempotencyKey: args.idempotencyKey,
        requestedAt: existing.requestedAt,
        status: "processing",
        providerRefundId: existing.providerRefundId || null,
        reused: true,
        executeProvider: shouldExecuteProvider
      };
    }
    const reserved = await tx.paymentRefund.aggregate({
      where: { paymentId: payment.id, status: { in: ["processing", "succeeded"] } },
      _sum: { amountCents: true }
    });
    const reservedCents = reserved._sum.amountCents || 0;
    if (reservedCents + args.amountCents > paymentCents) {
      throw new Error("Cumulative refund amount cannot exceed the settled payment");
    }
    const created = await tx.paymentRefund.create({
      data: {
        idempotencyKey: args.idempotencyKey,
        amount: centsToDollars(args.amountCents),
        amountCents: args.amountCents,
        status: "processing",
        providerCode: payment.paymentProvider.code,
        providerPaymentId: payment.providerPaymentId,
        requestedAt: /* @__PURE__ */ new Date(),
        providerData: { requestReason: args.reason },
        payment: { connect: { id: payment.id } },
        requestedBy: { connect: { id: context.session.itemId } }
      }
    });
    return {
      refundId: created.id,
      paymentId: payment.id,
      storeId: store.id,
      provider: payment.paymentProvider,
      providerPaymentId: payment.providerPaymentId,
      amountCents: args.amountCents,
      currencyCode: "usd",
      idempotencyKey: args.idempotencyKey,
      requestedAt: created.requestedAt,
      status: created.status,
      providerRefundId: null,
      reused: false,
      executeProvider: true
    };
  }, { isolationLevel: "ReadCommitted" }));
  if (claim.status === "succeeded") {
    return refundResult(claim, claim.status, claim.providerRefundId, true, "Refund already recorded.");
  }
  if (!claim.executeProvider) {
    return refundResult(claim, claim.status, claim.providerRefundId, true, "Refund is already being processed.");
  }
  let providerResponse;
  try {
    providerResponse = await refundPayment({
      provider: claim.provider,
      paymentId: claim.providerPaymentId,
      amount: claim.amountCents,
      idempotencyKey: claim.idempotencyKey
    });
    if (providerResponse?.amount !== void 0 && Number(providerResponse.amount) !== claim.amountCents) {
      throw new Error("Payment provider returned a refund amount different from the requested amount");
    }
    if (providerResponse?.currency && String(providerResponse.currency).toLowerCase() !== claim.currencyCode.toLowerCase()) {
      throw new Error("Payment provider returned a refund currency different from the payment");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment provider refund failed";
    await context.transaction(async (transactionContext) => {
      const tx = transactionContext.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', claim.refundId);
      const current = await tx.paymentRefund.findUnique({ where: { id: claim.refundId }, select: { status: true } });
      if (current?.status === "processing") {
        await tx.paymentRefund.update({
          where: { id: claim.refundId },
          data: { status: "failed", failureMessage: message, providerStatus: "failed", processedAt: /* @__PURE__ */ new Date() }
        });
      }
    });
    throw new Error(message);
  }
  const providerStatus = providerResultStatus2(providerResponse);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
    const refund = await tx.paymentRefund.findUnique({ where: { id: claim.refundId } });
    if (!refund) throw new Error("Refund evidence disappeared during provider processing");
    if (refund.status !== "processing") {
      return refundResult({ ...claim, providerRefundId: refund.providerRefundId || null }, refund.status, refund.providerRefundId || null, true, "Refund state was finalized by another provider event.");
    }
    const providerRefundId = providerResponse?.data?.id || providerResponse?.id || null;
    await tx.paymentRefund.update({
      where: { id: refund.id },
      data: {
        status: providerStatus,
        providerRefundId,
        providerStatus: String(providerResponse?.status || providerStatus).toLowerCase(),
        providerData: {
          ...refund.providerData || {},
          providerResponse: providerResponse?.data || providerResponse || {}
        },
        processedAt: providerStatus === "processing" ? null : /* @__PURE__ */ new Date(),
        failureMessage: providerStatus === "failed" ? "Provider reported refund failure" : providerStatus === "canceled" ? "Provider canceled refund" : ""
      }
    });
    if (providerStatus !== "succeeded") {
      return refundResult({ ...claim, providerRefundId }, providerStatus, providerRefundId, claim.reused, "Payment provider has not completed the refund.");
    }
    const successful = await tx.paymentRefund.aggregate({
      where: { paymentId: claim.paymentId, status: "succeeded" },
      _sum: { amountCents: true }
    });
    const refundedCents = successful._sum.amountCents || 0;
    const payment = await tx.payment.findUnique({
      where: { id: claim.paymentId },
      select: { amount: true, amountCents: true, providerData: true }
    });
    const paymentCents = Number(payment?.amountCents || Math.round(Number(payment?.amount || 0) * 100));
    await tx.payment.update({
      where: { id: claim.paymentId },
      data: {
        status: refundedCents >= paymentCents ? "refunded" : "partially_refunded",
        providerRefundId: providerRefundId || void 0,
        providerData: {
          ...payment?.providerData || {},
          lastRefundId: providerRefundId,
          refundedAmountCents: refundedCents
        }
      }
    });
    await enqueueGroceryOutboxEvent(tx, {
      storeId: claim.storeId,
      eventKey: `payment-refund:${refund.id}:completed:v1`,
      eventType: "payment.refunded",
      aggregateType: "payment",
      aggregateId: claim.paymentId,
      occurredAt: new Date(refund.processedAt || /* @__PURE__ */ new Date()).toISOString(),
      payload: {
        paymentId: claim.paymentId,
        refundId: refund.id,
        amountCents: refund.amountCents,
        cumulativeRefundedCents: refundedCents,
        providerCode: claim.provider.code,
        providerPaymentId: claim.providerPaymentId,
        providerRefundId
      }
    });
    return refundResult({ ...claim, providerRefundId }, "succeeded", providerRefundId, claim.reused, "Refund recorded.");
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/manageGroceryOutbox.ts
async function assertCanManageOutbox(context) {
  await requireFreshCapability(context, "canManageOnboarding");
}
function eventResult(event) {
  return {
    eventId: event.id,
    eventKey: event.eventKey,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
    payloadHash: event.payloadHash,
    occurredAt: new Date(event.occurredAt).toISOString(),
    status: event.status,
    attempts: event.attempts,
    claimToken: event.claimToken || null
  };
}
async function groceryOutboxStatus(_root, _args, context) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  const groups = await context.prisma.groceryOutboxEvent.groupBy({ by: ["status"], where: { storeId: store.id }, _count: { _all: true } });
  const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  return {
    pending: counts.pending || 0,
    processing: counts.processing || 0,
    delivered: counts.delivered || 0,
    failed: counts.failed || 0
  };
}
async function claimGroceryOutboxEvents(_root, { workerId, limit = 20 }, context) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  const normalizedWorkerId = workerId.trim();
  if (!/^[a-zA-Z0-9:_-]{3,80}$/.test(normalizedWorkerId)) throw new Error("A valid outbox worker ID is required");
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  return context.transaction(async (txContext) => {
    const rows = await txContext.prisma.$queryRawUnsafe(
      `SELECT "id" FROM "GroceryOutboxEvent"
       WHERE "status" = 'pending' AND "store" = $2
       ORDER BY "occurredAt" ASC, "id" ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      boundedLimit,
      store.id
    );
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const claimToken = newGroceryOutboxClaimToken(normalizedWorkerId);
    await txContext.prisma.groceryOutboxEvent.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        claimToken,
        claimedAt: /* @__PURE__ */ new Date(),
        lastError: ""
      }
    });
    const events = await txContext.prisma.groceryOutboxEvent.findMany({
      where: { id: { in: ids } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }]
    });
    return events.map(eventResult);
  }, { isolationLevel: "ReadCommitted" });
}
async function completeGroceryOutboxEvent(_root, { eventId, claimToken, succeeded, error }, context) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  if (!claimToken.trim()) throw new Error("Outbox claim token is required");
  const normalizedError = error?.trim().slice(0, 2e3) || "";
  return context.transaction(async (txContext) => {
    await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', eventId);
    const event = await txContext.prisma.groceryOutboxEvent.findUnique({ where: { id: eventId } });
    if (!event || event.storeId !== store.id || event.status !== "processing" || event.claimToken !== claimToken) {
      throw new Error("Outbox event is not owned by this active claim");
    }
    const updated = await txContext.prisma.groceryOutboxEvent.update({
      where: { id: event.id },
      data: succeeded ? { status: "delivered", deliveredAt: /* @__PURE__ */ new Date(), claimToken: "", claimedAt: null, lastError: "" } : { status: "failed", claimToken: "", claimedAt: null, lastError: normalizedError || "Delivery failed" }
    });
    return eventResult(updated);
  }, { isolationLevel: "ReadCommitted" });
}
async function replayGroceryOutboxEvent(_root, { eventId }, context) {
  await assertCanManageOutbox(context);
  const store = await requireSessionStore(context);
  return context.transaction(async (txContext) => {
    await txContext.prisma.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id" = $1 FOR UPDATE', eventId);
    const event = await txContext.prisma.groceryOutboxEvent.findUnique({ where: { id: eventId } });
    if (!event || event.storeId !== store.id || event.status !== "failed") throw new Error("Only failed outbox events can be replayed");
    const updated = await txContext.prisma.groceryOutboxEvent.update({
      where: { id: event.id },
      data: { status: "pending", claimToken: "", claimedAt: null, deliveredAt: null }
    });
    return eventResult(updated);
  }, { isolationLevel: "ReadCommitted" });
}

// features/keystone/mutations/manageStoreCapacity.ts
async function assertDelivery(context) {
  await requireFreshCapability(context, "canManageDelivery");
}
function key(value) {
  const result = value.trim();
  if (result.length < 12) throw new Error("Idempotency key required");
  return result;
}
async function configureDeliverySlot(_root, args, context) {
  await assertDelivery(context);
  const store = await requireSessionStore(context);
  const eventKey = key(args.idempotencyKey);
  return context.transaction(async (tx) => {
    await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id" = $1 FOR UPDATE', args.slotId);
    const slot = await tx.prisma.deliverySlot.findUnique({ where: { id: args.slotId } });
    if (!slot || slot.storeId !== store.id) throw new Error("Delivery slot not found in active store");
    const capacity = args.capacity ?? slot.capacity;
    const fee = args.deliveryFee ?? slot.deliveryFee ?? 0;
    const active = args.isActive ?? slot.isActive;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity < (slot.currentBookings || 0)) throw new Error("Capacity cannot be below current bookings");
    if (!Number.isInteger(fee) || fee < 0) throw new Error("Delivery fee must be non-negative cents");
    const reused = capacity === slot.capacity && fee === (slot.deliveryFee || 0) && active === slot.isActive;
    const updated = reused ? slot : await tx.prisma.deliverySlot.update({ where: { id: slot.id }, data: { capacity, deliveryFee: fee, isActive: active } });
    await enqueueGroceryOutboxEvent(tx.prisma, { storeId: store.id, eventKey: `delivery-slot:${eventKey}:configured:v1`, eventType: "delivery_slot.configured", aggregateType: "delivery_slot", aggregateId: slot.id, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { slotId: slot.id, capacity: updated.capacity, deliveryFee: updated.deliveryFee || 0, isActive: updated.isActive, currentBookings: updated.currentBookings || 0 } });
    return { slotId: slot.id, capacity: updated.capacity, currentBookings: updated.currentBookings || 0, isAvailable: updated.isActive, fee: updated.deliveryFee || 0, reused };
  }, { isolationLevel: "ReadCommitted" });
}
async function configurePickupSlot(_root, args, context) {
  await assertDelivery(context);
  const store = await requireSessionStore(context);
  const eventKey = key(args.idempotencyKey);
  return context.transaction(async (tx) => {
    await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', args.slotId);
    const slot = await tx.prisma.pickupSlot.findUnique({ where: { id: args.slotId } });
    if (!slot || slot.storeId !== store.id) throw new Error("Pickup slot not found in active store");
    const maxOrders = args.maxOrders ?? slot.maxOrders;
    const active = args.isAvailable ?? slot.isActive;
    if (!Number.isInteger(maxOrders) || maxOrders < 1 || maxOrders < (slot.currentOrders || 0)) throw new Error("Maximum orders cannot be below current orders");
    const derivedAvailability = active && (slot.currentOrders || 0) < maxOrders;
    const reused = maxOrders === slot.maxOrders && active === slot.isActive && derivedAvailability === slot.isAvailable;
    const updated = reused ? slot : await tx.prisma.pickupSlot.update({ where: { id: slot.id }, data: { maxOrders, isActive: active, isAvailable: derivedAvailability } });
    await enqueueGroceryOutboxEvent(tx.prisma, { storeId: store.id, eventKey: `pickup-slot:${eventKey}:configured:v1`, eventType: "pickup_slot.configured", aggregateType: "pickup_slot", aggregateId: slot.id, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { slotId: slot.id, maxOrders: updated.maxOrders, currentOrders: updated.currentOrders || 0, isAvailable: updated.isAvailable } });
    return { slotId: slot.id, capacity: updated.maxOrders, currentBookings: updated.currentOrders || 0, isAvailable: updated.isAvailable, fee: 0, reused };
  }, { isolationLevel: "ReadCommitted" });
}
async function configureParkingSpot(_root, args, context) {
  await assertDelivery(context);
  const store = await requireSessionStore(context);
  const eventKey = key(args.idempotencyKey);
  return context.transaction(async (tx) => {
    await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "ParkingSpot" WHERE "id" = $1 FOR UPDATE', args.spotId);
    const spot = await tx.prisma.parkingSpot.findUnique({ where: { id: args.spotId } });
    if (!spot || spot.storeId !== store.id) throw new Error("Parking spot not found in active store");
    if (args.isAvailable) {
      const occupiedOrders = await tx.prisma.order.count({
        where: {
          storeId: store.id,
          status: { notIn: ["delivered", "cancelled"] },
          metadata: { path: ["parkingSpotId"], equals: spot.id }
        }
      });
      if (occupiedOrders > 0) throw new Error("Occupied parking spots must be released through pickup handoff");
    }
    const reused = spot.isAvailable === args.isAvailable;
    const updated = reused ? spot : await tx.prisma.parkingSpot.update({ where: { id: spot.id }, data: { isAvailable: args.isAvailable } });
    await enqueueGroceryOutboxEvent(tx.prisma, { storeId: store.id, eventKey: `parking-spot:${eventKey}:configured:v1`, eventType: "parking_spot.configured", aggregateType: "parking_spot", aggregateId: spot.id, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { spotId: spot.id, spotNumber: spot.spotNumber, isAvailable: updated.isAvailable } });
    return { slotId: spot.id, capacity: 1, currentBookings: updated.isAvailable ? 0 : 1, isAvailable: updated.isAvailable, fee: 0, reused };
  }, { isolationLevel: "ReadCommitted" });
}

// features/keystone/mutations/provisionCustomer.ts
async function provisionGroceryCustomer(_root, { name, email, temporaryPassword }, context) {
  const { storeId } = await requireFreshCapability(context, "canManageUsers");
  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedName.length < 2 || normalizedName.length > 120) throw new Error("Customer name must be between 2 and 120 characters");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("A valid customer email is required");
  if (temporaryPassword.length < 12 || temporaryPassword.length > 200) throw new Error("Temporary password must be between 12 and 200 characters");
  const existing = await context.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) throw new Error("A customer with this email already exists");
  const customer = await context.sudo().db.User.createOne({
    data: {
      name: normalizedName,
      email: normalizedEmail,
      password: temporaryPassword,
      store: { connect: { id: storeId } },
      onboardingStatus: "not_started"
    }
  });
  return { success: true, customerId: customer.id, name: normalizedName, email: normalizedEmail };
}

// features/keystone/projections/platformProjections.ts
function requirePermission(context, capability, message) {
  return requireFreshCapability(context, capability).catch(() => {
    throw new Error(message);
  });
}
function iso(value) {
  return value ? new Date(value).toISOString() : null;
}
function number(value) {
  return value === null || value === void 0 ? null : Number(value);
}
var OPERATOR_BOUND = 500;
function assertWithinOperatorBound(rows, label) {
  if (rows.length > OPERATOR_BOUND) throw new Error(`${label} exceeds the bounded launch view; archive historical records or use the paginated Orders workflow`);
  return rows;
}
function pageArgs(args) {
  const page = Math.max(1, Math.trunc(Number(args?.page || 1)));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(args?.pageSize || 50))));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
function mapLineItem(line) {
  const unitPriceCents = Number(line.unitPriceCents || Math.round(Number(line.unitPrice || 0) * 100));
  return {
    id: line.id,
    title: line.title,
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: unitPriceCents / 100,
    unitPriceCents,
    thumbnail: line.thumbnail || "",
    metadata: line.metadata || null
  };
}
function mapRefund(refund) {
  return {
    id: refund.id,
    amountCents: refund.amountCents,
    status: refund.status,
    reason: refund.providerData?.requestReason || "",
    requestedAt: iso(refund.requestedAt),
    processedAt: iso(refund.processedAt),
    failureMessage: refund.failureMessage || null,
    reconciliationAttempts: refund.reconciliationAttempts || 0,
    reconciliationNextAttemptAt: iso(refund.reconciliationNextAttemptAt),
    reconciliationDeadLetterAt: iso(refund.reconciliationDeadLetterAt),
    reconciliationLastError: refund.reconciliationLastError || null
  };
}
function mapPayment(payment) {
  return {
    id: payment.id,
    amountCents: payment.amountCents,
    status: payment.status,
    providerPaymentId: payment.providerPaymentId || null,
    processedAt: iso(payment.processedAt),
    errorMessage: payment.errorMessage || null,
    providerCode: payment.paymentProvider?.code || "",
    refunds: (payment.refunds || []).map(mapRefund)
  };
}
async function groceryPlatformOrders(_root, args, context) {
  await requirePermission(context, "canManageOrders", "Orders projection requires order-management permission");
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const now = /* @__PURE__ */ new Date();
  const today = zonedStartOfDay(now, store.timezone);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
  const commercialOrderWhere = { storeId: store.id };
  const [orders, totalOrders, statuses, todaySales, thirtyDaySales, thirtyDayRefunds] = await Promise.all([
    context.prisma.order.findMany({
      where: { storeId: store.id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: pagination.skip,
      take: pagination.pageSize,
      select: {
        id: true,
        displayId: true,
        email: true,
        status: true,
        deliveryDate: true,
        deliveryTimeWindow: true,
        metadata: true,
        createdAt: true,
        currencyCode: true,
        subtotalCents: true,
        taxCents: true,
        deliveryFeeCents: true,
        discountCents: true,
        totalCents: true,
        lineItems: { select: { id: true, title: true, sku: true, quantity: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
        payments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amountCents: true,
            status: true,
            providerPaymentId: true,
            processedAt: true,
            errorMessage: true,
            paymentProvider: { select: { code: true } },
            refunds: {
              orderBy: { requestedAt: "desc" },
              select: {
                id: true,
                amountCents: true,
                status: true,
                providerData: true,
                requestedAt: true,
                processedAt: true,
                failureMessage: true,
                reconciliationAttempts: true,
                reconciliationNextAttemptAt: true,
                reconciliationDeadLetterAt: true,
                reconciliationLastError: true
              }
            }
          }
        }
      }
    }),
    context.prisma.order.count({ where: { storeId: store.id } }),
    Promise.all(["pending", "picking", "packed", "out_for_delivery", "delivered"].map(async (status) => [
      status,
      await context.prisma.order.count({ where: { storeId: store.id, status } })
    ])),
    context.prisma.order.aggregate({
      where: { ...commercialOrderWhere, createdAt: { gte: today } },
      _count: { _all: true },
      _sum: { totalCents: true }
    }),
    context.prisma.order.aggregate({
      where: { ...commercialOrderWhere, createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      _sum: { totalCents: true },
      _avg: { totalCents: true }
    }),
    context.prisma.paymentRefund.aggregate({
      where: { status: "succeeded", processedAt: { gte: thirtyDaysAgo }, payment: { storeId: store.id } },
      _sum: { amountCents: true }
    })
  ]);
  const counts = Object.fromEntries(statuses);
  return {
    currencyCode: store.currencyCode,
    orders: orders.map((order) => ({
      ...order,
      deliveryDate: iso(order.deliveryDate),
      createdAt: iso(order.createdAt),
      lineItems: order.lineItems.map(mapLineItem),
      payments: order.payments.map(mapPayment)
    })),
    salesSummary: {
      todayOrders: todaySales._count._all,
      todayGrossCents: todaySales._sum.totalCents || 0,
      thirtyDayOrders: thirtyDaySales._count._all,
      thirtyDayGrossCents: thirtyDaySales._sum.totalCents || 0,
      thirtyDayRefundCents: thirtyDayRefunds._sum.amountCents || 0,
      thirtyDayNetCents: (thirtyDaySales._sum.totalCents || 0) - (thirtyDayRefunds._sum.amountCents || 0),
      averageBasketCents: Math.round(thirtyDaySales._avg.totalCents || 0)
    },
    pending: counts.pending || 0,
    picking: counts.picking || 0,
    packed: counts.packed || 0,
    outForDelivery: counts.out_for_delivery || 0,
    delivered: counts.delivered || 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalOrders,
    totalPages: Math.max(1, Math.ceil(totalOrders / pagination.pageSize))
  };
}
async function ordersByStatus(context, storeId, status, orderBy) {
  return context.prisma.order.findMany({
    where: { storeId, status },
    orderBy: [{ [orderBy]: orderBy === "createdAt" ? "asc" : "desc" }, { id: "asc" }],
    take: OPERATOR_BOUND + 1,
    select: {
      id: true,
      displayId: true,
      email: true,
      status: true,
      deliveryDate: true,
      deliveryTimeWindow: true,
      createdAt: true,
      currencyCode: true,
      subtotalCents: true,
      taxCents: true,
      deliveryFeeCents: true,
      discountCents: true,
      totalCents: true,
      substitutionPreference: true,
      metadata: true,
      lineItems: { select: { id: true, quantity: true, title: true, sku: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amountCents: true,
          status: true,
          providerPaymentId: true,
          processedAt: true,
          errorMessage: true,
          paymentProvider: { select: { code: true } },
          refunds: {
            orderBy: { requestedAt: "desc" },
            select: {
              id: true,
              amountCents: true,
              status: true,
              providerData: true,
              requestedAt: true,
              processedAt: true,
              failureMessage: true,
              reconciliationAttempts: true,
              reconciliationNextAttemptAt: true,
              reconciliationDeadLetterAt: true,
              reconciliationLastError: true
            }
          }
        }
      }
    }
  });
}
async function groceryPlatformFulfillment(_root, _args, context) {
  await requirePermission(context, "canManageOrders", "Fulfillment projection requires order-management permission");
  const store = await requireSessionStore(context);
  const [pending, picking, packed, substitutions] = await Promise.all([
    ordersByStatus(context, store.id, "pending", "createdAt"),
    ordersByStatus(context, store.id, "picking", "createdAt"),
    ordersByStatus(context, store.id, "packed", "updatedAt"),
    context.prisma.orderItemSubstitution.findMany({
      where: { lineItem: { order: { storeId: store.id } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: OPERATOR_BOUND + 1,
      select: {
        id: true,
        orderItem: true,
        originalProduct: true,
        substitutedProduct: true,
        reason: true,
        customerApproved: true,
        approvedAt: true
      }
    })
  ]);
  assertWithinOperatorBound(pending, "Pending fulfillment orders");
  assertWithinOperatorBound(picking, "Picking fulfillment orders");
  assertWithinOperatorBound(packed, "Packed fulfillment orders");
  assertWithinOperatorBound(substitutions, "Substitution evidence");
  const mapOrder = (order) => ({
    ...order,
    deliveryDate: iso(order.deliveryDate),
    createdAt: iso(order.createdAt),
    lineItems: order.lineItems.map(mapLineItem),
    payments: order.payments.map(mapPayment)
  });
  return {
    pending: pending.map(mapOrder),
    picking: picking.map(mapOrder),
    packed: packed.map(mapOrder),
    orderItemSubstitutions: substitutions.map((item) => ({ ...item, approvedAt: iso(item.approvedAt) }))
  };
}
async function groceryPlatformDelivery(_root, _args, context) {
  await requirePermission(context, "canManageDelivery", "Delivery projection requires delivery-management permission");
  const store = await requireSessionStore(context);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(/* @__PURE__ */ new Date(), store.timezone, -1), store.timezone);
  const [routes, readyCandidates, drivers, slots] = await Promise.all([
    context.prisma.deliveryRoute.findMany({
      where: { storeId: store.id },
      orderBy: [{ date: "desc" }, { id: "asc" }],
      take: OPERATOR_BOUND + 1,
      select: {
        id: true,
        date: true,
        timeWindow: true,
        status: true,
        startedAt: true,
        completedAt: true,
        driver: { select: { id: true, name: true, email: true } },
        orders: { select: { id: true, displayId: true, status: true, metadata: true } }
      }
    }),
    context.prisma.order.findMany({
      where: { storeId: store.id, status: "packed" },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: OPERATOR_BOUND + 1,
      select: {
        id: true,
        displayId: true,
        email: true,
        status: true,
        deliveryDate: true,
        deliveryTimeWindow: true,
        createdAt: true,
        currencyCode: true,
        subtotalCents: true,
        taxCents: true,
        deliveryFeeCents: true,
        discountCents: true,
        totalCents: true,
        substitutionPreference: true,
        metadata: true,
        lineItems: { select: { id: true, title: true, sku: true, quantity: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
        payments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amountCents: true,
            status: true,
            providerPaymentId: true,
            processedAt: true,
            errorMessage: true,
            paymentProvider: { select: { code: true } },
            refunds: {
              orderBy: { requestedAt: "desc" },
              select: {
                id: true,
                amountCents: true,
                status: true,
                providerData: true,
                requestedAt: true,
                processedAt: true,
                failureMessage: true,
                reconciliationAttempts: true,
                reconciliationNextAttemptAt: true,
                reconciliationDeadLetterAt: true,
                reconciliationLastError: true
              }
            }
          }
        }
      }
    }),
    context.prisma.user.findMany({
      where: { storeId: store.id, role: { canManageDelivery: true } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: OPERATOR_BOUND + 1,
      select: { id: true, name: true, email: true }
    }),
    context.prisma.deliverySlot.findMany({
      where: { storeId: store.id, date: { gte: slotWindowStart } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }],
      take: OPERATOR_BOUND + 1,
      select: { id: true, date: true, startTime: true, endTime: true, capacity: true, currentBookings: true, isActive: true, deliveryFee: true }
    })
  ]);
  assertWithinOperatorBound(routes, "Delivery routes");
  assertWithinOperatorBound(readyCandidates, "Delivery-ready orders");
  assertWithinOperatorBound(drivers, "Delivery drivers");
  assertWithinOperatorBound(slots, "Delivery slots");
  const readyOrders = readyCandidates.filter((order) => order.metadata?.fulfillmentMethod === "delivery");
  return {
    deliveryRoutes: routes.map((route) => ({ ...route, date: iso(route.date), status: route.status || "planning", startedAt: iso(route.startedAt), completedAt: iso(route.completedAt) })),
    readyOrders: readyOrders.map((order) => ({
      ...order,
      deliveryDate: iso(order.deliveryDate),
      createdAt: iso(order.createdAt),
      lineItems: order.lineItems.map(mapLineItem),
      payments: order.payments.map(mapPayment)
    })),
    drivers,
    deliverySlots: slots.map((slot) => ({ ...slot, date: iso(slot.date), currentBookings: slot.currentBookings || 0, deliveryFee: slot.deliveryFee || 0 }))
  };
}
async function groceryPlatformPickup(_root, _args, context) {
  await requirePermission(context, "canManageDelivery", "Pickup projection requires delivery-management permission");
  const store = await requireSessionStore(context);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(/* @__PURE__ */ new Date(), store.timezone, -1), store.timezone);
  const [slots, parkingSpots, orders] = await Promise.all([
    context.prisma.pickupSlot.findMany({ where: { storeId: store.id, date: { gte: slotWindowStart } }, orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }], take: OPERATOR_BOUND + 1, select: { id: true, date: true, startTime: true, endTime: true, maxOrders: true, currentOrders: true, isAvailable: true } }),
    context.prisma.parkingSpot.findMany({ where: { storeId: store.id }, orderBy: [{ spotNumber: "asc" }, { id: "asc" }], take: OPERATOR_BOUND + 1, select: { id: true, spotNumber: true, description: true, isAccessible: true, isAvailable: true } }),
    context.prisma.order.findMany({ where: { storeId: store.id, status: "packed" }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: OPERATOR_BOUND + 1, select: { id: true, displayId: true, email: true, status: true, metadata: true } })
  ]);
  assertWithinOperatorBound(slots, "Pickup slots");
  assertWithinOperatorBound(parkingSpots, "Parking spots");
  assertWithinOperatorBound(orders, "Pickup-ready orders");
  const pickupOrders = orders.filter((order) => order.metadata?.fulfillmentMethod === "pickup");
  return {
    pickupSlots: slots.map((slot) => ({ ...slot, date: iso(slot.date), currentOrders: slot.currentOrders || 0 })),
    parkingSpots,
    pickupOrders
  };
}
async function groceryPlatformInventory(_root, _args, context) {
  await requirePermission(context, "canManageInventory", "Inventory projection requires inventory-management permission");
  const store = await requireSessionStore(context);
  const now = /* @__PURE__ */ new Date();
  const [products, inventoryLots] = await Promise.all([
    context.prisma.product.findMany({ where: { storeId: store.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: OPERATOR_BOUND + 1, select: { id: true, title: true, sku: true, stockQuantity: true, lowStockThreshold: true, department: true, supplier: { select: { id: true, name: true } }, _count: { select: { backInStockAlerts: { where: { isActive: true } } } } } }),
    context.prisma.inventoryLot.findMany({ where: { storeId: store.id }, orderBy: [{ expirationDate: "asc" }, { id: "asc" }], take: OPERATOR_BOUND + 1, select: { id: true, lotNumber: true, expirationDate: true, quantity: true, quantityRemaining: true, location: true, productId: true, product: { select: { id: true, title: true } }, supplier: { select: { id: true, name: true } } } })
  ]);
  assertWithinOperatorBound(products, "Inventory products");
  assertWithinOperatorBound(inventoryLots, "Inventory lots");
  const sellableByProduct = /* @__PURE__ */ new Map();
  for (const lot of inventoryLots) {
    if (lot.productId && lot.expirationDate.getTime() > now.getTime() && lot.quantityRemaining > 0) {
      sellableByProduct.set(lot.productId, (sellableByProduct.get(lot.productId) || 0) + lot.quantityRemaining);
    }
  }
  return {
    products: products.map(({ _count, stockQuantity, ...product }) => {
      const sellableQuantity = sellableByProduct.get(product.id) || 0;
      return {
        ...product,
        stockQuantity: sellableQuantity,
        recordedStockQuantity: Number(stockQuantity || 0),
        inStock: sellableQuantity > 0,
        activeBackInStockAlerts: _count.backInStockAlerts
      };
    }),
    inventoryLots: inventoryLots.map(({ productId: _productId, ...lot }) => ({
      ...lot,
      expirationDate: iso(lot.expirationDate),
      isExpired: lot.expirationDate.getTime() <= now.getTime(),
      isExpiringSoon: lot.expirationDate.getTime() > now.getTime() && lot.expirationDate.getTime() <= now.getTime() + 7 * 864e5
    }))
  };
}
async function groceryPlatformSuppliers(_root, _args, context) {
  await requirePermission(context, "canManageSuppliers", "Suppliers projection requires supplier-management permission");
  const store = await requireSessionStore(context);
  const suppliers = await context.prisma.supplier.findMany({
    where: { storeId: store.id },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: OPERATOR_BOUND + 1,
    select: { id: true, name: true, contactName: true, email: true, phone: true, paymentTerms: true, deliveryDays: true, minimumOrder: true, minimumOrderCents: true, products: { select: { id: true } }, purchaseOrders: { select: { id: true, status: true } } }
  });
  assertWithinOperatorBound(suppliers, "Suppliers");
  return { currencyCode: store.currencyCode, suppliers };
}
async function groceryPlatformPurchasing(_root, _args, context) {
  await requirePermission(context, "canManageInventory", "Purchasing projection requires inventory-management permission");
  const store = await requireSessionStore(context);
  const dueSoonBoundary = new Date(Date.now() + 3 * 864e5);
  const purchaseOrders = await context.prisma.purchaseOrder.findMany({
    where: { storeId: store.id },
    orderBy: [{ orderDate: "desc" }, { id: "asc" }],
    take: OPERATOR_BOUND + 1,
    select: { id: true, poNumber: true, orderDate: true, expectedDeliveryDate: true, status: true, totalAmount: true, totalAmountCents: true, notes: true, supplier: { select: { id: true, name: true } }, items: { select: { id: true, productTitle: true, productSku: true, quantity: true, quantityReceived: true, unitCost: true, unitCostCents: true } } }
  });
  assertWithinOperatorBound(purchaseOrders, "Purchase orders");
  return { currencyCode: store.currencyCode, purchaseOrders: purchaseOrders.map((order) => ({ ...order, orderDate: iso(order.orderDate), expectedDeliveryDate: iso(order.expectedDeliveryDate), isDueSoon: Boolean(order.expectedDeliveryDate && order.expectedDeliveryDate <= dueSoonBoundary), totalAmount: Number(order.totalAmountCents || Math.round(Number(order.totalAmount || 0) * 100)) / 100, totalAmountCents: order.totalAmountCents, items: order.items.map((item) => ({ ...item, unitCost: Number(item.unitCostCents || Math.round(Number(item.unitCost || 0) * 100)) / 100, unitCostCents: item.unitCostCents })) })) };
}
async function groceryPlatformMerchandising(_root, _args, context) {
  await requirePermission(context, "canManageProducts", "Merchandising projection requires product-management permission");
  const store = await requireSessionStore(context);
  const [departments, coupons] = await Promise.all([
    context.prisma.department.findMany({ where: { storeId: store.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: OPERATOR_BOUND + 1, select: { id: true, name: true, handle: true, sortOrder: true, isActive: true, temperatureZone: true, products: { select: { id: true } } } }),
    context.prisma.coupon.findMany({ where: { storeId: store.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: OPERATOR_BOUND + 1, select: { id: true, code: true, discountType: true, discountValue: true, discountValueCents: true, minPurchase: true, minPurchaseCents: true, maxUses: true, currentUses: true, productCategories: true, isActive: true, validFrom: true, validTo: true } })
  ]);
  assertWithinOperatorBound(departments, "Departments");
  assertWithinOperatorBound(coupons, "Coupons");
  return { currencyCode: store.currencyCode, departments, coupons: coupons.map((coupon) => ({ ...coupon, discountValue: number(coupon.discountValue), minPurchase: number(coupon.minPurchase), validFrom: iso(coupon.validFrom), validTo: iso(coupon.validTo) })) };
}
async function groceryPlatformCustomers(_root, _args, context) {
  await requirePermission(context, "canManageUsers", "Customers projection requires user-management permission");
  const store = await requireSessionStore(context);
  const [users, totalCustomers, savedCarts, orderStats, shoppingListStats] = await Promise.all([
    context.prisma.user.findMany({ where: { storeId: store.id, roleId: null }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: OPERATOR_BOUND + 1, select: { id: true, name: true, email: true, onboardingStatus: true, createdAt: true } }),
    context.prisma.user.count({ where: { storeId: store.id, roleId: null } }),
    context.prisma.cart.count({ where: { storeId: store.id, itemCount: { gt: 0 } } }),
    context.prisma.order.groupBy({
      by: ["userId"],
      where: { storeId: store.id, userId: { not: null } },
      _count: { _all: true },
      _max: { createdAt: true }
    }),
    context.prisma.shoppingList.groupBy({
      by: ["userId"],
      where: { user: { storeId: store.id } },
      _count: { _all: true }
    })
  ]);
  assertWithinOperatorBound(users, "Customers");
  const latestDates = orderStats.flatMap((row) => row._max.createdAt ? [row._max.createdAt] : []);
  const latestOrders = latestDates.length ? await context.prisma.order.findMany({
    where: {
      storeId: store.id,
      userId: { in: orderStats.flatMap((row) => row.userId ? [row.userId] : []) },
      createdAt: { in: latestDates }
    },
    orderBy: [{ createdAt: "desc" }, { displayId: "desc" }],
    select: { userId: true, displayId: true, status: true, createdAt: true }
  }) : [];
  const orderCountByUser = new Map(orderStats.flatMap((row) => row.userId ? [[row.userId, Number(row._count?._all || 0)]] : []));
  const shoppingListCountByUser = new Map(shoppingListStats.map((row) => [row.userId, Number(row._count?._all || 0)]));
  const latestOrderByUser = /* @__PURE__ */ new Map();
  for (const order of latestOrders) {
    if (order.userId && !latestOrderByUser.has(order.userId)) latestOrderByUser.set(order.userId, order);
  }
  return {
    users: users.map((user) => {
      const lastOrder = latestOrderByUser.get(user.id);
      return {
        ...user,
        createdAt: iso(user.createdAt),
        orderCount: orderCountByUser.get(user.id) || 0,
        shoppingListCount: shoppingListCountByUser.get(user.id) || 0,
        lastOrder: lastOrder ? { displayId: lastOrder.displayId, status: lastOrder.status, createdAt: iso(lastOrder.createdAt) } : null
      };
    }),
    totalCustomers,
    savedCarts
  };
}
async function groceryPlatformPayments(_root, _args, context) {
  await requirePermission(context, "canManagePayments", "Payments projection requires payment-management permission");
  const store = await requireSessionStore(context);
  const supportedCodes = Object.keys(paymentProviderDefinitions);
  const [payments, providers, paymentCount, failedCount, processingCount, captured, refunded, recoveryCounts] = await Promise.all([
    context.prisma.payment.findMany({
      where: { storeId: store.id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        amountCents: true,
        status: true,
        paymentMethod: true,
        providerPaymentId: true,
        processedAt: true,
        createdAt: true,
        errorMessage: true,
        order: { select: { id: true, displayId: true, status: true } },
        paymentProvider: { select: { code: true } },
        refunds: {
          orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            amountCents: true,
            status: true,
            providerData: true,
            requestedAt: true,
            processedAt: true,
            failureMessage: true,
            reconciliationAttempts: true,
            reconciliationNextAttemptAt: true,
            reconciliationDeadLetterAt: true,
            reconciliationLastError: true
          }
        }
      }
    }),
    context.prisma.paymentProvider.findMany({
      where: { code: { in: supportedCodes } },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: { id: true, name: true, code: true, isInstalled: true }
    }),
    context.prisma.payment.count({ where: { storeId: store.id } }),
    context.prisma.payment.count({ where: { storeId: store.id, status: "failed" } }),
    context.prisma.payment.count({ where: { storeId: store.id, status: "processing" } }),
    context.prisma.payment.aggregate({
      where: { storeId: store.id, status: { in: ["succeeded", "partially_refunded", "refunded"] } },
      _sum: { amountCents: true }
    }),
    context.prisma.paymentRefund.aggregate({
      where: { payment: { storeId: store.id }, status: "succeeded" },
      _sum: { amountCents: true }
    }),
    context.prisma.checkoutAttempt.groupBy({
      by: ["status"],
      where: { storeId: store.id },
      _count: { _all: true }
    })
  ]);
  assertWithinOperatorBound(payments, "Recent payments");
  return {
    currencyCode: store.currencyCode,
    payments: payments.map((payment) => ({
      ...payment,
      createdAt: iso(payment.createdAt),
      processedAt: iso(payment.processedAt),
      providerCode: payment.paymentProvider?.code || "",
      refunds: payment.refunds.map(mapRefund)
    })),
    providers: providers.map((provider) => {
      const definition = paymentProviderDefinitions[provider.code];
      return {
        ...provider,
        publicCheckout: Boolean(definition?.publicCheckout),
        runtimeConfigured: Boolean(definition) && definition.credentialEnv.every((name) => Boolean(process.env[name]))
      };
    }),
    summary: {
      paymentCount,
      failedCount,
      processingCount,
      capturedCents: captured._sum.amountCents || 0,
      refundedCents: refunded._sum.amountCents || 0,
      netCents: (captured._sum.amountCents || 0) - (refunded._sum.amountCents || 0),
      recovery: Object.fromEntries(recoveryCounts.map((row) => [row.status, row._count._all]))
    }
  };
}
async function groceryPlatformSettings(_root, _args, context) {
  await requirePermission(context, "canManageOnboarding", "Settings projection requires onboarding-management permission");
  const store = await requireSessionStore(context);
  const [settings, counts] = await Promise.all([
    context.prisma.storeSettings.findUnique({
      where: { storeId: store.id },
      select: {
        id: true,
        name: true,
        tagline: true,
        homepageTitle: true,
        homepageDescription: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        logoUrl: true,
        brandHue: true,
        currencyCode: true,
        taxRateBps: true,
        locale: true,
        timezone: true,
        countryCode: true,
        hours: true,
        isActive: true
      }
    }),
    Promise.all([
      context.prisma.product.count({ where: { storeId: store.id } }),
      context.prisma.supplier.count({ where: { storeId: store.id } }),
      context.prisma.deliverySlot.count({ where: { storeId: store.id } }),
      context.prisma.pickupSlot.count({ where: { storeId: store.id } }),
      context.prisma.parkingSpot.count({ where: { storeId: store.id } })
    ])
  ]);
  if (!settings) throw new Error("Store settings are not initialized");
  return {
    store: { id: store.id, name: store.name, timezone: store.timezone, currencyCode: store.currencyCode, isActive: store.isActive },
    settings,
    counts: { products: counts[0], suppliers: counts[1], deliverySlots: counts[2], pickupSlots: counts[3], parkingSpots: counts[4] }
  };
}

// features/keystone/mutations/index.ts
var graphql = String.raw;
function parseJSONLiteral(ast) {
  switch (ast.kind) {
    case import_graphql.Kind.STRING:
    case import_graphql.Kind.BOOLEAN:
      return ast.value;
    case import_graphql.Kind.INT:
    case import_graphql.Kind.FLOAT:
      return Number(ast.value);
    case import_graphql.Kind.OBJECT:
      return Object.fromEntries(ast.fields.map((field) => [field.name.value, parseJSONLiteral(field.value)]));
    case import_graphql.Kind.LIST:
      return ast.values.map(parseJSONLiteral);
    case import_graphql.Kind.NULL:
      return null;
    default:
      return null;
  }
}
var JSONScalar = new import_graphql.GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON payload for provider webhook events.",
  parseValue: (value) => value,
  serialize: (value) => value,
  parseLiteral: parseJSONLiteral
});
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql`
      input UserUpdateProfileInput {
        email: String
        name: String
        onboardingStatus: String
      }

      type GroceryCartProduct {
        id: ID!
        name: String
        handle: String
        price: Float
        unitPrice: Float
        unit: String
        imageUrl: String
        inStock: Boolean
        stockQuantity: Int
      }

      type GroceryCartItem {
        id: ID!
        product: GroceryCartProduct
        quantity: Int!
        subtotal: Float!
        substitutionPreference: String
      }

      type GroceryCart {
        id: ID!
        items: [GroceryCartItem!]!
        subtotal: Float!
        tax: Float!
        deliveryFee: Float!
        total: Float!
        itemCount: Int!
      }

      # Coupon types
      type ClippedCouponDetails {
        id: ID!
        code: String!
        discountType: String!
        discountValue: Float!
        minPurchase: Float
        validTo: String
        productCategories: [String]
      }

      type ClippedCoupon {
        id: ID!
        clippedAt: String!
        coupon: ClippedCouponDetails!
      }

      type ClipCouponResult {
        success: Boolean!
        message: String!
        userCoupon: ClippedCoupon
      }

      type UnclipCouponResult {
        success: Boolean!
        message: String!
      }

      type CouponBreakdownItem {
        couponId: ID!
        couponCode: String!
        discountType: String!
        discountAmount: Float!
        appliedToProducts: [ID!]!
      }

      type ApplyCouponsResult {
        success: Boolean!
        totalDiscount: Float!
        breakdown: [CouponBreakdownItem!]!
        warnings: [String!]!
        finalSubtotal: Float!
      }

      type MarkCouponsUsedResult {
        success: Boolean!
        markedAsUsed: [ID!]!
      }

      type PreviewCouponDetails {
        code: String!
        discountType: String!
        discountValue: Float!
        minPurchase: Float
      }

      type PreviewCouponResult {
        valid: Boolean!
        message: String!
        potentialDiscount: Float!
        couponDetails: PreviewCouponDetails
      }

      # Recipe types
      type ScaledIngredientProduct {
        id: ID!
        name: String
        price: Float
        imageUrl: String
        inStock: Boolean
        stockQuantity: Int
      }

      type ScaledIngredient {
        id: ID!
        productId: String
        product: ScaledIngredientProduct
        originalQuantity: Float!
        scaledQuantity: Float!
        unit: String
        notes: String
        isOptional: Boolean
      }

      type ScaledRecipe {
        recipeId: ID!
        recipeName: String!
        originalServings: Int!
        targetServings: Int!
        scaleFactor: Float!
        ingredients: [ScaledIngredient!]!
      }

      type RecipeCartAddedItem {
        productId: String!
        productName: String
        quantity: Int!
        action: String!
        newTotal: Int
      }

      type RecipeCartUnavailableItem {
        productId: String
        productName: String
        reason: String!
        availableQuantity: Int
        requestedQuantity: Int
        existingQuantity: Int
      }

      type RecipeCartSkippedItem {
        productId: String
        reason: String!
      }

      type RecipeCartSummary {
        addedCount: Int!
        unavailableCount: Int!
        skippedOptionalCount: Int!
        addedItems: [RecipeCartAddedItem!]!
        unavailableItems: [RecipeCartUnavailableItem!]!
        skippedOptional: [RecipeCartSkippedItem!]!
      }

      type AddRecipeToCartResult {
        cart: GroceryCart!
        recipeId: ID!
        recipeName: String!
        servingsAdded: Int!
        summary: RecipeCartSummary!
      }

      # Shopping List types
      type ShoppingListItemResult {
        id: ID!
        product: String!
        quantity: Int!
        unit: String
        checked: Boolean!
        notes: String
        addedAt: String
      }

      type ShoppingListResult {
        id: ID!
        name: String!
        isDefault: Boolean!
        items: [ShoppingListItemResult!]!
        itemCount: Int!
        checkedCount: Int!
      }

      type DeleteShoppingListResult {
        success: Boolean!
        listId: ID!
      }

      type AddListToCartResult {
        success: Boolean!
        message: String!
        addedCount: Int!
        skippedCount: Int!
        skippedItems: [String!]!
      }

      type PublicGroceryStorefrontSettings {
        id: ID!
        name: String!
        tagline: String
        homepageTitle: String
        homepageDescription: String
        contactEmail: String
        contactPhone: String
        address: String
        logoUrl: String
        brandHue: Int
        effectiveBrandHue: Int!
        currencyCode: String
        locale: String
        timezone: String
        countryCode: String
      }

      type StorefrontBrandHueResult {
        brandHue: Int
        effectiveBrandHue: Int!
      }

      type PublicGroceryDepartment {
        id: ID!
        name: String!
        handle: String!
        isActive: Boolean!
      }

      type PublicGroceryProduct {
        id: ID!
        title: String!
        handle: String!
        description: JSON
        sku: String!
        price: Float
        compareAtPrice: Float
        unitOfMeasure: String
        pricingMethod: String
        imageUrl: String
        thumbnailUrl: String
        isPerishable: Boolean!
        shelfLife: Int
        organicCertified: Boolean!
        allergens: [String!]!
        department: PublicGroceryDepartment
        inStock: Boolean!
        stockQuantity: Int!
        backInStockRequested: Boolean!
      }

      type PublicGroceryProductConnection {
        products: [PublicGroceryProduct!]!
        totalCount: Int!
      }

      type BackInStockRequestResult {
        requested: Boolean!
        reused: Boolean!
        productId: ID!
        message: String!
      }

      type PublicGroceryCoupon {
        id: ID!
        code: String!
        discountType: String!
        discountValue: Float!
        minPurchase: Float!
        validTo: String
        productCategories: [String!]!
      }

      type PublicDeliveryWindow {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        feeCents: Int!
        remainingCapacity: Int!
      }

      type PublicPickupWindow {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        remainingCapacity: Int!
      }

      type PublicParkingSpot {
        id: ID!
        spotNumber: String!
        description: String
        isAccessible: Boolean!
      }

      type PublicGroceryAvailability {
        deliveryWindows: [PublicDeliveryWindow!]!
        pickupWindows: [PublicPickupWindow!]!
        parkingSpots: [PublicParkingSpot!]!
      }

      # Pickup Slot types
      type PickupSlotResult {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        availableCapacity: Int!
        maxOrders: Int!
        currentOrders: Int!
        isAvailable: Boolean!
      }

      type PickupSlotsByDateResult {
        date: String!
        slots: [PickupSlotResult!]!
        totalSlots: Int!
        totalAvailableCapacity: Int!
      }

      # Customer Check-in types
      type ParkingSpotResult {
        id: ID!
        spotNumber: String!
        description: String
        isAccessible: Boolean!
        isAvailable: Boolean!
      }

      type CheckInParkingSpot {
        id: ID!
        spotNumber: String!
        description: String
        isAccessible: Boolean!
      }

      type CustomerCheckInResult {
        success: Boolean!
        orderId: ID!
        orderNumber: Int!
        status: String!
        parkingSpot: CheckInParkingSpot
        estimatedWaitMinutes: Int!
        message: String!
      }

      type ReleaseParkingSpotResult {
        success: Boolean!
        parkingSpotId: ID!
        spotNumber: String!
        orderId: ID!
        message: String!
      }

      type CompleteOrderHandoffResult {
        success: Boolean!
        orderId: ID!
        orderNumber: Int!
        status: String!
        message: String!
      }

      type DeliveryRouteWorkflowResult {
        success: Boolean!
        routeId: ID!
        status: String!
        orderCount: Int!
        message: String!
      }

      type OrderCancellationResult { success: Boolean!, orderId: ID!, status: String!, reused: Boolean! }
      type ProvisionGroceryCustomerResult { success: Boolean!, customerId: ID!, name: String!, email: String! }
      type CheckoutReconciliationResult { processed: Int!, results: JSON! }
      type RefundReconciliationResult { scanned: Int!, results: JSON! }
      type SupplierMinimumOrderResult { success: Boolean!, id: ID!, minimumOrder: Float!, minimumOrderCents: Int! }
      type OrderFulfillmentWorkflowResult {
        success: Boolean!
        orderId: ID!
        status: String!
        stage: String!
        reused: Boolean!
        message: String!
      }

      type OrderItemSubstitutionWorkflowResult {
        success: Boolean!
        substitutionId: ID!
        orderItemId: ID!
        customerApproved: Boolean!
        approvedAt: String
        reused: Boolean!
      }

      type GroceryOutboxEventResult {
        eventId: ID!
        eventKey: String!
        eventType: String!
        aggregateType: String!
        aggregateId: String!
        schemaVersion: Int!
        payload: JSON!
        payloadHash: String!
        occurredAt: String!
        status: String!
        attempts: Int!
        claimToken: String
      }

      type GroceryOutboxStatusResult {
        pending: Int!
        processing: Int!
        delivered: Int!
        failed: Int!
      }

      type StoreCapacityResult {
        slotId: ID!
        capacity: Int!
        currentBookings: Int!
        isAvailable: Boolean!
        fee: Int!
        reused: Boolean!
      }

      type InventoryAdjustmentResult {
        success: Boolean!
        adjustmentId: ID!
        inventoryLotId: ID!
        productId: ID!
        quantityDelta: Int!
        quantityRemaining: Int!
        productStock: Int!
        reused: Boolean!
      }

      input PurchaseOrderDraftItemInput {
        productId: ID!
        quantity: Int!
        unitCost: Float!
      }

      type PurchaseOrderDraftResult {
        success: Boolean!
        purchaseOrderId: ID!
        poNumber: String!
        status: String!
        totalAmount: Float!
        itemCount: Int!
        reused: Boolean!
      }

      type PurchaseOrderDraftItemRemovalResult {
        success: Boolean!
        purchaseOrderId: ID!
        removedItemId: ID!
        totalAmount: Float!
        itemCount: Int!
        reused: Boolean!
      }

      input PurchaseOrderReceiptInput {
        poItemId: ID!
        targetQuantityReceived: Int!
        lotNumber: String!
        expirationDate: String!
        location: String
      }

      type PurchaseOrderWorkflowResult {
        success: Boolean!
        purchaseOrderId: ID!
        status: String!
        receivedUnits: Int!
        message: String!
      }

      scalar JSON

      type GroceryOnboardingResult {
        completed: Boolean!
        reused: Boolean!
        counts: JSON!
      }

      type PaymentWebhookResult {
        success: Boolean!
        duplicate: Boolean!
        providerCode: String!
        eventType: String!
        paymentId: String
        updatedPaymentId: ID
        message: String!
      }

      type PaymentRefundResult {
        success: Boolean!
        refundId: ID!
        paymentId: ID!
        amountCents: Int!
        status: String!
        providerRefundId: String
        reused: Boolean!
        message: String!
      }

      type GroceryPlatformOrderLineItem {
        id: ID!
        title: String!
        sku: String!
        quantity: Int!
        unitPrice: Float!
        unitPriceCents: Int!
        thumbnail: String!
        metadata: JSON
      }

      type GroceryPlatformPaymentRefund {
        id: ID!
        amountCents: Int!
        status: String!
        reason: String!
        requestedAt: String
        processedAt: String
        failureMessage: String
        reconciliationAttempts: Int!
        reconciliationNextAttemptAt: String
        reconciliationDeadLetterAt: String
        reconciliationLastError: String
      }

      type GroceryPlatformPayment {
        id: ID!
        amountCents: Int!
        status: String!
        providerPaymentId: String
        processedAt: String
        errorMessage: String
        providerCode: String!
        refunds: [GroceryPlatformPaymentRefund!]!
      }

      type GroceryPlatformSalesSummary {
        todayOrders: Int!
        todayGrossCents: Int!
        thirtyDayOrders: Int!
        thirtyDayGrossCents: Int!
        thirtyDayRefundCents: Int!
        thirtyDayNetCents: Int!
        averageBasketCents: Int!
      }

      type GroceryPlatformOrder {
        id: ID!
        displayId: Int!
        email: String!
        status: String!
        deliveryDate: String
        deliveryTimeWindow: String!
        createdAt: String
        currencyCode: String!
        subtotalCents: Int!
        taxCents: Int!
        deliveryFeeCents: Int!
        discountCents: Int!
        totalCents: Int!
        substitutionPreference: String
        metadata: JSON
        lineItems: [GroceryPlatformOrderLineItem!]!
        payments: [GroceryPlatformPayment!]!
      }

      type GroceryPlatformOrdersProjection {
        currencyCode: String!
        orders: [GroceryPlatformOrder!]!
        page: Int!
        pageSize: Int!
        totalOrders: Int!
        totalPages: Int!
        salesSummary: GroceryPlatformSalesSummary!
        pending: Int!
        picking: Int!
        packed: Int!
        outForDelivery: Int!
        delivered: Int!
      }

      type GroceryPlatformSubstitution {
        id: ID!
        orderItem: String!
        originalProduct: String!
        substitutedProduct: String!
        reason: String!
        customerApproved: Boolean!
        approvedAt: String
      }

      type GroceryPlatformFulfillmentProjection {
        pending: [GroceryPlatformOrder!]!
        picking: [GroceryPlatformOrder!]!
        packed: [GroceryPlatformOrder!]!
        orderItemSubstitutions: [GroceryPlatformSubstitution!]!
      }

      type GroceryPlatformDriver {
        id: ID!
        name: String!
        email: String!
      }

      type GroceryPlatformRouteOrder {
        id: ID!
        displayId: Int!
        status: String!
        metadata: JSON
      }

      type GroceryPlatformRoute {
        id: ID!
        date: String!
        timeWindow: String!
        status: String
        startedAt: String
        completedAt: String
        driver: GroceryPlatformDriver
        orders: [GroceryPlatformRouteOrder!]!
      }

      type GroceryPlatformDeliverySlot {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        capacity: Int!
        currentBookings: Int!
        isActive: Boolean!
        deliveryFee: Int!
      }

      type GroceryPlatformDeliveryProjection {
        deliveryRoutes: [GroceryPlatformRoute!]!
        readyOrders: [GroceryPlatformOrder!]!
        drivers: [GroceryPlatformDriver!]!
        deliverySlots: [GroceryPlatformDeliverySlot!]!
      }

      type GroceryPlatformPickupSlot {
        id: ID!
        date: String!
        startTime: String!
        endTime: String!
        maxOrders: Int!
        currentOrders: Int!
        isAvailable: Boolean!
      }

      type GroceryPlatformParkingSpot {
        id: ID!
        spotNumber: String!
        description: String
        isAccessible: Boolean!
        isAvailable: Boolean!
      }

      type GroceryPlatformPickupOrder {
        id: ID!
        displayId: Int!
        email: String!
        status: String!
        metadata: JSON
      }

      type GroceryPlatformPickupProjection {
        pickupSlots: [GroceryPlatformPickupSlot!]!
        parkingSpots: [GroceryPlatformParkingSpot!]!
        pickupOrders: [GroceryPlatformPickupOrder!]!
      }

      type GroceryPlatformInventoryProduct {
        id: ID!
        title: String!
        sku: String!
        stockQuantity: Int
        recordedStockQuantity: Int!
        lowStockThreshold: Int
        inStock: Boolean!
        activeBackInStockAlerts: Int!
        department: String
        supplier: GroceryPlatformSupplier
      }

      type GroceryPlatformInventoryLot {
        id: ID!
        lotNumber: String!
        expirationDate: String!
        quantity: Int!
        quantityRemaining: Int!
        location: String
        isExpired: Boolean!
        isExpiringSoon: Boolean!
        product: GroceryPlatformInventoryProductRef
        supplier: GroceryPlatformSupplier
      }

      type GroceryPlatformInventoryProductRef { id: ID!, title: String! }
      type GroceryPlatformSupplier { id: ID!, name: String! }
      type GroceryPlatformInventoryProjection {
        products: [GroceryPlatformInventoryProduct!]!
        inventoryLots: [GroceryPlatformInventoryLot!]!
      }

      type GroceryPlatformSupplierRow {
        id: ID!
        name: String!
        contactName: String
        email: String!
        phone: String
        paymentTerms: String
        deliveryDays: JSON
        minimumOrder: Float
        minimumOrderCents: Int!
        products: [GroceryPlatformInventoryProductRef!]!
        purchaseOrders: [GroceryPlatformPurchaseOrderRef!]!
      }
      type GroceryPlatformPurchaseOrderRef { id: ID!, status: String }
      type GroceryPlatformSuppliersProjection { currencyCode: String!, suppliers: [GroceryPlatformSupplierRow!]! }

      type GroceryPlatformPurchaseOrder {
        id: ID!
        poNumber: String!
        orderDate: String!
        expectedDeliveryDate: String
        status: String
        totalAmount: Float
        totalAmountCents: Int
        notes: String
        isDueSoon: Boolean!
        supplier: GroceryPlatformSupplier
        items: [GroceryPlatformPurchaseItem!]!
      }
      type GroceryPlatformPurchaseItem { id: ID!, productTitle: String!, productSku: String!, quantity: Int!, quantityReceived: Int!, unitCost: Float!, unitCostCents: Int! }
      type GroceryPlatformPurchasingProjection { currencyCode: String!, purchaseOrders: [GroceryPlatformPurchaseOrder!]! }

      type GroceryPlatformDepartment {
        id: ID!
        name: String!
        handle: String!
        sortOrder: Int
        isActive: Boolean!
        temperatureZone: String
        products: [GroceryPlatformInventoryProductRef!]!
      }
      type GroceryPlatformCoupon {
        id: ID!
        code: String!
        discountType: String!
        discountValue: Float
        discountValueCents: Int!
        minPurchase: Float
        minPurchaseCents: Int!
        maxUses: Int!
        currentUses: Int!
        productCategories: JSON
        isActive: Boolean!
        validFrom: String
        validTo: String
      }
      type GroceryPlatformMerchandisingProjection {
        currencyCode: String!
        departments: [GroceryPlatformDepartment!]!
        coupons: [GroceryPlatformCoupon!]!
      }

      type GroceryPlatformCustomer {
        id: ID!
        name: String!
        email: String!
        onboardingStatus: String
        createdAt: String!
        orderCount: Int!
        shoppingListCount: Int!
        lastOrder: GroceryPlatformCustomerLastOrder
      }
      type GroceryPlatformCustomerLastOrder { displayId: Int!, status: String!, createdAt: String! }
      type GroceryPlatformCustomersProjection {
        users: [GroceryPlatformCustomer!]!
        totalCustomers: Int!
        savedCarts: Int!
      }

      type GroceryPlatformPaymentOrder { id: ID!, displayId: Int!, status: String! }
      type GroceryPlatformPaymentRow {
        id: ID!
        amountCents: Int!
        status: String!
        paymentMethod: String
        providerPaymentId: String
        providerCode: String!
        processedAt: String
        createdAt: String!
        errorMessage: String
        order: GroceryPlatformPaymentOrder!
        refunds: [GroceryPlatformPaymentRefund!]!
      }
      type GroceryPlatformPaymentProviderTruth {
        id: ID!
        name: String!
        code: String!
        isInstalled: Boolean!
        publicCheckout: Boolean!
        runtimeConfigured: Boolean!
      }
      type GroceryPlatformPaymentSummary {
        paymentCount: Int!
        failedCount: Int!
        processingCount: Int!
        capturedCents: Int!
        refundedCents: Int!
        netCents: Int!
        recovery: JSON!
      }
      type GroceryPlatformPaymentsProjection {
        currencyCode: String!
        payments: [GroceryPlatformPaymentRow!]!
        providers: [GroceryPlatformPaymentProviderTruth!]!
        summary: GroceryPlatformPaymentSummary!
      }

      type GroceryPlatformStoreTruth { id: ID!, name: String!, timezone: String!, currencyCode: String!, isActive: Boolean! }
      type GroceryPlatformSettingsTruth {
        id: ID!
        name: String!
        tagline: String!
        homepageTitle: String!
        homepageDescription: String!
        contactEmail: String!
        contactPhone: String!
        address: String!
        logoUrl: String!
        brandHue: Int
        currencyCode: String!
        taxRateBps: Int!
        locale: String!
        timezone: String!
        countryCode: String!
        hours: JSON!
        isActive: Boolean!
      }
      type GroceryPlatformSettingsCounts { products: Int!, suppliers: Int!, deliverySlots: Int!, pickupSlots: Int!, parkingSpots: Int! }
      type GroceryPlatformSettingsProjection { store: GroceryPlatformStoreTruth!, settings: GroceryPlatformSettingsTruth!, counts: GroceryPlatformSettingsCounts! }

      type Query {
        groceryPlatformOrders(page: Int, pageSize: Int): GroceryPlatformOrdersProjection!
        groceryPlatformFulfillment: GroceryPlatformFulfillmentProjection!
        groceryPlatformDelivery: GroceryPlatformDeliveryProjection!
        groceryPlatformPickup: GroceryPlatformPickupProjection!
        groceryPlatformInventory: GroceryPlatformInventoryProjection!
        groceryPlatformSuppliers: GroceryPlatformSuppliersProjection!
        groceryPlatformPurchasing: GroceryPlatformPurchasingProjection!
        groceryPlatformMerchandising: GroceryPlatformMerchandisingProjection!
        groceryPlatformCustomers: GroceryPlatformCustomersProjection!
        groceryPlatformPayments: GroceryPlatformPaymentsProjection!
        groceryPlatformSettings: GroceryPlatformSettingsProjection!
        redirectToInit: Boolean
        groceryCart(sessionId: String): GroceryCart
        clippedCoupons: [ClippedCoupon!]!
        activeCartPaymentProviders: [PaymentProvider!]!
        guestGroceryOrder(orderId: ID!, sessionId: String!, token: String!): Order
        publicGroceryCoupons: [PublicGroceryCoupon!]!
        publicGroceryStorefrontSettings: PublicGroceryStorefrontSettings!
        publicGroceryProducts(department: String, search: String, availability: String, organic: Boolean, sort: String, take: Int, skip: Int, ids: [ID!]): PublicGroceryProductConnection!
        publicGroceryProduct(handle: String!): PublicGroceryProduct
        publicGroceryAvailability(days: Int): PublicGroceryAvailability!
        groceryOutboxStatus: GroceryOutboxStatusResult!

        # Pickup Slot queries
        availablePickupSlots(days: Int, minCapacity: Int): [PickupSlotResult!]!
        pickupSlotsByDate(days: Int, minCapacity: Int): [PickupSlotsByDateResult!]!

        # Parking Spot queries
        availableParkingSpots(accessibleOnly: Boolean): [ParkingSpotResult!]!
      }

      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        provisionGroceryCustomer(name: String!, email: String!, temporaryPassword: String!): ProvisionGroceryCustomerResult!
        initiatePaymentSession(cartId: ID!, paymentProviderId: String!, deliverySlotId: ID, pickupSlotId: ID, sessionId: String, couponCode: String, recovery: CheckoutRecoveryInput!): PaymentSession
        addItemToGroceryCart(productId: ID!, quantity: Int!, sessionId: String): GroceryCart
        updateGroceryCartItem(itemId: ID!, quantity: Int!, sessionId: String): GroceryCart
        removeItemFromGroceryCart(itemId: ID!, sessionId: String): GroceryCart
        clearGroceryCart(sessionId: String): GroceryCart
        mergeGuestGroceryCart(guestSessionId: String!): GroceryCart
        updateGrocerySubstitutionPreference(itemId: ID!, preference: String!, sessionId: String): GroceryCart
        requestGroceryBackInStockAlert(productId: ID!): BackInStockRequestResult!

        # Shopping List mutations
        createCustomerShoppingList(name: String!): ShoppingList!
        deleteCustomerShoppingList(listId: ID!): DeleteShoppingListResult!
        addToShoppingList(listId: ID!, product: String!, quantity: Int, unit: String, notes: String): ShoppingListResult!
        removeFromShoppingList(listId: ID!, itemId: ID!): ShoppingListResult!
        updateShoppingListItemQuantity(listId: ID!, itemId: ID!, quantity: Int!): ShoppingListResult!
        toggleShoppingListItemChecked(listId: ID!, itemId: ID!): ShoppingListResult!
        addShoppingListToCart(listId: ID!, sessionId: String): AddListToCartResult!

        # Customer Check-in mutations
        customerCheckIn(orderId: ID!, parkingSpotId: ID, vehicleDescription: String): CustomerCheckInResult!
        guestCustomerCheckIn(orderId: ID!, sessionId: String!, token: String!, parkingSpotId: ID, vehicleDescription: String): CustomerCheckInResult!
        releaseParkingSpot(parkingSpotId: ID!, orderId: ID!): ReleaseParkingSpotResult!
        completeOrderHandoff(orderId: ID!): CompleteOrderHandoffResult!
        createDeliveryRouteFromOrders(deliveryDate: String!, deliveryTimeWindow: String!, orderIds: [ID!]!, driverId: ID!): DeliveryRouteWorkflowResult!
        updateDeliveryRouteWorkflow(routeId: ID!, status: String!): DeliveryRouteWorkflowResult!
        submitGroceryOrder(data: SubmitGroceryOrderInput!): SubmitGroceryOrderResult!
        cancelGroceryOrder(orderId: ID!, reason: String!, idempotencyKey: String!): OrderCancellationResult!
        reconcileCheckoutAttempts(limit: Int): CheckoutReconciliationResult!
        reconcilePaymentRefunds(limit: Int): RefundReconciliationResult!
        updateSupplierMinimumOrder(supplierId: ID!, minimumOrderCents: Int!): SupplierMinimumOrderResult!
        handlePaymentProviderWebhook(providerCode: String!, rawBody: String!, headers: JSON): PaymentWebhookResult!
        refundPayment(paymentId: ID!, amountCents: Int!, reason: String!, idempotencyKey: String!): PaymentRefundResult!
        runGroceryOnboarding(seed: JSON): GroceryOnboardingResult!
        updateGroceryStorefrontBrandHue(brandHue: Int): StorefrontBrandHueResult!
        advanceOrderFulfillment(orderId: ID!, target: String!): OrderFulfillmentWorkflowResult!
        recordOrderItemSubstitution(orderItemId: ID!, substitutedProduct: String!, reason: String, customerApproved: Boolean, idempotencyKey: String!): OrderItemSubstitutionWorkflowResult!
        claimGroceryOutboxEvents(workerId: String!, limit: Int): [GroceryOutboxEventResult!]!
        completeGroceryOutboxEvent(eventId: ID!, claimToken: String!, succeeded: Boolean!, error: String): GroceryOutboxEventResult!
        replayGroceryOutboxEvent(eventId: ID!): GroceryOutboxEventResult!
        configureDeliverySlot(slotId: ID!, capacity: Int, deliveryFee: Int, isActive: Boolean, idempotencyKey: String!): StoreCapacityResult!
        configurePickupSlot(slotId: ID!, maxOrders: Int, isAvailable: Boolean, idempotencyKey: String!): StoreCapacityResult!
        configureParkingSpot(spotId: ID!, isAvailable: Boolean!, idempotencyKey: String!): StoreCapacityResult!
        adjustInventoryLot(inventoryLotId: ID!, targetQuantityRemaining: Int!, reason: String!, idempotencyKey: String!, note: String): InventoryAdjustmentResult!
        createPurchaseOrderDraft(idempotencyKey: String!, supplierId: ID!, expectedDeliveryDate: String, notes: String, items: [PurchaseOrderDraftItemInput!]!): PurchaseOrderDraftResult!
        removePurchaseOrderDraftItem(purchaseOrderId: ID!, poItemId: ID!): PurchaseOrderDraftItemRemovalResult!
        transitionPurchaseOrder(purchaseOrderId: ID!, status: String!): PurchaseOrderWorkflowResult!
        receivePurchaseOrder(purchaseOrderId: ID!, receipts: [PurchaseOrderReceiptInput!]!): PurchaseOrderWorkflowResult!
      }

      input SubmitGroceryOrderAddressInput {
        firstName: String!
        lastName: String!
        address1: String!
        city: String!
        province: String!
        postalCode: String!
        phone: String!
      }

      input CheckoutRecoveryInput {
        email: String!
        deliveryAddress: SubmitGroceryOrderAddressInput!
        substitutionPreference: String!
        deliveryInstructions: String
      }

      input SubmitGroceryOrderInput {
        cartId: ID!
        paymentSessionId: ID!
        paymentIntentId: String!
        sessionId: String
        couponCode: String
        email: String!
        deliveryAddress: SubmitGroceryOrderAddressInput!
        deliveryDate: String!
        deliveryTimeWindow: String!
        fulfillmentMethod: String!
        deliverySlotId: ID
        pickupSlotId: ID
        deliveryFee: Float!
        expectedTotal: Float!
        substitutionPreference: String!
        deliveryInstructions: String
      }

      type SubmitGroceryOrderResult {
        success: Boolean!
        orderId: ID
        displayId: Int
        guestOrderToken: String
        message: String!
      }
    `,
    resolvers: {
      JSON: JSONScalar,
      Query: {
        groceryPlatformOrders,
        groceryPlatformFulfillment,
        groceryPlatformDelivery,
        groceryPlatformPickup,
        groceryPlatformInventory,
        groceryPlatformSuppliers,
        groceryPlatformPurchasing,
        groceryPlatformMerchandising,
        groceryPlatformCustomers,
        groceryPlatformPayments,
        groceryPlatformSettings,
        redirectToInit: redirectToInit_default,
        groceryCart: getCart,
        clippedCoupons: getClippedCoupons,
        activeCartPaymentProviders: async (_root, _args, context) => {
          return context.sudo().query.PaymentProvider.findMany({
            where: {
              code: { equals: STRIPE_PROVIDER_CODE },
              isInstalled: { equals: true }
            },
            query: "id name code isInstalled"
          });
        },
        guestGroceryOrder: getGuestGroceryOrder,
        publicGroceryCoupons: getPublicGroceryCoupons,
        publicGroceryStorefrontSettings: getPublicGroceryStorefrontSettings,
        publicGroceryProducts: getPublicGroceryProducts,
        publicGroceryProduct: getPublicGroceryProduct,
        publicGroceryAvailability: getPublicGroceryAvailability,
        groceryOutboxStatus,
        availablePickupSlots: getAvailablePickupSlots,
        pickupSlotsByDate: getPickupSlotsByDate,
        availableParkingSpots: getAvailableParkingSpots
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        provisionGroceryCustomer,
        initiatePaymentSession,
        addItemToGroceryCart: addToCart,
        updateGroceryCartItem: updateCartItem,
        removeItemFromGroceryCart: removeFromCart,
        clearGroceryCart: clearCart,
        mergeGuestGroceryCart: mergeGuestCart,
        updateGrocerySubstitutionPreference: updateSubstitutionPreference,
        requestGroceryBackInStockAlert,
        // Recipe mutations
        // Shopping List mutations
        createCustomerShoppingList: createShoppingList,
        deleteCustomerShoppingList: deleteShoppingList,
        addToShoppingList: addToList,
        removeFromShoppingList: removeFromList,
        updateShoppingListItemQuantity: updateListItemQuantity,
        toggleShoppingListItemChecked: toggleListItemChecked,
        addShoppingListToCart: addListToCart,
        // Customer Check-in mutations
        customerCheckIn,
        guestCustomerCheckIn,
        releaseParkingSpot,
        completeOrderHandoff,
        createDeliveryRouteFromOrders,
        updateDeliveryRouteWorkflow,
        submitGroceryOrder,
        cancelGroceryOrder,
        reconcileCheckoutAttempts,
        reconcilePaymentRefunds,
        updateSupplierMinimumOrder,
        handlePaymentProviderWebhook,
        refundPayment: refundPaymentForOrder,
        runGroceryOnboarding,
        updateGroceryStorefrontBrandHue,
        advanceOrderFulfillment,
        recordOrderItemSubstitution,
        claimGroceryOutboxEvents,
        completeGroceryOutboxEvent,
        replayGroceryOutboxEvent,
        configureDeliverySlot,
        configurePickupSlot,
        configureParkingSpot,
        adjustInventoryLot,
        createPurchaseOrderDraft,
        removePurchaseOrderDraftItem,
        transitionPurchaseOrder,
        receivePurchaseOrder
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (value) {
    const parsed = new URL(value);
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      throw new Error("Password reset origin must use HTTPS in production");
    }
    return value.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
  return "http://localhost:3000";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  if (process.env.NODE_ENV === "production" && (!process.env.SMTP_HOST || !process.env.SMTP_FROM)) {
    throw new Error("SMTP_HOST and SMTP_FROM are required in production");
  }
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/lib/graphqlSecurity.ts
var import_graphql2 = require("graphql");

// features/keystone/lib/proxyIdentity.ts
var import_node_crypto8 = require("node:crypto");
function normalizeIp(ip) {
  const trimmed = ip.trim();
  return trimmed.startsWith("::ffff:") ? trimmed.slice("::ffff:".length) : trimmed;
}
function verifyProxyIdentity(value, secret2, nowSeconds = Math.floor(Date.now() / 1e3)) {
  const parts = value.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) return null;
  const expected = (0, import_node_crypto8.createHmac)("sha256", secret2).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (parts[2].length !== expected.length || !(0, import_node_crypto8.timingSafeEqual)(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload?.version !== 1 || typeof payload.ip !== "string" || !payload.ip || !Number.isInteger(payload.issuedAt)) return null;
  if (Math.abs(nowSeconds - payload.issuedAt) > 60) return null;
  return { ...payload, ip: normalizeIp(payload.ip) };
}

// features/keystone/lib/graphqlSecurity.ts
var MAX_GRAPHQL_QUERY_LENGTH = 1e5;
var MAX_GRAPHQL_DEPTH = 12;
function fragmentMap(document2) {
  return new Map(document2.definitions.filter((definition) => definition.kind === import_graphql2.Kind.FRAGMENT_DEFINITION).map((fragment) => [fragment.name.value, fragment]));
}
function depthOfSelectionSet(selectionSet, fragments, depth, seen, report) {
  if (!selectionSet) return depth;
  let maximum = depth;
  for (const selection of selectionSet.selections) {
    if (selection.kind === import_graphql2.Kind.FRAGMENT_SPREAD) {
      if (seen.has(selection.name.value)) continue;
      const nextSeen = new Set(seen).add(selection.name.value);
      maximum = Math.max(maximum, depthOfSelectionSet(fragments.get(selection.name.value)?.selectionSet, fragments, depth + 1, nextSeen, report));
      continue;
    }
    if (selection.kind === import_graphql2.Kind.INLINE_FRAGMENT) {
      maximum = Math.max(maximum, depthOfSelectionSet(selection.selectionSet, fragments, depth + 1, seen, report));
      continue;
    }
    const nextDepth = depth + 1;
    if (nextDepth > MAX_GRAPHQL_DEPTH) report(selection);
    maximum = Math.max(maximum, depthOfSelectionSet(selection.selectionSet, fragments, nextDepth, seen, report));
  }
  return maximum;
}
var boundedGraphqlDepthRule = (context) => ({
  Document(node) {
    const fragments = fragmentMap(node);
    for (const definition of node.definitions) {
      if (definition.kind === import_graphql2.Kind.OPERATION_DEFINITION) {
        depthOfSelectionSet(definition.selectionSet, fragments, 0, /* @__PURE__ */ new Set(), (selection) => context.reportError(new import_graphql2.GraphQLError(`GraphQL query depth exceeds ${MAX_GRAPHQL_DEPTH}`, { nodes: selection })));
      }
    }
  }
});
var rejectIntrospectionInProduction = (context) => ({
  Field(node) {
    if (process.env.NODE_ENV === "production" && (node.name.value === "__schema" || node.name.value === "__type")) {
      context.reportError(new import_graphql2.GraphQLError("GraphQL introspection is disabled in production", { nodes: node }));
    }
  }
});
function documentFor(query) {
  try {
    return (0, import_graphql2.parse)(query || "");
  } catch {
    return null;
  }
}
function operationDefinitions(query) {
  return documentFor(query)?.definitions.filter((definition) => definition.kind === import_graphql2.Kind.OPERATION_DEFINITION) || [];
}
function isGraphqlMutation(query) {
  return operationDefinitions(query).some((definition) => definition.operation === "mutation" || definition.operation === "subscription");
}
function isDangerousAuthOperation(query) {
  const document2 = documentFor(query);
  if (!document2) return false;
  const fragments = fragmentMap(document2);
  const names = /* @__PURE__ */ new Set([
    "authenticateUserWithPassword",
    "createInitialUser",
    "sendUserPasswordResetLink",
    "redeemUserPasswordResetToken"
  ]);
  const visit = (selectionSet, seen) => selectionSet?.selections.some((selection) => {
    if (selection.kind === import_graphql2.Kind.FIELD && names.has(selection.name.value)) return true;
    if (selection.kind === import_graphql2.Kind.INLINE_FRAGMENT) return visit(selection.selectionSet, seen);
    if (selection.kind === import_graphql2.Kind.FRAGMENT_SPREAD && !seen.has(selection.name.value)) return visit(fragments.get(selection.name.value)?.selectionSet, new Set(seen).add(selection.name.value));
    return false;
  }) || false;
  return operationDefinitions(query).some((definition) => visit(definition.selectionSet, /* @__PURE__ */ new Set()));
}
function requestIp(headers) {
  if (process.env.TRUSTED_PROXY !== "true") return "untrusted-proxy";
  const identity = headers?.get("x-grocery-proxy-identity")?.trim() || "";
  const secret2 = process.env.TRUSTED_PROXY_IDENTITY_SECRET?.trim() || "";
  return verifyProxyIdentity(identity, secret2)?.ip || "unverified-proxy";
}

// features/keystone/lib/graphqlRateLimit.ts
var import_node_crypto9 = require("node:crypto");
var import_graphql3 = require("graphql");
var WINDOW_MS = 6e4;
var ANONYMOUS_QUERY_LIMIT = 120;
var AUTHENTICATED_QUERY_LIMIT = 600;
var ANONYMOUS_MUTATION_LIMIT = 40;
var AUTHENTICATED_MUTATION_LIMIT = 120;
var AUTH_LIMIT = 8;
async function consumeSharedBucket(prisma, key2, limit) {
  const now = /* @__PURE__ */ new Date();
  const result = await prisma.$queryRawUnsafe(`
    INSERT INTO "RateLimitBucket" ("id", "key", "windowStartedAt", "requestCount", "createdAt", "updatedAt")
    VALUES (md5($1 || $2::text), $1, $2, 1, $2, $2)
    ON CONFLICT ("key") DO UPDATE SET
      "windowStartedAt" = CASE WHEN EXTRACT(EPOCH FROM ($2 - "RateLimitBucket"."windowStartedAt")) * 1000 >= ${WINDOW_MS} THEN $2 ELSE "RateLimitBucket"."windowStartedAt" END,
      "requestCount" = CASE WHEN EXTRACT(EPOCH FROM ($2 - "RateLimitBucket"."windowStartedAt")) * 1000 >= ${WINDOW_MS} THEN 1 ELSE "RateLimitBucket"."requestCount" + 1 END,
      "updatedAt" = $2
    RETURNING "requestCount"
  `, key2, now);
  if (Number(result[0]?.requestCount || 0) > limit) throw new import_graphql3.GraphQLError("Too many requests; retry later", { extensions: { code: "RATE_LIMITED" } });
}
async function enforceGraphqlRateLimit({
  prisma,
  headers,
  identity,
  query
}) {
  if (query.length > MAX_GRAPHQL_QUERY_LENGTH) throw new import_graphql3.GraphQLError("GraphQL request is too large", { extensions: { code: "QUERY_TOO_LARGE" } });
  if (!prisma) throw new import_graphql3.GraphQLError("Rate limiter unavailable", { extensions: { code: "RATE_LIMITER_UNAVAILABLE" } });
  const ip = requestIp(headers);
  const operationClass = isDangerousAuthOperation(query) ? "auth" : isGraphqlMutation(query) ? "mutation" : "query";
  const limit = operationClass === "auth" ? AUTH_LIMIT : operationClass === "mutation" ? identity ? AUTHENTICATED_MUTATION_LIMIT : ANONYMOUS_MUTATION_LIMIT : identity ? AUTHENTICATED_QUERY_LIMIT : ANONYMOUS_QUERY_LIMIT;
  const key2 = (0, import_node_crypto9.createHash)("sha256").update(`${ip}:${identity || "anonymous"}:${operationClass}`).digest("hex");
  await consumeSharedBucket(prisma, key2, limit);
}
function graphqlRateLimitPlugin() {
  return {
    async requestDidStart(requestContext) {
      const context = requestContext.contextValue;
      await enforceGraphqlRateLimit({
        prisma: context?.prisma,
        headers: requestContext.request.http?.headers,
        identity: context?.session?.itemId,
        query: requestContext.request.query || ""
      });
      return {};
    }
  };
}

// lib/applicationOrigin.ts
function firstHeaderValue(value) {
  return value?.split(",")[0]?.trim() || null;
}
function validatedOrigin(value, label) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${label} must use credential-free HTTP or HTTPS`);
  }
  return url.origin;
}
function resolveApplicationOrigin({
  headers,
  nodeEnv = process.env.NODE_ENV,
  canonicalSiteUrl: canonicalSiteUrl2 = process.env.NEXT_PUBLIC_SITE_URL,
  port = process.env.PORT
} = {}) {
  if (nodeEnv === "production") {
    if (!canonicalSiteUrl2?.trim()) throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
    const origin = validatedOrigin(canonicalSiteUrl2.trim(), "NEXT_PUBLIC_SITE_URL");
    if (!origin.startsWith("https://")) throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production");
    return origin;
  }
  const host = firstHeaderValue(headers?.get("x-forwarded-host") || headers?.get("host") || null);
  if (host) {
    const forwardedProtocol = firstHeaderValue(headers?.get("x-forwarded-proto") || null)?.toLowerCase();
    const localHost = host === "localhost" || host.startsWith("localhost:") || host === "127.0.0.1" || host.startsWith("127.0.0.1:") || host === "[::1]" || host.startsWith("[::1]:");
    const protocol = forwardedProtocol || (localHost ? "http" : "https");
    if (protocol !== "http" && protocol !== "https") throw new Error("Forwarded application protocol must be HTTP or HTTPS");
    return validatedOrigin(`${protocol}://${host}`, "Request origin");
  }
  const fallbackPort = port?.trim() || "3000";
  if (!/^\d+$/.test(fallbackPort)) throw new Error("PORT must be numeric");
  return `http://localhost:${fallbackPort}`;
}

// features/keystone/index.ts
var databaseURL = getDatabaseUrl();
assertProductionPaymentConfig();
var publicStoreId = getPublicStoreId();
var production = isProduction();
var canonicalSiteUrl = production ? getCanonicalSiteUrl() : null;
function passwordResetOrigin(context) {
  const requestHeaders = context.req?.headers;
  return resolveApplicationOrigin({
    nodeEnv: production ? "production" : "development",
    canonicalSiteUrl: canonicalSiteUrl || void 0,
    headers: requestHeaders ? {
      get(name) {
        const value = requestHeaders[name.toLowerCase()];
        return Array.isArray(value) ? value.join(",") : value || null;
      }
    } : null
  });
}
var sessionConfig = {
  maxAge: getSessionMaxAge(),
  secret: getSessionSecret(),
  secure: isProduction(),
  sameSite: "lax"
};
var { bucketName, region, accessKeyId, secretAccessKey, endpoint } = getStorageConfig();
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      store: { connect: { id: publicStoreId } },
      role: {
        create: {
          store: { connect: { id: publicStoreId } },
          name: "Admin",
          canManageProducts: true,
          canManageOrders: true,
          canManageInventory: true,
          canManageSuppliers: true,
          canManageDelivery: true,
          canManageUsers: true,
          canManagePayments: true,
          canManageOnboarding: true,
          canAccessDashboard: true
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity, passwordResetOrigin(args.context));
    }
  },
  sessionData: `
    name
    email
    store { id code name }
    role {
      id
      name
      canManageProducts
      canManageOrders
      canManageInventory
      canManageSuppliers
      canManageDelivery
      canManageUsers
      canManagePayments
      canManageOnboarding
      canAccessDashboard
    }
  `
});
var keystone_default = withAuth(
  (0, import_core45.config)({
    db: {
      provider: "postgresql",
      url: databaseURL
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      // UI visibility is not authorization; List/custom operation access below
      // resolves current capabilities from the database.
      isAccessAllowed: ({ session }) => session?.data.role?.canAccessDashboard ?? false
    },
    session: (0, import_session.statelessSessions)(sessionConfig),
    graphql: {
      extendGraphqlSchema,
      playground: !production,
      debug: !production,
      bodyParser: { limit: "1mb" },
      cors: { origin: canonicalSiteUrl || true, credentials: true },
      apolloConfig: {
        validationRules: [boundedGraphqlDepthRule, rejectIntrospectionInProduction],
        plugins: [graphqlRateLimitPlugin()]
      }
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
