"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __glob = (map) => (path) => {
  var fn = map[path];
  if (fn) return fn();
  throw new Error("Module not found in bundle: " + path);
};
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
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
async function createPaymentFunction({ cart, amount, currency }) {
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
  });
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
async function refundPaymentFunction({ paymentId, amount }) {
  const stripe = getStripeClient();
  const refund = await stripe.refunds.create({
    payment_intent: paymentId,
    amount
  });
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
async function handleWebhookFunction({ event, headers }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }
  const stripe = getStripeClient();
  try {
    const stripeEvent = stripe.webhooks.constructEvent(
      JSON.stringify(event),
      headers["stripe-signature"],
      webhookSecret
    );
    return {
      isValid: true,
      event: stripeEvent,
      type: stripeEvent.type,
      resource: stripeEvent.data.object
    };
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err?.message || "Unknown error"}`);
  }
}
var import_stripe, getStripeClient;
var init_stripe = __esm({
  "features/integrations/payment/stripe.ts"() {
    "use strict";
    import_stripe = __toESM(require("stripe"));
    getStripeClient = () => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        throw new Error("Stripe secret key not configured");
      }
      return new import_stripe.default(stripeKey, {
        apiVersion: "2025-08-27.basil"
      });
    };
  }
});

// features/integrations/payment/manual.ts
var manual_exports = {};
__export(manual_exports, {
  capturePaymentFunction: () => capturePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  refundPaymentFunction: () => refundPaymentFunction2
});
async function createPaymentFunction2({ amount }) {
  return {
    clientSecret: `manual_secret_${Date.now()}`,
    paymentIntentId: `manual_${Date.now()}`,
    amount,
    provider: "manual"
  };
}
async function capturePaymentFunction2({ paymentId, amount }) {
  return {
    status: "succeeded",
    amount,
    data: { id: paymentId, provider: "manual" }
  };
}
async function refundPaymentFunction2({ paymentId, amount }) {
  return {
    status: "refunded",
    amount,
    data: { id: paymentId, provider: "manual" }
  };
}
async function getPaymentStatusFunction2({ paymentId }) {
  return {
    status: "succeeded",
    amount: 0,
    data: { id: paymentId, provider: "manual" }
  };
}
async function generatePaymentLinkFunction2({ paymentId }) {
  return `manual://${paymentId}`;
}
async function handleWebhookFunction2({ event }) {
  return {
    isValid: true,
    type: event?.type || "manual.event",
    resource: event
  };
}
var init_manual = __esm({
  "features/integrations/payment/manual.ts"() {
    "use strict";
  }
});

// features/integrations/payment/index.ts
var payment_exports = {};
__export(payment_exports, {
  paymentProviderAdapters: () => paymentProviderAdapters
});
var paymentProviderAdapters;
var init_payment = __esm({
  "features/integrations/payment/index.ts"() {
    "use strict";
    paymentProviderAdapters = {
      stripe: () => Promise.resolve().then(() => (init_stripe(), stripe_exports)),
      manual: () => Promise.resolve().then(() => (init_manual(), manual_exports))
    };
  }
});

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core36 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/Address.ts
var import_core = require("@keystone-6/core");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/access.ts
function isSignedIn({ session }) {
  return Boolean(session);
}
var permissions = {
  canManageProducts: ({ session }) => session?.data.role?.canManageProducts ?? false,
  canManageOrders: ({ session }) => session?.data.role?.canManageOrders ?? false,
  canManageInventory: ({ session }) => session?.data.role?.canManageInventory ?? false,
  canManageSuppliers: ({ session }) => session?.data.role?.canManageSuppliers ?? false,
  canManageDelivery: ({ session }) => session?.data.role?.canManageDelivery ?? false,
  canManageUsers: ({ session }) => session?.data.role?.canManageUsers ?? false,
  canManagePayments: ({ session }) => session?.data.role?.canManagePayments ?? false,
  canManageOnboarding: ({ session }) => session?.data.role?.canManageOnboarding ?? false,
  canAccessDashboard: ({ session }) => session?.data.role?.canAccessDashboard ?? false
};

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
      query: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      }
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
      ref: "User",
      label: "User"
    }),
    ...trackingFields
  }
});

// features/keystone/models/BackInStockAlert.ts
var import_core2 = require("@keystone-6/core");
var import_fields3 = require("@keystone-6/core/fields");
var BackInStockAlert = (0, import_core2.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      }
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
      label: "Product",
      ui: {
        description: "Product ID to monitor for stock availability"
      }
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
      query: ({ session }) => permissions.canManageOrders({ session }),
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders
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
    customer: (0, import_fields4.relationship)({
      ref: "User",
      label: "Customer",
      ui: {
        description: "The logged-in user who owns this cart"
      }
    }),
    // For guest users
    sessionId: (0, import_fields4.text)({
      label: "Session ID",
      isIndexed: true,
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
      label: "Subtotal",
      ui: {
        description: "Cart subtotal before tax and fees"
      }
    }),
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

// features/keystone/models/CartItem.ts
var import_core4 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var CartItem = (0, import_core4.list)({
  access: {
    operation: {
      query: ({ session }) => permissions.canManageOrders({ session }),
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders
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
    cart: (0, import_fields5.relationship)({
      ref: "Cart.items",
      label: "Cart",
      ui: {
        description: "The cart this item belongs to"
      }
    }),
    // Product relationship
    product: (0, import_fields5.relationship)({
      ref: "Product",
      label: "Product",
      ui: {
        description: "The product in this cart item"
      }
    }),
    // Quantity
    quantity: (0, import_fields5.integer)({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: {
        description: "Number of units in cart"
      }
    }),
    // Calculated subtotal for this item
    subtotal: (0, import_fields5.float)({
      defaultValue: 0,
      label: "Subtotal",
      ui: {
        description: "Price x Quantity"
      }
    }),
    // Grocery-specific: substitution preference
    substitutionPreference: (0, import_fields5.select)({
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
    addedAt: (0, import_fields5.timestamp)({
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
var import_core5 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
var Coupon = (0, import_core5.list)({
  access: {
    operation: {
      query: () => true,
      // Public can view coupons
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageProducts({ session })) {
          return true;
        }
        return {
          isActive: {
            equals: true
          }
        };
      }
    }
  },
  ui: {
    labelField: "code",
    listView: {
      initialColumns: ["code", "discountType", "discountValue", "isActive", "validFrom", "validTo"]
    }
  },
  fields: {
    code: (0, import_fields6.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Coupon Code",
      ui: {
        description: "Unique coupon code that customers will enter"
      }
    }),
    discountType: (0, import_fields6.select)({
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
    discountValue: (0, import_fields6.float)({
      label: "Discount Value",
      ui: {
        description: "Percentage (0-100) or fixed dollar amount"
      },
      validation: { min: 0 }
    }),
    minPurchase: (0, import_fields6.float)({
      label: "Minimum Purchase",
      ui: {
        description: "Minimum order amount required to use this coupon"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    maxUses: (0, import_fields6.integer)({
      label: "Maximum Uses",
      ui: {
        description: "Total number of times this coupon can be used (0 = unlimited)"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    currentUses: (0, import_fields6.integer)({
      label: "Current Uses",
      ui: {
        description: "Number of times this coupon has been used"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    validFrom: (0, import_fields6.timestamp)({
      label: "Valid From",
      ui: {
        description: "Date when coupon becomes active"
      }
    }),
    validTo: (0, import_fields6.timestamp)({
      label: "Valid To",
      ui: {
        description: "Date when coupon expires"
      }
    }),
    productCategories: (0, import_fields6.json)({
      label: "Product Categories",
      ui: {
        description: "JSON array of department/category slugs this coupon applies to (empty = all)"
      }
    }),
    excludedProducts: (0, import_fields6.json)({
      label: "Excluded Products",
      ui: {
        description: "JSON array of product IDs excluded from this coupon"
      }
    }),
    isActive: (0, import_fields6.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this coupon is currently active"
      }
    }),
    // Relationships
    userCoupons: (0, import_fields6.relationship)({
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
var import_core6 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");
var Department = (0, import_core6.list)({
  access: {
    operation: {
      query: () => true,
      // Public can read departments
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "handle", "temperatureZone", "sortOrder", "isActive"]
    }
  },
  fields: {
    name: (0, import_fields7.text)({
      validation: { isRequired: true },
      label: "Department Name",
      ui: {
        description: "e.g., Produce, Meat, Dairy, Bakery, Frozen, etc."
      }
    }),
    handle: (0, import_fields7.text)({
      isIndexed: "unique",
      label: "Handle",
      ui: {
        description: "URL-friendly identifier (e.g., 'produce', 'meat-seafood')"
      }
    }),
    description: (0, import_fields7.text)({
      ui: {
        displayMode: "textarea",
        description: "Brief description shown on storefront"
      }
    }),
    imageUrl: (0, import_fields7.text)({
      label: "Image URL",
      ui: {
        description: "URL of the department image"
      }
    }),
    sortOrder: (0, import_fields7.integer)({
      defaultValue: 0,
      label: "Sort Order",
      ui: {
        description: "Display order on storefront (lower numbers first)"
      }
    }),
    isActive: (0, import_fields7.checkbox)({
      defaultValue: true,
      label: "Active",
      ui: {
        description: "Show this department on the storefront"
      }
    }),
    temperatureZone: (0, import_fields7.select)({
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
    requiredLicenses: (0, import_fields7.multiselect)({
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
    manager: (0, import_fields7.relationship)({
      ref: "User",
      label: "Department Manager",
      ui: {
        description: "User responsible for this department"
      }
    }),
    products: (0, import_fields7.relationship)({
      ref: "Product.departmentRef",
      many: true,
      label: "Products"
    }),
    ...trackingFields
  }
});

// features/keystone/models/DeliveryRoute.ts
var import_core7 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var DeliveryRoute = (0, import_core7.list)({
  access: {
    operation: {
      query: permissions.canManageDelivery,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery
    }
  },
  ui: {
    listView: {
      initialColumns: ["driver", "date", "timeWindow", "status"]
    }
  },
  fields: {
    date: (0, import_fields8.timestamp)({
      validation: { isRequired: true },
      label: "Delivery Date"
    }),
    timeWindow: (0, import_fields8.select)({
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
    stops: (0, import_fields8.json)({
      label: "Stops",
      ui: {
        description: "JSON array with optimized delivery sequence",
        views: require.resolve("@keystone-6/core/fields/types/json/views")
      }
    }),
    status: (0, import_fields8.select)({
      type: "enum",
      options: [
        { label: "Planning", value: "planning" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" }
      ],
      defaultValue: "planning",
      label: "Status"
    }),
    startedAt: (0, import_fields8.timestamp)({
      label: "Started At",
      ui: {
        description: "When the driver started this route"
      }
    }),
    completedAt: (0, import_fields8.timestamp)({
      label: "Completed At",
      ui: {
        description: "When all deliveries were completed"
      }
    }),
    // Relationships
    driver: (0, import_fields8.relationship)({
      ref: "User",
      label: "Driver",
      ui: {
        description: "User assigned to drive this route"
      }
    }),
    orders: (0, import_fields8.relationship)({
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
var import_core8 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var DeliverySlot = (0, import_core8.list)({
  access: {
    operation: {
      query: () => true,
      // Logged in users can see available slots
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageDelivery({ session })) {
          return true;
        }
        return {
          isActive: { equals: true }
        };
      }
    }
  },
  ui: {
    listView: {
      initialColumns: ["date", "startTime", "endTime", "capacity", "currentBookings", "isActive"]
    }
  },
  fields: {
    // Date of the delivery slot
    date: (0, import_fields9.timestamp)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Date",
      ui: {
        description: "Date for this delivery time window"
      }
    }),
    // Start time of the delivery window
    startTime: (0, import_fields9.text)({
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this delivery window (e.g., '09:00')"
      }
    }),
    // End time of the delivery window
    endTime: (0, import_fields9.text)({
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this delivery window (e.g., '11:00')"
      }
    }),
    // Maximum number of deliveries for this slot
    capacity: (0, import_fields9.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 10,
      label: "Capacity",
      ui: {
        description: "Maximum number of deliveries that can be scheduled for this slot"
      }
    }),
    // Current number of deliveries booked
    currentBookings: (0, import_fields9.integer)({
      defaultValue: 0,
      validation: { min: 0 },
      label: "Current Bookings",
      ui: {
        description: "Current number of deliveries booked for this slot"
      }
    }),
    // Whether the slot is active and available for booking
    isActive: (0, import_fields9.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this delivery slot is active and available for booking"
      }
    }),
    // Delivery fee for this slot (e.g., premium for express slots)
    deliveryFee: (0, import_fields9.integer)({
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
var import_core9 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var FavoriteProduct = (0, import_core9.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      }
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
    user: (0, import_fields10.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user who favorited this product"
      }
    }),
    // Product ID (text field as specified)
    product: (0, import_fields10.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product",
      ui: {
        description: "Product ID of the favorited product"
      }
    }),
    // When the product was favorited
    favoritedAt: (0, import_fields10.timestamp)({
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

// features/keystone/models/InventoryLot.ts
var import_core10 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
var InventoryLot = (0, import_core10.list)({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory
    }
  },
  ui: {
    labelField: "lotNumber",
    listView: {
      initialColumns: ["lotNumber", "product", "expirationDate", "quantityRemaining", "supplier"]
    }
  },
  fields: {
    lotNumber: (0, import_fields11.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Lot Number",
      ui: {
        description: "Unique identifier for this inventory lot"
      }
    }),
    expirationDate: (0, import_fields11.timestamp)({
      validation: { isRequired: true },
      label: "Expiration Date",
      ui: {
        description: "Date when this lot expires"
      }
    }),
    receivedDate: (0, import_fields11.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Received Date",
      ui: {
        description: "Date this lot was received"
      }
    }),
    quantity: (0, import_fields11.integer)({
      validation: { isRequired: true, min: 0 },
      label: "Original Quantity",
      ui: {
        description: "Total units received in this lot"
      }
    }),
    quantityRemaining: (0, import_fields11.integer)({
      validation: { isRequired: true, min: 0 },
      label: "Quantity Remaining",
      ui: {
        description: "Units still available in this lot"
      }
    }),
    costPerUnit: (0, import_fields11.float)({
      validation: { isRequired: true },
      label: "Cost Per Unit",
      ui: {
        description: "Purchase cost per unit for this lot"
      }
    }),
    location: (0, import_fields11.text)({
      label: "Location",
      ui: {
        description: "Warehouse zone/bin location (e.g., A-1-3)"
      }
    }),
    // Relationships
    product: (0, import_fields11.relationship)({
      ref: "Product.inventoryLots",
      label: "Product"
    }),
    supplier: (0, import_fields11.relationship)({
      ref: "Supplier.inventoryLots",
      label: "Supplier"
    }),
    ...trackingFields
  }
});

// features/keystone/models/LoyaltyProgram.ts
var import_core11 = require("@keystone-6/core");
var import_fields12 = require("@keystone-6/core/fields");
var LoyaltyProgram = (0, import_core11.list)({
  access: {
    operation: {
      query: () => true,
      // Public can view loyalty program details
      create: permissions.canManageUsers,
      update: permissions.canManageUsers,
      delete: permissions.canManageUsers
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "pointsPerDollar", "isActive"]
    }
  },
  fields: {
    // Program name
    name: (0, import_fields12.text)({
      validation: { isRequired: true },
      label: "Program Name",
      ui: {
        description: "Name of the loyalty program (e.g., 'Grocery Rewards', 'Fresh Points')"
      }
    }),
    // Points earned per dollar spent
    pointsPerDollar: (0, import_fields12.float)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 1,
      label: "Points Per Dollar",
      ui: {
        description: "How many points customers earn per dollar spent"
      }
    }),
    // Tier configuration and thresholds
    tierConfiguration: (0, import_fields12.json)({
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
    redemptionRules: (0, import_fields12.json)({
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
    expirationRules: (0, import_fields12.json)({
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
    tierBenefits: (0, import_fields12.json)({
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
    isActive: (0, import_fields12.checkbox)({
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
var import_core12 = require("@keystone-6/core");
var import_fields13 = require("@keystone-6/core/fields");
var LoyaltyTransaction = (0, import_core12.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders
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
      }
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
    user: (0, import_fields13.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user this transaction belongs to"
      }
    }),
    // Points awarded or redeemed (positive for earned, negative for redeemed)
    points: (0, import_fields13.integer)({
      validation: { isRequired: true },
      label: "Points",
      ui: {
        description: "Points earned (positive) or redeemed (negative)"
      }
    }),
    // Transaction type
    type: (0, import_fields13.select)({
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
    description: (0, import_fields13.text)({
      validation: { isRequired: true },
      label: "Description",
      ui: {
        description: "Description of what this transaction is for",
        displayMode: "textarea"
      }
    }),
    // Related order (if applicable)
    order: (0, import_fields13.relationship)({
      ref: "Order",
      label: "Order",
      ui: {
        description: "Order associated with this transaction (if applicable)"
      }
    }),
    // Balance after this transaction
    balanceAfter: (0, import_fields13.integer)({
      validation: { isRequired: true },
      label: "Balance After",
      ui: {
        description: "User's points balance after this transaction"
      }
    }),
    // When the transaction occurred
    transactionDate: (0, import_fields13.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Transaction Date",
      ui: {
        description: "When this transaction occurred"
      }
    }),
    // Expiration date (for earned points)
    expiresAt: (0, import_fields13.timestamp)({
      label: "Expires At",
      ui: {
        description: "When these points expire (if applicable)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/NotificationPreference.ts
var import_core13 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
var NotificationPreference = (0, import_core13.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      }
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
    user: (0, import_fields14.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user these preferences belong to"
      }
    }),
    // Order updates notifications
    orderUpdates: (0, import_fields14.checkbox)({
      defaultValue: true,
      label: "Order Updates",
      ui: {
        description: "Receive notifications about order status changes"
      }
    }),
    // Delivery alerts
    deliveryAlerts: (0, import_fields14.checkbox)({
      defaultValue: true,
      label: "Delivery Alerts",
      ui: {
        description: "Receive notifications about delivery status and ETA"
      }
    }),
    // Price drop notifications
    priceDrops: (0, import_fields14.checkbox)({
      defaultValue: false,
      label: "Price Drops",
      ui: {
        description: "Receive notifications when favorited products go on sale"
      }
    }),
    // Back in stock notifications
    backInStock: (0, import_fields14.checkbox)({
      defaultValue: false,
      label: "Back in Stock",
      ui: {
        description: "Receive notifications when out-of-stock products become available"
      }
    }),
    // Weekly deals digest
    weeklyDeals: (0, import_fields14.checkbox)({
      defaultValue: false,
      label: "Weekly Deals",
      ui: {
        description: "Receive weekly digest of deals and promotions"
      }
    }),
    // Notification channels (JSON array: email/sms/push)
    channels: (0, import_fields14.json)({
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
var import_core14 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");
var Order = (0, import_core14.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders
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
    displayId: (0, import_fields15.integer)({
      validation: { isRequired: true },
      label: "Order Number"
    }),
    email: (0, import_fields15.text)({
      validation: { isRequired: true },
      label: "Customer Email"
    }),
    status: (0, import_fields15.select)({
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
    taxRate: (0, import_fields15.float)({
      label: "Tax Rate"
    }),
    canceledAt: (0, import_fields15.timestamp)({
      label: "Cancelled At"
    }),
    metadata: (0, import_fields15.json)(),
    noNotification: (0, import_fields15.checkbox)({
      defaultValue: false,
      label: "Suppress Notifications"
    }),
    // Delivery time window fields (grocery-specific)
    deliveryDate: (0, import_fields15.timestamp)({
      validation: { isRequired: true },
      label: "Delivery Date",
      ui: {
        description: "Scheduled delivery date"
      }
    }),
    deliveryTimeWindow: (0, import_fields15.select)({
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
    deliveryInstructions: (0, import_fields15.text)({
      ui: {
        displayMode: "textarea",
        description: "Special delivery instructions from customer"
      },
      label: "Delivery Instructions"
    }),
    substitutionPreference: (0, import_fields15.select)({
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
    user: (0, import_fields15.relationship)({
      ref: "User",
      label: "Customer"
    }),
    shippingAddress: (0, import_fields15.relationship)({
      ref: "Address",
      label: "Shipping Address"
    }),
    billingAddress: (0, import_fields15.relationship)({
      ref: "Address",
      label: "Billing Address"
    }),
    lineItems: (0, import_fields15.relationship)({
      ref: "OrderLineItem.order",
      many: true,
      label: "Line Items"
    }),
    deliveryRoute: (0, import_fields15.relationship)({
      ref: "DeliveryRoute.orders",
      label: "Delivery Route"
    }),
    ...trackingFields
  }
});

// features/keystone/models/OrderItemSubstitution.ts
var import_core15 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
var OrderItemSubstitution = (0, import_core15.list)({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders
    }
  },
  ui: {
    labelField: "originalProduct",
    listView: {
      initialColumns: ["orderItem", "originalProduct", "substitutedProduct", "customerApproved"]
    }
  },
  fields: {
    orderItem: (0, import_fields16.text)({
      validation: { isRequired: true },
      label: "Order Item ID",
      ui: {
        description: "Reference to the order line item being substituted"
      }
    }),
    originalProduct: (0, import_fields16.text)({
      validation: { isRequired: true },
      label: "Original Product",
      ui: {
        description: "The originally ordered product identifier"
      }
    }),
    substitutedProduct: (0, import_fields16.text)({
      validation: { isRequired: true },
      label: "Substituted Product",
      ui: {
        description: "The product used as a substitute"
      }
    }),
    reason: (0, import_fields16.text)({
      label: "Reason",
      ui: {
        description: "Reason for the substitution",
        displayMode: "textarea"
      }
    }),
    customerApproved: (0, import_fields16.checkbox)({
      defaultValue: false,
      label: "Customer Approved",
      ui: {
        description: "Whether the customer has approved this substitution"
      }
    }),
    approvedAt: (0, import_fields16.timestamp)({
      label: "Approved At",
      ui: {
        description: "When the customer approved the substitution"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/OrderLineItem.ts
var import_core16 = require("@keystone-6/core");
var import_fields17 = require("@keystone-6/core/fields");
var OrderLineItem = (0, import_core16.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders
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
      }
    }
  },
  ui: {
    listView: {
      initialColumns: ["title", "quantity", "unitPrice", "order"]
    }
  },
  fields: {
    title: (0, import_fields17.text)({
      validation: { isRequired: true },
      label: "Product Title"
    }),
    sku: (0, import_fields17.text)({
      label: "SKU"
    }),
    quantity: (0, import_fields17.integer)({
      validation: { isRequired: true, min: 1 },
      label: "Quantity"
    }),
    unitPrice: (0, import_fields17.float)({
      validation: { isRequired: true },
      label: "Unit Price"
    }),
    thumbnail: (0, import_fields17.text)({
      label: "Thumbnail URL"
    }),
    metadata: (0, import_fields17.json)(),
    // Relationships
    order: (0, import_fields17.relationship)({
      ref: "Order.lineItems",
      label: "Order"
    }),
    product: (0, import_fields17.relationship)({
      ref: "Product",
      label: "Product"
    }),
    // Track which inventory lot was used (for FEFO)
    inventoryLot: (0, import_fields17.relationship)({
      ref: "InventoryLot",
      label: "Inventory Lot",
      ui: {
        description: "Inventory lot used to fulfill this line item"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/ParkingSpot.ts
var import_core17 = require("@keystone-6/core");
var import_fields18 = require("@keystone-6/core/fields");
var ParkingSpot = (0, import_core17.list)({
  access: {
    operation: {
      query: () => true,
      create: permissions.canManageDelivery,
      update: permissions.canManageDelivery,
      delete: permissions.canManageDelivery
    }
  },
  ui: {
    labelField: "spotNumber",
    listView: {
      initialColumns: ["spotNumber", "description", "isAccessible", "isAvailable"]
    }
  },
  fields: {
    spotNumber: (0, import_fields18.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Spot Number",
      ui: {
        description: "Unique identifier for this parking spot (e.g., 'A1', 'B2')"
      }
    }),
    description: (0, import_fields18.text)({
      label: "Description",
      ui: {
        displayMode: "textarea",
        description: "Additional details about this spot location"
      }
    }),
    isAccessible: (0, import_fields18.checkbox)({
      defaultValue: false,
      label: "Is Accessible",
      ui: {
        description: "Whether this spot is ADA accessible"
      }
    }),
    isAvailable: (0, import_fields18.checkbox)({
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
var import_core18 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
var Payment = (0, import_core18.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManageOrders
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
      delete: ({ session }) => permissions.canManageOrders({ session })
    }
  },
  ui: {
    listView: {
      initialColumns: ["amount", "status", "paymentMethod", "order", "createdAt"]
    }
  },
  fields: {
    amount: (0, import_fields19.decimal)({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      ui: {
        description: "Payment amount in dollars"
      }
    }),
    status: (0, import_fields19.select)({
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
    paymentMethod: (0, import_fields19.select)({
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
    providerPaymentId: (0, import_fields19.text)({
      isIndexed: "unique",
      ui: {
        description: "Provider payment identifier"
      }
    }),
    providerChargeId: (0, import_fields19.text)({
      ui: {
        description: "Provider charge/capture identifier"
      }
    }),
    providerRefundId: (0, import_fields19.text)({
      ui: {
        description: "Provider refund identifier"
      }
    }),
    providerData: (0, import_fields19.json)({
      defaultValue: {},
      ui: {
        description: "Normalized provider payload and metadata"
      }
    }),
    // Card details (last 4 digits for reference)
    cardLast4: (0, import_fields19.text)({
      ui: {
        description: "Last 4 digits of card"
      }
    }),
    cardBrand: (0, import_fields19.text)({
      ui: {
        description: "Card brand (visa, mastercard, etc.)"
      }
    }),
    // Delivery tip handling
    deliveryTipAmount: (0, import_fields19.decimal)({
      precision: 10,
      scale: 2,
      defaultValue: "0.00",
      ui: {
        description: "Delivery tip amount included in payment"
      }
    }),
    // Timestamps
    processedAt: (0, import_fields19.timestamp)({
      ui: {
        description: "When payment was successfully processed"
      }
    }),
    // Metadata for errors or additional info
    errorMessage: (0, import_fields19.text)({
      ui: {
        description: "Error message if payment failed"
      }
    }),
    notes: (0, import_fields19.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    // Relationships
    order: (0, import_fields19.relationship)({
      ref: "Order",
      ui: {
        displayMode: "select"
      }
    }),
    paymentProvider: (0, import_fields19.relationship)({
      ref: "PaymentProvider.payments",
      ui: {
        displayMode: "select"
      }
    }),
    processedBy: (0, import_fields19.relationship)({
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
var import_core19 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
var PaymentProvider = (0, import_core19.list)({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: permissions.canManagePayments,
      update: permissions.canManagePayments,
      delete: permissions.canManagePayments
    }
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "isInstalled"]
    }
  },
  fields: {
    name: (0, import_fields20.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields20.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: "Payment provider code must start with pp_"
        }
      }
    }),
    isInstalled: (0, import_fields20.checkbox)({
      defaultValue: true
    }),
    credentials: (0, import_fields20.json)({
      defaultValue: {}
    }),
    metadata: (0, import_fields20.json)({
      defaultValue: {}
    }),
    createPaymentFunction: (0, import_fields20.text)({ validation: { isRequired: true }, defaultValue: "manual" }),
    capturePaymentFunction: (0, import_fields20.text)({ validation: { isRequired: true }, defaultValue: "manual" }),
    refundPaymentFunction: (0, import_fields20.text)({ validation: { isRequired: true }, defaultValue: "manual" }),
    getPaymentStatusFunction: (0, import_fields20.text)({ validation: { isRequired: true }, defaultValue: "manual" }),
    generatePaymentLinkFunction: (0, import_fields20.text)({ validation: { isRequired: true }, defaultValue: "manual" }),
    handleWebhookFunction: (0, import_fields20.text)({ validation: { isRequired: true }, defaultValue: "manual" }),
    payments: (0, import_fields20.relationship)({
      ref: "Payment.paymentProvider",
      many: true
    }),
    sessions: (0, import_fields20.relationship)({
      ref: "PaymentSession.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentSession.ts
var import_core20 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
var PaymentSession = (0, import_core20.list)({
  access: {
    operation: {
      query: permissions.canManageOrders,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders
    }
  },
  ui: {
    listView: {
      initialColumns: ["paymentProvider", "amount", "isSelected", "isInitiated"]
    }
  },
  fields: {
    isSelected: (0, import_fields21.checkbox)({ defaultValue: false }),
    isInitiated: (0, import_fields21.checkbox)({ defaultValue: false }),
    amount: (0, import_fields21.decimal)({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      defaultValue: "0.00"
    }),
    data: (0, import_fields21.json)({ defaultValue: {} }),
    idempotencyKey: (0, import_fields21.text)(),
    cart: (0, import_fields21.relationship)({ ref: "Cart.paymentSessions" }),
    paymentProvider: (0, import_fields21.relationship)({ ref: "PaymentProvider.sessions" }),
    ...trackingFields
  }
});

// features/keystone/models/PickupSlot.ts
var import_core21 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
var PickupSlot = (0, import_core21.list)({
  access: {
    operation: {
      query: () => true,
      create: permissions.canManageOrders,
      update: permissions.canManageOrders,
      delete: permissions.canManageOrders
    }
  },
  ui: {
    listView: {
      initialColumns: ["date", "startTime", "endTime", "maxOrders", "currentOrders", "isAvailable"]
    }
  },
  fields: {
    date: (0, import_fields22.timestamp)({
      validation: { isRequired: true },
      label: "Date",
      ui: {
        description: "Date for this pickup slot"
      }
    }),
    startTime: (0, import_fields22.text)({
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this slot (e.g., '09:00')"
      }
    }),
    endTime: (0, import_fields22.text)({
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this slot (e.g., '10:00')"
      }
    }),
    maxOrders: (0, import_fields22.integer)({
      validation: { isRequired: true },
      defaultValue: 10,
      label: "Max Orders",
      ui: {
        description: "Maximum number of orders that can be scheduled for this slot"
      }
    }),
    currentOrders: (0, import_fields22.integer)({
      defaultValue: 0,
      label: "Current Orders",
      ui: {
        description: "Current number of orders scheduled for this slot"
      }
    }),
    isAvailable: (0, import_fields22.checkbox)({
      defaultValue: true,
      label: "Is Available",
      ui: {
        description: "Whether this slot is available for new orders"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/POItem.ts
var import_core22 = require("@keystone-6/core");
var import_fields23 = require("@keystone-6/core/fields");
var POItem = (0, import_core22.list)({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory
    }
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["product", "quantity", "unitCost", "purchaseOrder"]
    }
  },
  fields: {
    quantity: (0, import_fields23.integer)({
      validation: { isRequired: true, min: 1 },
      label: "Quantity"
    }),
    unitCost: (0, import_fields23.float)({
      validation: { isRequired: true },
      label: "Unit Cost",
      ui: {
        description: "Cost per unit from supplier"
      }
    }),
    quantityReceived: (0, import_fields23.integer)({
      defaultValue: 0,
      label: "Quantity Received",
      ui: {
        description: "Actual quantity received (may differ from ordered)"
      }
    }),
    // Relationships
    purchaseOrder: (0, import_fields23.relationship)({
      ref: "PurchaseOrder.items",
      label: "Purchase Order"
    }),
    product: (0, import_fields23.relationship)({
      ref: "Product",
      label: "Product"
    }),
    ...trackingFields
  }
});

// features/keystone/models/PriceAlert.ts
var import_core23 = require("@keystone-6/core");
var import_fields24 = require("@keystone-6/core/fields");
var PriceAlert = (0, import_core23.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      }
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
    user: (0, import_fields24.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user who created this price alert"
      }
    }),
    // Product ID (text field as specified)
    product: (0, import_fields24.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product",
      ui: {
        description: "Product ID to monitor for price changes"
      }
    }),
    // Target price the user wants to be notified at
    targetPrice: (0, import_fields24.decimal)({
      validation: { isRequired: true },
      precision: 12,
      scale: 2,
      label: "Target Price",
      ui: {
        description: "Price threshold to trigger the alert"
      }
    }),
    // Current price of the product
    currentPrice: (0, import_fields24.decimal)({
      precision: 12,
      scale: 2,
      label: "Current Price",
      ui: {
        description: "Current price of the product"
      }
    }),
    // Whether the alert has been triggered
    isTriggered: (0, import_fields24.checkbox)({
      defaultValue: false,
      label: "Is Triggered",
      ui: {
        description: "Whether the price alert has been triggered"
      }
    }),
    // When the user was notified
    notifiedAt: (0, import_fields24.timestamp)({
      label: "Notified At",
      ui: {
        description: "When the user was notified about the price drop"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Product.ts
var import_core24 = require("@keystone-6/core");
var import_fields25 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");
var Product = (0, import_core24.list)({
  access: {
    operation: {
      query: () => true,
      // Public can view products
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageProducts({ session })) {
          return true;
        }
        return {
          status: {
            equals: "published"
          }
        };
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
    title: (0, import_fields25.text)({
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
    handle: (0, import_fields25.text)({
      isIndexed: "unique",
      label: "Handle",
      ui: {
        description: "URL-friendly identifier"
      }
    }),
    sku: (0, import_fields25.text)({
      label: "SKU",
      ui: {
        description: "Stock Keeping Unit"
      }
    }),
    status: (0, import_fields25.select)({
      type: "enum",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" }
      ],
      defaultValue: "draft",
      validation: { isRequired: true }
    }),
    metadata: (0, import_fields25.json)(),
    // Pricing fields
    price: (0, import_fields25.float)({
      label: "Price",
      ui: {
        description: "Product price in dollars"
      },
      validation: { min: 0 }
    }),
    compareAtPrice: (0, import_fields25.float)({
      label: "Compare at Price",
      ui: {
        description: "Original price for sale items"
      },
      validation: { min: 0 }
    }),
    costPrice: (0, import_fields25.float)({
      label: "Cost Price",
      ui: {
        description: "Cost to purchase from supplier"
      },
      validation: { min: 0 }
    }),
    // Inventory fields
    inStock: (0, import_fields25.checkbox)({
      defaultValue: true,
      label: "In Stock",
      ui: {
        description: "Product is available for purchase"
      }
    }),
    stockQuantity: (0, import_fields25.integer)({
      defaultValue: 0,
      label: "Stock Quantity",
      ui: {
        description: "Available inventory count"
      },
      validation: { min: 0 }
    }),
    lowStockThreshold: (0, import_fields25.integer)({
      defaultValue: 10,
      label: "Low Stock Threshold",
      ui: {
        description: "Alert when stock falls below this number"
      }
    }),
    // Media
    imageUrl: (0, import_fields25.text)({
      label: "Image URL",
      ui: {
        description: "Main product image URL"
      }
    }),
    thumbnailUrl: (0, import_fields25.text)({
      label: "Thumbnail URL",
      ui: {
        description: "Small product thumbnail URL"
      }
    }),
    // Grocery-specific fields
    department: (0, import_fields25.select)({
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
    isPerishable: (0, import_fields25.checkbox)({
      defaultValue: false,
      label: "Perishable",
      ui: {
        description: "Product requires refrigeration or has expiration date"
      }
    }),
    shelfLife: (0, import_fields25.integer)({
      label: "Shelf Life (days)",
      ui: {
        description: "Number of days product remains fresh"
      }
    }),
    pricingMethod: (0, import_fields25.select)({
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
    unitOfMeasure: (0, import_fields25.select)({
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
    organicCertified: (0, import_fields25.checkbox)({
      defaultValue: false,
      label: "Organic Certified",
      ui: {
        description: "Product is certified organic"
      }
    }),
    allergens: (0, import_fields25.multiselect)({
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
    supplier: (0, import_fields25.relationship)({
      ref: "Supplier.products",
      label: "Supplier"
    }),
    departmentRef: (0, import_fields25.relationship)({
      ref: "Department.products",
      label: "Department Reference"
    }),
    inventoryLots: (0, import_fields25.relationship)({
      ref: "InventoryLot.product",
      many: true,
      label: "Inventory Lots"
    }),
    ...trackingFields
  }
});

// features/keystone/models/PurchaseOrder.ts
var import_core25 = require("@keystone-6/core");
var import_fields26 = require("@keystone-6/core/fields");
var PurchaseOrder = (0, import_core25.list)({
  access: {
    operation: {
      query: permissions.canManageInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory
    }
  },
  ui: {
    labelField: "poNumber",
    listView: {
      initialColumns: ["poNumber", "supplier", "orderDate", "status", "totalAmount"]
    }
  },
  fields: {
    poNumber: (0, import_fields26.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "PO Number",
      ui: {
        description: "Auto-generated purchase order number"
      },
      hooks: {
        resolveInput: async ({ operation, resolvedData, context }) => {
          if (operation === "create" && !resolvedData.poNumber) {
            const date = /* @__PURE__ */ new Date();
            const prefix = `PO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
            const count = await context.query.PurchaseOrder.count({
              where: {
                poNumber: {
                  startsWith: prefix
                }
              }
            });
            return `${prefix}-${String(count + 1).padStart(4, "0")}`;
          }
          return resolvedData.poNumber;
        }
      }
    }),
    orderDate: (0, import_fields26.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Order Date"
    }),
    expectedDeliveryDate: (0, import_fields26.timestamp)({
      label: "Expected Delivery Date",
      ui: {
        description: "When we expect to receive this order"
      }
    }),
    status: (0, import_fields26.select)({
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
    totalAmount: (0, import_fields26.float)({
      label: "Total Amount",
      ui: {
        description: "Total value of this purchase order"
      }
    }),
    receivedAt: (0, import_fields26.timestamp)({
      label: "Received At",
      ui: {
        description: "When the order was actually received"
      }
    }),
    notes: (0, import_fields26.text)({
      ui: {
        displayMode: "textarea"
      },
      label: "Notes"
    }),
    // Relationships
    supplier: (0, import_fields26.relationship)({
      ref: "Supplier.purchaseOrders",
      label: "Supplier"
    }),
    items: (0, import_fields26.relationship)({
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
var import_core26 = require("@keystone-6/core");
var import_fields27 = require("@keystone-6/core/fields");
var Recipe = (0, import_core26.list)({
  access: {
    operation: {
      query: () => true,
      // Public can view recipes
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "prepTime", "cookTime", "servings", "difficulty"]
    }
  },
  fields: {
    name: (0, import_fields27.text)({
      validation: { isRequired: true },
      label: "Recipe Name"
    }),
    description: (0, import_fields27.text)({
      label: "Description",
      ui: {
        description: "Brief description of the recipe",
        displayMode: "textarea"
      }
    }),
    instructions: (0, import_fields27.text)({
      validation: { isRequired: true },
      label: "Instructions",
      ui: {
        description: "Step-by-step cooking instructions",
        displayMode: "textarea"
      }
    }),
    prepTime: (0, import_fields27.integer)({
      label: "Prep Time (minutes)",
      ui: {
        description: "Time required for preparation"
      },
      validation: { min: 0 }
    }),
    cookTime: (0, import_fields27.integer)({
      label: "Cook Time (minutes)",
      ui: {
        description: "Time required for cooking"
      },
      validation: { min: 0 }
    }),
    servings: (0, import_fields27.integer)({
      label: "Servings",
      ui: {
        description: "Number of servings this recipe makes"
      },
      validation: { min: 1 }
    }),
    difficulty: (0, import_fields27.select)({
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
    image: (0, import_fields27.text)({
      label: "Image URL",
      ui: {
        description: "URL for the recipe image"
      }
    }),
    categories: (0, import_fields27.json)({
      label: "Categories",
      ui: {
        description: "JSON array of recipe categories (e.g., breakfast, dinner, vegetarian)"
      }
    }),
    // Ingredients relationship
    ingredients: (0, import_fields27.relationship)({
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
var import_core27 = require("@keystone-6/core");
var import_fields28 = require("@keystone-6/core/fields");
var RecipeIngredient = (0, import_core27.list)({
  access: {
    operation: {
      query: () => true,
      // Public can view ingredients for public recipe content.
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts
    }
  },
  ui: {
    labelField: "product",
    listView: {
      initialColumns: ["recipe", "product", "quantity", "unit", "isOptional"]
    }
  },
  fields: {
    // Recipe relationship
    recipe: (0, import_fields28.relationship)({
      ref: "Recipe.ingredients",
      label: "Recipe",
      ui: {
        description: "The recipe this ingredient belongs to"
      }
    }),
    // Product ID (text field as specified)
    product: (0, import_fields28.text)({
      validation: { isRequired: true },
      label: "Product",
      ui: {
        description: "Product ID of the ingredient"
      }
    }),
    // Quantity needed
    quantity: (0, import_fields28.float)({
      validation: { isRequired: true, min: 0 },
      label: "Quantity",
      ui: {
        description: "Amount of the ingredient needed"
      }
    }),
    // Unit of measurement
    unit: (0, import_fields28.text)({
      label: "Unit",
      ui: {
        description: "Unit of measurement (e.g., 'cups', 'tbsp', 'oz', 'pieces')"
      }
    }),
    // Additional notes
    notes: (0, import_fields28.text)({
      label: "Notes",
      ui: {
        description: "Additional notes (e.g., 'diced', 'melted', 'room temperature')",
        displayMode: "textarea"
      }
    }),
    // Whether the ingredient is optional
    isOptional: (0, import_fields28.checkbox)({
      defaultValue: false,
      label: "Is Optional",
      ui: {
        description: "Whether this ingredient is optional for the recipe"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core28 = require("@keystone-6/core");
var import_fields29 = require("@keystone-6/core/fields");
var Role = (0, import_core28.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageUsers,
      update: permissions.canManageUsers,
      delete: permissions.canManageUsers
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "canManageProducts", "canManageOrders", "canManageInventory", "canManageOnboarding", "canAccessDashboard"]
    }
  },
  fields: {
    name: (0, import_fields29.text)({
      validation: { isRequired: true },
      label: "Role Name"
    }),
    // Permission flags
    canManageProducts: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Manage Products"
    }),
    canManageOrders: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Manage Orders"
    }),
    canManagePayments: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Manage Payments"
    }),
    canManageInventory: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Manage Inventory"
    }),
    canManageSuppliers: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Manage Suppliers"
    }),
    canManageDelivery: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Manage Delivery Routes"
    }),
    canManageUsers: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Manage Users"
    }),
    canManageOnboarding: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Manage Onboarding"
    }),
    canAccessDashboard: (0, import_fields29.checkbox)({
      defaultValue: false,
      label: "Can Access Dashboard"
    }),
    // Relationships
    assignedTo: (0, import_fields29.relationship)({
      ref: "User.role",
      many: true,
      label: "Assigned To"
    }),
    ...trackingFields
  }
});

// features/keystone/models/ShoppingList.ts
var import_core29 = require("@keystone-6/core");
var import_fields30 = require("@keystone-6/core/fields");
var ShoppingList = (0, import_core29.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
    },
    filter: {
      query: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      update: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
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
    user: (0, import_fields30.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user who owns this shopping list"
      }
    }),
    // Name of the shopping list
    name: (0, import_fields30.text)({
      validation: { isRequired: true },
      label: "Name",
      ui: {
        description: "Name of the shopping list (e.g., 'Weekly Groceries', 'Party Supplies')"
      }
    }),
    // Whether this is the user's default list
    isDefault: (0, import_fields30.checkbox)({
      defaultValue: false,
      label: "Default List",
      ui: {
        description: "Whether this is the user's default shopping list"
      }
    }),
    // Items in this shopping list
    items: (0, import_fields30.relationship)({
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
var import_core30 = require("@keystone-6/core");
var import_fields31 = require("@keystone-6/core/fields");
var ShoppingListItem = (0, import_core30.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
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
    list: (0, import_fields31.relationship)({
      ref: "ShoppingList.items",
      label: "Shopping List",
      ui: {
        description: "The shopping list this item belongs to"
      }
    }),
    // Product name or ID
    product: (0, import_fields31.text)({
      validation: { isRequired: true },
      label: "Product",
      ui: {
        description: "Product name or ID to add to the list"
      }
    }),
    // Quantity needed
    quantity: (0, import_fields31.integer)({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: {
        description: "Number of units needed"
      }
    }),
    // Unit of measurement
    unit: (0, import_fields31.text)({
      label: "Unit",
      ui: {
        description: "Unit of measurement (e.g., 'lbs', 'oz', 'each', 'dozen')"
      }
    }),
    // Whether the item has been checked off
    checked: (0, import_fields31.checkbox)({
      defaultValue: false,
      label: "Checked",
      ui: {
        description: "Whether this item has been checked off the list"
      }
    }),
    // Additional notes
    notes: (0, import_fields31.text)({
      label: "Notes",
      ui: {
        description: "Additional notes (e.g., 'organic only', 'brand preference')",
        displayMode: "textarea"
      }
    }),
    // When the item was added
    addedAt: (0, import_fields31.timestamp)({
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
var import_core31 = require("@keystone-6/core");
var import_fields32 = require("@keystone-6/core/fields");
var Subscription = (0, import_core31.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
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
      update: ({ session }) => {
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      }
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
    user: (0, import_fields32.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user who owns this subscription"
      }
    }),
    // Product ID (text field)
    product: (0, import_fields32.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product",
      ui: {
        description: "Product ID for the subscription"
      }
    }),
    // Quantity to deliver each time
    quantity: (0, import_fields32.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Quantity",
      ui: {
        description: "Number of items to deliver each time"
      }
    }),
    // Delivery frequency
    frequency: (0, import_fields32.select)({
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
    nextDeliveryDate: (0, import_fields32.timestamp)({
      label: "Next Delivery Date",
      ui: {
        description: "Date of the next scheduled delivery"
      }
    }),
    // Subscription discount percentage
    discount: (0, import_fields32.float)({
      label: "Discount",
      ui: {
        description: "Discount percentage applied to subscription orders (0-100)"
      },
      validation: { min: 0, max: 100 },
      defaultValue: 0
    }),
    // Whether subscription is currently active
    isActive: (0, import_fields32.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this subscription is currently active"
      }
    }),
    // Paused until date (for temporary pauses)
    pausedUntil: (0, import_fields32.timestamp)({
      label: "Paused Until",
      ui: {
        description: "If set, subscription is paused until this date"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/SubstitutionPreference.ts
var import_core32 = require("@keystone-6/core");
var import_fields33 = require("@keystone-6/core/fields");
var SubstitutionPreference = (0, import_core32.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: isSignedIn
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
      update: ({ session }) => {
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      },
      delete: ({ session }) => {
        if (permissions.canManageOrders({ session })) {
          return true;
        }
        if (session?.itemId) {
          return { user: { id: { equals: session.itemId } } };
        }
        return false;
      }
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
    user: (0, import_fields33.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user these preferences belong to"
      }
    }),
    // Whether to allow substitutions at all
    allowSubstitutions: (0, import_fields33.checkbox)({
      defaultValue: true,
      label: "Allow Substitutions",
      ui: {
        description: "Whether to allow product substitutions when items are out of stock"
      }
    }),
    // Prefer same brand when substituting
    preferSimilarBrand: (0, import_fields33.checkbox)({
      defaultValue: true,
      label: "Prefer Similar Brand",
      ui: {
        description: "When substituting, prefer the same brand if possible"
      }
    }),
    // Prefer same size when substituting
    preferSimilarSize: (0, import_fields33.checkbox)({
      defaultValue: true,
      label: "Prefer Similar Size",
      ui: {
        description: "When substituting, prefer similar size/quantity if possible"
      }
    }),
    // Contact before substituting
    contactBeforeSubstitute: (0, import_fields33.checkbox)({
      defaultValue: false,
      label: "Contact Before Substitute",
      ui: {
        description: "Contact the customer before making any substitution"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Supplier.ts
var import_core33 = require("@keystone-6/core");
var import_fields34 = require("@keystone-6/core/fields");
var Supplier = (0, import_core33.list)({
  access: {
    operation: {
      query: permissions.canManageSuppliers,
      create: permissions.canManageSuppliers,
      update: permissions.canManageSuppliers,
      delete: permissions.canManageSuppliers
    }
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "contactName", "email", "paymentTerms"]
    }
  },
  fields: {
    name: (0, import_fields34.text)({
      validation: { isRequired: true },
      label: "Supplier Name"
    }),
    contactName: (0, import_fields34.text)({
      label: "Contact Name"
    }),
    email: (0, import_fields34.text)({
      validation: { isRequired: true },
      label: "Email"
    }),
    phone: (0, import_fields34.text)({
      label: "Phone"
    }),
    paymentTerms: (0, import_fields34.select)({
      type: "enum",
      options: [
        { label: "Net 30", value: "net_30" },
        { label: "Net 60", value: "net_60" },
        { label: "Cash on Delivery", value: "cod" }
      ],
      defaultValue: "net_30",
      label: "Payment Terms"
    }),
    deliveryDays: (0, import_fields34.multiselect)({
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
    minimumOrder: (0, import_fields34.float)({
      label: "Minimum Order Amount",
      ui: {
        description: "Minimum order value for this supplier"
      }
    }),
    // Relationships
    products: (0, import_fields34.relationship)({
      ref: "Product.supplier",
      many: true,
      label: "Products"
    }),
    inventoryLots: (0, import_fields34.relationship)({
      ref: "InventoryLot.supplier",
      many: true,
      label: "Inventory Lots"
    }),
    purchaseOrders: (0, import_fields34.relationship)({
      ref: "PurchaseOrder.supplier",
      many: true,
      label: "Purchase Orders"
    }),
    ...trackingFields
  }
});

// features/keystone/models/User.ts
var import_core34 = require("@keystone-6/core");
var import_access34 = require("@keystone-6/core/access");
var import_fields35 = require("@keystone-6/core/fields");
var User = (0, import_core34.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: () => true,
      update: isSignedIn,
      delete: permissions.canManageUsers
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        return { id: { equals: session?.itemId } };
      },
      update: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        return { id: { equals: session?.itemId } };
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
    name: (0, import_fields35.text)({
      validation: { isRequired: true },
      label: "Name"
    }),
    email: (0, import_fields35.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Email"
    }),
    password: (0, import_fields35.password)({
      validation: { isRequired: true },
      access: {
        read: import_access34.denyAll,
        update: ({ session, item }) => permissions.canManageUsers({ session }) || session?.itemId === item.id
      }
    }),
    role: (0, import_fields35.relationship)({
      ref: "Role.assignedTo",
      label: "Role"
    }),
    onboardingStatus: (0, import_fields35.select)({
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
var import_core35 = require("@keystone-6/core");
var import_fields36 = require("@keystone-6/core/fields");
var UserCoupon = (0, import_core35.list)({
  access: {
    operation: {
      query: isSignedIn,
      create: isSignedIn,
      update: isSignedIn,
      delete: permissions.canManageUsers
    },
    filter: {
      query: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        return {
          user: {
            id: { equals: session?.itemId }
          }
        };
      },
      update: ({ session }) => {
        if (permissions.canManageUsers({ session })) {
          return true;
        }
        return {
          user: {
            id: { equals: session?.itemId }
          }
        };
      }
    }
  },
  ui: {
    labelField: "id",
    listView: {
      initialColumns: ["user", "coupon", "clippedAt", "used", "usedAt"]
    }
  },
  fields: {
    user: (0, import_fields36.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "User who clipped this coupon"
      }
    }),
    coupon: (0, import_fields36.relationship)({
      ref: "Coupon.userCoupons",
      label: "Coupon",
      ui: {
        description: "The coupon that was clipped"
      }
    }),
    clippedAt: (0, import_fields36.timestamp)({
      label: "Clipped At",
      ui: {
        description: "When the user clipped this coupon"
      },
      defaultValue: { kind: "now" }
    }),
    usedAt: (0, import_fields36.timestamp)({
      label: "Used At",
      ui: {
        description: "When the coupon was used in an order"
      }
    }),
    used: (0, import_fields36.checkbox)({
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
  CartItem,
  Coupon,
  Department,
  DeliveryRoute,
  DeliverySlot,
  FavoriteProduct,
  InventoryLot,
  LoyaltyProgram,
  LoyaltyTransaction,
  NotificationPreference,
  Order,
  OrderItemSubstitution,
  OrderLineItem,
  ParkingSpot,
  Payment,
  PaymentProvider,
  PaymentSession,
  PickupSlot,
  POItem,
  PriceAlert,
  Product,
  PurchaseOrder,
  Recipe,
  RecipeIngredient,
  Role,
  ShoppingList,
  ShoppingListItem,
  Subscription,
  SubstitutionPreference,
  Supplier,
  User,
  UserCoupon
};

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

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

// features/keystone/mutations/cartOperations.ts
var TAX_RATE = 0.08;
var DELIVERY_FEE = 5.99;
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
async function getOrCreateCart(context, sessionId) {
  const sudoContext = context.sudo();
  if (context.session?.itemId) {
    let cart = await sudoContext.query.Cart.findMany({
      where: {
        customer: { id: { equals: context.session.itemId } }
      },
      query: `
        id
        sessionId
        customer { id }
        itemCount
        subtotal
        items {
          id
          quantity
          subtotal
          substitutionPreference
          product {
            id
            title
            handle
            price
            imageUrl
            inStock
            stockQuantity
            pricingMethod
            unitOfMeasure
          }
        }
      `
    });
    if (cart.length > 0) {
      return cart[0];
    }
    return await sudoContext.query.Cart.createOne({
      data: {
        customer: { connect: { id: context.session.itemId } },
        itemCount: 0,
        subtotal: 0
      },
      query: `
        id
        sessionId
        customer { id }
        itemCount
        subtotal
        items {
          id
          quantity
          subtotal
          substitutionPreference
          product {
            id
            title
            handle
            price
            imageUrl
            inStock
            stockQuantity
            pricingMethod
            unitOfMeasure
          }
        }
      `
    });
  }
  if (sessionId) {
    const guestSessionId = requireGuestSessionId(sessionId);
    let cart = await sudoContext.query.Cart.findMany({
      where: {
        sessionId: { equals: guestSessionId }
      },
      query: `
        id
        sessionId
        customer { id }
        itemCount
        subtotal
        items {
          id
          quantity
          subtotal
          substitutionPreference
          product {
            id
            title
            handle
            price
            imageUrl
            inStock
            stockQuantity
            pricingMethod
            unitOfMeasure
          }
        }
      `
    });
    if (cart.length > 0) {
      return cart[0];
    }
    const expiresAt = /* @__PURE__ */ new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    return await sudoContext.query.Cart.createOne({
      data: {
        sessionId: guestSessionId,
        itemCount: 0,
        subtotal: 0,
        expiresAt: expiresAt.toISOString()
      },
      query: `
        id
        sessionId
        customer { id }
        itemCount
        subtotal
        items {
          id
          quantity
          subtotal
          substitutionPreference
          product {
            id
            title
            handle
            price
            imageUrl
            inStock
            stockQuantity
            pricingMethod
            unitOfMeasure
          }
        }
      `
    });
  }
  throw new Error("No session ID provided for guest cart");
}
async function recalculateCart(context, cartId) {
  const sudoContext = context.sudo();
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      sessionId
      customer { id }
      items {
        id
        quantity
        product {
          id
          price
        }
      }
    `
  });
  if (!cart) {
    throw new Error("Cart not found");
  }
  let subtotal = 0;
  let itemCount = 0;
  for (const item of cart.items) {
    const itemSubtotal = (item.product?.price || 0) * item.quantity;
    subtotal += itemSubtotal;
    itemCount += item.quantity;
    await sudoContext.query.CartItem.updateOne({
      where: { id: item.id },
      data: { subtotal: itemSubtotal }
    });
  }
  await sudoContext.query.Cart.updateOne({
    where: { id: cartId },
    data: {
      subtotal,
      itemCount
    }
  });
  return { subtotal, itemCount };
}
function formatCartResponse(cart) {
  const subtotal = cart.subtotal || 0;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + DELIVERY_FEE;
  return {
    id: cart.id,
    items: cart.items.map((item) => ({
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
        inStock: item.product?.inStock,
        stockQuantity: item.product?.stockQuantity
      }
    })),
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
    return formatCartResponse(cart);
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
  const sudoContext = context.sudo();
  const cart = await getOrCreateCart(context, sessionId);
  assertCartAccess(cart, context, sessionId);
  const product = await sudoContext.query.Product.findOne({
    where: { id: productId },
    query: "id title price inStock stockQuantity"
  });
  if (!product) {
    throw new Error("Product not found");
  }
  if (!product.inStock) {
    throw new Error("Product is out of stock");
  }
  if (product.stockQuantity !== null && product.stockQuantity < quantity) {
    throw new Error(`Only ${product.stockQuantity} items available in stock`);
  }
  const existingItem = cart.items.find(
    (item) => item.product?.id === productId
  );
  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;
    if (product.stockQuantity !== null && product.stockQuantity < newQuantity) {
      throw new Error(`Only ${product.stockQuantity} items available in stock`);
    }
    await sudoContext.query.CartItem.updateOne({
      where: { id: existingItem.id },
      data: { quantity: newQuantity }
    });
  } else {
    await sudoContext.query.CartItem.createOne({
      data: {
        cart: { connect: { id: cart.id } },
        product: { connect: { id: productId } },
        quantity,
        subtotal: (product.price || 0) * quantity
      }
    });
  }
  await recalculateCart(context, cart.id);
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
}
async function updateCartItem(root, {
  itemId,
  quantity,
  sessionId
}, context) {
  const sudoContext = context.sudo();
  const cartItem = await sudoContext.query.CartItem.findOne({
    where: { id: itemId },
    query: `
      id
      cart { id sessionId customer { id } }
      product { id stockQuantity inStock }
    `
  });
  if (!cartItem) {
    throw new Error("Cart item not found");
  }
  assertCartAccess(cartItem.cart, context, sessionId);
  if (cartItem.product?.stockQuantity !== null && cartItem.product?.stockQuantity < quantity) {
    throw new Error(`Only ${cartItem.product.stockQuantity} items available in stock`);
  }
  if (quantity <= 0) {
    await sudoContext.query.CartItem.deleteOne({
      where: { id: itemId }
    });
  } else {
    await sudoContext.query.CartItem.updateOne({
      where: { id: itemId },
      data: { quantity }
    });
  }
  await recalculateCart(context, cartItem.cart.id);
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
}
async function removeFromCart(root, { itemId, sessionId }, context) {
  const sudoContext = context.sudo();
  const cartItem = await sudoContext.query.CartItem.findOne({
    where: { id: itemId },
    query: "id cart { id sessionId customer { id } }"
  });
  if (!cartItem) {
    throw new Error("Cart item not found");
  }
  assertCartAccess(cartItem.cart, context, sessionId);
  await sudoContext.query.CartItem.deleteOne({
    where: { id: itemId }
  });
  await recalculateCart(context, cartItem.cart.id);
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
}
async function clearCart(root, { sessionId }, context) {
  const sudoContext = context.sudo();
  const cart = await getOrCreateCart(context, sessionId);
  assertCartAccess(cart, context, sessionId);
  for (const item of cart.items) {
    await sudoContext.query.CartItem.deleteOne({
      where: { id: item.id }
    });
  }
  await sudoContext.query.Cart.updateOne({
    where: { id: cart.id },
    data: {
      subtotal: 0,
      itemCount: 0
    }
  });
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
}
async function mergeGuestCart(root, { guestSessionId }, context) {
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to merge cart");
  }
  const sudoContext = context.sudo();
  const guestCarts = await sudoContext.query.Cart.findMany({
    where: { sessionId: { equals: guestSessionId } },
    query: `
      id
      sessionId
      customer { id }
      items {
        id
        quantity
        product { id }
      }
    `
  });
  if (guestCarts.length === 0) {
    const userCart2 = await getOrCreateCart(context);
    return formatCartResponse(userCart2);
  }
  const guestCart = guestCarts[0];
  assertCartAccess(guestCart, { ...context, session: void 0 }, guestSessionId);
  const userCart = await getOrCreateCart(context);
  for (const guestItem of guestCart.items) {
    const existingItem = userCart.items.find(
      (item) => item.product?.id === guestItem.product?.id
    );
    if (existingItem) {
      await sudoContext.query.CartItem.updateOne({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + guestItem.quantity }
      });
    } else {
      await sudoContext.query.CartItem.updateOne({
        where: { id: guestItem.id },
        data: {
          cart: { connect: { id: userCart.id } }
        }
      });
    }
  }
  await sudoContext.query.Cart.deleteOne({
    where: { id: guestCart.id }
  });
  await recalculateCart(context, userCart.id);
  const updatedCart = await getOrCreateCart(context);
  return formatCartResponse(updatedCart);
}
async function updateSubstitutionPreference(root, {
  itemId,
  preference,
  sessionId
}, context) {
  const sudoContext = context.sudo();
  const cartItem = await sudoContext.query.CartItem.findOne({
    where: { id: itemId },
    query: "id cart { id sessionId customer { id } }"
  });
  if (!cartItem) {
    throw new Error("Cart item not found");
  }
  assertCartAccess(cartItem.cart, context, sessionId);
  await sudoContext.query.CartItem.updateOne({
    where: { id: itemId },
    data: { substitutionPreference: preference }
  });
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
}

// features/keystone/mutations/clipCoupon.ts
async function clipCoupon(root, { couponId, couponCode }, context) {
  if (!context.session?.itemId) {
    throw new Error("You must be logged in to clip a coupon");
  }
  const userId = context.session.itemId;
  const sudoContext = context.sudo();
  let coupon;
  if (couponId) {
    coupon = await sudoContext.query.Coupon.findOne({
      where: { id: couponId },
      query: `
        id
        code
        isActive
        validFrom
        validTo
        maxUses
        currentUses
        discountType
        discountValue
        minPurchase
        productCategories
      `
    });
  } else if (couponCode) {
    const coupons = await sudoContext.query.Coupon.findMany({
      where: { code: { equals: couponCode } },
      query: `
        id
        code
        isActive
        validFrom
        validTo
        maxUses
        currentUses
        discountType
        discountValue
        minPurchase
        productCategories
      `
    });
    coupon = coupons[0];
  } else {
    throw new Error("You must provide either a couponId or couponCode");
  }
  if (!coupon) {
    throw new Error("Coupon not found");
  }
  if (!coupon.isActive) {
    throw new Error("This coupon is no longer active");
  }
  const now = /* @__PURE__ */ new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    throw new Error("This coupon is not yet valid");
  }
  if (coupon.validTo && new Date(coupon.validTo) < now) {
    throw new Error("This coupon has expired");
  }
  if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
    throw new Error("This coupon has reached its maximum number of uses");
  }
  const existingUserCoupons = await sudoContext.query.UserCoupon.findMany({
    where: {
      user: { id: { equals: userId } },
      coupon: { id: { equals: coupon.id } }
    },
    query: "id used"
  });
  if (existingUserCoupons.length > 0) {
    const existing = existingUserCoupons[0];
    if (existing.used) {
      throw new Error("You have already used this coupon");
    }
    throw new Error("You have already clipped this coupon");
  }
  const userCoupon = await sudoContext.query.UserCoupon.createOne({
    data: {
      user: { connect: { id: userId } },
      coupon: { connect: { id: coupon.id } },
      clippedAt: (/* @__PURE__ */ new Date()).toISOString(),
      used: false
    },
    query: `
      id
      clippedAt
      used
      coupon {
        id
        code
        discountType
        discountValue
        minPurchase
        validTo
        productCategories
      }
    `
  });
  return {
    success: true,
    message: `Coupon "${coupon.code}" has been clipped to your account`,
    userCoupon: {
      id: userCoupon.id,
      clippedAt: userCoupon.clippedAt,
      coupon: {
        id: userCoupon.coupon.id,
        code: userCoupon.coupon.code,
        discountType: userCoupon.coupon.discountType,
        discountValue: userCoupon.coupon.discountValue,
        minPurchase: userCoupon.coupon.minPurchase,
        validTo: userCoupon.coupon.validTo,
        productCategories: userCoupon.coupon.productCategories
      }
    }
  };
}
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
async function unclipCoupon(root, { userCouponId }, context) {
  if (!context.session?.itemId) {
    throw new Error("You must be logged in to unclip a coupon");
  }
  const sudoContext = context.sudo();
  const userCoupon = await sudoContext.query.UserCoupon.findOne({
    where: { id: userCouponId },
    query: `
      id
      used
      user { id }
      coupon { code }
    `
  });
  if (!userCoupon) {
    throw new Error("Clipped coupon not found");
  }
  if (userCoupon.user.id !== context.session.itemId) {
    throw new Error("You can only remove your own clipped coupons");
  }
  if (userCoupon.used) {
    throw new Error("Cannot remove a coupon that has already been used");
  }
  await sudoContext.query.UserCoupon.deleteOne({
    where: { id: userCouponId }
  });
  return {
    success: true,
    message: `Coupon "${userCoupon.coupon.code}" has been removed from your account`
  };
}

// features/keystone/mutations/applyCoupons.ts
async function applyCoupons(root, {
  userCouponIds,
  sessionId
}, context) {
  if (!context.session?.itemId) {
    throw new Error("You must be logged in to apply coupons");
  }
  const userId = context.session.itemId;
  const sudoContext = context.sudo();
  const carts = await sudoContext.query.Cart.findMany({
    where: {
      customer: { id: { equals: userId } }
    },
    query: `
      id
      subtotal
      items {
        id
        quantity
        subtotal
        product {
          id
          title
          price
          department
        }
      }
    `
  });
  if (carts.length === 0 || carts[0].items.length === 0) {
    return {
      success: false,
      totalDiscount: 0,
      breakdown: [],
      warnings: ["Your cart is empty"],
      finalSubtotal: 0
    };
  }
  const cart = carts[0];
  const cartItems = cart.items;
  const originalSubtotal = cart.subtotal || 0;
  let userCouponsQuery = {
    user: { id: { equals: userId } },
    used: { equals: false }
  };
  if (userCouponIds && userCouponIds.length > 0) {
    userCouponsQuery.id = { in: userCouponIds };
  }
  const userCoupons = await sudoContext.query.UserCoupon.findMany({
    where: userCouponsQuery,
    query: `
      id
      coupon {
        id
        code
        discountType
        discountValue
        minPurchase
        validFrom
        validTo
        isActive
        maxUses
        currentUses
        productCategories
        excludedProducts
      }
    `
  });
  if (userCoupons.length === 0) {
    return {
      success: true,
      totalDiscount: 0,
      breakdown: [],
      warnings: ["No clipped coupons to apply"],
      finalSubtotal: originalSubtotal
    };
  }
  const breakdown = [];
  const warnings = [];
  let totalDiscount = 0;
  const discountedProducts = /* @__PURE__ */ new Set();
  let hasPercentageOrFixedApplied = false;
  for (const userCoupon of userCoupons) {
    const coupon = userCoupon.coupon;
    const now = /* @__PURE__ */ new Date();
    if (!coupon.isActive) {
      warnings.push(`Coupon "${coupon.code}" is no longer active`);
      continue;
    }
    if (coupon.validFrom && new Date(coupon.validFrom) > now) {
      warnings.push(`Coupon "${coupon.code}" is not yet valid`);
      continue;
    }
    if (coupon.validTo && new Date(coupon.validTo) < now) {
      warnings.push(`Coupon "${coupon.code}" has expired`);
      continue;
    }
    if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
      warnings.push(`Coupon "${coupon.code}" has reached its maximum uses`);
      continue;
    }
    if (coupon.minPurchase && originalSubtotal < coupon.minPurchase) {
      warnings.push(
        `Coupon "${coupon.code}" requires minimum purchase of $${coupon.minPurchase.toFixed(2)}`
      );
      continue;
    }
    if ((coupon.discountType === "percentage" || coupon.discountType === "fixed") && hasPercentageOrFixedApplied) {
      warnings.push(
        `Coupon "${coupon.code}" cannot be stacked with other percentage/fixed discounts`
      );
      continue;
    }
    const applicableItems = getApplicableItems(cartItems, coupon);
    if (applicableItems.length === 0) {
      warnings.push(
        `Coupon "${coupon.code}" does not apply to any items in your cart`
      );
      continue;
    }
    let discountAmount = 0;
    const appliedToProducts = [];
    switch (coupon.discountType) {
      case "percentage":
        discountAmount = calculatePercentageDiscount(
          applicableItems,
          coupon.discountValue,
          discountedProducts
        );
        applicableItems.forEach((item) => {
          appliedToProducts.push(item.product.id);
          discountedProducts.add(item.product.id);
        });
        hasPercentageOrFixedApplied = true;
        break;
      case "fixed":
        const applicableTotal = applicableItems.reduce(
          (sum, item) => sum + item.subtotal,
          0
        );
        discountAmount = Math.min(coupon.discountValue, applicableTotal);
        applicableItems.forEach((item) => {
          appliedToProducts.push(item.product.id);
          discountedProducts.add(item.product.id);
        });
        hasPercentageOrFixedApplied = true;
        break;
      case "bogo":
        discountAmount = calculateBOGODiscount(
          applicableItems,
          discountedProducts
        );
        applicableItems.forEach((item) => {
          if (item.quantity >= 2 || applicableItems.length >= 2) {
            appliedToProducts.push(item.product.id);
            discountedProducts.add(item.product.id);
          }
        });
        break;
      default:
        warnings.push(`Unknown discount type for coupon "${coupon.code}"`);
        continue;
    }
    if (discountAmount > 0) {
      breakdown.push({
        couponId: coupon.id,
        couponCode: coupon.code,
        discountType: coupon.discountType,
        discountAmount: Math.round(discountAmount * 100) / 100,
        appliedToProducts
      });
      totalDiscount += discountAmount;
    } else {
      warnings.push(
        `Coupon "${coupon.code}" did not provide any discount for your cart`
      );
    }
  }
  totalDiscount = Math.min(totalDiscount, originalSubtotal);
  totalDiscount = Math.round(totalDiscount * 100) / 100;
  const finalSubtotal = Math.round((originalSubtotal - totalDiscount) * 100) / 100;
  return {
    success: true,
    totalDiscount,
    breakdown,
    warnings,
    finalSubtotal
  };
}
function getApplicableItems(cartItems, coupon) {
  let applicable = [...cartItems];
  const productCategories = coupon.productCategories;
  if (productCategories && Array.isArray(productCategories) && productCategories.length > 0) {
    applicable = applicable.filter(
      (item) => productCategories.includes(item.product.department)
    );
  }
  const excludedProducts = coupon.excludedProducts;
  if (excludedProducts && Array.isArray(excludedProducts) && excludedProducts.length > 0) {
    applicable = applicable.filter(
      (item) => !excludedProducts.includes(item.product.id)
    );
  }
  return applicable;
}
function calculatePercentageDiscount(items, percentage, alreadyDiscounted) {
  let total = 0;
  for (const item of items) {
    if (alreadyDiscounted.has(item.product.id)) {
      continue;
    }
    const itemDiscount = item.subtotal * (percentage / 100);
    total += itemDiscount;
  }
  return total;
}
function calculateBOGODiscount(items, alreadyDiscounted) {
  let totalDiscount = 0;
  const eligibleItems = items.filter(
    (item) => !alreadyDiscounted.has(item.product.id)
  );
  if (eligibleItems.length === 0) {
    return 0;
  }
  for (const item of eligibleItems) {
    if (item.quantity >= 2) {
      const freeItems = Math.floor(item.quantity / 2);
      const itemPrice = item.product.price || 0;
      totalDiscount += freeItems * itemPrice;
    }
  }
  const singleItems = eligibleItems.filter((item) => item.quantity === 1).sort((a, b) => (b.product.price || 0) - (a.product.price || 0));
  for (let i = 0; i < singleItems.length - 1; i += 2) {
    const cheaperItem = singleItems[i + 1];
    totalDiscount += cheaperItem.product.price || 0;
  }
  return totalDiscount;
}
async function markCouponsAsUsed(root, { userCouponIds }, context) {
  if (!context.session?.itemId) {
    throw new Error("You must be logged in");
  }
  const sudoContext = context.sudo();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const results = [];
  for (const userCouponId of userCouponIds) {
    const userCoupon = await sudoContext.query.UserCoupon.findOne({
      where: { id: userCouponId },
      query: `
        id
        used
        user { id }
        coupon { id currentUses }
      `
    });
    if (!userCoupon || userCoupon.user.id !== context.session.itemId) {
      continue;
    }
    if (userCoupon.used) {
      continue;
    }
    await sudoContext.query.UserCoupon.updateOne({
      where: { id: userCouponId },
      data: {
        used: true,
        usedAt: now
      }
    });
    await sudoContext.query.Coupon.updateOne({
      where: { id: userCoupon.coupon.id },
      data: {
        currentUses: (userCoupon.coupon.currentUses || 0) + 1
      }
    });
    results.push(userCouponId);
  }
  return {
    success: true,
    markedAsUsed: results
  };
}
async function previewCouponDiscount(root, { couponCode, sessionId }, context) {
  const sudoContext = context.sudo();
  const coupons = await sudoContext.query.Coupon.findMany({
    where: { code: { equals: couponCode } },
    query: `
      id
      code
      discountType
      discountValue
      minPurchase
      validFrom
      validTo
      isActive
      productCategories
    `
  });
  if (coupons.length === 0) {
    return {
      valid: false,
      message: "Coupon not found",
      potentialDiscount: 0
    };
  }
  const coupon = coupons[0];
  const now = /* @__PURE__ */ new Date();
  if (!coupon.isActive) {
    return {
      valid: false,
      message: "This coupon is no longer active",
      potentialDiscount: 0
    };
  }
  if (coupon.validTo && new Date(coupon.validTo) < now) {
    return {
      valid: false,
      message: "This coupon has expired",
      potentialDiscount: 0
    };
  }
  let cart;
  if (context.session?.itemId) {
    const carts = await sudoContext.query.Cart.findMany({
      where: {
        customer: { id: { equals: context.session.itemId } }
      },
      query: `
        id
        subtotal
        items {
          id
          quantity
          subtotal
          product {
            id
            title
            price
            department
          }
        }
      `
    });
    cart = carts[0];
  } else if (sessionId) {
    const carts = await sudoContext.query.Cart.findMany({
      where: {
        sessionId: { equals: sessionId }
      },
      query: `
        id
        subtotal
        items {
          id
          quantity
          subtotal
          product {
            id
            title
            price
            department
          }
        }
      `
    });
    cart = carts[0];
  }
  if (!cart || cart.items.length === 0) {
    return {
      valid: true,
      message: "Add items to your cart to see potential savings",
      potentialDiscount: 0,
      couponDetails: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchase: coupon.minPurchase
      }
    };
  }
  if (coupon.minPurchase && cart.subtotal < coupon.minPurchase) {
    return {
      valid: true,
      message: `Add $${(coupon.minPurchase - cart.subtotal).toFixed(2)} more to use this coupon`,
      potentialDiscount: 0,
      couponDetails: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchase: coupon.minPurchase
      }
    };
  }
  const applicableItems = getApplicableItems(cart.items, coupon);
  let potentialDiscount = 0;
  switch (coupon.discountType) {
    case "percentage":
      potentialDiscount = calculatePercentageDiscount(
        applicableItems,
        coupon.discountValue,
        /* @__PURE__ */ new Set()
      );
      break;
    case "fixed":
      const applicableTotal = applicableItems.reduce(
        (sum, item) => sum + item.subtotal,
        0
      );
      potentialDiscount = Math.min(coupon.discountValue, applicableTotal);
      break;
    case "bogo":
      potentialDiscount = calculateBOGODiscount(applicableItems, /* @__PURE__ */ new Set());
      break;
  }
  potentialDiscount = Math.round(potentialDiscount * 100) / 100;
  return {
    valid: true,
    message: potentialDiscount > 0 ? `You could save $${potentialDiscount.toFixed(2)} with this coupon!` : "This coupon does not apply to items in your cart",
    potentialDiscount,
    couponDetails: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minPurchase: coupon.minPurchase
    }
  };
}

// features/keystone/mutations/manageSubscription.ts
function calculateNextDeliveryDate(frequency, fromDate) {
  const date = fromDate || /* @__PURE__ */ new Date();
  switch (frequency) {
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "biweekly":
      date.setDate(date.getDate() + 14);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      date.setDate(date.getDate() + 7);
  }
  return date;
}
async function createSubscription(root, {
  productId,
  quantity,
  frequency,
  deliveryDay
}, context) {
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to create a subscription");
  }
  const sudoContext = context.sudo();
  const product = await sudoContext.query.Product.findOne({
    where: { id: productId },
    query: "id title price inStock"
  });
  if (!product) {
    throw new Error("Product not found");
  }
  const existingSubscriptions = await sudoContext.query.Subscription.findMany({
    where: {
      user: { id: { equals: context.session.itemId } },
      product: { equals: productId },
      isActive: { equals: true }
    },
    query: "id"
  });
  if (existingSubscriptions.length > 0) {
    throw new Error("You already have an active subscription for this product");
  }
  const nextDeliveryDate = calculateNextDeliveryDate(frequency);
  const subscription = await sudoContext.query.Subscription.createOne({
    data: {
      user: { connect: { id: context.session.itemId } },
      product: productId,
      quantity,
      frequency,
      nextDeliveryDate: nextDeliveryDate.toISOString(),
      isActive: true,
      discount: 5
      // Default 5% subscription discount
    },
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
      createdAt
    `
  });
  return {
    id: subscription.id,
    productId: subscription.product,
    quantity: subscription.quantity,
    frequency: subscription.frequency,
    nextDeliveryDate: subscription.nextDeliveryDate,
    discount: subscription.discount,
    isActive: subscription.isActive,
    isPaused: !!subscription.pausedUntil,
    pausedUntil: subscription.pausedUntil
  };
}
async function updateSubscription(root, {
  subscriptionId,
  quantity,
  frequency
}, context) {
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to update a subscription");
  }
  const sudoContext = context.sudo();
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: "id user { id } product quantity frequency nextDeliveryDate isActive"
  });
  if (!subscription) {
    throw new Error("Subscription not found");
  }
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error("You can only update your own subscriptions");
  }
  const updateData = {};
  if (quantity !== void 0) {
    if (quantity < 1) {
      throw new Error("Quantity must be at least 1");
    }
    updateData.quantity = quantity;
  }
  if (frequency !== void 0) {
    if (!["weekly", "biweekly", "monthly"].includes(frequency)) {
      throw new Error("Invalid frequency. Must be weekly, biweekly, or monthly");
    }
    updateData.frequency = frequency;
    updateData.nextDeliveryDate = calculateNextDeliveryDate(frequency).toISOString();
  }
  const updatedSubscription = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: updateData,
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
    `
  });
  return {
    id: updatedSubscription.id,
    productId: updatedSubscription.product,
    quantity: updatedSubscription.quantity,
    frequency: updatedSubscription.frequency,
    nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    discount: updatedSubscription.discount,
    isActive: updatedSubscription.isActive,
    isPaused: !!updatedSubscription.pausedUntil,
    pausedUntil: updatedSubscription.pausedUntil
  };
}
async function pauseSubscription(root, {
  subscriptionId,
  pauseUntil
}, context) {
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to pause a subscription");
  }
  const sudoContext = context.sudo();
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: "id user { id } isActive"
  });
  if (!subscription) {
    throw new Error("Subscription not found");
  }
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error("You can only pause your own subscriptions");
  }
  if (!subscription.isActive) {
    throw new Error("Cannot pause an inactive subscription");
  }
  const pauseDate = new Date(pauseUntil);
  if (pauseDate <= /* @__PURE__ */ new Date()) {
    throw new Error("Pause date must be in the future");
  }
  const updatedSubscription = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: {
      pausedUntil: pauseDate.toISOString()
    },
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
    `
  });
  return {
    id: updatedSubscription.id,
    productId: updatedSubscription.product,
    quantity: updatedSubscription.quantity,
    frequency: updatedSubscription.frequency,
    nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    discount: updatedSubscription.discount,
    isActive: updatedSubscription.isActive,
    isPaused: true,
    pausedUntil: updatedSubscription.pausedUntil
  };
}
async function cancelSubscription(root, { subscriptionId }, context) {
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to cancel a subscription");
  }
  const sudoContext = context.sudo();
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: "id user { id } isActive"
  });
  if (!subscription) {
    throw new Error("Subscription not found");
  }
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error("You can only cancel your own subscriptions");
  }
  if (!subscription.isActive) {
    throw new Error("Subscription is already cancelled");
  }
  const updatedSubscription = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: {
      isActive: false,
      pausedUntil: null
    },
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
    `
  });
  return {
    id: updatedSubscription.id,
    productId: updatedSubscription.product,
    quantity: updatedSubscription.quantity,
    frequency: updatedSubscription.frequency,
    nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    discount: updatedSubscription.discount,
    isActive: false,
    isPaused: false,
    pausedUntil: null
  };
}
async function skipNextDelivery(root, { subscriptionId }, context) {
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to skip a delivery");
  }
  const sudoContext = context.sudo();
  const subscription = await sudoContext.query.Subscription.findOne({
    where: { id: subscriptionId },
    query: "id user { id } frequency nextDeliveryDate isActive pausedUntil"
  });
  if (!subscription) {
    throw new Error("Subscription not found");
  }
  if (subscription.user?.id !== context.session.itemId) {
    throw new Error("You can only modify your own subscriptions");
  }
  if (!subscription.isActive) {
    throw new Error("Cannot skip delivery for inactive subscription");
  }
  const currentDeliveryDate = subscription.nextDeliveryDate ? new Date(subscription.nextDeliveryDate) : /* @__PURE__ */ new Date();
  const newNextDeliveryDate = calculateNextDeliveryDate(
    subscription.frequency,
    currentDeliveryDate
  );
  const updatedSubscription = await sudoContext.query.Subscription.updateOne({
    where: { id: subscriptionId },
    data: {
      nextDeliveryDate: newNextDeliveryDate.toISOString()
    },
    query: `
      id
      product
      quantity
      frequency
      nextDeliveryDate
      discount
      isActive
      pausedUntil
    `
  });
  return {
    id: updatedSubscription.id,
    productId: updatedSubscription.product,
    quantity: updatedSubscription.quantity,
    frequency: updatedSubscription.frequency,
    nextDeliveryDate: updatedSubscription.nextDeliveryDate,
    discount: updatedSubscription.discount,
    isActive: updatedSubscription.isActive,
    isPaused: !!updatedSubscription.pausedUntil,
    pausedUntil: updatedSubscription.pausedUntil,
    skippedDate: subscription.nextDeliveryDate
  };
}

// features/keystone/mutations/addRecipeToCart.ts
var TAX_RATE2 = 0.08;
var DELIVERY_FEE2 = 5.99;
async function getOrCreateCart2(context, sessionId) {
  const sudoContext = context.sudo();
  if (context.session?.itemId) {
    let cart = await sudoContext.query.Cart.findMany({
      where: {
        customer: { id: { equals: context.session.itemId } }
      },
      query: `
        id
        itemCount
        subtotal
        items {
          id
          quantity
          subtotal
          substitutionPreference
          product {
            id
            title
            handle
            price
            imageUrl
            inStock
            stockQuantity
            pricingMethod
            unitOfMeasure
          }
        }
      `
    });
    if (cart.length > 0) {
      return cart[0];
    }
    return await sudoContext.query.Cart.createOne({
      data: {
        customer: { connect: { id: context.session.itemId } },
        itemCount: 0,
        subtotal: 0
      },
      query: `
        id
        itemCount
        subtotal
        items {
          id
          quantity
          subtotal
          substitutionPreference
          product {
            id
            title
            handle
            price
            imageUrl
            inStock
            stockQuantity
            pricingMethod
            unitOfMeasure
          }
        }
      `
    });
  }
  if (sessionId) {
    let cart = await sudoContext.query.Cart.findMany({
      where: {
        sessionId: { equals: sessionId }
      },
      query: `
        id
        itemCount
        subtotal
        items {
          id
          quantity
          subtotal
          substitutionPreference
          product {
            id
            title
            handle
            price
            imageUrl
            inStock
            stockQuantity
            pricingMethod
            unitOfMeasure
          }
        }
      `
    });
    if (cart.length > 0) {
      return cart[0];
    }
    const expiresAt = /* @__PURE__ */ new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    return await sudoContext.query.Cart.createOne({
      data: {
        sessionId,
        itemCount: 0,
        subtotal: 0,
        expiresAt: expiresAt.toISOString()
      },
      query: `
        id
        itemCount
        subtotal
        items {
          id
          quantity
          subtotal
          substitutionPreference
          product {
            id
            title
            handle
            price
            imageUrl
            inStock
            stockQuantity
            pricingMethod
            unitOfMeasure
          }
        }
      `
    });
  }
  throw new Error("No session ID provided for guest cart");
}
async function recalculateCart2(context, cartId) {
  const sudoContext = context.sudo();
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      items {
        id
        quantity
        product {
          id
          price
        }
      }
    `
  });
  if (!cart) {
    throw new Error("Cart not found");
  }
  let subtotal = 0;
  let itemCount = 0;
  for (const item of cart.items) {
    const itemSubtotal = (item.product?.price || 0) * item.quantity;
    subtotal += itemSubtotal;
    itemCount += item.quantity;
    await sudoContext.query.CartItem.updateOne({
      where: { id: item.id },
      data: { subtotal: itemSubtotal }
    });
  }
  await sudoContext.query.Cart.updateOne({
    where: { id: cartId },
    data: {
      subtotal,
      itemCount
    }
  });
  return { subtotal, itemCount };
}
function formatCartResponse2(cart) {
  const subtotal = cart.subtotal || 0;
  const tax = subtotal * TAX_RATE2;
  const total = subtotal + tax + DELIVERY_FEE2;
  return {
    id: cart.id,
    items: cart.items.map((item) => ({
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
        inStock: item.product?.inStock,
        stockQuantity: item.product?.stockQuantity
      }
    })),
    subtotal,
    tax: Math.round(tax * 100) / 100,
    deliveryFee: DELIVERY_FEE2,
    total: Math.round(total * 100) / 100,
    itemCount: cart.itemCount || 0
  };
}
async function scaleRecipe(root, {
  recipeId,
  targetServings
}, context) {
  const sudoContext = context.sudo();
  const recipe = await sudoContext.query.Recipe.findOne({
    where: { id: recipeId },
    query: "id name servings"
  });
  if (!recipe) {
    throw new Error("Recipe not found");
  }
  if (!recipe.servings || recipe.servings <= 0) {
    throw new Error("Recipe does not have valid serving information");
  }
  const ingredients = await sudoContext.db.RecipeIngredient.findMany({
    where: {
      recipe: { id: { equals: recipeId } }
    }
  });
  const scaleFactor = targetServings / recipe.servings;
  const scaledIngredients = await Promise.all(
    ingredients.map(async (ingredient) => {
      const product = ingredient.product ? await sudoContext.query.Product.findOne({
        where: { id: ingredient.product },
        query: "id title price imageUrl inStock stockQuantity"
      }) : null;
      return {
        id: ingredient.id,
        productId: ingredient.product,
        product: product ? {
          id: product.id,
          name: product.title,
          price: product.price,
          imageUrl: product.imageUrl,
          inStock: product.inStock,
          stockQuantity: product.stockQuantity
        } : null,
        originalQuantity: ingredient.quantity,
        scaledQuantity: Math.round(ingredient.quantity * scaleFactor * 100) / 100,
        unit: ingredient.unit,
        notes: ingredient.notes,
        isOptional: ingredient.isOptional
      };
    })
  );
  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    originalServings: recipe.servings,
    targetServings,
    scaleFactor: Math.round(scaleFactor * 100) / 100,
    ingredients: scaledIngredients
  };
}
async function addRecipeToCart(root, {
  recipeId,
  servings,
  sessionId,
  includeOptional
}, context) {
  const sudoContext = context.sudo();
  const recipe = await sudoContext.query.Recipe.findOne({
    where: { id: recipeId },
    query: "id name servings"
  });
  if (!recipe) {
    throw new Error("Recipe not found");
  }
  const cart = await getOrCreateCart2(context, sessionId);
  const ingredients = await sudoContext.db.RecipeIngredient.findMany({
    where: {
      recipe: { id: { equals: recipeId } }
    }
  });
  if (ingredients.length === 0) {
    throw new Error("Recipe has no ingredients");
  }
  const targetServings = servings || recipe.servings || 1;
  const scaleFactor = recipe.servings ? targetServings / recipe.servings : 1;
  const addedItems = [];
  const unavailableItems = [];
  const skippedOptional = [];
  for (const ingredient of ingredients) {
    if (ingredient.isOptional && !includeOptional) {
      skippedOptional.push({
        productId: ingredient.product,
        reason: "Optional ingredient not included"
      });
      continue;
    }
    if (!ingredient.product) {
      unavailableItems.push({
        productId: null,
        reason: "No product linked to ingredient"
      });
      continue;
    }
    const product = await sudoContext.query.Product.findOne({
      where: { id: ingredient.product },
      query: "id title price inStock stockQuantity"
    });
    if (!product) {
      unavailableItems.push({
        productId: ingredient.product,
        reason: "Product not found"
      });
      continue;
    }
    if (!product.inStock) {
      unavailableItems.push({
        productId: ingredient.product,
        productName: product.title,
        reason: "Out of stock"
      });
      continue;
    }
    const scaledQuantity = Math.ceil(ingredient.quantity * scaleFactor);
    if (product.stockQuantity !== null && product.stockQuantity < scaledQuantity) {
      unavailableItems.push({
        productId: ingredient.product,
        productName: product.title,
        reason: `Insufficient stock (need ${scaledQuantity}, have ${product.stockQuantity})`,
        availableQuantity: product.stockQuantity
      });
      continue;
    }
    const existingItem = cart.items.find(
      (item) => item.product?.id === ingredient.product
    );
    if (existingItem) {
      const newQuantity = existingItem.quantity + scaledQuantity;
      if (product.stockQuantity !== null && product.stockQuantity < newQuantity) {
        unavailableItems.push({
          productId: ingredient.product,
          productName: product.title,
          reason: `Insufficient stock for combined quantity`,
          requestedQuantity: scaledQuantity,
          existingQuantity: existingItem.quantity
        });
        continue;
      }
      await sudoContext.query.CartItem.updateOne({
        where: { id: existingItem.id },
        data: { quantity: newQuantity }
      });
      addedItems.push({
        productId: ingredient.product,
        productName: product.title,
        quantity: scaledQuantity,
        action: "updated",
        newTotal: newQuantity
      });
    } else {
      await sudoContext.query.CartItem.createOne({
        data: {
          cart: { connect: { id: cart.id } },
          product: { connect: { id: ingredient.product } },
          quantity: scaledQuantity,
          subtotal: (product.price || 0) * scaledQuantity
        }
      });
      addedItems.push({
        productId: ingredient.product,
        productName: product.title,
        quantity: scaledQuantity,
        action: "added"
      });
    }
  }
  await recalculateCart2(context, cart.id);
  const updatedCart = await getOrCreateCart2(context, sessionId);
  const formattedCart = formatCartResponse2(updatedCart);
  return {
    cart: formattedCart,
    recipeId: recipe.id,
    recipeName: recipe.name,
    servingsAdded: targetServings,
    summary: {
      addedCount: addedItems.length,
      unavailableCount: unavailableItems.length,
      skippedOptionalCount: skippedOptional.length,
      addedItems,
      unavailableItems,
      skippedOptional
    }
  };
}

// features/keystone/mutations/manageShoppingList.ts
async function getShoppingListForUser(context, listId) {
  const sudoContext = context.sudo();
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to manage shopping lists");
  }
  const list36 = await sudoContext.query.ShoppingList.findOne({
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
  if (!list36) {
    throw new Error("Shopping list not found");
  }
  if (list36.user?.id !== context.session.itemId) {
    throw new Error("Not authorized to access this shopping list");
  }
  return list36;
}
function formatShoppingListResponse(list36) {
  return {
    id: list36.id,
    name: list36.name,
    isDefault: list36.isDefault,
    items: list36.items.map((item) => ({
      id: item.id,
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      notes: item.notes,
      addedAt: item.addedAt
    })),
    itemCount: list36.items.length,
    checkedCount: list36.items.filter((item) => item.checked).length
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
  const list36 = await getShoppingListForUser(context, listId);
  const existingItem = list36.items.find(
    (item) => item.product.toLowerCase() === product.toLowerCase()
  );
  if (existingItem) {
    const newQuantity = existingItem.quantity + (quantity || 1);
    await sudoContext.query.ShoppingListItem.updateOne({
      where: { id: existingItem.id },
      data: {
        quantity: newQuantity,
        ...unit && { unit },
        ...notes && { notes: existingItem.notes ? `${existingItem.notes}; ${notes}` : notes }
      }
    });
  } else {
    await sudoContext.query.ShoppingListItem.createOne({
      data: {
        list: { connect: { id: listId } },
        product,
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
    throw new Error("Item not found");
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
  const list36 = await getShoppingListForUser(context, listId);
  const uncheckedItems = list36.items.filter((item) => !item.checked);
  if (uncheckedItems.length === 0) {
    return {
      success: true,
      message: "No unchecked items to add to cart",
      addedCount: 0,
      skippedCount: 0,
      skippedItems: []
    };
  }
  let cart;
  if (context.session?.itemId) {
    const carts = await sudoContext.query.Cart.findMany({
      where: {
        customer: { id: { equals: context.session.itemId } }
      },
      query: "id items { id product { id title } quantity }"
    });
    if (carts.length > 0) {
      cart = carts[0];
    } else {
      cart = await sudoContext.query.Cart.createOne({
        data: {
          customer: { connect: { id: context.session.itemId } },
          itemCount: 0,
          subtotal: 0
        },
        query: "id items { id product { id title } quantity }"
      });
    }
  } else if (sessionId) {
    const carts = await sudoContext.query.Cart.findMany({
      where: {
        sessionId: { equals: sessionId }
      },
      query: "id items { id product { id title } quantity }"
    });
    if (carts.length > 0) {
      cart = carts[0];
    } else {
      const expiresAt = /* @__PURE__ */ new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      cart = await sudoContext.query.Cart.createOne({
        data: {
          sessionId,
          itemCount: 0,
          subtotal: 0,
          expiresAt: expiresAt.toISOString()
        },
        query: "id items { id product { id title } quantity }"
      });
    }
  } else {
    throw new Error("No session ID provided for guest cart");
  }
  let addedCount = 0;
  const skippedItems = [];
  for (const item of uncheckedItems) {
    const products = await sudoContext.query.Product.findMany({
      where: {
        OR: [
          { title: { contains: item.product, mode: "insensitive" } },
          { title: { equals: item.product, mode: "insensitive" } }
        ]
      },
      query: "id title price inStock stockQuantity",
      take: 1
    });
    if (products.length === 0) {
      skippedItems.push(item.product);
      continue;
    }
    const product = products[0];
    if (!product.inStock) {
      skippedItems.push(`${item.product} (out of stock)`);
      continue;
    }
    const existingCartItem = cart.items.find(
      (cartItem) => cartItem.product?.id === product.id
    );
    if (existingCartItem) {
      const newQuantity = existingCartItem.quantity + item.quantity;
      await sudoContext.query.CartItem.updateOne({
        where: { id: existingCartItem.id },
        data: { quantity: newQuantity }
      });
    } else {
      await sudoContext.query.CartItem.createOne({
        data: {
          cart: { connect: { id: cart.id } },
          product: { connect: { id: product.id } },
          quantity: item.quantity,
          subtotal: (product.price || 0) * item.quantity
        }
      });
    }
    addedCount++;
  }
  const updatedCart = await sudoContext.query.Cart.findOne({
    where: { id: cart.id },
    query: `
      id
      items {
        id
        quantity
        product { id price }
      }
    `
  });
  let subtotal = 0;
  let itemCount = 0;
  for (const cartItem of updatedCart.items) {
    const itemSubtotal = (cartItem.product?.price || 0) * cartItem.quantity;
    subtotal += itemSubtotal;
    itemCount += cartItem.quantity;
    await sudoContext.query.CartItem.updateOne({
      where: { id: cartItem.id },
      data: { subtotal: itemSubtotal }
    });
  }
  await sudoContext.query.Cart.updateOne({
    where: { id: cart.id },
    data: { subtotal, itemCount }
  });
  return {
    success: true,
    message: `Added ${addedCount} items to cart${skippedItems.length > 0 ? `, skipped ${skippedItems.length}` : ""}`,
    addedCount,
    skippedCount: skippedItems.length,
    skippedItems
  };
}

// features/keystone/mutations/getAvailablePickupSlots.ts
async function getAvailablePickupSlots(root, { days = 7, minCapacity = 1 }, context) {
  const sudoContext = context.sudo();
  const startDate = /* @__PURE__ */ new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);
  const slots = await sudoContext.query.PickupSlot.findMany({
    where: {
      AND: [
        { date: { gte: startDate.toISOString() } },
        { date: { lt: endDate.toISOString() } },
        { isAvailable: { equals: true } }
      ]
    },
    query: `
      id
      date
      startTime
      endTime
      maxOrders
      currentOrders
      isAvailable
    `,
    orderBy: [{ date: "asc" }, { startTime: "asc" }]
  });
  const availableSlots = [];
  for (const slot of slots) {
    const availableCapacity = slot.maxOrders - slot.currentOrders;
    if (availableCapacity >= minCapacity) {
      availableSlots.push({
        id: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        availableCapacity,
        maxOrders: slot.maxOrders,
        currentOrders: slot.currentOrders,
        isAvailable: slot.isAvailable
      });
    }
  }
  return availableSlots;
}
async function getPickupSlotsByDate(root, { days = 7, minCapacity = 1 }, context) {
  const slots = await getAvailablePickupSlots(root, { days, minCapacity }, context);
  const groupedSlots = {};
  for (const slot of slots) {
    const dateKey = new Date(slot.date).toISOString().split("T")[0];
    if (!groupedSlots[dateKey]) {
      groupedSlots[dateKey] = [];
    }
    groupedSlots[dateKey].push(slot);
  }
  return Object.entries(groupedSlots).map(([date, daySlots]) => ({
    date,
    slots: daySlots,
    totalSlots: daySlots.length,
    totalAvailableCapacity: daySlots.reduce((sum, slot) => sum + slot.availableCapacity, 0)
  }));
}
async function reservePickupSlot(root, { slotId, orderId }, context) {
  const sudoContext = context.sudo();
  const slot = await sudoContext.query.PickupSlot.findOne({
    where: { id: slotId },
    query: "id maxOrders currentOrders isAvailable date startTime endTime"
  });
  if (!slot) {
    throw new Error("Pickup slot not found");
  }
  if (!slot.isAvailable) {
    throw new Error("Pickup slot is not available");
  }
  const availableCapacity = slot.maxOrders - slot.currentOrders;
  if (availableCapacity <= 0) {
    throw new Error("Pickup slot is fully booked");
  }
  await sudoContext.query.PickupSlot.updateOne({
    where: { id: slotId },
    data: {
      currentOrders: slot.currentOrders + 1,
      // Automatically mark as unavailable if full
      isAvailable: slot.currentOrders + 1 < slot.maxOrders
    }
  });
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: "id metadata"
  });
  if (order) {
    const metadata = order.metadata || {};
    await sudoContext.query.Order.updateOne({
      where: { id: orderId },
      data: {
        metadata: {
          ...metadata,
          pickupSlotId: slotId,
          pickupDate: slot.date,
          pickupStartTime: slot.startTime,
          pickupEndTime: slot.endTime
        }
      }
    });
  }
  return {
    success: true,
    slotId,
    orderId,
    pickupDate: slot.date,
    pickupStartTime: slot.startTime,
    pickupEndTime: slot.endTime,
    remainingCapacity: availableCapacity - 1
  };
}
async function releasePickupSlot(root, { slotId, orderId }, context) {
  const sudoContext = context.sudo();
  const slot = await sudoContext.query.PickupSlot.findOne({
    where: { id: slotId },
    query: "id maxOrders currentOrders"
  });
  if (!slot) {
    throw new Error("Pickup slot not found");
  }
  if (slot.currentOrders <= 0) {
    throw new Error("No reservations to release");
  }
  await sudoContext.query.PickupSlot.updateOne({
    where: { id: slotId },
    data: {
      currentOrders: slot.currentOrders - 1,
      isAvailable: true
      // Re-enable if it was full
    }
  });
  if (orderId) {
    const order = await sudoContext.query.Order.findOne({
      where: { id: orderId },
      query: "id metadata"
    });
    if (order) {
      const metadata = order.metadata || {};
      delete metadata.pickupSlotId;
      delete metadata.pickupDate;
      delete metadata.pickupStartTime;
      delete metadata.pickupEndTime;
      await sudoContext.query.Order.updateOne({
        where: { id: orderId },
        data: { metadata }
      });
    }
  }
  return {
    success: true,
    slotId,
    remainingCapacity: slot.maxOrders - slot.currentOrders + 1
  };
}

// features/keystone/mutations/customerCheckIn.ts
async function customerCheckIn(root, {
  orderId,
  parkingSpotId,
  vehicleDescription
}, context) {
  const sudoContext = context.sudo();
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: `
      id
      displayId
      status
      email
      user { id }
      metadata
    `
  });
  if (!order) {
    throw new Error("Order not found");
  }
  if (context.session?.itemId && order.user?.id !== context.session.itemId) {
    throw new Error("Not authorized to check in for this order");
  }
  const metadata = order.metadata || {};
  if (metadata.fulfillmentMethod === "pickup" && !metadata.readyForPickup) {
    throw new Error("This pickup order is not marked ready yet");
  }
  const validStatuses = ["packed"];
  if (!validStatuses.includes(order.status)) {
    if (order.status === "delivered") {
      throw new Error("This order has already been picked up");
    }
    if (order.status === "cancelled") {
      throw new Error("This order has been cancelled");
    }
    if (order.status === "pending") {
      throw new Error("This order is still being processed and not ready for pickup");
    }
    throw new Error(`Order cannot be checked in with status: ${order.status}`);
  }
  let parkingSpot = null;
  if (parkingSpotId) {
    parkingSpot = await sudoContext.query.ParkingSpot.findOne({
      where: { id: parkingSpotId },
      query: "id spotNumber description isAccessible isAvailable"
    });
    if (!parkingSpot) {
      throw new Error("Parking spot not found");
    }
    if (!parkingSpot.isAvailable) {
      throw new Error("Selected parking spot is not available");
    }
    await sudoContext.query.ParkingSpot.updateOne({
      where: { id: parkingSpotId },
      data: { isAvailable: false }
    });
  }
  const checkInTime = (/* @__PURE__ */ new Date()).toISOString();
  await sudoContext.query.Order.updateOne({
    where: { id: orderId },
    data: {
      status: "packed",
      // Ensure status indicates ready for handoff
      metadata: {
        ...metadata,
        checkInTime,
        parkingSpotId: parkingSpotId || null,
        parkingSpotNumber: parkingSpot?.spotNumber || null,
        vehicleDescription: vehicleDescription || null,
        customerArrived: true,
        pickupCheckedInAt: checkInTime
      }
    }
  });
  const waitingOrders = await sudoContext.query.Order.findMany({
    where: {
      AND: [
        { status: { equals: "packed" } },
        { id: { not: { equals: orderId } } }
      ]
    },
    query: "id metadata"
  });
  const ordersAhead = waitingOrders.filter((o) => {
    const orderMeta = o.metadata || {};
    if (!orderMeta.customerArrived) return false;
    if (!orderMeta.checkInTime) return false;
    return new Date(orderMeta.checkInTime) < new Date(checkInTime);
  }).length;
  const estimatedWaitMinutes = ordersAhead * 3;
  return {
    success: true,
    orderId,
    orderNumber: order.displayId,
    status: "checked_in",
    parkingSpot: parkingSpot ? {
      id: parkingSpot.id,
      spotNumber: parkingSpot.spotNumber,
      description: parkingSpot.description,
      isAccessible: parkingSpot.isAccessible
    } : null,
    estimatedWaitMinutes,
    message: parkingSpot ? `Checked in at spot ${parkingSpot.spotNumber}. Estimated wait: ${estimatedWaitMinutes} minutes.` : `Checked in successfully. Estimated wait: ${estimatedWaitMinutes} minutes.`
  };
}
async function getAvailableParkingSpots(root, { accessibleOnly }, context) {
  const sudoContext = context.sudo();
  const where = {
    isAvailable: { equals: true }
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
async function releaseParkingSpot(root, { parkingSpotId, orderId }, context) {
  const sudoContext = context.sudo();
  const spot = await sudoContext.query.ParkingSpot.findOne({
    where: { id: parkingSpotId },
    query: "id spotNumber isAvailable"
  });
  if (!spot) {
    throw new Error("Parking spot not found");
  }
  await sudoContext.query.ParkingSpot.updateOne({
    where: { id: parkingSpotId },
    data: { isAvailable: true }
  });
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: "id metadata"
  });
  if (order) {
    const metadata = order.metadata || {};
    await sudoContext.query.Order.updateOne({
      where: { id: orderId },
      data: {
        status: "delivered",
        metadata: {
          ...metadata,
          deliveryTime: (/* @__PURE__ */ new Date()).toISOString(),
          parkingSpotReleased: true
        }
      }
    });
  }
  return {
    success: true,
    parkingSpotId,
    spotNumber: spot.spotNumber,
    orderId,
    message: `Parking spot ${spot.spotNumber} released. Order marked as delivered.`
  };
}
async function completeOrderHandoff(root, { orderId }, context) {
  const sudoContext = context.sudo();
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: "id displayId status metadata"
  });
  if (!order) {
    throw new Error("Order not found");
  }
  if (order.status === "delivered") {
    throw new Error("Order has already been delivered");
  }
  const metadata = order.metadata || {};
  const parkingSpotId = metadata.parkingSpotId;
  if (parkingSpotId) {
    await sudoContext.query.ParkingSpot.updateOne({
      where: { id: parkingSpotId },
      data: { isAvailable: true }
    });
  }
  await sudoContext.query.Order.updateOne({
    where: { id: orderId },
    data: {
      status: "delivered",
      metadata: {
        ...metadata,
        deliveryTime: (/* @__PURE__ */ new Date()).toISOString(),
        handoffCompletedBy: context.session?.itemId || "staff",
        parkingSpotReleased: !!parkingSpotId
      }
    }
  });
  return {
    success: true,
    orderId,
    orderNumber: order.displayId,
    status: "delivered",
    message: `Order #${order.displayId} has been handed off successfully.`
  };
}

// import("../../integrations/payment/**/*.ts") in features/keystone/utils/paymentProviderAdapter.ts
var globImport_integrations_payment_ts = __glob({
  "../../integrations/payment/index.ts": () => Promise.resolve().then(() => (init_payment(), payment_exports)),
  "../../integrations/payment/manual.ts": () => Promise.resolve().then(() => (init_manual(), manual_exports)),
  "../../integrations/payment/stripe.ts": () => Promise.resolve().then(() => (init_stripe(), stripe_exports))
});

// features/keystone/utils/paymentProviderAdapter.ts
async function executeAdapterFunction({ provider, functionName, args }) {
  const functionPath = provider?.[functionName];
  if (!functionPath) {
    throw new Error(`Provider ${provider?.code || "unknown"} is missing ${functionName}`);
  }
  if (functionPath.startsWith("http")) {
    const response = await fetch(functionPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...args })
    });
    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.statusText}`);
    }
    return response.json();
  }
  const adapter = await globImport_integrations_payment_ts(`../../integrations/payment/${functionPath}.ts`);
  const fn = adapter[functionName];
  if (!fn) {
    throw new Error(`Function ${functionName} not found in adapter ${functionPath}`);
  }
  return fn({ provider, ...args });
}
async function createPayment({ provider, cart, order, amount, currency }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency }
  });
}
async function getPaymentStatus({ provider, paymentId }) {
  return executeAdapterFunction({
    provider,
    functionName: "getPaymentStatusFunction",
    args: { paymentId }
  });
}

// features/keystone/mutations/submitGroceryOrder.ts
var TAX_RATE3 = 0.0875;
function generateDisplayId() {
  return Number(String(Date.now()).slice(-6));
}
async function submitGroceryOrder(root, { data }, context) {
  const sudoContext = context.sudo();
  const fulfillmentMethod = data.fulfillmentMethod === "pickup" ? "pickup" : "delivery";
  if (fulfillmentMethod === "delivery" && !data.deliverySlotId) {
    throw new Error("Delivery orders require a delivery slot");
  }
  if (fulfillmentMethod === "pickup" && !data.pickupSlotId) {
    throw new Error("Pickup orders require a pickup slot");
  }
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: data.cartId },
    query: `
      id
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
          sku
          price
          imageUrl
          inStock
          stockQuantity
        }
      }
    `
  });
  if (!cart) {
    throw new Error("Cart not found");
  }
  const sessionUserId = context.session?.itemId || null;
  const cartOwnerId = cart.customer?.id || null;
  if (sessionUserId) {
    if (cartOwnerId !== sessionUserId) {
      throw new Error("You do not have access to this cart");
    }
  } else if (!data.sessionId?.trim() || cartOwnerId || cart.sessionId !== data.sessionId.trim()) {
    throw new Error("You do not have access to this cart");
  }
  if (!cart.items?.length) {
    throw new Error("Cart is empty");
  }
  for (const item of cart.items) {
    if (!item.product) {
      throw new Error("Cart contains an invalid product");
    }
    if (!item.product.inStock) {
      throw new Error(`${item.product.title} is out of stock`);
    }
    if (item.product.stockQuantity !== null && item.product.stockQuantity !== void 0 && item.product.stockQuantity < item.quantity) {
      throw new Error(`Only ${item.product.stockQuantity} units available for ${item.product.title}`);
    }
  }
  const deliverySlot = fulfillmentMethod === "delivery" ? await sudoContext.query.DeliverySlot.findOne({
    where: { id: data.deliverySlotId },
    query: "id date startTime endTime capacity currentBookings isActive deliveryFee"
  }) : null;
  const pickupSlot = fulfillmentMethod === "pickup" ? await sudoContext.query.PickupSlot.findOne({
    where: { id: data.pickupSlotId },
    query: "id date startTime endTime maxOrders currentOrders isAvailable"
  }) : null;
  if (fulfillmentMethod === "delivery" && !deliverySlot) {
    throw new Error("Selected delivery slot was not found");
  }
  if (fulfillmentMethod === "pickup" && !pickupSlot) {
    throw new Error("Selected pickup slot was not found");
  }
  if (deliverySlot && !deliverySlot.isActive) {
    throw new Error("Selected delivery slot is no longer available");
  }
  if (pickupSlot && !pickupSlot.isAvailable) {
    throw new Error("Selected pickup slot is no longer available");
  }
  if (deliverySlot && deliverySlot.capacity - deliverySlot.currentBookings <= 0) {
    throw new Error("Selected delivery slot is fully booked");
  }
  if (pickupSlot && pickupSlot.maxOrders - pickupSlot.currentOrders <= 0) {
    throw new Error("Selected pickup slot is fully booked");
  }
  const subtotal = cart.items.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0);
  const taxAmount = Number((subtotal * TAX_RATE3).toFixed(2));
  const deliveryFee = fulfillmentMethod === "delivery" ? Number(((deliverySlot?.deliveryFee || 0) / 100).toFixed(2)) : 0;
  const orderTotal = Number((subtotal + taxAmount + deliveryFee).toFixed(2));
  if (Math.abs(orderTotal - data.expectedTotal) > 0.02) {
    throw new Error("Order total changed before checkout. Please review your cart and fulfillment slot.");
  }
  if (Math.abs(deliveryFee - data.deliveryFee) > 0.02) {
    throw new Error("Delivery fee changed before checkout. Please review your fulfillment slot.");
  }
  const selectedSession = await sudoContext.query.PaymentSession.findOne({
    where: { id: data.paymentSessionId },
    query: `
      id
      amount
      isSelected
      isInitiated
      data
      paymentProvider {
        id
        code
        isInstalled
        createPaymentFunction
        capturePaymentFunction
        refundPaymentFunction
        getPaymentStatusFunction
        generatePaymentLinkFunction
        handleWebhookFunction
        credentials
      }
      cart {
        id
      }
    `
  });
  if (!selectedSession || selectedSession.cart?.id !== cart.id) {
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
  const sessionTotal = Number(selectedSession.data?.total || selectedSession.amount || 0);
  if (Math.abs(sessionTotal - orderTotal) > 0.02) {
    throw new Error("Payment session amount does not match order total");
  }
  const paymentProvider = selectedSession.paymentProvider;
  if (!paymentProvider) {
    throw new Error("Payment provider missing from payment session");
  }
  const providerPaymentId = selectedSession.data?.paymentIntentId || data.paymentIntentId;
  if (!providerPaymentId) {
    throw new Error("Payment session is missing provider payment id");
  }
  const paymentStatus = await getPaymentStatus({
    provider: paymentProvider,
    paymentId: providerPaymentId
  });
  const normalizedStatus = paymentStatus?.status || "succeeded";
  if (!["succeeded", "requires_capture", "captured", "processing"].includes(normalizedStatus)) {
    throw new Error(`Payment is not in a chargeable state: ${normalizedStatus}`);
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
  const order = await sudoContext.db.Order.createOne({
    data: {
      displayId: generateDisplayId(),
      email: data.email,
      status: "pending",
      taxRate: TAX_RATE3,
      deliveryDate: new Date(data.deliveryDate).toISOString(),
      deliveryTimeWindow: data.deliveryTimeWindow,
      substitutionPreference: data.substitutionPreference,
      deliveryInstructions: data.deliveryInstructions || void 0,
      metadata: {
        fulfillmentMethod,
        deliverySlotId: data.deliverySlotId || null,
        pickupSlotId: data.pickupSlotId || null,
        deliveryFee,
        subtotal,
        taxAmount,
        orderTotal,
        selectedFulfillmentSlot: selectedSlot ? {
          date: selectedSlot.date,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime
        } : null
      },
      user: sessionUserId ? { connect: { id: sessionUserId } } : void 0,
      shippingAddress: { connect: { id: address.id } }
    }
  });
  for (const item of cart.items) {
    await sudoContext.db.OrderLineItem.createOne({
      data: {
        title: item.product?.title || "Product",
        sku: item.product?.sku || void 0,
        quantity: item.quantity,
        unitPrice: item.product?.price || 0,
        thumbnail: item.product?.imageUrl || void 0,
        order: { connect: { id: order.id } },
        product: item.product?.id ? { connect: { id: item.product.id } } : void 0,
        metadata: {
          cartItemId: item.id,
          substitutionPreference: item.substitutionPreference || null
        }
      }
    });
    if (item.product?.id && typeof item.product.stockQuantity === "number") {
      await sudoContext.db.Product.updateOne({
        where: { id: item.product.id },
        data: {
          stockQuantity: Math.max(0, item.product.stockQuantity - item.quantity),
          inStock: item.product.stockQuantity - item.quantity > 0
        }
      });
    }
  }
  if (deliverySlot && data.deliverySlotId) {
    await sudoContext.query.DeliverySlot.updateOne({
      where: { id: data.deliverySlotId },
      data: {
        currentBookings: deliverySlot.currentBookings + 1,
        isActive: deliverySlot.currentBookings + 1 < deliverySlot.capacity
      }
    });
  }
  if (pickupSlot && data.pickupSlotId) {
    await sudoContext.query.PickupSlot.updateOne({
      where: { id: data.pickupSlotId },
      data: {
        currentOrders: pickupSlot.currentOrders + 1,
        isAvailable: pickupSlot.currentOrders + 1 < pickupSlot.maxOrders
      }
    });
  }
  await sudoContext.db.Payment.createOne({
    data: {
      amount: orderTotal.toFixed(2),
      status: "succeeded",
      paymentMethod: "credit_card",
      providerPaymentId,
      providerData: {
        ...selectedSession.data,
        status: paymentStatus?.status,
        providerCode: paymentProvider.code
      },
      processedAt: (/* @__PURE__ */ new Date()).toISOString(),
      order: { connect: { id: order.id } },
      paymentProvider: { connect: { id: paymentProvider.id } },
      processedBy: sessionUserId ? { connect: { id: sessionUserId } } : void 0
    }
  });
  for (const item of cart.items) {
    await sudoContext.db.CartItem.deleteOne({
      where: { id: item.id }
    });
  }
  await sudoContext.db.Cart.updateOne({
    where: { id: cart.id },
    data: {
      itemCount: 0,
      subtotal: 0
    }
  });
  return {
    success: true,
    orderId: order.id,
    displayId: order.displayId,
    message: "Order submitted successfully"
  };
}

// features/keystone/mutations/initiatePaymentSession.ts
async function initiatePaymentSession(root, { cartId, paymentProviderId, deliverySlotId, pickupSlotId, sessionId }, context) {
  const sudoContext = context.sudo();
  if (deliverySlotId && pickupSlotId) {
    throw new Error("Choose either delivery or pickup, not both");
  }
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      sessionId
      customer { id }
      subtotal
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
  const provider = await sudoContext.query.PaymentProvider.findOne({
    where: { code: paymentProviderId },
    query: `
      id
      code
      isInstalled
      createPaymentFunction
      capturePaymentFunction
      refundPaymentFunction
      getPaymentStatusFunction
      generatePaymentLinkFunction
      handleWebhookFunction
      credentials
    `
  });
  if (!provider || !provider.isInstalled) {
    throw new Error(`Payment provider ${paymentProviderId} not found or not installed`);
  }
  const deliverySlot = deliverySlotId ? await sudoContext.query.DeliverySlot.findOne({
    where: { id: deliverySlotId },
    query: "id deliveryFee capacity currentBookings isActive"
  }) : null;
  const pickupSlot = pickupSlotId ? await sudoContext.query.PickupSlot.findOne({
    where: { id: pickupSlotId },
    query: "id maxOrders currentOrders isAvailable"
  }) : null;
  if (deliverySlotId && !deliverySlot) {
    throw new Error("Selected delivery slot was not found");
  }
  if (pickupSlotId && !pickupSlot) {
    throw new Error("Selected pickup slot was not found");
  }
  if (deliverySlot && !deliverySlot.isActive) {
    throw new Error("Selected delivery slot is no longer available");
  }
  if (pickupSlot && !pickupSlot.isAvailable) {
    throw new Error("Selected pickup slot is no longer available");
  }
  if (deliverySlot && deliverySlot.capacity - deliverySlot.currentBookings <= 0) {
    throw new Error("Selected delivery slot is fully booked");
  }
  if (pickupSlot && pickupSlot.maxOrders - pickupSlot.currentOrders <= 0) {
    throw new Error("Selected pickup slot is fully booked");
  }
  const fulfillmentMethod = pickupSlot ? "pickup" : "delivery";
  const subtotalDollars = Number(cart.subtotal || 0);
  const taxDollars = Number((subtotalDollars * 0.0875).toFixed(2));
  const deliveryFeeDollars = Number(((deliverySlot?.deliveryFee || 0) / 100).toFixed(2));
  const totalDollars = Number((subtotalDollars + taxDollars + deliveryFeeDollars).toFixed(2));
  const amountInCents = Math.round(totalDollars * 100);
  const slotKey = pickupSlotId ? `pickup:${pickupSlotId}` : `delivery:${deliverySlotId || "no-slot"}`;
  const idempotencyKey = `${cart.id}:${provider.code}:${slotKey}:${amountInCents}`;
  const existingSession = cart.paymentSessions?.find(
    (session) => session.paymentProvider?.code === provider.code && session.idempotencyKey === idempotencyKey
  );
  if (existingSession) {
    return existingSession;
  }
  const existingSelectedSessions = cart.paymentSessions?.filter((session) => session.isSelected) || [];
  for (const session of existingSelectedSessions) {
    await sudoContext.query.PaymentSession.updateOne({
      where: { id: session.id },
      data: { isSelected: false }
    });
  }
  const sessionData = await createPayment({
    provider,
    cart,
    amount: amountInCents,
    currency: "usd"
  });
  const newSession = await sudoContext.query.PaymentSession.createOne({
    data: {
      cart: { connect: { id: cart.id } },
      paymentProvider: { connect: { id: provider.id } },
      amount: totalDollars.toFixed(2),
      idempotencyKey,
      isSelected: true,
      isInitiated: true,
      data: {
        ...sessionData,
        subtotal: subtotalDollars,
        tax: taxDollars,
        deliveryFee: deliveryFeeDollars,
        total: totalDollars,
        fulfillmentMethod,
        deliverySlotId: deliverySlotId || null,
        pickupSlotId: pickupSlotId || null,
        amountInCents
      }
    },
    query: `
      id
      data
      amount
      idempotencyKey
      isInitiated
      isSelected
      paymentProvider {
        id
        code
      }
    `
  });
  return newSession;
}

// features/keystone/mutations/manageDeliveryRoutes.ts
async function getOrderOrThrow(sudoContext, orderId) {
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: "id displayId status deliveryDate deliveryTimeWindow metadata deliveryRoute { id }"
  });
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  return order;
}
async function createDeliveryRouteFromOrders(root, { deliveryDate, deliveryTimeWindow, orderIds, driverId }, context) {
  if (!orderIds.length) {
    throw new Error("Select at least one order for the route");
  }
  const sudoContext = context.sudo();
  const orders = [];
  for (const orderId of orderIds) {
    const order = await getOrderOrThrow(sudoContext, orderId);
    const metadata = order.metadata || {};
    if (metadata.fulfillmentMethod !== "delivery") {
      throw new Error(`Order #${order.displayId} is not a delivery order`);
    }
    if (order.status !== "packed") {
      throw new Error(`Order #${order.displayId} must be packed before routing`);
    }
    if (order.deliveryTimeWindow !== deliveryTimeWindow) {
      throw new Error(`Order #${order.displayId} is in a different delivery window`);
    }
    if (order.deliveryRoute?.id || metadata.deliveryRouteId) {
      throw new Error(`Order #${order.displayId} is already assigned to a route`);
    }
    orders.push(order);
  }
  const route = await sudoContext.query.DeliveryRoute.createOne({
    data: {
      date: new Date(deliveryDate).toISOString(),
      timeWindow: deliveryTimeWindow,
      status: "planning",
      ...driverId ? { driver: { connect: { id: driverId } } } : {},
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
}
async function updateDeliveryRouteWorkflow(root, { routeId, status }, context) {
  const sudoContext = context.sudo();
  const route = await sudoContext.query.DeliveryRoute.findOne({
    where: { id: routeId },
    query: `
      id
      status
      stops
      orders {
        id
        displayId
        status
        metadata
      }
    `
  });
  if (!route) {
    throw new Error("Delivery route not found");
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
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const routeData = { status };
  if (status === "in_progress") {
    routeData.startedAt = now;
  }
  if (status === "completed") {
    routeData.completedAt = now;
  }
  await sudoContext.query.DeliveryRoute.updateOne({
    where: { id: routeId },
    data: {
      ...routeData,
      stops: (route.stops || []).map((stop) => ({
        ...stop,
        status: status === "in_progress" ? "out_for_delivery" : status === "completed" ? "delivered" : stop.status
      }))
    }
  });
  const nextOrderStatus = status === "in_progress" ? "out_for_delivery" : status === "completed" ? "delivered" : null;
  if (nextOrderStatus) {
    for (const order of route.orders || []) {
      await sudoContext.query.Order.updateOne({
        where: { id: order.id },
        data: {
          status: nextOrderStatus,
          metadata: {
            ...order.metadata || {},
            deliveryRouteId: routeId,
            ...status === "in_progress" ? { dispatchedAt: now } : {},
            ...status === "completed" ? { deliveredAt: now } : {}
          }
        }
      });
    }
  }
  return {
    success: true,
    routeId,
    status,
    orderCount: route.orders?.length || 0,
    message: status === "in_progress" ? "Route dispatched." : status === "completed" ? "Route completed." : "Route updated."
  };
}

// features/keystone/mutations/index.ts
var graphql = String.raw;
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

      # Subscription types
      type GrocerySubscription {
        id: ID!
        productId: String!
        quantity: Int!
        frequency: String!
        nextDeliveryDate: String
        discount: Float
        isActive: Boolean!
        isPaused: Boolean!
        pausedUntil: String
        skippedDate: String
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

      type AddListToCartResult {
        success: Boolean!
        message: String!
        addedCount: Int!
        skippedCount: Int!
        skippedItems: [String!]!
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

      type ReservePickupSlotResult {
        success: Boolean!
        slotId: ID!
        orderId: ID!
        pickupDate: String!
        pickupStartTime: String!
        pickupEndTime: String!
        remainingCapacity: Int!
      }

      type ReleasePickupSlotResult {
        success: Boolean!
        slotId: ID!
        remainingCapacity: Int!
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

      type Query {
        redirectToInit: Boolean
        groceryCart(sessionId: String): GroceryCart
        clippedCoupons: [ClippedCoupon!]!
        scaleRecipe(recipeId: ID!, targetServings: Int!): ScaledRecipe!
        activeCartPaymentProviders: [PaymentProvider!]!

        # Pickup Slot queries
        availablePickupSlots(days: Int, minCapacity: Int): [PickupSlotResult!]!
        pickupSlotsByDate(days: Int, minCapacity: Int): [PickupSlotsByDateResult!]!

        # Parking Spot queries
        availableParkingSpots(accessibleOnly: Boolean): [ParkingSpotResult!]!
      }

      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        initiatePaymentSession(cartId: ID!, paymentProviderId: String!, deliverySlotId: ID, pickupSlotId: ID, sessionId: String): PaymentSession
        addItemToGroceryCart(productId: ID!, quantity: Int!, sessionId: String): GroceryCart
        updateGroceryCartItem(itemId: ID!, quantity: Int!, sessionId: String): GroceryCart
        removeItemFromGroceryCart(itemId: ID!, sessionId: String): GroceryCart
        clearGroceryCart(sessionId: String): GroceryCart
        mergeGuestGroceryCart(guestSessionId: String!): GroceryCart
        updateGrocerySubstitutionPreference(itemId: ID!, preference: String!, sessionId: String): GroceryCart

        # Coupon mutations
        clipCoupon(couponId: ID, couponCode: String): ClipCouponResult!
        unclipCoupon(userCouponId: ID!): UnclipCouponResult!
        applyCoupons(userCouponIds: [ID!], sessionId: String): ApplyCouponsResult!
        markCouponsAsUsed(userCouponIds: [ID!]!): MarkCouponsUsedResult!
        previewCouponDiscount(couponCode: String!, sessionId: String): PreviewCouponResult!

        # Subscription mutations
        createGrocerySubscription(productId: ID!, quantity: Int!, frequency: String!, deliveryDay: String): GrocerySubscription!
        updateGrocerySubscription(subscriptionId: ID!, quantity: Int, frequency: String): GrocerySubscription!
        pauseGrocerySubscription(subscriptionId: ID!, pauseUntil: String!): GrocerySubscription!
        cancelGrocerySubscription(subscriptionId: ID!): GrocerySubscription!
        skipNextGroceryDelivery(subscriptionId: ID!): GrocerySubscription!

        # Recipe mutations
        addRecipeToCart(recipeId: ID!, servings: Int, sessionId: String, includeOptional: Boolean): AddRecipeToCartResult!

        # Shopping List mutations
        addToShoppingList(listId: ID!, product: String!, quantity: Int, unit: String, notes: String): ShoppingListResult!
        removeFromShoppingList(listId: ID!, itemId: ID!): ShoppingListResult!
        updateShoppingListItemQuantity(listId: ID!, itemId: ID!, quantity: Int!): ShoppingListResult!
        toggleShoppingListItemChecked(listId: ID!, itemId: ID!): ShoppingListResult!
        addShoppingListToCart(listId: ID!, sessionId: String): AddListToCartResult!

        # Pickup Slot mutations
        reservePickupSlot(slotId: ID!, orderId: ID!): ReservePickupSlotResult!
        releasePickupSlot(slotId: ID!, orderId: ID): ReleasePickupSlotResult!

        # Customer Check-in mutations
        customerCheckIn(orderId: ID!, parkingSpotId: ID, vehicleDescription: String): CustomerCheckInResult!
        releaseParkingSpot(parkingSpotId: ID!, orderId: ID!): ReleaseParkingSpotResult!
        completeOrderHandoff(orderId: ID!): CompleteOrderHandoffResult!
        createDeliveryRouteFromOrders(deliveryDate: String!, deliveryTimeWindow: String!, orderIds: [ID!]!, driverId: ID): DeliveryRouteWorkflowResult!
        updateDeliveryRouteWorkflow(routeId: ID!, status: String!): DeliveryRouteWorkflowResult!
        submitGroceryOrder(data: SubmitGroceryOrderInput!): SubmitGroceryOrderResult!
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

      input SubmitGroceryOrderInput {
        cartId: ID!
        paymentSessionId: ID!
        paymentIntentId: String!
        sessionId: String
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
        message: String!
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default,
        groceryCart: getCart,
        clippedCoupons: getClippedCoupons,
        scaleRecipe,
        activeCartPaymentProviders: async (_root, _args, context) => {
          return context.sudo().query.PaymentProvider.findMany({
            where: { isInstalled: { equals: true } },
            query: "id name code isInstalled"
          });
        },
        availablePickupSlots: getAvailablePickupSlots,
        pickupSlotsByDate: getPickupSlotsByDate,
        availableParkingSpots: getAvailableParkingSpots
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        initiatePaymentSession,
        addItemToGroceryCart: addToCart,
        updateGroceryCartItem: updateCartItem,
        removeItemFromGroceryCart: removeFromCart,
        clearGroceryCart: clearCart,
        mergeGuestGroceryCart: mergeGuestCart,
        updateGrocerySubstitutionPreference: updateSubstitutionPreference,
        // Coupon mutations
        clipCoupon,
        unclipCoupon,
        applyCoupons,
        markCouponsAsUsed,
        previewCouponDiscount,
        // Subscription mutations
        createGrocerySubscription: createSubscription,
        updateGrocerySubscription: updateSubscription,
        pauseGrocerySubscription: pauseSubscription,
        cancelGrocerySubscription: cancelSubscription,
        skipNextGroceryDelivery: skipNextDelivery,
        // Recipe mutations
        addRecipeToCart,
        // Shopping List mutations
        addToShoppingList: addToList,
        removeFromShoppingList: removeFromList,
        updateShoppingListItemQuantity: updateListItemQuantity,
        toggleShoppingListItemChecked: toggleListItemChecked,
        addShoppingListToCart: addListToCart,
        // Pickup Slot mutations
        reservePickupSlot,
        releasePickupSlot,
        // Customer Check-in mutations
        customerCheckIn,
        releaseParkingSpot,
        completeOrderHandoff,
        createDeliveryRouteFromOrders,
        updateDeliveryRouteWorkflow,
        submitGroceryOrder
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
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

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  // How long they stay signed in?
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
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
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
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
  (0, import_core36.config)({
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
      isAccessAllowed: ({ session }) => permissions.canAccessDashboard({ session })
    },
    session: (0, import_session.statelessSessions)(sessionConfig),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
