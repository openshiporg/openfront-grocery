"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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
    query: `id privacyErasedAt store { id isActive } role { ${capability} }`
  });
  if (user?.privacyErasedAt || !user?.store?.isActive || !user.role?.[capability]) throw new Error(`Missing current capability: ${capability}`);
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
      select: { privacyErasedAt: true, store: { select: { isActive: true } }, role: { select: { [capability]: true } } }
    });
    return Boolean(!user?.privacyErasedAt && user?.store?.isActive && user.role?.[capability]);
  };
}
var permissions;
var init_access = __esm({
  "features/keystone/access.ts"() {
    "use strict";
    permissions = {
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
  }
});

// features/keystone/lib/storeScope.ts
async function requireSessionStore(context) {
  if (!context.session?.itemId) throw new Error("Store-scoped operation requires authentication");
  const user = await context.prisma.user.findUnique({
    where: { id: context.session.itemId },
    select: { privacyErasedAt: true, storeId: true, store: { select: { id: true, code: true, name: true, isActive: true, timezone: true, currencyCode: true } } }
  });
  if (user?.privacyErasedAt) throw new Error("This account has completed an erasure request");
  if (!user?.storeId || !user.store?.isActive) throw new Error("Active store scope is required");
  return user.store;
}
async function publicStore(context) {
  const publicStoreId2 = process.env.PUBLIC_STORE_ID || JUNIPER_STORE_ID;
  const store = await context.prisma.store.findFirst({ where: { id: publicStoreId2, isActive: true } });
  if (!store) throw new Error("No active grocery store is configured");
  return store;
}
var JUNIPER_STORE_ID;
var init_storeScope = __esm({
  "features/keystone/lib/storeScope.ts"() {
    "use strict";
    JUNIPER_STORE_ID = "store_juniper";
  }
});

// features/keystone/lib/inventoryMovements.ts
function quantityMilli(value) {
  const number2 = Number(value);
  const milli = Math.round(number2 * 1e3);
  if (!Number.isFinite(number2) || !Number.isSafeInteger(milli) || Math.abs(number2 * 1e3 - milli) > 1e-5) {
    throw new Error("Stock quantity must have at most three decimal places");
  }
  return milli;
}
function canonicalEvidence(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalEvidence);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key2) => [key2, canonicalEvidence(value[key2])]));
  return value;
}
async function appendInventoryMovement(tx, input) {
  if (!input.storeId || !input.productId || !input.sourceId || !input.reason?.trim() || !input.idempotencyKey) throw new Error("Inventory movement requires ownership and source evidence");
  const before = quantityMilli(input.quantityBefore), after = quantityMilli(input.quantityAfter);
  const productBefore = quantityMilli(input.productStockBefore), productAfter = quantityMilli(input.productStockAfter);
  if (Math.min(before, after, productBefore, productAfter) < 0) throw new Error("Inventory movement cannot have negative balances");
  const data = { ...input, reason: input.reason.trim(), quantityBefore: before / 1e3, quantityAfter: after / 1e3, quantityDelta: (after - before) / 1e3, productStockBefore: productBefore / 1e3, productStockAfter: productAfter / 1e3 };
  const existing = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    for (const field of ["storeId", "productId", "inventoryLotId", "orderId", "sourceType", "sourceId", "reason", "actorId"]) {
      if ((existing[field] || null) !== (data[field] || null)) throw new Error("Inventory movement replay conflicts with original evidence");
    }
    for (const field of ["quantityBefore", "quantityAfter", "productStockBefore", "productStockAfter"]) {
      if (quantityMilli(existing[field]) !== quantityMilli(data[field])) throw new Error("Inventory movement replay conflicts with original balances");
    }
    if (JSON.stringify(canonicalEvidence(existing.metadata || null)) !== JSON.stringify(canonicalEvidence(input.metadata || null))) throw new Error("Inventory movement replay conflicts with original source evidence");
    return existing;
  }
  const previous = await tx.inventoryMovement.findFirst({ where: { storeId: input.storeId, inventoryLotId: input.inventoryLotId || null, productId: input.productId }, orderBy: { sequence: "desc" } });
  if (previous && quantityMilli(previous.quantityAfter) !== before) throw new Error("Inventory movement does not continue the lot journal balance");
  return tx.inventoryMovement.create({ data: { ...data, sequence: Number(previous?.sequence || 0) + 1 } });
}
var init_inventoryMovements = __esm({
  "features/keystone/lib/inventoryMovements.ts"() {
    "use strict";
  }
});

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
var init_serializableTransaction = __esm({
  "features/keystone/utils/serializableTransaction.ts"() {
    "use strict";
  }
});

// features/keystone/lib/groceryOutbox.ts
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
  return (0, import_node_crypto2.createHash)("sha256").update(canonicalGroceryOutboxPayload(payload)).digest("hex");
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
  return `${workerId}:${(0, import_node_crypto2.randomUUID)()}`;
}
var import_node_crypto2;
var init_groceryOutbox = __esm({
  "features/keystone/lib/groceryOutbox.ts"() {
    "use strict";
    import_node_crypto2 = require("node:crypto");
  }
});

// features/integrations/payment/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  cancelPaymentFunction: () => cancelPaymentFunction,
  capturePaymentFunction: () => capturePaymentFunction,
  createPaymentFunction: () => createPaymentFunction,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction,
  getPaymentStatusFunction: () => getPaymentStatusFunction,
  getRefundStatusFunction: () => getRefundStatusFunction,
  handleWebhookFunction: () => handleWebhookFunction,
  refundPaymentFunction: () => refundPaymentFunction,
  stripeCheckoutMetadata: () => stripeCheckoutMetadata
});
function stripeCheckoutMetadata(cart) {
  return { cartId: cart?.id || "", sessionId: cart?.sessionId || "", ...cart?.checkoutPaymentSessionId ? {
    paymentSessionId: cart.checkoutPaymentSessionId,
    checkoutFingerprint: cart.checkoutFingerprint || "",
    cartFingerprint: cart.cartFingerprint || ""
  } : {} };
}
async function createPaymentFunction({ cart, amount, currency, idempotencyKey, captureMethod = "automatic" }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    capture_method: captureMethod,
    automatic_payment_methods: {
      enabled: true
    },
    metadata: stripeCheckoutMetadata(cart)
  }, idempotencyKey ? { idempotencyKey } : void 0);
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id
  };
}
async function capturePaymentFunction({ paymentId, amount, amountCents, idempotencyKey }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    amount_to_capture: amountCents ?? amount
  }, idempotencyKey ? { idempotencyKey } : void 0);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    amountCents: paymentIntent.amount_received,
    currency: paymentIntent.currency,
    data: paymentIntent
  };
}
async function refundPaymentFunction({ paymentId, amount, idempotencyKey }) {
  const stripe = getStripeClient();
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentId,
      amount,
      metadata: idempotencyKey ? { groceryRefundKey: idempotencyKey } : void 0
    },
    idempotencyKey ? { idempotencyKey } : void 0
  );
  return {
    status: refund.status,
    amount: refund.amount,
    currency: refund.currency,
    paymentId: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id,
    data: refund
  };
}
async function getPaymentStatusFunction({ paymentId }) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  return {
    status: paymentIntent.status,
    amount: paymentIntent.status === "succeeded" ? paymentIntent.amount_received : paymentIntent.amount,
    amountCents: paymentIntent.status === "succeeded" ? paymentIntent.amount_received : paymentIntent.amount,
    currency: paymentIntent.currency,
    authorizedAmountCents: paymentIntent.amount,
    capturedAmountCents: paymentIntent.amount_received,
    capturableAmountCents: paymentIntent.amount_capturable,
    captureMethod: paymentIntent.capture_method,
    data: paymentIntent
  };
}
async function getRefundStatusFunction({ refundId }) {
  const refund = await getStripeClient().refunds.retrieve(refundId);
  return {
    id: refund.id,
    status: refund.status,
    amount: refund.amount,
    currency: refund.currency,
    paymentId: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id,
    data: refund
  };
}
async function cancelPaymentFunction({ paymentId, idempotencyKey }) {
  const intent = await getStripeClient().paymentIntents.cancel(paymentId, {}, idempotencyKey ? { idempotencyKey } : void 0);
  return { status: intent.status, amount: intent.amount_received, amountCents: intent.amount_received, currency: intent.currency, data: intent };
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

// features/integrations/payment/test.ts
var test_exports = {};
__export(test_exports, {
  cancelPaymentFunction: () => cancelPaymentFunction2,
  capturePaymentFunction: () => capturePaymentFunction2,
  createPaymentFunction: () => createPaymentFunction2,
  createTestPaymentWebhookSignature: () => createTestPaymentWebhookSignature,
  generatePaymentLinkFunction: () => generatePaymentLinkFunction2,
  getPaymentStatusFunction: () => getPaymentStatusFunction2,
  getRefundStatusFunction: () => getRefundStatusFunction2,
  handleWebhookFunction: () => handleWebhookFunction2,
  refundPaymentFunction: () => refundPaymentFunction2
});
function secret() {
  const value = process.env[TEST_PROVIDER_SECRET_ENV];
  if (!value) throw new Error(`${TEST_PROVIDER_SECRET_ENV} is required for the local payment adapter`);
  return value;
}
function signature(rawBody) {
  return (0, import_node_crypto3.createHmac)("sha256", secret()).update(rawBody).digest("hex");
}
async function createPaymentFunction2({ amount, currency, idempotencyKey, captureMethod = "automatic" }) {
  secret();
  const paymentIntentId = `test_pi_${Buffer.from(idempotencyKey || `${currency}:${amount}:${Date.now()}`).toString("base64url")}`;
  if (!paymentStates.has(paymentIntentId)) paymentStates.set(paymentIntentId, { status: captureMethod === "manual" ? "requires_capture" : "succeeded", amount, amountCents: amount, currency: currency.toLowerCase(), authorizedAmountCents: amount, capturedAmountCents: captureMethod === "manual" ? 0 : amount, capturableAmountCents: captureMethod === "manual" ? amount : 0, captureMethod });
  return { clientSecret: `${paymentIntentId}_secret`, paymentIntentId, amount, currency: currency.toLowerCase() };
}
async function capturePaymentFunction2({ paymentId, amount, amountCents }) {
  secret();
  const current = await getPaymentStatusFunction2({ paymentId });
  const captured2 = amountCents ?? amount ?? current.authorizedAmountCents;
  if (!Number.isInteger(captured2) || captured2 < 1 || captured2 > current.authorizedAmountCents) throw new Error("Capture exceeds authorized amount");
  if (current.status === "canceled" || current.status === "succeeded" && current.capturedAmountCents !== captured2) throw new Error("Payment cannot be recaptured");
  const result = { ...current, status: "succeeded", amount: captured2, amountCents: captured2, capturedAmountCents: captured2, capturableAmountCents: 0, data: { id: paymentId, status: "succeeded" } };
  paymentStates.set(paymentId, result);
  return result;
}
async function refundPaymentFunction2({ paymentId, amount, idempotencyKey }) {
  secret();
  if (process.env.GROCERY_TEST_PROVIDER_TIMEOUT === "true") await new Promise((resolve) => setTimeout(resolve, 250));
  if (!paymentId) throw new Error("Test payment id is required");
  const refundedAmount = amount ?? Number((await getPaymentStatusFunction2({ paymentId })).amount || 0);
  const refundId = `test_re_${Buffer.from(idempotencyKey || paymentId).toString("base64url")}`;
  if (refundStates.has(refundId)) return refundStates.get(refundId);
  const payment = await getPaymentStatusFunction2({ paymentId });
  const result = {
    status: "succeeded",
    amount: refundedAmount,
    currency: payment.currency,
    paymentId,
    data: { id: refundId, payment_intent: paymentId, amount: refundedAmount, currency: payment.currency, fullRefund: amount === void 0, metadata: { groceryRefundKey: idempotencyKey } }
  };
  refundStates.set(refundId, result);
  return result;
}
async function getPaymentStatusFunction2({ paymentId }) {
  secret();
  if (paymentStates.has(paymentId)) return paymentStates.get(paymentId);
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
  return { status: "succeeded", amount, amountCents: amount, currency, authorizedAmountCents: amount, capturedAmountCents: amount, capturableAmountCents: 0, captureMethod: "automatic", data: { id: paymentId, status: "succeeded", amount, currency } };
}
async function getRefundStatusFunction2({ refundId }) {
  secret();
  const refund = refundStates.get(refundId);
  if (!refund) throw new Error("Test refund not found");
  return refund;
}
async function cancelPaymentFunction2({ paymentId }) {
  secret();
  const current = await getPaymentStatusFunction2({ paymentId });
  if (current.status === "succeeded") throw new Error("Captured payment requires refund");
  const result = { ...current, status: "canceled", capturableAmountCents: 0 };
  paymentStates.set(paymentId, result);
  return result;
}
async function generatePaymentLinkFunction2({ paymentId }) {
  secret();
  return `https://test-payments.local/payments/${encodeURIComponent(paymentId)}`;
}
async function handleWebhookFunction2({ rawBody, headers }) {
  const expected = signature(rawBody);
  const received = headers["x-grocery-test-signature"];
  if (!received || received.length !== expected.length || !(0, import_node_crypto3.timingSafeEqual)(Buffer.from(received), Buffer.from(expected))) {
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
var import_node_crypto3, TEST_PROVIDER_SECRET_ENV, paymentStates, refundStates;
var init_test = __esm({
  "features/integrations/payment/test.ts"() {
    "use strict";
    import_node_crypto3 = require("node:crypto");
    TEST_PROVIDER_SECRET_ENV = "GROCERY_PAYMENT_TEST_SECRET";
    paymentStates = /* @__PURE__ */ new Map();
    refundStates = /* @__PURE__ */ new Map();
  }
});

// features/integrations/payment/index.ts
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
var STRIPE_PROVIDER_CODE, TEST_PROVIDER_CODE, paymentProviderAdapters, paymentProviderDefinitions;
var init_payment = __esm({
  "features/integrations/payment/index.ts"() {
    "use strict";
    init_stripe();
    init_test();
    STRIPE_PROVIDER_CODE = "pp_stripe_default";
    TEST_PROVIDER_CODE = "pp_test_default";
    paymentProviderAdapters = {
      [STRIPE_PROVIDER_CODE]: stripe_exports,
      [TEST_PROVIDER_CODE]: test_exports
    };
    paymentProviderDefinitions = {
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
  }
});

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
async function createPayment({ provider, cart, order, amount, currency, idempotencyKey, captureMethod }) {
  return executeAdapterFunction({
    provider,
    functionName: "createPaymentFunction",
    args: { cart, order, amount, currency, idempotencyKey, captureMethod }
  });
}
async function capturePayment({ provider, paymentId, amount, amountCents, idempotencyKey }) {
  return executeAdapterFunction({
    provider,
    functionName: "capturePaymentFunction",
    args: { paymentId, amount, amountCents, idempotencyKey }
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
async function getRefundStatus({ provider, refundId }) {
  return executeAdapterFunction({ provider, functionName: "getRefundStatusFunction", args: { refundId } });
}
async function cancelPayment({ provider, paymentId, idempotencyKey }) {
  return executeAdapterFunction({ provider, functionName: "cancelPaymentFunction", args: { paymentId, idempotencyKey } });
}
async function verifyPaymentWebhook({
  providerCode,
  rawBody,
  headers
}) {
  const adapter = getPaymentProviderAdapter(providerCode);
  return adapter.handleWebhookFunction({ rawBody, headers });
}
var init_paymentProviderAdapter = __esm({
  "features/keystone/utils/paymentProviderAdapter.ts"() {
    "use strict";
    init_payment();
  }
});

// features/keystone/lib/refundAllocations.ts
function cumulativeShare(total, quantity, basis) {
  return Number((BigInt(total) * BigInt(quantity) + BigInt(Math.floor(basis / 2))) / BigInt(basis));
}
function allocateFinalSaleRefund(finalSale, requested, prior) {
  if (finalSale?.status !== "finalized" || !finalSale.settlementId || !Array.isArray(finalSale.lines) || !Array.isArray(finalSale.actuals)) throw new Error("Line refunds require an immutable finalized sale snapshot");
  if (!requested.length || requested.length > 500 || new Set(requested.map((line) => line.lineItemId)).size !== requested.length) throw new Error("Refund requires distinct final-sale line identities");
  return [...requested].sort((a, b) => a.lineItemId.localeCompare(b.lineItemId)).map((input) => {
    const commercial = finalSale.lines.find((line) => line.id === input.lineItemId);
    const actual = finalSale.actuals.find((line) => line.lineItemId === input.lineItemId);
    if (!commercial || !actual) throw new Error("Refund line does not belong to the finalized sale");
    const fulfilledQuantityMilli = integer41(actual.quantityMilli, "Final fulfilled quantity");
    const refundQuantityMilli = integer41(input.quantityMilli, "Refund quantity");
    if (refundQuantityMilli < 1 || fulfilledQuantityMilli < 1) throw new Error("Refund quantity must be positive for a fulfilled line");
    if (!["refund_only", "return_to_stock", "waste", "quarantine"].includes(input.disposition)) throw new Error("Explicit refund disposition required");
    if (input.disposition !== "refund_only" && !input.conditionNote?.trim()) throw new Error("Returned goods require condition or custody evidence");
    const existing = prior.filter((row) => (row.lineItemId || row.lineItem?.id) === input.lineItemId);
    const quantityBefore = existing.reduce((total, row) => total + integer41(row.quantityMilli, "Prior refund quantity"), 0);
    const quantityAfter = quantityBefore + refundQuantityMilli;
    if (quantityAfter > fulfilledQuantityMilli) throw new Error("Cumulative refunded quantity exceeds the final fulfilled quantity");
    const subtotal = integer41(commercial.subtotalCents, "Line subtotal"), discount = integer41(commercial.discountCents, "Line discount"), tax = integer41(commercial.taxCents, "Line tax");
    if (discount > subtotal) throw new Error("Final sale discount exceeds line subtotal");
    const share = (amount) => cumulativeShare(amount, quantityAfter, fulfilledQuantityMilli) - cumulativeShare(amount, quantityBefore, fulfilledQuantityMilli);
    const netGoodsCents = share(subtotal - discount), discountCents = share(discount), taxCents = share(tax);
    const returnedLots = input.returnedLots || [];
    if (new Set(returnedLots.map((lot) => lot.lotId)).size !== returnedLots.length) throw new Error("Return lot identities must be distinct");
    if (input.disposition === "refund_only" && returnedLots.length) throw new Error("Refund-only requests cannot include physical returns");
    if (input.disposition !== "refund_only") {
      if (returnedLots.reduce((sum, lot) => sum + integer41(lot.quantityMilli, "Returned lot quantity"), 0) !== refundQuantityMilli) throw new Error("Returned lot quantities must equal the refunded physical quantity");
      for (const returned of returnedLots) {
        const allocated = (actual.allocations || []).filter((lot) => (lot.lotId || lot.inventoryLotId) === returned.lotId).reduce((sum, lot) => sum + quantityMilli(lot.quantity), 0);
        const previous = existing.flatMap((row) => row.returnedLots || []).filter((lot) => lot.lotId === returned.lotId).reduce((sum, lot) => sum + Number(lot.quantityMilli), 0);
        if (returned.quantityMilli <= 0 || returned.quantityMilli + previous > allocated) throw new Error("Return lot quantity exceeds its original actual allocation");
      }
    }
    return { lineItemId: input.lineItemId, finalSettlementId: finalSale.settlementId, finalFulfillmentId: actual.id || "", productId: actual.productId || actual.product?.id, productTitle: actual.productTitle || commercial.id, unitOfMeasure: actual.unitOfMeasure || "each", quantityMilli: refundQuantityMilli, quantityBefore, quantityAfter, fulfilledQuantityMilli, subtotalCents: netGoodsCents + discountCents, discountCents, netGoodsCents, taxCents, totalCents: netGoodsCents + taxCents, taxRateBasisPoints: commercial.taxRateBasisPoints, disposition: input.disposition, conditionNote: input.conditionNote?.trim() || "", returnedLots };
  });
}
async function commercialAdjustmentsForRefund(tx, providerRefundKey) {
  const rows = await tx.orderLineRefund.findMany({ where: { providerRefundKey }, orderBy: { lineItemId: "asc" } });
  if (!rows.length) return null;
  return {
    kind: "final_sale_line_refund",
    requestKey: rows[0].requestKey,
    orderId: rows[0].orderId,
    settlementId: rows[0].finalSettlementId,
    currencyCode: rows[0].currencyCode,
    netGoodsCents: rows.reduce((sum, row) => sum + row.netGoodsCents, 0),
    discountCents: rows.reduce((sum, row) => sum + row.discountCents, 0),
    taxCents: rows.reduce((sum, row) => sum + row.taxCents, 0),
    totalCents: rows.reduce((sum, row) => sum + row.totalCents, 0),
    lines: rows.map((row) => ({ id: row.id, lineItemId: row.lineItemId, finalFulfillmentId: row.finalFulfillmentId, quantityMilli: row.quantityMilli, subtotalCents: row.subtotalCents, discountCents: row.discountCents, netGoodsCents: row.netGoodsCents, taxCents: row.taxCents, totalCents: row.totalCents, disposition: row.disposition }))
  };
}
async function reconcileOrderLineRefundRows(tx, refund) {
  const adjustments = await commercialAdjustmentsForRefund(tx, refund.idempotencyKey);
  if (!adjustments) return null;
  const payment = await tx.payment.findUnique({ where: { id: refund.paymentId }, select: { storeId: true, orderId: true } });
  const rows = await tx.orderLineRefund.findMany({ where: { providerRefundKey: refund.idempotencyKey } });
  if (!payment || rows.some((row) => row.paymentId !== refund.paymentId || row.storeId !== payment.storeId || row.orderId !== payment.orderId) || adjustments.totalCents !== Number(refund.amountCents)) throw new Error("Line refund evidence differs from provider refund ownership or amount");
  await tx.orderLineRefund.updateMany({ where: { providerRefundKey: refund.idempotencyKey }, data: { paymentRefundId: refund.id, status: refund.status, failureMessage: refund.failureMessage || "", processedAt: refund.processedAt || null } });
  await tx.paymentRefund.update({ where: { id: refund.id }, data: { providerData: { ...refund.providerData || {}, commercialAdjustments: adjustments } } });
  return adjustments;
}
async function unlinkedLineRefundReservedCents(tx, paymentId, excludedProviderRefundKey) {
  const rows = await tx.orderLineRefund.findMany({ where: { paymentId, ...excludedProviderRefundKey ? { providerRefundKey: { not: excludedProviderRefundKey } } : {} }, select: { providerRefundKey: true, totalCents: true } });
  const active = await tx.paymentRefund.findMany({ where: { paymentId, status: { in: ["processing", "succeeded"] } }, select: { idempotencyKey: true } });
  const alreadyCounted = new Set(active.map((refund) => refund.idempotencyKey));
  return rows.filter((row) => !alreadyCounted.has(row.providerRefundKey)).reduce((sum, row) => sum + Number(row.totalCents), 0);
}
var integer41;
var init_refundAllocations = __esm({
  "features/keystone/lib/refundAllocations.ts"() {
    "use strict";
    init_inventoryMovements();
    integer41 = (value, label) => {
      const amount = Number(value);
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw new Error(`${label} must be non-negative integer minor units`);
      return amount;
    };
  }
});

// features/keystone/lib/refundRecovery.ts
function normalizeProviderRefund(response, expected) {
  const resource = response?.data || response;
  const id = response?.id || resource?.id;
  const amount = response?.amount ?? resource?.amount;
  const currency = response?.currency ?? resource?.currency;
  const payment = response?.paymentId || resource?.payment_intent || resource?.paymentId;
  const paymentId = typeof payment === "string" ? payment : payment?.id;
  if (!id || expected.providerRefundId && expected.providerRefundId !== id) throw new Error("Provider refund identity does not match");
  if (!Number.isSafeInteger(amount) || amount !== expected.amountCents) throw new Error("Provider refund amount does not match");
  if (typeof currency !== "string" || currency.toLowerCase() !== expected.currencyCode.toLowerCase()) throw new Error("Provider refund currency does not match");
  if (paymentId !== expected.providerPaymentId) throw new Error("Provider refund payment does not match");
  const rawStatus = String(response?.status ?? resource?.status ?? "").toLowerCase();
  const status = rawStatus === "succeeded" || rawStatus === "paid" ? "succeeded" : rawStatus === "failed" ? "failed" : rawStatus === "canceled" || rawStatus === "cancelled" ? "canceled" : "processing";
  return { id: String(id), status, rawStatus, resource };
}
async function assertRefundBudget(tx, paymentId, paymentCents, amountCents, refundId, providerRefundKey) {
  const reserved = await tx.paymentRefund.aggregate({ where: { paymentId, status: { in: ["processing", "succeeded"] }, ...refundId ? { id: { not: refundId } } : {} }, _sum: { amountCents: true } });
  const lineReservedCents = await unlinkedLineRefundReservedCents(tx, paymentId, providerRefundKey);
  if (!Number.isSafeInteger(paymentCents) || !Number.isSafeInteger(amountCents) || amountCents < 1 || Number(reserved._sum.amountCents || 0) + lineReservedCents + amountCents > paymentCents) {
    throw new Error("Cumulative refund amount cannot exceed the settled payment");
  }
}
function assertRefundCreationWindow(requestedAt, providerRefundId, now = Date.now()) {
  if (!providerRefundId && now - new Date(requestedAt).getTime() >= 23 * 60 * 60 * 1e3) throw new Error("Unknown refund outcome requires provider evidence; automatic creation replay window expired");
}
function refundProviderData(previous, resource) {
  return JSON.parse(JSON.stringify({ ...previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {}, providerResponse: resource }));
}
var init_refundRecovery = __esm({
  "features/keystone/lib/refundRecovery.ts"() {
    "use strict";
    init_refundAllocations();
  }
});

// features/keystone/mutations/managePaymentRefund.ts
var managePaymentRefund_exports = {};
__export(managePaymentRefund_exports, {
  normalizeRefundRequest: () => normalizeRefundRequest,
  refundPaymentForOrder: () => refundPaymentForOrder
});
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
function centsToDollars(cents3) {
  return (cents3 / 100).toFixed(2);
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
        providerData: true,
        paymentProvider: { select: { id: true, code: true, isInstalled: true } }
      }
    });
    if (!payment || payment.storeId !== store.id) throw new Error("Payment not found in active store");
    const authorizationVoid = payment.providerData?.authorizationVoid;
    if (authorizationVoid && ["processing", "unknown"].includes(authorizationVoid.status) && args.idempotencyKey !== `${authorizationVoid.key}:original-refund`) throw new Error("An authorization abandonment is unresolved; finish it before another refund");
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
          currencyCode: store.currencyCode.toLowerCase(),
          idempotencyKey: args.idempotencyKey,
          requestedAt: existing.requestedAt,
          status: existing.status,
          providerRefundId: existing.providerRefundId || null,
          reused: true,
          executeProvider: false
        };
      }
      await assertRefundBudget(tx, payment.id, paymentCents, args.amountCents, existing.id, args.idempotencyKey);
      const leaseActive = existing.reconciliationLeaseExpiresAt && new Date(existing.reconciliationLeaseExpiresAt).getTime() > Date.now();
      const stale = existing.status === "processing" && Date.now() - new Date(existing.updatedAt).getTime() > 5 * 60 * 1e3;
      const shouldExecuteProvider = !leaseActive && (existing.status === "failed" || existing.status === "canceled" || stale);
      if (shouldExecuteProvider) assertRefundCreationWindow(existing.requestedAt, existing.providerRefundId);
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
            reconciliationLastError: null,
            reconciliationNextAttemptAt: new Date(Date.now() + 3e4)
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
        currencyCode: store.currencyCode.toLowerCase(),
        idempotencyKey: args.idempotencyKey,
        requestedAt: existing.requestedAt,
        status: "processing",
        providerRefundId: existing.providerRefundId || null,
        reused: true,
        executeProvider: shouldExecuteProvider
      };
    }
    await assertRefundBudget(tx, payment.id, paymentCents, args.amountCents, void 0, args.idempotencyKey);
    const created = await tx.paymentRefund.create({
      data: {
        idempotencyKey: args.idempotencyKey,
        amount: centsToDollars(args.amountCents),
        amountCents: args.amountCents,
        status: "processing",
        providerCode: payment.paymentProvider.code,
        providerPaymentId: payment.providerPaymentId,
        requestedAt: /* @__PURE__ */ new Date(),
        providerData: { requestReason: args.reason, currencyCode: store.currencyCode.toLowerCase(), commercialAdjustments: await commercialAdjustmentsForRefund(tx, args.idempotencyKey) },
        reconciliationNextAttemptAt: new Date(Date.now() + 3e4),
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
      currencyCode: store.currencyCode.toLowerCase(),
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
    assertRefundCreationWindow(claim.requestedAt, claim.providerRefundId);
    providerResponse = claim.providerRefundId ? await getRefundStatus({ provider: claim.provider, refundId: claim.providerRefundId }) : await refundPayment({ provider: claim.provider, paymentId: claim.providerPaymentId, amount: claim.amountCents, idempotencyKey: claim.idempotencyKey });
    normalizeProviderRefund(providerResponse, claim);
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
          data: { status: "processing", failureMessage: message, providerStatus: "unknown", processedAt: null, reconciliationLastError: message, reconciliationNextAttemptAt: new Date(Date.now() + 1e4) }
        });
      }
    });
    throw new Error(message);
  }
  const normalized = normalizeProviderRefund(providerResponse, claim);
  const providerStatus = normalized.status;
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
    const refund = await tx.paymentRefund.findUnique({ where: { id: claim.refundId } });
    if (!refund) throw new Error("Refund evidence disappeared during provider processing");
    if (refund.status !== "processing") {
      return refundResult({ ...claim, providerRefundId: refund.providerRefundId || null }, refund.status, refund.providerRefundId || null, true, "Refund state was finalized by another provider event.");
    }
    const providerRefundId = normalized.id;
    await tx.paymentRefund.update({
      where: { id: refund.id },
      data: {
        status: providerStatus,
        providerRefundId,
        providerStatus: String(providerResponse?.status || providerStatus).toLowerCase(),
        providerData: refundProviderData(refund.providerData, normalized.resource),
        processedAt: providerStatus === "processing" ? null : /* @__PURE__ */ new Date(),
        failureMessage: providerStatus === "failed" ? "Provider reported refund failure" : providerStatus === "canceled" ? "Provider canceled refund" : ""
      }
    });
    await reconcileOrderLineRefundRows(tx, await tx.paymentRefund.findUnique({ where: { id: refund.id } }));
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
var init_managePaymentRefund = __esm({
  "features/keystone/mutations/managePaymentRefund.ts"() {
    "use strict";
    init_refundAllocations();
    init_access();
    init_groceryOutbox();
    init_storeScope();
    init_paymentProviderAdapter();
    init_serializableTransaction();
    init_refundRecovery();
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
var import_core65 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/InventoryConversion.ts
var import_core = require("@keystone-6/core");
var import_fields2 = require("@keystone-6/core/fields");
init_access();

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

// features/keystone/models/InventoryConversion.ts
var InventoryConversion = (0, import_core.list)({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    idempotencyKey: (0, import_fields2.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    inputFingerprint: (0, import_fields2.text)({ validation: { isRequired: true } }),
    reviewHash: (0, import_fields2.text)(),
    quantityCases: (0, import_fields2.integer)({ validation: { isRequired: true, min: 1 } }),
    unitsPerCase: (0, import_fields2.integer)({ validation: { isRequired: true, min: 2 } }),
    destinationQuantity: (0, import_fields2.integer)({ validation: { isRequired: true, min: 1 } }),
    totalCostCents: (0, import_fields2.integer)({ validation: { isRequired: true, min: 0 } }),
    currencyCode: (0, import_fields2.text)(),
    reason: (0, import_fields2.text)(),
    conditionNote: (0, import_fields2.text)(),
    actorId: (0, import_fields2.text)(),
    committedAt: (0, import_fields2.timestamp)(),
    sourceSnapshot: (0, import_fields2.json)(),
    destinations: (0, import_fields2.json)(),
    sourceInventoryLot: (0, import_fields2.relationship)({ ref: "InventoryLot" }),
    sourceProduct: (0, import_fields2.relationship)({ ref: "Product" }),
    destinationProduct: (0, import_fields2.relationship)({ ref: "Product" }),
    store: (0, import_fields2.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields
  }
});

// features/keystone/models/CatalogImport.ts
var import_core2 = require("@keystone-6/core");
var import_fields3 = require("@keystone-6/core/fields");
init_access();
var CatalogImport = (0, import_core2.list)({
  access: { operation: { query: permissions.canManageProducts, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    identityKey: (0, import_fields3.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    idempotencyKey: (0, import_fields3.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    sourceSystem: (0, import_fields3.text)({ validation: { isRequired: true } }),
    sourceBatchId: (0, import_fields3.text)({ validation: { isRequired: true } }),
    schemaVersion: (0, import_fields3.integer)({ validation: { isRequired: true } }),
    payloadHash: (0, import_fields3.text)({ validation: { isRequired: true } }),
    reviewHash: (0, import_fields3.text)({ validation: { isRequired: true } }),
    currencyCode: (0, import_fields3.text)({ validation: { isRequired: true } }),
    rowCount: (0, import_fields3.integer)({ validation: { isRequired: true } }),
    rows: (0, import_fields3.json)(),
    result: (0, import_fields3.json)(),
    committedAt: (0, import_fields3.timestamp)({ validation: { isRequired: true } }),
    actorId: (0, import_fields3.text)({ validation: { isRequired: true } }),
    store: (0, import_fields3.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields
  }
});

// features/keystone/models/CustomerPrivacyRequest.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");
init_access();
var CustomerPrivacyRequest = (0, import_core3.list)({
  access: { operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false }, filter: { query: async ({ session, context }) => {
    if (!session?.itemId) return false;
    const user = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { storeId: true } });
    if (!user?.storeId) return false;
    return await permissions.canManageUsers({ session, context }) ? { store: { id: { equals: user.storeId } } } : { user: { id: { equals: session.itemId } } };
  } } },
  fields: { store: (0, import_fields4.relationship)({ ref: "Store" }), user: (0, import_fields4.relationship)({ ref: "User" }), kind: (0, import_fields4.select)({ options: ["export", "erasure"] }), status: (0, import_fields4.select)({ options: ["requested", "deferred", "completed", "rejected"], defaultValue: "requested" }), policyVersion: (0, import_fields4.text)(), reviewReason: (0, import_fields4.text)(), reviewedBy: (0, import_fields4.relationship)({ ref: "User" }), reviewedAt: (0, import_fields4.timestamp)(), eligibleAt: (0, import_fields4.timestamp)(), completedAt: (0, import_fields4.timestamp)(), resultSummary: (0, import_fields4.json)(), ...trackingFields }
});

// features/keystone/models/StaffAccessEvent.ts
var import_core4 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
init_access();
var StaffAccessEvent = (0, import_core4.list)({
  access: { operation: { query: permissions.canManageUsers, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: { store: (0, import_fields5.relationship)({ ref: "Store" }), actor: (0, import_fields5.relationship)({ ref: "User" }), subject: (0, import_fields5.relationship)({ ref: "User.staffAccessEvents" }), invitation: (0, import_fields5.relationship)({ ref: "StaffInvitation" }), action: (0, import_fields5.text)(), reason: (0, import_fields5.text)(), before: (0, import_fields5.json)(), after: (0, import_fields5.json)(), ...trackingFields }
});

// features/keystone/models/StaffInvitation.ts
var import_core5 = require("@keystone-6/core");
var import_fields6 = require("@keystone-6/core/fields");
init_access();
var StaffInvitation = (0, import_core5.list)({
  access: { operation: { query: permissions.canManageUsers, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    store: (0, import_fields6.relationship)({ ref: "Store" }),
    email: (0, import_fields6.text)({ validation: { isRequired: true } }),
    name: (0, import_fields6.text)({ validation: { isRequired: true } }),
    tokenHash: (0, import_fields6.text)({ isIndexed: "unique", access: { read: () => false } }),
    capabilities: (0, import_fields6.json)(),
    status: (0, import_fields6.select)({ options: ["pending", "accepted", "revoked"], defaultValue: "pending" }),
    expiresAt: (0, import_fields6.timestamp)({ validation: { isRequired: true } }),
    acceptedAt: (0, import_fields6.timestamp)(),
    invitedBy: (0, import_fields6.relationship)({ ref: "User" }),
    acceptedUser: (0, import_fields6.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/OrderLineRefund.ts
var import_core6 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");
init_access();
var OrderLineRefund = (0, import_core6.list)({
  access: { operation: { query: permissions.canManagePayments, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    requestKey: (0, import_fields7.text)({ isIndexed: true }),
    providerRefundKey: (0, import_fields7.text)({ isIndexed: true }),
    inputFingerprint: (0, import_fields7.text)(),
    store: (0, import_fields7.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    order: (0, import_fields7.relationship)({ ref: "Order" }),
    payment: (0, import_fields7.relationship)({ ref: "Payment" }),
    paymentRefund: (0, import_fields7.relationship)({ ref: "PaymentRefund" }),
    lineItem: (0, import_fields7.relationship)({ ref: "OrderLineItem" }),
    finalSettlementId: (0, import_fields7.text)(),
    finalFulfillmentId: (0, import_fields7.text)(),
    productId: (0, import_fields7.text)(),
    productTitle: (0, import_fields7.text)(),
    unitOfMeasure: (0, import_fields7.text)(),
    currencyCode: (0, import_fields7.text)(),
    quantityMilli: (0, import_fields7.integer)({ validation: { isRequired: true, min: 1 } }),
    quantityBefore: (0, import_fields7.integer)(),
    quantityAfter: (0, import_fields7.integer)(),
    fulfilledQuantityMilli: (0, import_fields7.integer)(),
    subtotalCents: (0, import_fields7.integer)(),
    discountCents: (0, import_fields7.integer)(),
    netGoodsCents: (0, import_fields7.integer)(),
    taxCents: (0, import_fields7.integer)(),
    totalCents: (0, import_fields7.integer)(),
    taxRateBasisPoints: (0, import_fields7.integer)(),
    disposition: (0, import_fields7.select)({ options: ["refund_only", "return_to_stock", "waste", "quarantine"], validation: { isRequired: true } }),
    conditionNote: (0, import_fields7.text)(),
    returnedLots: (0, import_fields7.json)(),
    reason: (0, import_fields7.text)(),
    requestedBy: (0, import_fields7.text)(),
    status: (0, import_fields7.select)({ options: ["reserved", "processing", "succeeded", "failed", "canceled"], defaultValue: "reserved" }),
    failureMessage: (0, import_fields7.text)(),
    processedAt: (0, import_fields7.timestamp)(),
    events: (0, import_fields7.json)(),
    ...trackingFields
  }
});

// features/keystone/models/LoyaltyRedemption.ts
var import_core7 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
init_access();
var LoyaltyRedemption = (0, import_core7.list)({
  access: { operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false }, filter: { query: async ({ session, context }) => {
    const store = storeScopedFilter({ session });
    if (!store) return false;
    return await permissions.canManageOrders({ session, context }) ? store : { AND: [store, { user: { id: { equals: session.itemId } } }] };
  } } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields8.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    points: (0, import_fields8.integer)({ validation: { isRequired: true, min: 1 } }),
    discountCents: (0, import_fields8.integer)({ validation: { isRequired: true, min: 1 } }),
    status: (0, import_fields8.select)({ options: ["issued", "used", "reversed"], defaultValue: "issued" }),
    store: (0, import_fields8.relationship)({ ref: "Store" }),
    user: (0, import_fields8.relationship)({ ref: "User" }),
    program: (0, import_fields8.relationship)({ ref: "LoyaltyProgram" }),
    coupon: (0, import_fields8.relationship)({ ref: "Coupon" }),
    order: (0, import_fields8.relationship)({ ref: "Order" }),
    usedAt: (0, import_fields8.timestamp)(),
    events: (0, import_fields8.json)(),
    ...trackingFields
  }
});

// features/keystone/models/SubscriptionRun.ts
var import_core8 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
init_access();
var SubscriptionRun = (0, import_core8.list)({
  access: { operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false }, filter: { query: async ({ session, context }) => {
    const store = storeScopedFilter({ session });
    if (!store) return false;
    return await permissions.canManageOrders({ session, context }) ? store : { AND: [store, { user: { id: { equals: session.itemId } } }] };
  } } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields9.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    subscription: (0, import_fields9.relationship)({ ref: "Subscription" }),
    store: (0, import_fields9.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    user: (0, import_fields9.relationship)({ ref: "User" }),
    dueAt: (0, import_fields9.timestamp)({ validation: { isRequired: true } }),
    status: (0, import_fields9.select)({ options: ["awaiting_checkout", "blocked_cart", "blocked_stock", "ordered", "skipped", "cancelled"], validation: { isRequired: true } }),
    product: (0, import_fields9.relationship)({ ref: "Product" }),
    productTitle: (0, import_fields9.text)(),
    quantity: (0, import_fields9.integer)(),
    priceCents: (0, import_fields9.integer)(),
    cart: (0, import_fields9.relationship)({ ref: "Cart" }),
    cartItemId: (0, import_fields9.text)(),
    order: (0, import_fields9.relationship)({ ref: "Order" }),
    failureReason: (0, import_fields9.text)(),
    events: (0, import_fields9.json)(),
    ...trackingFields
  }
});

// features/keystone/models/SettlementMatch.ts
var import_core9 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
init_access();
var SettlementMatch = (0, import_core9.list)({
  access: { operation: { query: permissions.canManagePayments, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    sourceKey: (0, import_fields10.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    store: (0, import_fields10.relationship)({ ref: "Store" }),
    recordedBy: (0, import_fields10.relationship)({ ref: "User" }),
    payment: (0, import_fields10.relationship)({ ref: "Payment" }),
    providerCode: (0, import_fields10.text)({ validation: { isRequired: true } }),
    statementReference: (0, import_fields10.text)({ validation: { isRequired: true } }),
    entryReference: (0, import_fields10.text)({ validation: { isRequired: true } }),
    paymentReference: (0, import_fields10.text)({ validation: { isRequired: true } }),
    refundReference: (0, import_fields10.text)(),
    payoutReference: (0, import_fields10.text)(),
    currencyCode: (0, import_fields10.text)(),
    entryType: (0, import_fields10.select)({ options: ["capture", "refund"], validation: { isRequired: true } }),
    amountCents: (0, import_fields10.integer)({ validation: { isRequired: true, min: 0 } }),
    feeCents: (0, import_fields10.integer)({ validation: { isRequired: true, min: 0 } }),
    netCents: (0, import_fields10.integer)({ validation: { isRequired: true } }),
    settledAt: (0, import_fields10.timestamp)({ validation: { isRequired: true } }),
    status: (0, import_fields10.select)({ options: ["matched", "unresolved"], defaultValue: "unresolved" }),
    reason: (0, import_fields10.text)(),
    evidence: (0, import_fields10.json)(),
    ...trackingFields
  }
});

// features/keystone/models/FinancialClose.ts
var import_core10 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
init_access();
var FinancialClose = (0, import_core10.list)({
  access: { operation: { query: permissions.canManagePayments, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  fields: {
    idempotencyKey: (0, import_fields11.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    store: (0, import_fields11.relationship)({ ref: "Store" }),
    recordedBy: (0, import_fields11.relationship)({ ref: "User" }),
    periodStart: (0, import_fields11.timestamp)({ validation: { isRequired: true } }),
    periodEnd: (0, import_fields11.timestamp)({ validation: { isRequired: true } }),
    timezone: (0, import_fields11.text)({ validation: { isRequired: true } }),
    cutoff: (0, import_fields11.timestamp)({ validation: { isRequired: true } }),
    status: (0, import_fields11.select)({ options: ["reconciled", "closed_with_exceptions"], validation: { isRequired: true } }),
    note: (0, import_fields11.text)(),
    contentHash: (0, import_fields11.text)({ validation: { isRequired: true } }),
    snapshot: (0, import_fields11.json)(),
    ...trackingFields
  }
});

// features/keystone/models/SupplierCredit.ts
var import_core11 = require("@keystone-6/core");
var import_fields12 = require("@keystone-6/core/fields");
init_access();
var SupplierCredit = (0, import_core11.list)({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    identityKey: (0, import_fields12.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    responseIdentityKey: (0, import_fields12.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    idempotencyKey: (0, import_fields12.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    kind: (0, import_fields12.select)({ options: ["claim", "credit", "debit"], defaultValue: "claim" }),
    status: (0, import_fields12.select)({ options: ["open", "accepted", "rejected"], defaultValue: "open" }),
    reference: (0, import_fields12.text)(),
    amountCents: (0, import_fields12.integer)(),
    claimedAmountCents: (0, import_fields12.integer)(),
    currencyCode: (0, import_fields12.text)(),
    reason: (0, import_fields12.text)(),
    evidence: (0, import_fields12.text)(),
    openedBy: (0, import_fields12.text)(),
    resolvedBy: (0, import_fields12.text)(),
    resolvedAt: (0, import_fields12.timestamp)(),
    events: (0, import_fields12.json)(),
    supplier: (0, import_fields12.relationship)({ ref: "Supplier" }),
    invoice: (0, import_fields12.relationship)({ ref: "SupplierInvoice" }),
    receipt: (0, import_fields12.relationship)({ ref: "PurchaseReceipt" }),
    store: (0, import_fields12.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields
  }
});

// features/keystone/models/SupplierInvoice.ts
var import_core12 = require("@keystone-6/core");
var import_fields13 = require("@keystone-6/core/fields");
init_access();
var SupplierInvoice = (0, import_core12.list)({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    identityKey: (0, import_fields13.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    idempotencyKey: (0, import_fields13.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    invoiceNumber: (0, import_fields13.text)({ validation: { isRequired: true } }),
    supplierName: (0, import_fields13.text)(),
    currencyCode: (0, import_fields13.text)({ validation: { isRequired: true } }),
    invoiceDate: (0, import_fields13.timestamp)({ validation: { isRequired: true } }),
    dueDate: (0, import_fields13.timestamp)(),
    documentReference: (0, import_fields13.text)(),
    status: (0, import_fields13.select)({ options: ["captured", "variance", "approved", "settled", "voided"], defaultValue: "captured" }),
    lines: (0, import_fields13.json)(),
    subtotalCents: (0, import_fields13.integer)(),
    taxCents: (0, import_fields13.integer)(),
    freightCents: (0, import_fields13.integer)(),
    grossCents: (0, import_fields13.integer)(),
    expectedCents: (0, import_fields13.integer)(),
    varianceCents: (0, import_fields13.integer)(),
    capturedBy: (0, import_fields13.text)(),
    approvedBy: (0, import_fields13.text)(),
    approvedAt: (0, import_fields13.timestamp)(),
    settledBy: (0, import_fields13.text)(),
    settledAt: (0, import_fields13.timestamp)(),
    settlement: (0, import_fields13.json)(),
    events: (0, import_fields13.json)(),
    inputFingerprint: (0, import_fields13.text)(),
    supplier: (0, import_fields13.relationship)({ ref: "Supplier" }),
    store: (0, import_fields13.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields
  }
});

// features/keystone/models/ProductInformationVersion.ts
var import_core13 = require("@keystone-6/core");
var import_fields14 = require("@keystone-6/core/fields");
init_access();
var ProductInformationVersion = (0, import_core13.list)({ access: { operation: { query: permissions.canManageProducts, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } }, fields: { store: (0, import_fields14.relationship)({ ref: "Store" }), product: (0, import_fields14.relationship)({ ref: "Product" }), actor: (0, import_fields14.relationship)({ ref: "User" }), idempotencyKey: (0, import_fields14.text)({ isIndexed: "unique" }), sourceReference: (0, import_fields14.text)(), effectiveAt: (0, import_fields14.timestamp)(), snapshot: (0, import_fields14.json)(), ...trackingFields } });

// features/keystone/models/CustomerMessage.ts
var import_core14 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");
init_access();
var CustomerMessage = (0, import_core14.list)({ access: { operation: { query: permissions.canManageOrders, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } }, fields: {
  store: (0, import_fields15.relationship)({ ref: "Store" }),
  eventKey: (0, import_fields15.text)({ isIndexed: "unique", validation: { isRequired: true } }),
  order: (0, import_fields15.relationship)({ ref: "Order" }),
  user: (0, import_fields15.relationship)({ ref: "User" }),
  recipient: (0, import_fields15.text)(),
  subject: (0, import_fields15.text)(),
  body: (0, import_fields15.text)(),
  channel: (0, import_fields15.text)({ defaultValue: "email" }),
  status: (0, import_fields15.text)({ defaultValue: "pending" }),
  attempts: (0, import_fields15.integer)({ defaultValue: 0 }),
  providerEvidence: (0, import_fields15.json)(),
  failureMessage: (0, import_fields15.text)(),
  sentAt: (0, import_fields15.timestamp)(),
  deliveryToken: (0, import_fields15.text)({ access: { read: () => false } }),
  deliveryLeaseExpiresAt: (0, import_fields15.timestamp)({ db: { isNullable: true } }),
  ...trackingFields
} });

// features/keystone/models/PurchaseReceipt.ts
var import_core15 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
init_access();
var PurchaseReceipt = (0, import_core15.list)({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields16.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    purchaseOrder: (0, import_fields16.relationship)({ ref: "PurchaseOrder" }),
    poItem: (0, import_fields16.relationship)({ ref: "POItem" }),
    inventoryLot: (0, import_fields16.relationship)({ ref: "InventoryLot" }),
    supplier: (0, import_fields16.relationship)({ ref: "Supplier" }),
    product: (0, import_fields16.relationship)({ ref: "Product" }),
    supplierLotNumber: (0, import_fields16.text)({ isIndexed: true }),
    deliveryReference: (0, import_fields16.text)(),
    quantity: (0, import_fields16.decimal)({ precision: 18, scale: 3 }),
    targetQuantityReceived: (0, import_fields16.decimal)({ precision: 18, scale: 3 }),
    unitCostCents: (0, import_fields16.integer)(),
    conditionStatus: (0, import_fields16.select)({ options: ["accepted", "inspection_pending", "rejected"], validation: { isRequired: true } }),
    inspectionNote: (0, import_fields16.text)(),
    receivedBy: (0, import_fields16.text)(),
    expirationDate: (0, import_fields16.timestamp)(),
    store: (0, import_fields16.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields
  }
});

// features/keystone/models/InventoryCount.ts
var import_core16 = require("@keystone-6/core");
var import_fields17 = require("@keystone-6/core/fields");
init_access();
var InventoryCount = (0, import_core16.list)({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields17.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    status: (0, import_fields17.select)({ options: ["observed", "recounted", "approved"], defaultValue: "observed" }),
    inventoryLot: (0, import_fields17.relationship)({ ref: "InventoryLot" }),
    product: (0, import_fields17.relationship)({ ref: "Product" }),
    expectedQuantity: (0, import_fields17.decimal)({ precision: 18, scale: 3 }),
    observedQuantity: (0, import_fields17.decimal)({ precision: 18, scale: 3 }),
    recountQuantity: (0, import_fields17.decimal)({ precision: 18, scale: 3 }),
    observedBy: (0, import_fields17.text)(),
    recountedBy: (0, import_fields17.text)(),
    approvedBy: (0, import_fields17.text)(),
    reason: (0, import_fields17.text)(),
    events: (0, import_fields17.json)(),
    approvedAt: (0, import_fields17.timestamp)(),
    store: (0, import_fields17.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields
  }
});

// features/keystone/models/InventoryRecall.ts
var import_core17 = require("@keystone-6/core");
var import_fields18 = require("@keystone-6/core/fields");
init_access();
var InventoryRecall = (0, import_core17.list)({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields18.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    reason: (0, import_fields18.text)({ validation: { isRequired: true } }),
    status: (0, import_fields18.select)({ options: ["open", "closed"], defaultValue: "open" }),
    scope: (0, import_fields18.json)(),
    affectedOrders: (0, import_fields18.json)(),
    events: (0, import_fields18.json)(),
    closure: (0, import_fields18.json)(),
    openedBy: (0, import_fields18.text)(),
    closedBy: (0, import_fields18.text)(),
    closedAt: (0, import_fields18.timestamp)(),
    store: (0, import_fields18.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields
  }
});

// features/keystone/models/InventoryMovement.ts
var import_core18 = require("@keystone-6/core");
var import_fields19 = require("@keystone-6/core/fields");
init_access();
var InventoryMovement = (0, import_core18.list)({
  access: { operation: { query: permissions.canManageInventory, create: () => false, update: () => false, delete: () => false }, filter: { query: storeScopedFilter } },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields19.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    sequence: (0, import_fields19.integer)({ validation: { isRequired: true }, isIndexed: true }),
    sourceType: (0, import_fields19.text)({ validation: { isRequired: true } }),
    sourceId: (0, import_fields19.text)({ validation: { isRequired: true } }),
    reason: (0, import_fields19.text)({ validation: { isRequired: true } }),
    actorId: (0, import_fields19.text)(),
    quantityBefore: (0, import_fields19.decimal)({ precision: 18, scale: 3 }),
    quantityAfter: (0, import_fields19.decimal)({ precision: 18, scale: 3 }),
    quantityDelta: (0, import_fields19.decimal)({ precision: 18, scale: 3 }),
    productStockBefore: (0, import_fields19.decimal)({ precision: 18, scale: 3 }),
    productStockAfter: (0, import_fields19.decimal)({ precision: 18, scale: 3 }),
    metadata: (0, import_fields19.json)(),
    product: (0, import_fields19.relationship)({ ref: "Product" }),
    inventoryLot: (0, import_fields19.relationship)({ ref: "InventoryLot" }),
    order: (0, import_fields19.relationship)({ ref: "Order" }),
    store: (0, import_fields19.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    ...trackingFields
  }
});

// features/keystone/models/OrderSettlement.ts
var import_core19 = require("@keystone-6/core");
var import_fields20 = require("@keystone-6/core/fields");
init_access();
var OrderSettlement = (0, import_core19.list)({
  access: { operation: { query: permissions.canManagePayments, create: () => false, update: () => false, delete: () => false }, filter: { query: relatedStoreScopedFilter("order") } },
  fields: {
    order: (0, import_fields20.relationship)({ ref: "Order" }),
    idempotencyKey: (0, import_fields20.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    actualsHash: (0, import_fields20.text)({ validation: { isRequired: true } }),
    status: (0, import_fields20.select)({ options: ["processing", "requires_customer_authorization", "finalized", "abandoned"], defaultValue: "processing" }),
    totalCents: (0, import_fields20.integer)({ validation: { isRequired: true, min: 0 } }),
    snapshot: (0, import_fields20.json)(),
    providerEvidence: (0, import_fields20.json)(),
    failureMessage: (0, import_fields20.text)(),
    finalizedBy: (0, import_fields20.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/OrderLineFulfillment.ts
var import_core20 = require("@keystone-6/core");
var import_fields21 = require("@keystone-6/core/fields");
init_access();
var OrderLineFulfillment = (0, import_core20.list)({
  access: {
    operation: { query: permissions.canManageOrders, create: () => false, update: () => false, delete: () => false },
    filter: { query: nestedRelatedStoreScopedFilter("lineItem", "order") }
  },
  fields: {
    idempotencyKey: (0, import_fields21.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    lineItemIdSnapshot: (0, import_fields21.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    lineItem: (0, import_fields21.relationship)({ ref: "OrderLineItem.fulfillment" }),
    product: (0, import_fields21.relationship)({ ref: "Product" }),
    recordedBy: (0, import_fields21.relationship)({ ref: "User" }),
    resolution: (0, import_fields21.select)({ options: ["picked", "short", "substituted"], validation: { isRequired: true } }),
    productTitle: (0, import_fields21.text)({ validation: { isRequired: true } }),
    productSku: (0, import_fields21.text)(),
    unitOfMeasure: (0, import_fields21.text)({ validation: { isRequired: true } }),
    quantityMilli: (0, import_fields21.integer)({ validation: { isRequired: true, min: 0 } }),
    grossMilli: (0, import_fields21.integer)({ validation: { isRequired: true, min: 0 } }),
    tareMilli: (0, import_fields21.integer)({ validation: { isRequired: true, min: 0 } }),
    unitPriceCents: (0, import_fields21.integer)({ validation: { isRequired: true, min: 0 } }),
    subtotalCents: (0, import_fields21.integer)({ validation: { isRequired: true, min: 0 } }),
    taxRateBasisPoints: (0, import_fields21.integer)({ validation: { isRequired: true, min: 0, max: 1e4 } }),
    allocations: (0, import_fields21.json)(),
    evidence: (0, import_fields21.json)(),
    ...trackingFields
  }
});

// features/keystone/models/Address.ts
var import_core21 = require("@keystone-6/core");
var import_fields22 = require("@keystone-6/core/fields");
init_access();
var Address = (0, import_core21.list)({
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
    firstName: (0, import_fields22.text)({
      label: "First Name"
    }),
    lastName: (0, import_fields22.text)({
      label: "Last Name"
    }),
    company: (0, import_fields22.text)({
      label: "Company"
    }),
    address1: (0, import_fields22.text)({
      validation: { isRequired: true },
      label: "Address Line 1"
    }),
    address2: (0, import_fields22.text)({
      label: "Address Line 2"
    }),
    city: (0, import_fields22.text)({
      validation: { isRequired: true },
      label: "City"
    }),
    province: (0, import_fields22.text)({
      label: "Province/State"
    }),
    postalCode: (0, import_fields22.text)({
      validation: { isRequired: true },
      label: "Postal Code"
    }),
    phone: (0, import_fields22.text)({
      label: "Phone"
    }),
    // Relationships
    user: (0, import_fields22.relationship)({
      access: { create: () => false, update: () => false },
      ref: "User",
      label: "User"
    }),
    ...trackingFields
  }
});

// features/keystone/models/BackInStockAlert.ts
var import_core22 = require("@keystone-6/core");
var import_fields23 = require("@keystone-6/core/fields");
init_access();
var BackInStockAlert = (0, import_core22.list)({
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
    user: (0, import_fields23.relationship)({
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
    product: (0, import_fields23.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product display snapshot"
      }
    }),
    productRef: (0, import_fields23.relationship)({
      ref: "Product.backInStockAlerts",
      access: { create: () => false, update: () => false },
      label: "Product"
    }),
    // When the user was notified
    notifiedAt: (0, import_fields23.timestamp)({
      label: "Notified At",
      ui: {
        description: "When the user was notified about the product being back in stock"
      }
    }),
    // Whether the alert is still active
    isActive: (0, import_fields23.checkbox)({
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
var import_core23 = require("@keystone-6/core");
var import_fields24 = require("@keystone-6/core/fields");
init_access();
var Cart = (0, import_core23.list)({
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
    store: (0, import_fields24.relationship)({
      ref: "Store.carts",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    customer: (0, import_fields24.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: uniqueRelationshipPrisma },
      ref: "User",
      label: "Customer",
      ui: {
        description: "The logged-in user who owns this cart"
      }
    }),
    // For guest users
    sessionId: (0, import_fields24.text)({
      label: "Session ID",
      isIndexed: "unique",
      ui: {
        description: "Session identifier for guest carts"
      }
    }),
    // Cart items relationship
    items: (0, import_fields24.relationship)({
      ref: "CartItem.cart",
      many: true,
      label: "Cart Items"
    }),
    paymentSessions: (0, import_fields24.relationship)({
      ref: "PaymentSession.cart",
      many: true,
      label: "Payment Sessions"
    }),
    checkoutAttempts: (0, import_fields24.relationship)({ ref: "CheckoutAttempt.cart", many: true }),
    // Calculated fields (cached for performance)
    itemCount: (0, import_fields24.integer)({
      defaultValue: 0,
      label: "Item Count",
      ui: {
        description: "Total number of items in cart"
      }
    }),
    subtotal: (0, import_fields24.float)({
      defaultValue: 0,
      label: "Legacy display subtotal",
      ui: {
        description: "Cart subtotal before tax and fees"
      }
    }),
    subtotalCents: (0, import_fields24.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative subtotal (minor units)" }),
    // Cart expiration for guest carts
    expiresAt: (0, import_fields24.timestamp)({
      label: "Expires At",
      ui: {
        description: "When this cart expires (for guest carts)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/CheckoutAttempt.ts
var import_core24 = require("@keystone-6/core");
var import_fields25 = require("@keystone-6/core/fields");
init_access();
var CheckoutAttempt = (0, import_core24.list)({
  access: {
    operation: { query: permissions.canManageOrders, create: () => false, update: () => false, delete: () => false },
    filter: { query: storeScopedFilter, update: storeScopedFilter, delete: storeScopedFilter }
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields25.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { update: () => false } }),
    providerCode: (0, import_fields25.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    providerPaymentId: (0, import_fields25.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    amountCents: (0, import_fields25.integer)({ validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    currencyCode: (0, import_fields25.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    status: (0, import_fields25.select)({
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
    attempts: (0, import_fields25.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    fencingToken: (0, import_fields25.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    leaseToken: (0, import_fields25.text)({ db: { isNullable: true }, access: { update: () => false } }),
    leaseExpiresAt: (0, import_fields25.timestamp)({ access: { update: () => false } }),
    lastError: (0, import_fields25.text)({ access: { update: () => false } }),
    requestData: (0, import_fields25.json)({ defaultValue: {}, access: { update: () => false } }),
    settledAt: (0, import_fields25.timestamp)(),
    finalizedAt: (0, import_fields25.timestamp)(),
    compensationAt: (0, import_fields25.timestamp)(),
    store: (0, import_fields25.relationship)({ ref: "Store.checkoutAttempts", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    cart: (0, import_fields25.relationship)({ ref: "Cart.checkoutAttempts", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    paymentSession: (0, import_fields25.relationship)({ ref: "PaymentSession.checkoutAttempts", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } }, access: { create: () => false, update: () => false } }),
    order: (0, import_fields25.relationship)({ ref: "Order.checkoutAttempts", access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/CartItem.ts
var import_core25 = require("@keystone-6/core");
var import_fields26 = require("@keystone-6/core/fields");
init_access();
var CartItem = (0, import_core25.list)({
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
    cart: (0, import_fields26.relationship)({
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
    product: (0, import_fields26.relationship)({
      ref: "Product",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      label: "Product",
      ui: {
        description: "The product in this cart item"
      }
    }),
    // Quantity
    quantity: (0, import_fields26.integer)({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: {
        description: "Number of units in cart"
      }
    }),
    // Calculated subtotal for this item
    subtotal: (0, import_fields26.float)({
      defaultValue: 0,
      label: "Legacy display subtotal",
      ui: {
        description: "Price x Quantity"
      }
    }),
    subtotalCents: (0, import_fields26.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative subtotal (minor units)" }),
    // Grocery-specific: substitution preference
    substitutionPreference: (0, import_fields26.select)({
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
    addedAt: (0, import_fields26.timestamp)({
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
var import_core26 = require("@keystone-6/core");
var import_fields27 = require("@keystone-6/core/fields");
init_access();
var Coupon = (0, import_core26.list)({
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
    code: (0, import_fields27.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Coupon Code",
      ui: {
        description: "Unique coupon code that customers will enter"
      }
    }),
    discountType: (0, import_fields27.select)({
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
    discountValue: (0, import_fields27.float)({
      label: "Discount Value",
      ui: {
        description: "Percentage (0-100) or fixed dollar amount"
      },
      validation: { min: 0 }
    }),
    discountValueCents: (0, import_fields27.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative fixed discount (minor units)" }),
    minPurchase: (0, import_fields27.float)({
      label: "Legacy display minimum purchase",
      ui: {
        description: "Minimum order amount required to use this coupon"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    minPurchaseCents: (0, import_fields27.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative minimum purchase (minor units)" }),
    maxUses: (0, import_fields27.integer)({
      label: "Maximum Uses",
      ui: {
        description: "Total number of times this coupon can be used (0 = unlimited)"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    currentUses: (0, import_fields27.integer)({
      label: "Current Uses",
      ui: {
        description: "Number of times this coupon has been used"
      },
      validation: { min: 0 },
      defaultValue: 0
    }),
    validFrom: (0, import_fields27.timestamp)({
      label: "Valid From",
      ui: {
        description: "Date when coupon becomes active"
      }
    }),
    validTo: (0, import_fields27.timestamp)({
      label: "Valid To",
      ui: {
        description: "Date when coupon expires"
      }
    }),
    productCategories: (0, import_fields27.json)({
      label: "Product Categories",
      ui: {
        description: "JSON array of department/category slugs this coupon applies to (empty = all)"
      }
    }),
    excludedProducts: (0, import_fields27.json)({
      label: "Excluded Products",
      ui: {
        description: "JSON array of product IDs excluded from this coupon"
      }
    }),
    isActive: (0, import_fields27.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this coupon is currently active"
      }
    }),
    // Relationships
    store: (0, import_fields27.relationship)({
      ref: "Store.coupons",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false }
    }),
    userCoupons: (0, import_fields27.relationship)({
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
var import_core27 = require("@keystone-6/core");
var import_fields28 = require("@keystone-6/core/fields");
init_access();
var Department = (0, import_core27.list)({
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
    name: (0, import_fields28.text)({
      validation: { isRequired: true },
      label: "Department Name",
      ui: {
        description: "e.g., Produce, Meat, Dairy, Bakery, Frozen, etc."
      }
    }),
    handle: (0, import_fields28.text)({
      isIndexed: "unique",
      label: "Handle",
      ui: {
        description: "URL-friendly identifier (e.g., 'produce', 'meat-seafood')"
      }
    }),
    description: (0, import_fields28.text)({
      ui: {
        displayMode: "textarea",
        description: "Brief description shown on storefront"
      }
    }),
    imageUrl: (0, import_fields28.text)({
      label: "Image URL",
      ui: {
        description: "URL of the department image"
      }
    }),
    sortOrder: (0, import_fields28.integer)({
      defaultValue: 0,
      label: "Sort Order",
      ui: {
        description: "Display order on storefront (lower numbers first)"
      }
    }),
    isActive: (0, import_fields28.checkbox)({
      defaultValue: true,
      label: "Active",
      ui: {
        description: "Show this department on the storefront"
      }
    }),
    temperatureZone: (0, import_fields28.select)({
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
    requiredLicenses: (0, import_fields28.multiselect)({
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
    store: (0, import_fields28.relationship)({
      ref: "Store.departments",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false }
    }),
    manager: (0, import_fields28.relationship)({
      access: { read: permissions.canManageProducts },
      ref: "User",
      label: "Department Manager",
      ui: {
        description: "User responsible for this department"
      }
    }),
    products: (0, import_fields28.relationship)({
      ref: "Product.departmentRef",
      many: true,
      label: "Products"
    }),
    ...trackingFields
  }
});

// features/keystone/models/DeliveryRoute.ts
var import_core28 = require("@keystone-6/core");
var import_fields29 = require("@keystone-6/core/fields");
init_access();
var DeliveryRoute = (0, import_core28.list)({
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
    date: (0, import_fields29.timestamp)({
      validation: { isRequired: true },
      label: "Delivery Date"
    }),
    timeWindow: (0, import_fields29.select)({
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
    stops: (0, import_fields29.json)({
      label: "Stops",
      ui: {
        description: "JSON array with optimized delivery sequence",
        views: require.resolve("@keystone-6/core/fields/types/json/views")
      }
    }),
    status: (0, import_fields29.select)({
      type: "enum",
      options: [
        { label: "Planning", value: "planning" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed", value: "completed" }
      ],
      defaultValue: "planning",
      label: "Status"
    }),
    startedAt: (0, import_fields29.timestamp)({
      label: "Started At",
      ui: {
        description: "When the driver started this route"
      }
    }),
    completedAt: (0, import_fields29.timestamp)({
      label: "Completed At",
      ui: {
        description: "When all deliveries were completed"
      }
    }),
    // Relationships
    store: (0, import_fields29.relationship)({
      ref: "Store.deliveryRoutes",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    driver: (0, import_fields29.relationship)({
      ref: "User",
      label: "Driver",
      ui: {
        description: "User assigned to drive this route"
      }
    }),
    orders: (0, import_fields29.relationship)({
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
var import_core29 = require("@keystone-6/core");
var import_fields30 = require("@keystone-6/core/fields");
init_access();
var DeliverySlot = (0, import_core29.list)({
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
    store: (0, import_fields30.relationship)({
      ref: "Store.deliverySlots",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageDelivery, update: () => false }
    }),
    orders: (0, import_fields30.relationship)({ ref: "Order.deliverySlot", many: true, access: { update: () => false } }),
    // Date of the delivery slot
    date: (0, import_fields30.timestamp)({
      access: { update: () => false },
      validation: { isRequired: true },
      isIndexed: true,
      label: "Date",
      ui: {
        description: "Date for this delivery time window"
      }
    }),
    // Start time of the delivery window
    startTime: (0, import_fields30.text)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this delivery window (e.g., '09:00')"
      }
    }),
    // End time of the delivery window
    endTime: (0, import_fields30.text)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this delivery window (e.g., '11:00')"
      }
    }),
    // Maximum number of deliveries for this slot
    capacity: (0, import_fields30.integer)({
      access: { update: () => false },
      validation: { isRequired: true, min: 1 },
      defaultValue: 10,
      label: "Capacity",
      ui: {
        description: "Maximum number of deliveries that can be scheduled for this slot"
      }
    }),
    // Current number of deliveries booked
    currentBookings: (0, import_fields30.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      validation: { min: 0 },
      label: "Current Bookings",
      ui: {
        description: "Current number of deliveries booked for this slot"
      }
    }),
    // Whether the slot is active and available for booking
    isActive: (0, import_fields30.checkbox)({
      access: { update: () => false },
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this delivery slot is active and available for booking"
      }
    }),
    // Delivery fee for this slot (e.g., premium for express slots)
    deliveryFee: (0, import_fields30.integer)({
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
var import_core30 = require("@keystone-6/core");
var import_fields31 = require("@keystone-6/core/fields");
init_access();
var FavoriteProduct = (0, import_core30.list)({
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
    user: (0, import_fields31.relationship)({
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
    product: (0, import_fields31.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product display snapshot"
      }
    }),
    productRef: (0, import_fields31.relationship)({
      ref: "Product.favoriteProducts",
      access: { create: () => false, update: () => false },
      label: "Product"
    }),
    // When the product was favorited
    favoritedAt: (0, import_fields31.timestamp)({
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
var import_core31 = require("@keystone-6/core");
var import_fields32 = require("@keystone-6/core/fields");
init_access();
var DELIVERY_FIELDS = /* @__PURE__ */ new Set([
  "status",
  "attempts",
  "claimToken",
  "claimedAt",
  "deliveredAt",
  "lastError",
  "nextAttemptAt"
]);
var GroceryOutboxEvent = (0, import_core31.list)({
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
    store: (0, import_fields32.relationship)({
      ref: "Store.outboxEvents",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    eventKey: (0, import_fields32.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { update: () => false } }),
    eventType: (0, import_fields32.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    aggregateType: (0, import_fields32.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    aggregateId: (0, import_fields32.text)({ validation: { isRequired: true }, isIndexed: true, access: { update: () => false } }),
    schemaVersion: (0, import_fields32.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 }, access: { update: () => false } }),
    payload: (0, import_fields32.json)({ access: { update: () => false } }),
    payloadHash: (0, import_fields32.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    occurredAt: (0, import_fields32.timestamp)({ validation: { isRequired: true }, isIndexed: true, access: { update: () => false } }),
    status: (0, import_fields32.text)({ defaultValue: "pending", isIndexed: true }),
    attempts: (0, import_fields32.integer)({ defaultValue: 0, validation: { min: 0 } }),
    claimToken: (0, import_fields32.text)(),
    claimedAt: (0, import_fields32.timestamp)(),
    deliveredAt: (0, import_fields32.timestamp)(),
    nextAttemptAt: (0, import_fields32.timestamp)(),
    lastError: (0, import_fields32.text)({ ui: { displayMode: "textarea" } }),
    ...trackingFields
  }
});

// features/keystone/models/InventoryLot.ts
var import_core32 = require("@keystone-6/core");
var import_fields33 = require("@keystone-6/core/fields");
init_access();
var InventoryLot = (0, import_core32.list)({
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
    lotNumber: (0, import_fields33.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Lot Number",
      ui: {
        description: "Unique identifier for this inventory lot"
      }
    }),
    supplierLotNumber: (0, import_fields33.text)({ isIndexed: true, label: "Supplier batch number" }),
    safetyStatus: (0, import_fields33.select)({ options: ["available", "held", "quarantined", "recalled"], defaultValue: "available", validation: { isRequired: true } }),
    conditionStatus: (0, import_fields33.select)({ options: ["accepted", "inspection_pending", "rejected"], defaultValue: "accepted", validation: { isRequired: true } }),
    safetyReason: (0, import_fields33.text)(),
    expirationDate: (0, import_fields33.timestamp)({
      validation: { isRequired: true },
      label: "Expiration Date",
      ui: {
        description: "Date when this lot expires"
      }
    }),
    receivedDate: (0, import_fields33.timestamp)({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Received Date",
      ui: {
        description: "Date this lot was received"
      }
    }),
    quantity: (0, import_fields33.decimal)({
      precision: 18,
      scale: 3,
      validation: { isRequired: true, min: "0" },
      label: "Original Quantity",
      ui: {
        description: "Total units received in this lot"
      }
    }),
    quantityRemaining: (0, import_fields33.decimal)({
      precision: 18,
      scale: 3,
      validation: { isRequired: true, min: "0" },
      label: "Quantity Remaining",
      ui: {
        description: "Units still available in this lot"
      }
    }),
    costPerUnit: (0, import_fields33.float)({
      validation: { isRequired: true },
      label: "Cost Per Unit (legacy display)",
      ui: { description: "Legacy display value; costPerUnitCents is authoritative" }
    }),
    costPerUnitCents: (0, import_fields33.integer)({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: "Cost Per Unit (minor units)"
    }),
    location: (0, import_fields33.text)({
      label: "Location",
      ui: {
        description: "Warehouse zone/bin location (e.g., A-1-3)"
      }
    }),
    // Relationships
    store: (0, import_fields33.relationship)({
      ref: "Store.inventoryLots",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    product: (0, import_fields33.relationship)({
      ref: "Product.inventoryLots",
      label: "Product"
    }),
    supplier: (0, import_fields33.relationship)({
      ref: "Supplier.inventoryLots",
      label: "Supplier"
    }),
    orderLineAllocations: (0, import_fields33.relationship)({
      ref: "OrderLineInventoryAllocation.inventoryLot",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    ...trackingFields
  }
});

// features/keystone/models/InventoryAdjustment.ts
var import_core33 = require("@keystone-6/core");
var import_fields34 = require("@keystone-6/core/fields");
init_access();
var InventoryAdjustment = (0, import_core33.list)({
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
    idempotencyKey: (0, import_fields34.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    reason: (0, import_fields34.select)({
      type: "enum",
      options: [
        { label: "Cycle count", value: "cycle_count" },
        { label: "Damage", value: "damage" },
        { label: "Spoilage", value: "spoilage" },
        { label: "Correction", value: "correction" }
      ],
      validation: { isRequired: true }
    }),
    quantityBefore: (0, import_fields34.decimal)({ precision: 18, scale: 3, validation: { isRequired: true } }),
    quantityAfter: (0, import_fields34.decimal)({ precision: 18, scale: 3, validation: { isRequired: true } }),
    quantityDelta: (0, import_fields34.decimal)({ precision: 18, scale: 3, validation: { isRequired: true } }),
    productStockBefore: (0, import_fields34.decimal)({ precision: 18, scale: 3, validation: { isRequired: true } }),
    productStockAfter: (0, import_fields34.decimal)({ precision: 18, scale: 3, validation: { isRequired: true } }),
    note: (0, import_fields34.text)(),
    store: (0, import_fields34.relationship)({
      ref: "Store.inventoryAdjustments",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    product: (0, import_fields34.relationship)({ ref: "Product" }),
    inventoryLot: (0, import_fields34.relationship)({ ref: "InventoryLot" }),
    adjustedBy: (0, import_fields34.relationship)({ ref: "User" }),
    ...trackingFields
  }
});

// features/keystone/models/LoyaltyProgram.ts
var import_core34 = require("@keystone-6/core");
var import_fields35 = require("@keystone-6/core/fields");
var LoyaltyProgram = (0, import_core34.list)({
  access: {
    operation: {
      query: () => true,
      create: () => false,
      update: () => false,
      delete: () => false
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
    earnPointsPer100Cents: (0, import_fields35.integer)({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    redeemPointsPer100Cents: (0, import_fields35.integer)({ defaultValue: 100, validation: { isRequired: true, min: 1 } }),
    minimumRedemptionPoints: (0, import_fields35.integer)({ defaultValue: 100, validation: { isRequired: true, min: 1 } }),
    refundDebtPolicy: (0, import_fields35.select)({ options: ["offset_future_earnings"], defaultValue: "offset_future_earnings", validation: { isRequired: true } }),
    store: (0, import_fields35.relationship)({
      ref: "Store.loyaltyPrograms",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      // Public loyalty projections do not expose the authenticated Store row.
      graphql: { isNonNull: { create: true } },
      access: { create: () => false, update: () => false }
    }),
    // Program name
    name: (0, import_fields35.text)({
      validation: { isRequired: true },
      label: "Program Name",
      ui: {
        description: "Name of the loyalty program (e.g., 'Grocery Rewards', 'Fresh Points')"
      }
    }),
    // Points earned per dollar spent
    pointsPerDollar: (0, import_fields35.float)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 1,
      label: "Points Per Dollar",
      ui: {
        description: "How many points customers earn per dollar spent"
      }
    }),
    // Tier configuration and thresholds
    tierConfiguration: (0, import_fields35.json)({
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
    redemptionRules: (0, import_fields35.json)({
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
    expirationRules: (0, import_fields35.json)({
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
    tierBenefits: (0, import_fields35.json)({
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
    isActive: (0, import_fields35.checkbox)({
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
var import_core35 = require("@keystone-6/core");
var import_fields36 = require("@keystone-6/core/fields");
init_access();
var LoyaltyTransaction = (0, import_core35.list)({
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
    idempotencyKey: (0, import_fields36.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    store: (0, import_fields36.relationship)({ ref: "Store" }),
    program: (0, import_fields36.relationship)({ ref: "LoyaltyProgram" }),
    sourceId: (0, import_fields36.text)(),
    sourceType: (0, import_fields36.text)(),
    actorId: (0, import_fields36.text)(),
    balanceBefore: (0, import_fields36.integer)(),
    metadata: (0, import_fields36.json)(),
    // User who owns this transaction
    user: (0, import_fields36.relationship)({
      ref: "User",
      label: "User",
      ui: {
        description: "The user this transaction belongs to"
      }
    }),
    // Points awarded or redeemed (positive for earned, negative for redeemed)
    points: (0, import_fields36.integer)({
      validation: { isRequired: true },
      label: "Points",
      ui: {
        description: "Points earned (positive) or redeemed (negative)"
      }
    }),
    // Transaction type
    type: (0, import_fields36.select)({
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
    description: (0, import_fields36.text)({
      validation: { isRequired: true },
      label: "Description",
      ui: {
        description: "Description of what this transaction is for",
        displayMode: "textarea"
      }
    }),
    // Related order (if applicable)
    order: (0, import_fields36.relationship)({
      ref: "Order",
      label: "Order",
      ui: {
        description: "Order associated with this transaction (if applicable)"
      }
    }),
    // Balance after this transaction
    balanceAfter: (0, import_fields36.integer)({
      validation: { isRequired: true },
      label: "Balance After",
      ui: {
        description: "User's points balance after this transaction"
      }
    }),
    // When the transaction occurred
    transactionDate: (0, import_fields36.timestamp)({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
      label: "Transaction Date",
      ui: {
        description: "When this transaction occurred"
      }
    }),
    // Expiration date (for earned points)
    expiresAt: (0, import_fields36.timestamp)({
      label: "Expires At",
      ui: {
        description: "When these points expire (if applicable)"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/NotificationPreference.ts
var import_core36 = require("@keystone-6/core");
var import_fields37 = require("@keystone-6/core/fields");
init_access();
var NotificationPreference = (0, import_core36.list)({
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
    user: (0, import_fields37.relationship)({
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
    orderUpdates: (0, import_fields37.checkbox)({
      defaultValue: true,
      label: "Order Updates",
      ui: {
        description: "Receive notifications about order status changes"
      }
    }),
    // Delivery alerts
    deliveryAlerts: (0, import_fields37.checkbox)({
      defaultValue: true,
      label: "Delivery Alerts",
      ui: {
        description: "Receive notifications about delivery status and ETA"
      }
    }),
    // Price drop notifications
    priceDrops: (0, import_fields37.checkbox)({
      defaultValue: false,
      label: "Price Drops",
      ui: {
        description: "Receive notifications when favorited products go on sale"
      }
    }),
    // Back in stock notifications
    backInStock: (0, import_fields37.checkbox)({
      defaultValue: false,
      label: "Back in Stock",
      ui: {
        description: "Receive notifications when out-of-stock products become available"
      }
    }),
    // Weekly deals digest
    weeklyDeals: (0, import_fields37.checkbox)({
      defaultValue: false,
      label: "Weekly Deals",
      ui: {
        description: "Receive weekly digest of deals and promotions"
      }
    }),
    // Notification channels (JSON array: email/sms/push)
    channels: (0, import_fields37.json)({
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
var import_core37 = require("@keystone-6/core");
var import_fields38 = require("@keystone-6/core/fields");
init_access();
function canUpdateUnroutedOrder({ item }) {
  return !item.deliveryRouteId;
}
function calendarDay(value) {
  if (!value) return null;
  const date2 = new Date(value);
  return Number.isFinite(date2.getTime()) ? date2.toISOString().slice(0, 10) : null;
}
var Order = (0, import_core37.list)({
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
          query: "id status date timeWindow stops"
        });
        if (!route) {
          addValidationError("Routed orders must retain their delivery route");
          return;
        }
        const stop = (Array.isArray(route.stops) ? route.stops : []).find((entry) => entry.orderId === current.id);
        const expectedStatus = stop?.status === "delivered" ? "delivered" : stop?.status === "returned" ? "returned" : stop?.status === "failed" ? "delivery_failed" : stop?.status === "refused" ? "delivery_refused" : route.status === "planning" ? "packed" : "out_for_delivery";
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
          const recordedReturn = stop?.status === "returned" && nextStatus === "returned" && resolvedData.deliveryRoute?.disconnect === true && nextMetadata.deliveryOutcome?.routeId === current.deliveryRouteId && nextMetadata.deliveryOutcome?.custody === "store";
          if (nextMetadata.deliveryRouteId !== current.deliveryRouteId && !recordedReturn) {
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
    displayId: (0, import_fields38.integer)({
      isIndexed: "unique",
      validation: { isRequired: true },
      label: "Order Number"
    }),
    email: (0, import_fields38.text)({
      validation: { isRequired: true },
      label: "Customer Email"
    }),
    status: (0, import_fields38.select)({
      access: { create: () => false, update: () => false },
      type: "enum",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Picking", value: "picking" },
        { label: "Packed", value: "packed" },
        { label: "Out for Delivery", value: "out_for_delivery" },
        { label: "Delivered", value: "delivered" },
        { label: "Delivery failed", value: "delivery_failed" },
        { label: "Delivery refused", value: "delivery_refused" },
        { label: "Returned to store", value: "returned" },
        { label: "Cancelled", value: "cancelled" }
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      label: "Status"
    }),
    taxRate: (0, import_fields38.float)({
      label: "Tax Rate"
    }),
    currencyCode: (0, import_fields38.text)({ defaultValue: "USD", validation: { isRequired: true } }),
    subtotalCents: (0, import_fields38.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    taxCents: (0, import_fields38.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    deliveryFeeCents: (0, import_fields38.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    discountCents: (0, import_fields38.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    totalCents: (0, import_fields38.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    canceledAt: (0, import_fields38.timestamp)({
      access: { create: () => false, update: () => false },
      label: "Cancelled At"
    }),
    metadata: (0, import_fields38.json)({ access: { create: () => false, update: () => false } }),
    noNotification: (0, import_fields38.checkbox)({
      defaultValue: false,
      label: "Suppress Notifications"
    }),
    // Delivery time window fields (grocery-specific)
    deliveryDate: (0, import_fields38.timestamp)({
      access: { update: canUpdateUnroutedOrder },
      validation: { isRequired: true },
      label: "Delivery Date",
      ui: {
        description: "Scheduled delivery date"
      }
    }),
    deliveryTimeWindow: (0, import_fields38.select)({
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
    deliveryInstructions: (0, import_fields38.text)({
      ui: {
        displayMode: "textarea",
        description: "Special delivery instructions from customer"
      },
      label: "Delivery Instructions"
    }),
    substitutionPreference: (0, import_fields38.select)({
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
    store: (0, import_fields38.relationship)({
      ref: "Store.orders",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    user: (0, import_fields38.relationship)({
      ref: "User",
      label: "Customer"
    }),
    shippingAddress: (0, import_fields38.relationship)({
      ref: "Address",
      label: "Shipping Address"
    }),
    billingAddress: (0, import_fields38.relationship)({
      ref: "Address",
      label: "Billing Address"
    }),
    checkoutAttempts: (0, import_fields38.relationship)({ ref: "CheckoutAttempt.order", many: true, access: { update: () => false }, ui: { itemView: { fieldMode: "read" } } }),
    payments: (0, import_fields38.relationship)({
      ref: "Payment.order",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    lineItems: (0, import_fields38.relationship)({
      ref: "OrderLineItem.order",
      many: true,
      label: "Line Items"
    }),
    deliverySlot: (0, import_fields38.relationship)({ ref: "DeliverySlot.orders", access: { update: () => false } }),
    pickupSlot: (0, import_fields38.relationship)({ ref: "PickupSlot.orders", access: { update: () => false } }),
    deliveryRoute: (0, import_fields38.relationship)({
      access: { update: () => false },
      ref: "DeliveryRoute.orders",
      label: "Delivery Route"
    }),
    ...trackingFields
  }
});

// features/keystone/models/OrderItemSubstitution.ts
var import_core38 = require("@keystone-6/core");
var import_fields39 = require("@keystone-6/core/fields");
init_access();
function normalizeText(value) {
  return typeof value === "string" ? value.trim() : value;
}
var OrderItemSubstitution = (0, import_core38.list)({
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
    idempotencyKey: (0, import_fields39.text)({
      isIndexed: "unique",
      validation: { isRequired: true },
      access: { update: () => false }
    }),
    orderItem: (0, import_fields39.text)({
      validation: { isRequired: true },
      access: { update: () => false },
      label: "Order Item ID Snapshot",
      ui: { itemView: { fieldMode: "read" } }
    }),
    lineItem: (0, import_fields39.relationship)({
      ref: "OrderLineItem.substitutions",
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    recordedBy: (0, import_fields39.relationship)({
      ref: "User",
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    originalProduct: (0, import_fields39.text)({
      validation: { isRequired: true },
      access: { update: () => false },
      label: "Original Product Snapshot",
      ui: { itemView: { fieldMode: "read" } }
    }),
    substitutedProduct: (0, import_fields39.text)({
      validation: { isRequired: true },
      access: { update: () => false },
      label: "Substituted Product Snapshot"
    }),
    reason: (0, import_fields39.text)({
      access: { update: () => false },
      ui: { displayMode: "textarea", itemView: { fieldMode: "read" } }
    }),
    customerApproved: (0, import_fields39.checkbox)({
      access: { update: () => false },
      defaultValue: false,
      ui: { itemView: { fieldMode: "read" } }
    }),
    approvedAt: (0, import_fields39.timestamp)({ access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/OrderLineItem.ts
var import_core39 = require("@keystone-6/core");
var import_fields40 = require("@keystone-6/core/fields");
init_access();
var OrderLineItem = (0, import_core39.list)({
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
    fulfillment: (0, import_fields40.relationship)({ ref: "OrderLineFulfillment.lineItem", access: { create: () => false, update: () => false } }),
    title: (0, import_fields40.text)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Product Title",
      ui: { itemView: { fieldMode: "read" } }
    }),
    sku: (0, import_fields40.text)({
      access: { update: () => false },
      label: "SKU",
      ui: { itemView: { fieldMode: "read" } }
    }),
    quantity: (0, import_fields40.integer)({
      access: { update: () => false },
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: { itemView: { fieldMode: "read" } }
    }),
    unitPrice: (0, import_fields40.float)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Legacy display unit price",
      ui: { itemView: { fieldMode: "read" } }
    }),
    unitPriceCents: (0, import_fields40.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative unit price (minor units)" }),
    thumbnail: (0, import_fields40.text)({
      access: { update: () => false },
      label: "Thumbnail URL",
      ui: { itemView: { fieldMode: "read" } }
    }),
    metadata: (0, import_fields40.json)({
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    // Relationships
    order: (0, import_fields40.relationship)({
      access: { update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Order.lineItems",
      label: "Order",
      ui: { itemView: { fieldMode: "read" } }
    }),
    product: (0, import_fields40.relationship)({
      access: { update: () => false },
      ref: "Product",
      label: "Product",
      ui: { itemView: { fieldMode: "read" } }
    }),
    // Track which inventory lot was used (for FEFO)
    inventoryLot: (0, import_fields40.relationship)({
      access: { update: () => false },
      ref: "InventoryLot",
      label: "Inventory Lot",
      ui: {
        description: "Inventory lot used to fulfill this line item",
        itemView: { fieldMode: "read" }
      }
    }),
    inventoryAllocations: (0, import_fields40.relationship)({
      ref: "OrderLineInventoryAllocation.lineItem",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    substitutions: (0, import_fields40.relationship)({
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
var import_core40 = require("@keystone-6/core");
var import_fields41 = require("@keystone-6/core/fields");
init_access();
var OrderLineInventoryAllocation = (0, import_core40.list)({
  access: {
    operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false },
    filter: { query: nestedRelatedStoreScopedFilter("lineItem", "order") }
  },
  fields: {
    lineItem: (0, import_fields41.relationship)({
      ref: "OrderLineItem.inventoryAllocations",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    inventoryLot: (0, import_fields41.relationship)({
      ref: "InventoryLot.orderLineAllocations",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    store: (0, import_fields41.relationship)({
      ref: "Store.orderLineInventoryAllocations",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    quantity: (0, import_fields41.decimal)({ precision: 18, scale: 3, validation: { isRequired: true, min: "0.001" }, access: { create: () => false, update: () => false } }),
    provenance: (0, import_fields41.json)({ access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/ParkingSpot.ts
var import_core41 = require("@keystone-6/core");
var import_fields42 = require("@keystone-6/core/fields");
init_access();
var ParkingSpot = (0, import_core41.list)({
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
    store: (0, import_fields42.relationship)({
      ref: "Store.parkingSpots",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageDelivery, update: () => false }
    }),
    spotNumber: (0, import_fields42.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Spot Number",
      ui: {
        description: "Unique identifier for this parking spot (e.g., 'A1', 'B2')"
      }
    }),
    description: (0, import_fields42.text)({
      label: "Description",
      ui: {
        displayMode: "textarea",
        description: "Additional details about this spot location"
      }
    }),
    isAccessible: (0, import_fields42.checkbox)({
      defaultValue: false,
      label: "Is Accessible",
      ui: {
        description: "Whether this spot is ADA accessible"
      }
    }),
    isAvailable: (0, import_fields42.checkbox)({
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
var import_core42 = require("@keystone-6/core");
var import_fields43 = require("@keystone-6/core/fields");
init_access();
var Payment = (0, import_core42.list)({
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
    amount: (0, import_fields43.decimal)({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      ui: { description: "Legacy display amount; amountCents is authoritative" }
    }),
    amountCents: (0, import_fields43.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      label: "Payment amount (minor units)"
    }),
    status: (0, import_fields43.select)({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Authorized", value: "authorized" },
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
    paymentMethod: (0, import_fields43.select)({
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
    providerPaymentId: (0, import_fields43.text)({
      isIndexed: "unique",
      ui: {
        description: "Provider payment identifier"
      }
    }),
    providerChargeId: (0, import_fields43.text)({
      ui: {
        description: "Provider charge/capture identifier"
      }
    }),
    providerRefundId: (0, import_fields43.text)({
      ui: {
        description: "Provider refund identifier"
      }
    }),
    providerData: (0, import_fields43.json)({
      defaultValue: {},
      ui: {
        description: "Normalized provider payload and metadata"
      }
    }),
    // Card details (last 4 digits for reference)
    cardLast4: (0, import_fields43.text)({
      ui: {
        description: "Last 4 digits of card"
      }
    }),
    cardBrand: (0, import_fields43.text)({
      ui: {
        description: "Card brand (visa, mastercard, etc.)"
      }
    }),
    // Delivery tip handling
    deliveryTipAmount: (0, import_fields43.decimal)({
      precision: 10,
      scale: 2,
      defaultValue: "0.00",
      ui: { description: "Legacy display tip; deliveryTipCents is authoritative" }
    }),
    deliveryTipCents: (0, import_fields43.integer)({
      validation: { isRequired: true, min: 0 },
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      label: "Delivery tip (minor units)"
    }),
    // Timestamps
    processedAt: (0, import_fields43.timestamp)({
      ui: {
        description: "When payment was successfully processed"
      }
    }),
    // Metadata for errors or additional info
    errorMessage: (0, import_fields43.text)({
      ui: {
        description: "Error message if payment failed"
      }
    }),
    notes: (0, import_fields43.text)({
      ui: {
        displayMode: "textarea",
        description: "Internal notes about this payment"
      }
    }),
    // Relationships
    store: (0, import_fields43.relationship)({
      ref: "Store.payments",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    order: (0, import_fields43.relationship)({
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Order.payments",
      ui: {
        displayMode: "select"
      }
    }),
    paymentProvider: (0, import_fields43.relationship)({
      ref: "PaymentProvider.payments",
      ui: {
        displayMode: "select"
      }
    }),
    refunds: (0, import_fields43.relationship)({
      ref: "PaymentRefund.payment",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    webhookEvents: (0, import_fields43.relationship)({
      ref: "PaymentWebhookEvent.payment",
      many: true,
      access: { update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    processedBy: (0, import_fields43.relationship)({
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
var import_core43 = require("@keystone-6/core");
var import_fields44 = require("@keystone-6/core/fields");
var PaymentProvider = (0, import_core43.list)({
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
    name: (0, import_fields44.text)({
      validation: { isRequired: true }
    }),
    code: (0, import_fields44.text)({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation: "Payment provider code must start with pp_"
        }
      }
    }),
    isInstalled: (0, import_fields44.checkbox)({
      defaultValue: true
    }),
    metadata: (0, import_fields44.json)({
      defaultValue: {},
      ui: {
        description: "Non-secret display metadata only. Adapter secrets are read from server environment variables."
      }
    }),
    payments: (0, import_fields44.relationship)({
      ref: "Payment.paymentProvider",
      many: true
    }),
    sessions: (0, import_fields44.relationship)({
      ref: "PaymentSession.paymentProvider",
      many: true
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentRefund.ts
var import_core44 = require("@keystone-6/core");
var import_fields45 = require("@keystone-6/core/fields");
init_access();
var PaymentRefund = (0, import_core44.list)({
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
    idempotencyKey: (0, import_fields45.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { update: () => false } }),
    amount: (0, import_fields45.decimal)({ precision: 10, scale: 2, validation: { isRequired: true }, access: { update: () => false } }),
    amountCents: (0, import_fields45.integer)({ validation: { isRequired: true, min: 1 }, access: { update: () => false } }),
    status: (0, import_fields45.select)({
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
    providerCode: (0, import_fields45.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    providerPaymentId: (0, import_fields45.text)({ validation: { isRequired: true }, access: { update: () => false } }),
    providerRefundId: (0, import_fields45.text)({ access: { update: () => false } }),
    providerStatus: (0, import_fields45.text)({ access: { update: () => false } }),
    providerData: (0, import_fields45.json)({ defaultValue: {}, access: { update: () => false } }),
    providerEventId: (0, import_fields45.text)({ db: { isNullable: true }, access: { update: () => false } }),
    providerEventCreatedAt: (0, import_fields45.timestamp)({ db: { isNullable: true }, access: { update: () => false } }),
    providerEventVersion: (0, import_fields45.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    failureMessage: (0, import_fields45.text)({ access: { update: () => false } }),
    reconciliationAttempts: (0, import_fields45.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { update: () => false } }),
    reconciliationOwner: (0, import_fields45.text)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationToken: (0, import_fields45.text)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationLeaseExpiresAt: (0, import_fields45.timestamp)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationNextAttemptAt: (0, import_fields45.timestamp)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationDeadLetterAt: (0, import_fields45.timestamp)({ db: { isNullable: true }, access: { update: () => false } }),
    reconciliationLastError: (0, import_fields45.text)({ db: { isNullable: true }, access: { update: () => false } }),
    requestedAt: (0, import_fields45.timestamp)({ validation: { isRequired: true }, access: { update: () => false } }),
    processedAt: (0, import_fields45.timestamp)({ access: { update: () => false } }),
    payment: (0, import_fields45.relationship)({
      ref: "Payment.refunds",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    requestedBy: (0, import_fields45.relationship)({
      ref: "User.paymentRefunds",
      access: { update: () => false }
    }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentSession.ts
var import_core45 = require("@keystone-6/core");
var import_fields46 = require("@keystone-6/core/fields");
init_access();
var PaymentSession = (0, import_core45.list)({
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
    isSelected: (0, import_fields46.checkbox)({ defaultValue: false }),
    isInitiated: (0, import_fields46.checkbox)({ defaultValue: false }),
    amount: (0, import_fields46.decimal)({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      defaultValue: "0.00"
    }),
    amountCents: (0, import_fields46.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, access: { create: () => false, update: () => false } }),
    reservedOrderDisplayId: (0, import_fields46.integer)({ db: { isNullable: true }, isIndexed: "unique", access: { create: () => false, update: () => false }, validation: { min: 1 }, label: "Reserved order number" }),
    data: (0, import_fields46.json)({ defaultValue: {} }),
    idempotencyKey: (0, import_fields46.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { create: () => false, update: () => false } }),
    cart: (0, import_fields46.relationship)({ ref: "Cart.paymentSessions", access: { create: () => false, update: () => false } }),
    checkoutAttempts: (0, import_fields46.relationship)({ ref: "CheckoutAttempt.paymentSession", many: true }),
    paymentProvider: (0, import_fields46.relationship)({ ref: "PaymentProvider.sessions" }),
    ...trackingFields
  }
});

// features/keystone/models/PaymentWebhookEvent.ts
var import_core46 = require("@keystone-6/core");
var import_fields47 = require("@keystone-6/core/fields");
init_access();
var PaymentWebhookEvent = (0, import_core46.list)({
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
    replayKey: (0, import_fields47.text)({
      isIndexed: "unique",
      validation: { isRequired: true }
    }),
    providerCode: (0, import_fields47.text)({
      validation: { isRequired: true },
      isIndexed: true
    }),
    providerEventId: (0, import_fields47.text)({
      validation: { isRequired: true },
      isIndexed: true
    }),
    providerCreatedAt: (0, import_fields47.timestamp)({ db: { isNullable: true } }),
    providerVersion: (0, import_fields47.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    eventType: (0, import_fields47.text)({
      validation: { isRequired: true }
    }),
    verifiedPayload: (0, import_fields47.json)({ defaultValue: {}, access: { create: () => false, update: () => false } }),
    processingAttempts: (0, import_fields47.integer)({ defaultValue: 0, validation: { min: 0 } }),
    nextAttemptAt: (0, import_fields47.timestamp)({ db: { isNullable: true } }),
    deadLetterAt: (0, import_fields47.timestamp)({ db: { isNullable: true } }),
    lastProcessingError: (0, import_fields47.text)(),
    replayAudit: (0, import_fields47.json)({ defaultValue: [] }),
    payloadHash: (0, import_fields47.text)({
      validation: { isRequired: true }
    }),
    claimToken: (0, import_fields47.text)({
      validation: { isRequired: true },
      access: { read: permissions.canManagePayments }
    }),
    status: (0, import_fields47.select)({
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
    paymentRecordId: (0, import_fields47.text)(),
    store: (0, import_fields47.relationship)({
      ref: "Store.paymentWebhookEvents",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    payment: (0, import_fields47.relationship)({
      ref: "Payment.webhookEvents",
      access: { update: () => false }
    }),
    processedAt: (0, import_fields47.timestamp)(),
    ...trackingFields
  }
});

// features/keystone/models/PickupSlot.ts
var import_core47 = require("@keystone-6/core");
var import_fields48 = require("@keystone-6/core/fields");
init_access();
var PickupSlot = (0, import_core47.list)({
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
    store: (0, import_fields48.relationship)({
      ref: "Store.pickupSlots",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageDelivery, update: () => false }
    }),
    orders: (0, import_fields48.relationship)({ ref: "Order.pickupSlot", many: true, access: { update: () => false } }),
    date: (0, import_fields48.timestamp)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Date",
      ui: {
        description: "Date for this pickup slot"
      }
    }),
    startTime: (0, import_fields48.text)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Start Time",
      ui: {
        description: "Start time for this slot (e.g., '09:00')"
      }
    }),
    endTime: (0, import_fields48.text)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "End Time",
      ui: {
        description: "End time for this slot (e.g., '10:00')"
      }
    }),
    maxOrders: (0, import_fields48.integer)({
      access: { update: () => false },
      validation: { isRequired: true },
      defaultValue: 10,
      label: "Max Orders",
      ui: {
        description: "Maximum number of orders that can be scheduled for this slot"
      }
    }),
    currentOrders: (0, import_fields48.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      label: "Current Orders",
      ui: {
        description: "Current number of orders scheduled for this slot"
      }
    }),
    isActive: (0, import_fields48.checkbox)({
      access: { update: () => false },
      defaultValue: true,
      label: "Operationally active",
      ui: { description: "Operator-owned slot state; capacity changes never reopen a closed slot" }
    }),
    isAvailable: (0, import_fields48.checkbox)({
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
var import_core48 = require("@keystone-6/core");
var import_fields49 = require("@keystone-6/core/fields");
init_access();
var POItem = (0, import_core48.list)({
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
    productTitle: (0, import_fields49.text)({
      access: { create: () => false, update: () => false },
      validation: { isRequired: true },
      label: "Product Title Snapshot"
    }),
    productSku: (0, import_fields49.text)({
      access: { create: () => false, update: () => false },
      label: "Product SKU Snapshot"
    }),
    quantity: (0, import_fields49.decimal)({
      precision: 18,
      scale: 3,
      access: { update: () => false },
      validation: { isRequired: true, min: "0.001" },
      label: "Quantity"
    }),
    unitCost: (0, import_fields49.float)({
      access: { update: () => false },
      validation: { isRequired: true },
      label: "Unit Cost (legacy display)",
      ui: { description: "Legacy display value; unitCostCents is authoritative" }
    }),
    unitCostCents: (0, import_fields49.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      label: "Unit Cost (minor units)"
    }),
    quantityReceived: (0, import_fields49.decimal)({
      precision: 18,
      scale: 3,
      access: { create: () => false, update: () => false },
      defaultValue: "0",
      label: "Quantity Received",
      ui: {
        description: "Actual quantity received (may differ from ordered)"
      }
    }),
    // Relationships
    purchaseOrder: (0, import_fields49.relationship)({
      access: { update: () => false },
      ref: "PurchaseOrder.items",
      label: "Purchase Order"
    }),
    product: (0, import_fields49.relationship)({
      access: { update: () => false },
      ref: "Product",
      label: "Product"
    }),
    ...trackingFields
  }
});

// features/keystone/models/PriceAlert.ts
var import_core49 = require("@keystone-6/core");
var import_fields50 = require("@keystone-6/core/fields");
init_access();
var PriceAlert = (0, import_core49.list)({
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
    user: (0, import_fields50.relationship)({
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
    product: (0, import_fields50.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product display snapshot"
      }
    }),
    productRef: (0, import_fields50.relationship)({
      ref: "Product.priceAlerts",
      access: { create: () => false, update: () => false },
      label: "Product"
    }),
    // Target price the user wants to be notified at
    targetPrice: (0, import_fields50.decimal)({
      validation: { isRequired: true },
      precision: 12,
      scale: 2,
      label: "Target Price",
      ui: {
        description: "Price threshold to trigger the alert"
      }
    }),
    // Current price of the product
    currentPrice: (0, import_fields50.decimal)({
      precision: 12,
      scale: 2,
      label: "Current Price",
      ui: {
        description: "Current price of the product"
      }
    }),
    // Whether the alert has been triggered
    isTriggered: (0, import_fields50.checkbox)({
      defaultValue: false,
      label: "Is Triggered",
      ui: {
        description: "Whether the price alert has been triggered"
      }
    }),
    // When the user was notified
    notifiedAt: (0, import_fields50.timestamp)({
      label: "Notified At",
      ui: {
        description: "When the user was notified about the price drop"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/Product.ts
var import_core50 = require("@keystone-6/core");
var import_fields51 = require("@keystone-6/core/fields");
var import_fields_document = require("@keystone-6/fields-document");
init_access();

// features/keystone/lib/productSkuIdentity.ts
function normalizeProductSku(value) {
  if (value !== null && value !== void 0 && typeof value !== "string") throw new Error("Product SKU must be text");
  const sku = (value || "").trim();
  if (sku.length > 100 || /[\u0000-\u001f\u007f]/.test(sku)) throw new Error("Product SKU must be at most 100 characters without control characters");
  return sku;
}
function deriveProductSkuIdentity(storeId, value) {
  if (!storeId) throw new Error("Product SKU identity requires a Store");
  const sku = normalizeProductSku(value);
  return sku ? JSON.stringify([storeId, sku]) : null;
}

// features/keystone/lib/productInformation.ts
var GROCERY_ALLERGENS = ["milk", "eggs", "fish", "shellfish", "tree_nuts", "peanuts", "wheat", "soybeans", "sesame"];
function initialProductInformation(input, actorId, sourceReference) {
  return { version: 0, actorId, sourceReference, recordedAt: (/* @__PURE__ */ new Date()).toISOString(), allergens: input.allergens || [], nutrition: input.nutrition || {}, unitOfMeasure: input.unitOfMeasure || "each", pricingMethod: input.pricingMethod || "unit", packBaseUnitsMilli: input.packBaseUnitsMilli || 1e3 };
}
function normalizeProductInformation(input) {
  const sourceReference = String(input.sourceReference || "").trim();
  if (sourceReference.length < 3 || sourceReference.length > 500) throw new Error("A bounded product information source reference is required");
  const packBaseUnitsMilli = Number(input.packBaseUnitsMilli ?? 1e3);
  if (!Number.isSafeInteger(packBaseUnitsMilli) || packBaseUnitsMilli < 1 || packBaseUnitsMilli > 1e9) throw new Error("Pack conversion must be positive integer thousandths");
  const nutrition = input.nutrition || {};
  const allowed = ["servingSize", "ingredients", "calories", "fatGrams", "saturatedFatGrams", "carbohydrateGrams", "sugarGrams", "proteinGrams", "sodiumMilligrams"];
  if (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition) || Object.keys(nutrition).some((k) => !allowed.includes(k))) throw new Error("Unsupported nutrition information");
  for (const [key2, value] of Object.entries(nutrition)) {
    if (["servingSize", "ingredients"].includes(key2)) {
      if (typeof value !== "string" || value.length > 5e3) throw new Error("Nutrition text is too long");
    } else if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e5) throw new Error("Nutrition quantities must be nonnegative numbers");
  }
  const variantLabel = String(input.variantLabel || "").trim();
  if (variantLabel.length > 120) throw new Error("Variant label is too long");
  if (input.allergens !== void 0 && (!Array.isArray(input.allergens) || input.allergens.some((value) => !GROCERY_ALLERGENS.includes(value)))) throw new Error("Choose supported allergen declarations");
  return { sourceReference, packBaseUnitsMilli, nutrition, variantLabel, variantOfId: input.variantOfId ? String(input.variantOfId) : null, ...input.allergens === void 0 ? {} : { allergens: [...new Set(input.allergens)].sort() } };
}

// features/keystone/models/Product.ts
async function resolveProductCatalogIdentity({ resolvedData, context, item, operation }) {
  const existingStoreId = item?.storeId;
  const session = context.session;
  let actorStoreId;
  if (session?.itemId) {
    const user = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { storeId: true, privacyErasedAt: true, store: { select: { isActive: true } } } });
    if (!user?.storeId || !user.store?.isActive || user.privacyErasedAt) throw new Error("An active Store account is required for Product writes");
    actorStoreId = user.storeId;
    if (session.data?.store?.id !== actorStoreId) throw new Error("Refresh the active Store session before changing a Product");
  } else if (operation !== "update" || Object.entries(resolvedData).some(([key2, value]) => value !== void 0 && !["stockQuantity", "inStock"].includes(key2))) {
    throw new Error("Catalog identity changes require an active Store account");
  }
  if (operation === "update" && (!existingStoreId || actorStoreId && existingStoreId !== actorStoreId)) throw new Error("Product belongs to another Store");
  const storeId = operation === "update" ? existingStoreId : actorStoreId;
  if (!storeId) throw new Error("A Product must belong to one Store");
  if (resolvedData.store !== void 0 && (!resolvedData.store || resolvedData.store.connect?.id !== storeId || Object.keys(resolvedData.store).some((key2) => key2 !== "connect"))) throw new Error("Product Store ownership cannot be reassigned");
  const sku = normalizeProductSku(resolvedData.sku !== void 0 ? resolvedData.sku : item?.sku);
  if (operation === "update" && ["unitOfMeasure", "pricingMethod"].some((key2) => resolvedData[key2] !== void 0 && resolvedData[key2] !== item?.[key2])) {
    const [lots, orders, purchasing] = await Promise.all([
      context.prisma.inventoryLot.count({ where: { productId: String(item.id) } }),
      context.prisma.orderLineItem.count({ where: { productId: String(item.id) } }),
      context.prisma.pOItem.count({ where: { productId: String(item.id) } })
    ]);
    if (lots + orders + purchasing > 0) throw new Error("Physical units on stocked or historically transacted products are immutable; create a separate SKU");
  }
  return {
    ...resolvedData,
    sku,
    skuIdentity: deriveProductSkuIdentity(storeId, sku),
    priceCents: resolvedData.price !== void 0 ? Math.round(Number(resolvedData.price) * 100) : resolvedData.priceCents,
    costPriceCents: resolvedData.costPrice !== void 0 ? Math.round(Number(resolvedData.costPrice) * 100) : resolvedData.costPriceCents,
    ...operation === "create" ? { store: { connect: { id: storeId } }, initialInformation: initialProductInformation(resolvedData, session.itemId, "operator_catalog_create") } : {}
  };
}
var Product = (0, import_core50.list)({
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
    resolveInput: resolveProductCatalogIdentity,
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
    skuIdentity: (0, import_fields51.text)({
      isIndexed: "unique",
      db: { isNullable: true },
      access: { read: () => false, create: () => false, update: () => false },
      ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" } }
    }),
    variantOf: (0, import_fields51.relationship)({ ref: "Product", access: { create: () => false, update: () => false } }),
    variantLabel: (0, import_fields51.text)({ access: { create: () => false, update: () => false } }),
    packBaseUnitsMilli: (0, import_fields51.integer)({ defaultValue: 1e3, validation: { isRequired: true, min: 1 }, access: { create: () => false, update: () => false } }),
    nutrition: (0, import_fields51.json)({ defaultValue: {}, access: { create: () => false, update: () => false } }),
    informationSource: (0, import_fields51.text)({ access: { create: () => false, update: () => false } }),
    initialInformation: (0, import_fields51.json)({ defaultValue: {}, access: { read: permissions.canManageProducts, create: () => false, update: () => false } }),
    title: (0, import_fields51.text)({
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
    handle: (0, import_fields51.text)({
      isIndexed: "unique",
      label: "Handle",
      ui: {
        description: "URL-friendly identifier"
      }
    }),
    sku: (0, import_fields51.text)({
      label: "SKU",
      ui: {
        description: "Stock Keeping Unit"
      }
    }),
    status: (0, import_fields51.select)({
      type: "enum",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" }
      ],
      defaultValue: "draft",
      validation: { isRequired: true }
    }),
    metadata: (0, import_fields51.json)({ access: { read: permissions.canManageProducts } }),
    // Pricing fields
    price: (0, import_fields51.float)({
      label: "Legacy display price (USD)",
      ui: {
        description: "Product price in dollars"
      },
      validation: { min: 0 }
    }),
    priceCents: (0, import_fields51.integer)({ access: { create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative price (minor units)" }),
    compareAtPrice: (0, import_fields51.float)({
      label: "Compare at Price",
      ui: {
        description: "Original price for sale items"
      },
      validation: { min: 0 }
    }),
    costPrice: (0, import_fields51.float)({
      access: { read: permissions.canManageProducts },
      label: "Cost Price",
      ui: {
        description: "Cost to purchase from supplier"
      },
      validation: { min: 0 }
    }),
    costPriceCents: (0, import_fields51.integer)({ access: { read: permissions.canManageProducts, create: () => false, update: () => false }, defaultValue: 0, validation: { isRequired: true, min: 0 }, label: "Authoritative cost (minor units)" }),
    // Inventory fields
    inStock: (0, import_fields51.checkbox)({
      access: { read: permissions.canManageProducts, create: () => false, update: () => false },
      defaultValue: false,
      label: "In Stock",
      ui: {
        description: "Reporting cache only; public sellability is derived from Store-owned unexpired inventory lots"
      }
    }),
    stockQuantity: (0, import_fields51.decimal)({
      precision: 18,
      scale: 3,
      access: {
        read: permissions.canManageProducts,
        create: () => false,
        update: () => false
      },
      defaultValue: "0",
      label: "Stock Quantity",
      ui: {
        description: "Reporting cache only; public sellable quantity is derived from Store-owned unexpired inventory lots"
      },
      validation: { min: "0" }
    }),
    lowStockThreshold: (0, import_fields51.integer)({
      access: { read: permissions.canManageProducts },
      defaultValue: 10,
      label: "Low Stock Threshold",
      ui: {
        description: "Alert when stock falls below this number"
      }
    }),
    // Media
    imageUrl: (0, import_fields51.text)({
      label: "Image URL",
      ui: {
        description: "Main product image URL"
      }
    }),
    thumbnailUrl: (0, import_fields51.text)({
      label: "Thumbnail URL",
      ui: {
        description: "Small product thumbnail URL"
      }
    }),
    // Grocery-specific fields
    department: (0, import_fields51.select)({
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
    isPerishable: (0, import_fields51.checkbox)({
      defaultValue: false,
      label: "Perishable",
      ui: {
        description: "Product requires refrigeration or has expiration date"
      }
    }),
    shelfLife: (0, import_fields51.integer)({
      label: "Shelf Life (days)",
      ui: {
        description: "Number of days product remains fresh"
      }
    }),
    taxRateBasisPoints: (0, import_fields51.integer)({
      validation: { min: 0, max: 1e4 },
      db: { isNullable: true },
      ui: { description: "Item tax basis points; blank inherits the Store rate, zero is exempt. Confirm your configured policy." }
    }),
    pricingMethod: (0, import_fields51.select)({
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
    unitOfMeasure: (0, import_fields51.select)({
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
    organicCertified: (0, import_fields51.checkbox)({
      defaultValue: false,
      label: "Organic Certified",
      ui: {
        description: "Product is certified organic"
      }
    }),
    allergens: (0, import_fields51.multiselect)({
      access: { update: () => false },
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
    store: (0, import_fields51.relationship)({
      ref: "Store.products",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageProducts, update: () => false }
    }),
    supplier: (0, import_fields51.relationship)({
      access: { read: permissions.canManageProducts },
      ref: "Supplier.products",
      label: "Supplier"
    }),
    departmentRef: (0, import_fields51.relationship)({
      ref: "Department.products",
      label: "Department Reference"
    }),
    inventoryLots: (0, import_fields51.relationship)({
      access: {
        read: permissions.canManageProducts,
        update: () => false
      },
      ref: "InventoryLot.product",
      many: true,
      label: "Inventory Lots"
    }),
    favoriteProducts: (0, import_fields51.relationship)({ ref: "FavoriteProduct.productRef", many: true, access: { update: () => false } }),
    backInStockAlerts: (0, import_fields51.relationship)({ ref: "BackInStockAlert.productRef", many: true, access: { update: () => false } }),
    priceAlerts: (0, import_fields51.relationship)({ ref: "PriceAlert.productRef", many: true, access: { update: () => false } }),
    shoppingListItems: (0, import_fields51.relationship)({ ref: "ShoppingListItem.productRef", many: true, access: { update: () => false } }),
    subscriptions: (0, import_fields51.relationship)({ ref: "Subscription.productRef", many: true, access: { update: () => false } }),
    recipeIngredients: (0, import_fields51.relationship)({ ref: "RecipeIngredient.productRef", many: true, access: { update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/PurchaseOrder.ts
var import_core51 = require("@keystone-6/core");
var import_fields52 = require("@keystone-6/core/fields");
init_access();
function canUpdateDraftPurchaseOrder({ item }) {
  return item.status === "draft";
}
var PurchaseOrder = (0, import_core51.list)({
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
    poNumber: (0, import_fields52.text)({
      access: { update: () => false },
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "PO Number",
      ui: {
        description: "Generated transactionally by the purchase-order draft workflow"
      }
    }),
    idempotencyKey: (0, import_fields52.text)({
      isIndexed: "unique",
      db: { isNullable: true },
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: "hidden" } }
    }),
    supplierName: (0, import_fields52.text)({
      access: { create: () => false, update: () => false },
      validation: { isRequired: true },
      label: "Supplier Name Snapshot"
    }),
    supplierEmail: (0, import_fields52.text)({
      access: { create: () => false, update: () => false },
      label: "Supplier Email Snapshot"
    }),
    orderDate: (0, import_fields52.timestamp)({
      access: { update: () => false },
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
      label: "Order Date"
    }),
    expectedDeliveryDate: (0, import_fields52.timestamp)({
      access: { update: canUpdateDraftPurchaseOrder },
      label: "Expected Delivery Date",
      ui: {
        description: "When we expect to receive this order"
      }
    }),
    status: (0, import_fields52.select)({
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
    totalAmount: (0, import_fields52.float)({
      access: { update: () => false },
      label: "Total Amount (legacy display)",
      ui: { description: "Legacy display value; totalAmountCents is authoritative" }
    }),
    totalAmountCents: (0, import_fields52.integer)({
      access: { create: () => false, update: () => false },
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      label: "Total Amount (minor units)"
    }),
    receivedAt: (0, import_fields52.timestamp)({
      access: { create: () => false, update: () => false },
      label: "Received At",
      ui: {
        description: "When the order was actually received"
      }
    }),
    notes: (0, import_fields52.text)({
      access: { update: canUpdateDraftPurchaseOrder },
      ui: {
        displayMode: "textarea"
      },
      label: "Notes"
    }),
    // Relationships
    store: (0, import_fields52.relationship)({
      ref: "Store.purchaseOrders",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false }
    }),
    supplier: (0, import_fields52.relationship)({
      access: { update: () => false },
      ref: "Supplier.purchaseOrders",
      label: "Supplier"
    }),
    items: (0, import_fields52.relationship)({
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
var import_core52 = require("@keystone-6/core");
var import_fields53 = require("@keystone-6/core/fields");
var Recipe = (0, import_core52.list)({
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
    name: (0, import_fields53.text)({
      validation: { isRequired: true },
      label: "Recipe Name"
    }),
    description: (0, import_fields53.text)({
      label: "Description",
      ui: {
        description: "Brief description of the recipe",
        displayMode: "textarea"
      }
    }),
    instructions: (0, import_fields53.text)({
      validation: { isRequired: true },
      label: "Instructions",
      ui: {
        description: "Step-by-step cooking instructions",
        displayMode: "textarea"
      }
    }),
    prepTime: (0, import_fields53.integer)({
      label: "Prep Time (minutes)",
      ui: {
        description: "Time required for preparation"
      },
      validation: { min: 0 }
    }),
    cookTime: (0, import_fields53.integer)({
      label: "Cook Time (minutes)",
      ui: {
        description: "Time required for cooking"
      },
      validation: { min: 0 }
    }),
    servings: (0, import_fields53.integer)({
      label: "Servings",
      ui: {
        description: "Number of servings this recipe makes"
      },
      validation: { min: 1 }
    }),
    difficulty: (0, import_fields53.select)({
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
    image: (0, import_fields53.text)({
      label: "Image URL",
      ui: {
        description: "URL for the recipe image"
      }
    }),
    categories: (0, import_fields53.json)({
      label: "Categories",
      ui: {
        description: "JSON array of recipe categories (e.g., breakfast, dinner, vegetarian)"
      }
    }),
    // Ingredients relationship
    ingredients: (0, import_fields53.relationship)({
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
var import_core53 = require("@keystone-6/core");
var import_fields54 = require("@keystone-6/core/fields");
var RecipeIngredient = (0, import_core53.list)({
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
    recipe: (0, import_fields54.relationship)({
      ref: "Recipe.ingredients",
      label: "Recipe",
      ui: {
        description: "The recipe this ingredient belongs to"
      }
    }),
    // Product ID (text field as specified)
    product: (0, import_fields54.text)({
      validation: { isRequired: true },
      label: "Product Snapshot",
      ui: {
        description: "Legacy product identifier snapshot"
      }
    }),
    productRef: (0, import_fields54.relationship)({
      ref: "Product.recipeIngredients",
      access: { update: () => false },
      label: "Product"
    }),
    // Quantity needed
    quantity: (0, import_fields54.float)({
      validation: { isRequired: true, min: 0 },
      label: "Quantity",
      ui: {
        description: "Amount of the ingredient needed"
      }
    }),
    // Unit of measurement
    unit: (0, import_fields54.text)({
      label: "Unit",
      ui: {
        description: "Unit of measurement (e.g., 'cups', 'tbsp', 'oz', 'pieces')"
      }
    }),
    // Additional notes
    notes: (0, import_fields54.text)({
      label: "Notes",
      ui: {
        description: "Additional notes (e.g., 'diced', 'melted', 'room temperature')",
        displayMode: "textarea"
      }
    }),
    // Whether the ingredient is optional
    isOptional: (0, import_fields54.checkbox)({
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
var import_core54 = require("@keystone-6/core");
var import_fields55 = require("@keystone-6/core/fields");
var RateLimitBucket = (0, import_core54.list)({
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields55.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    windowStartedAt: (0, import_fields55.timestamp)({ validation: { isRequired: true } }),
    requestCount: (0, import_fields55.integer)({ validation: { isRequired: true, min: 0 } }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core55 = require("@keystone-6/core");
var import_fields56 = require("@keystone-6/core/fields");

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
var GROCERY_STORE_ID = "store_juniper";
function getPublicStoreId() {
  const configuredValue = process.env.PUBLIC_STORE_ID?.trim();
  if (isProduction() && !configuredValue) {
    throw new Error("PUBLIC_STORE_ID is required in production");
  }
  const value = configuredValue || GROCERY_STORE_ID;
  if (isProduction() && value !== GROCERY_STORE_ID) {
    throw new Error(`PUBLIC_STORE_ID must match the migrated Grocery Store id ${GROCERY_STORE_ID}`);
  }
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

// features/keystone/lib/freshInstallAccess.ts
async function isFreshInstallBootstrapWindow(context) {
  if (!context?.prisma?.user?.count || !context.prisma.role?.count) return false;
  const [userCount, roleCount] = await Promise.all([
    context.prisma.user.count(),
    context.prisma.role.count()
  ]);
  return roleCount === 0 && (userCount === 0 || userCount === 1);
}
async function canResolveFreshInstallStore({ session, context }) {
  if (session?.itemId) return true;
  return isFreshInstallBootstrapWindow(context);
}
async function freshInstallStoreQueryFilter(args) {
  if (args.session?.itemId) return currentStoreScopedFilter({ session: args.session });
  if (!await canResolveFreshInstallStore(args)) return false;
  return {
    AND: [
      { id: { equals: getPublicStoreId() } },
      { isActive: { equals: true } }
    ]
  };
}

// features/keystone/models/Role.ts
var Role = (0, import_core55.list)({
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
          const bootstrapStore = await isFreshInstallBootstrapWindow(context) ? await context.prisma.store.findUnique({ where: { id: getPublicStoreId() }, select: { id: true, isActive: true } }) : null;
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
    name: (0, import_fields56.text)({
      validation: { isRequired: true },
      label: "Role Name"
    }),
    // Permission flags
    canManageProducts: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Manage Products"
    }),
    canManageOrders: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Manage Orders"
    }),
    canManagePayments: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Manage Payments"
    }),
    canManageInventory: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Manage Inventory"
    }),
    canManageSuppliers: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Manage Suppliers"
    }),
    canManageDelivery: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Manage Delivery Routes"
    }),
    canManageUsers: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Manage Users"
    }),
    canManageOnboarding: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Manage Onboarding"
    }),
    canAccessDashboard: (0, import_fields56.checkbox)({
      defaultValue: false,
      label: "Can Access Dashboard"
    }),
    // Relationships
    store: (0, import_fields56.relationship)({
      ref: "Store.roles",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    assignedTo: (0, import_fields56.relationship)({
      ref: "User.role",
      many: true,
      access: { update: () => false },
      label: "Assigned To"
    }),
    ...trackingFields
  }
});

// features/keystone/models/ShoppingList.ts
var import_core56 = require("@keystone-6/core");
var import_fields57 = require("@keystone-6/core/fields");
init_access();
var ShoppingList = (0, import_core56.list)({
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
    user: (0, import_fields57.relationship)({
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
    name: (0, import_fields57.text)({
      validation: { isRequired: true },
      label: "Name",
      ui: {
        description: "Name of the shopping list (e.g., 'Weekly Groceries', 'Party Supplies')"
      }
    }),
    // Whether this is the user's default list
    isDefault: (0, import_fields57.checkbox)({
      defaultValue: false,
      label: "Default List",
      ui: {
        description: "Whether this is the user's default shopping list"
      }
    }),
    // Items in this shopping list
    items: (0, import_fields57.relationship)({
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
var import_core57 = require("@keystone-6/core");
var import_fields58 = require("@keystone-6/core/fields");
init_access();
var ShoppingListItem = (0, import_core57.list)({
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
    list: (0, import_fields58.relationship)({
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
    product: (0, import_fields58.text)({
      validation: { isRequired: true },
      label: "Product Snapshot",
      ui: {
        description: "Legacy product name snapshot"
      }
    }),
    productRef: (0, import_fields58.relationship)({
      ref: "Product.shoppingListItems",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
      label: "Product"
    }),
    // Quantity needed
    quantity: (0, import_fields58.integer)({
      defaultValue: 1,
      validation: { isRequired: true, min: 1 },
      label: "Quantity",
      ui: {
        description: "Number of units needed"
      }
    }),
    // Unit of measurement
    unit: (0, import_fields58.text)({
      label: "Unit",
      ui: {
        description: "Unit of measurement (e.g., 'lbs', 'oz', 'each', 'dozen')"
      }
    }),
    // Whether the item has been checked off
    checked: (0, import_fields58.checkbox)({
      defaultValue: false,
      label: "Checked",
      ui: {
        description: "Whether this item has been checked off the list"
      }
    }),
    // Additional notes
    notes: (0, import_fields58.text)({
      label: "Notes",
      ui: {
        description: "Additional notes (e.g., 'organic only', 'brand preference')",
        displayMode: "textarea"
      }
    }),
    // When the item was added
    addedAt: (0, import_fields58.timestamp)({
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
var import_core58 = require("@keystone-6/core");
var import_fields59 = require("@keystone-6/core/fields");
init_access();
async function subscriptionAccessFilter({ session, context }) {
  const store = ownerStoreScopedFilter("user")({ session });
  if (store === false) return false;
  if (await permissions.canManageOrders({ session, context })) return store;
  return session?.itemId ? { AND: [store, { user: { id: { equals: session.itemId } } }] } : false;
}
var Subscription = (0, import_core58.list)({
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
    store: (0, import_fields59.relationship)({ ref: "Store", db: { extendPrismaSchema: requiredRelationshipPrisma }, graphql: { isNonNull: { read: true, create: true } } }),
    idempotencyKey: (0, import_fields59.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    status: (0, import_fields59.select)({ options: ["active", "paused", "cancelled"], defaultValue: "active", validation: { isRequired: true } }),
    scheduleTimezone: (0, import_fields59.text)({ defaultValue: "UTC" }),
    anchorDay: (0, import_fields59.integer)({ validation: { min: 1, max: 31 } }),
    consent: (0, import_fields59.json)(),
    events: (0, import_fields59.json)(),
    lastProcessedAt: (0, import_fields59.timestamp)(),
    // User who owns the subscription
    user: (0, import_fields59.relationship)({
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
    product: (0, import_fields59.text)({
      validation: { isRequired: true },
      isIndexed: true,
      label: "Product Snapshot",
      ui: {
        description: "Legacy product handle snapshot"
      }
    }),
    productRef: (0, import_fields59.relationship)({
      ref: "Product.subscriptions",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { update: () => false },
      label: "Product"
    }),
    // Quantity to deliver each time
    quantity: (0, import_fields59.integer)({
      validation: { isRequired: true, min: 1 },
      defaultValue: 1,
      label: "Quantity",
      ui: {
        description: "Number of items to deliver each time"
      }
    }),
    // Delivery frequency
    frequency: (0, import_fields59.select)({
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
    nextDeliveryDate: (0, import_fields59.timestamp)({
      label: "Next Delivery Date",
      ui: {
        description: "Date of the next scheduled delivery"
      }
    }),
    // Subscription discount percentage
    discount: (0, import_fields59.float)({
      label: "Discount percentage (legacy display)",
      ui: { description: "Legacy display value; discountBps is authoritative" },
      validation: { min: 0, max: 100 },
      defaultValue: 0
    }),
    discountBps: (0, import_fields59.integer)({
      defaultValue: 0,
      validation: { isRequired: true, min: 0, max: 1e4 },
      access: { create: () => false, update: () => false },
      label: "Discount (basis points)"
    }),
    // Whether subscription is currently active
    isActive: (0, import_fields59.checkbox)({
      defaultValue: true,
      label: "Is Active",
      ui: {
        description: "Whether this subscription is currently active"
      }
    }),
    // Paused until date (for temporary pauses)
    pausedUntil: (0, import_fields59.timestamp)({
      label: "Paused Until",
      ui: {
        description: "If set, subscription is paused until this date"
      }
    }),
    ...trackingFields
  }
});

// features/keystone/models/SubstitutionPreference.ts
var import_core59 = require("@keystone-6/core");
var import_fields60 = require("@keystone-6/core/fields");
init_access();
var SubstitutionPreference = (0, import_core59.list)({
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
    user: (0, import_fields60.relationship)({
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
    allowSubstitutions: (0, import_fields60.checkbox)({
      defaultValue: true,
      label: "Allow Substitutions",
      ui: {
        description: "Whether to allow product substitutions when items are out of stock"
      }
    }),
    // Prefer same brand when substituting
    preferSimilarBrand: (0, import_fields60.checkbox)({
      defaultValue: true,
      label: "Prefer Similar Brand",
      ui: {
        description: "When substituting, prefer the same brand if possible"
      }
    }),
    // Prefer same size when substituting
    preferSimilarSize: (0, import_fields60.checkbox)({
      defaultValue: true,
      label: "Prefer Similar Size",
      ui: {
        description: "When substituting, prefer similar size/quantity if possible"
      }
    }),
    // Contact before substituting
    contactBeforeSubstitute: (0, import_fields60.checkbox)({
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
var import_core60 = require("@keystone-6/core");
var import_fields61 = require("@keystone-6/core/fields");
var Store = (0, import_core60.list)({
  access: {
    operation: {
      query: canResolveFreshInstallStore,
      create: () => false,
      update: () => false,
      delete: () => false
    },
    filter: {
      query: freshInstallStoreQueryFilter,
      update: currentStoreScopedFilter,
      delete: currentStoreScopedFilter
    }
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
    code: (0, import_fields61.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { update: () => false } }),
    name: (0, import_fields61.text)({ validation: { isRequired: true } }),
    timezone: (0, import_fields61.text)({ defaultValue: "America/Los_Angeles" }),
    currencyCode: (0, import_fields61.text)({ defaultValue: "USD" }),
    isActive: (0, import_fields61.checkbox)({ defaultValue: true }),
    users: (0, import_fields61.relationship)({ ref: "User.store", many: true }),
    roles: (0, import_fields61.relationship)({ ref: "Role.store", many: true }),
    settings: (0, import_fields61.relationship)({ ref: "StoreSettings.store", many: true }),
    loyaltyPrograms: (0, import_fields61.relationship)({ ref: "LoyaltyProgram.store", many: true }),
    carts: (0, import_fields61.relationship)({ ref: "Cart.store", many: true }),
    orders: (0, import_fields61.relationship)({ ref: "Order.store", many: true }),
    products: (0, import_fields61.relationship)({ ref: "Product.store", many: true }),
    departments: (0, import_fields61.relationship)({ ref: "Department.store", many: true }),
    coupons: (0, import_fields61.relationship)({ ref: "Coupon.store", many: true }),
    suppliers: (0, import_fields61.relationship)({ ref: "Supplier.store", many: true }),
    inventoryLots: (0, import_fields61.relationship)({ ref: "InventoryLot.store", many: true }),
    inventoryAdjustments: (0, import_fields61.relationship)({ ref: "InventoryAdjustment.store", many: true }),
    checkoutAttempts: (0, import_fields61.relationship)({ ref: "CheckoutAttempt.store", many: true }),
    deliverySlots: (0, import_fields61.relationship)({ ref: "DeliverySlot.store", many: true }),
    pickupSlots: (0, import_fields61.relationship)({ ref: "PickupSlot.store", many: true }),
    parkingSpots: (0, import_fields61.relationship)({ ref: "ParkingSpot.store", many: true }),
    deliveryRoutes: (0, import_fields61.relationship)({ ref: "DeliveryRoute.store", many: true }),
    purchaseOrders: (0, import_fields61.relationship)({ ref: "PurchaseOrder.store", many: true }),
    payments: (0, import_fields61.relationship)({ ref: "Payment.store", many: true }),
    orderLineInventoryAllocations: (0, import_fields61.relationship)({ ref: "OrderLineInventoryAllocation.store", many: true }),
    paymentWebhookEvents: (0, import_fields61.relationship)({ ref: "PaymentWebhookEvent.store", many: true }),
    outboxEvents: (0, import_fields61.relationship)({ ref: "GroceryOutboxEvent.store", many: true }),
    ...trackingFields
  }
});

// features/keystone/lib/deliveryPolicy.ts
function normalizeDeliveryPolicy(raw) {
  const value = raw || {};
  const read = (key2, max = 1e8) => {
    const n = Number(value[key2] ?? 0);
    if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(`Invalid ${key2}`);
    return n;
  };
  if (value.version !== void 0 && value.version !== 1) throw new Error("Unsupported delivery policy version");
  if (value.postalPrefixes !== void 0 && !Array.isArray(value.postalPrefixes)) throw new Error("Postal prefixes must be a list");
  const prefixes = (value.postalPrefixes || []).map((s) => {
    if (typeof s !== "string") throw new Error("Invalid postal prefix");
    const normalized = s.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z0-9-]{3,12}$/.test(normalized)) throw new Error("Use explicit postal prefixes of at least three characters");
    return normalized;
  });
  if (prefixes.length > 200) throw new Error("Too many service areas");
  return { version: 1, pickupMinimumCents: read("pickupMinimumCents"), deliveryMinimumCents: read("deliveryMinimumCents"), postalPrefixes: [...new Set(prefixes)], deliveryFeeCents: read("deliveryFeeCents"), feeTaxRateBasisPoints: read("feeTaxRateBasisPoints", 1e4) };
}
function evaluateDeliveryPolicy(raw, method, postalCode, goodsAfterDiscountCents) {
  const policy = normalizeDeliveryPolicy(raw);
  if (!Number.isSafeInteger(goodsAfterDiscountCents) || goodsAfterDiscountCents < 0) throw new Error("Invalid basket amount");
  const minimum = method === "pickup" ? policy.pickupMinimumCents : policy.deliveryMinimumCents;
  if (goodsAfterDiscountCents < minimum) throw new Error(`The ${method} minimum is ${(minimum / 100).toFixed(2)} before tax and fees`);
  if (method === "delivery") {
    const postal = postalCode.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z0-9-]{3,12}$/.test(postal) || !policy.postalPrefixes.some((prefix) => postal.startsWith(prefix))) throw new Error("This address is outside the configured delivery area");
  }
  return { policy, feeCents: method === "delivery" ? policy.deliveryFeeCents : 0, feeTaxRateBasisPoints: method === "delivery" ? policy.feeTaxRateBasisPoints : 0 };
}

// features/keystone/models/StoreSettings.ts
var import_core61 = require("@keystone-6/core");
var import_fields62 = require("@keystone-6/core/fields");
init_access();

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
function integer38(value, fallback, minimum, maximum) {
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
    horizonDays: integer38(configured?.horizonDays, DEFAULT_HORIZON_DAYS, 1, MAX_HORIZON_DAYS),
    cutoffMinutes: integer38(configured?.cutoffMinutes, DEFAULT_CUTOFF_MINUTES, 0, 24 * 60),
    blackoutDates,
    deliveryTemplates,
    pickupTemplates
  };
}
function evaluateFulfillmentWindow({
  hours,
  timeZone,
  date: date2,
  startTime,
  endTime,
  now = /* @__PURE__ */ new Date(),
  applyCutoff = true
}) {
  try {
    assertValidTimeZone(timeZone);
    assertValidRollingFulfillmentPolicy(hours);
    if (!validTemplateTimes(startTime, endTime)) return { allowed: false, reason: "invalid" };
    const dateKey = dateKeyFor(date2, timeZone);
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
  const days = Math.min(policy.horizonDays, integer38(requestedDays, DEFAULT_HORIZON_DAYS, 1, MAX_HORIZON_DAYS));
  const existingDelivery = new Set(deliverySlots.map((slot) => `${dateKeyFor(slot.date, timeZone)}:${templateKey(slot)}`));
  const existingPickup = new Set(pickupSlots.map((slot) => `${dateKeyFor(slot.date, timeZone)}:${templateKey(slot)}`));
  const deliveryCreates = [];
  const pickupCreates = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = zonedDateKeyOffset(now, timeZone, offset);
    const date2 = zonedStartOfDateKey(dateKey, timeZone);
    for (const template of policy.deliveryTemplates) {
      const key2 = `${dateKey}:${templateKey(template)}`;
      if (!template.isActive || existingDelivery.has(key2)) continue;
      if (!evaluateFulfillmentWindow({ hours, timeZone, date: dateKey, startTime: template.startTime, endTime: template.endTime, now }).allowed) continue;
      deliveryCreates.push({ ...template, date: date2, currentBookings: 0 });
    }
    for (const template of policy.pickupTemplates) {
      const key2 = `${dateKey}:${templateKey(template)}`;
      if (!template.isActive || existingPickup.has(key2)) continue;
      if (!evaluateFulfillmentWindow({ hours, timeZone, date: dateKey, startTime: template.startTime, endTime: template.endTime, now }).allowed) continue;
      pickupCreates.push({ ...template, date: date2, currentOrders: 0, isAvailable: true });
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
  const integer42 = Math.round(numeric);
  return (integer42 % 360 + 360) % 360;
}
function effectiveStorefrontBrandHue(value) {
  return normalizeStorefrontBrandHue(value) ?? DEFAULT_STOREFRONT_BRAND_HUE;
}

// features/keystone/models/StoreSettings.ts
var StoreSettings = (0, import_core61.list)({
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
      if (resolvedData.deliveryPolicy !== void 0) {
        try {
          normalizeDeliveryPolicy(resolvedData.deliveryPolicy);
        } catch (error) {
          addValidationError(error instanceof Error ? error.message : "Invalid delivery policy");
        }
      }
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
    store: (0, import_fields62.relationship)({
      ref: "Store.settings",
      db: { extendPrismaSchema: requiredUniqueRelationshipPrisma },
      graphql: { isNonNull: { create: true } },
      access: { create: () => false, update: () => false }
    }),
    name: (0, import_fields62.text)({ validation: { isRequired: true }, defaultValue: "Juniper Market" }),
    tagline: (0, import_fields62.text)({ defaultValue: "Neighborhood grocery \xB7 delivery & curbside pickup" }),
    homepageTitle: (0, import_fields62.text)({ defaultValue: "Fresh from the neighborhood" }),
    homepageDescription: (0, import_fields62.text)({
      defaultValue: "Seasonal produce, pantry staples, and household essentials selected for everyday shopping.",
      ui: { displayMode: "textarea" }
    }),
    contactEmail: (0, import_fields62.text)({ defaultValue: "hello@junipermarket.example" }),
    contactPhone: (0, import_fields62.text)({ defaultValue: "(415) 555-0148" }),
    address: (0, import_fields62.text)({ defaultValue: "184 Juniper Street, San Francisco, CA 94107" }),
    logoUrl: (0, import_fields62.text)({ defaultValue: "/logo.svg" }),
    brandHue: (0, import_fields62.integer)({
      validation: { min: 0, max: 359 },
      label: "Storefront brand hue (0\u2013359)",
      ui: { description: "Leave unset to use the explicit storefront default. Use Platform Settings to choose a supported preset." }
    }),
    currencyCode: (0, import_fields62.text)({ access: { update: () => false }, defaultValue: "USD" }),
    taxRateBps: (0, import_fields62.integer)({ defaultValue: 875, validation: { isRequired: true, min: 0, max: 1e4 }, label: "Default tax rate (basis points)" }),
    locale: (0, import_fields62.text)({ defaultValue: "en-US" }),
    timezone: (0, import_fields62.text)({ defaultValue: "America/Los_Angeles" }),
    countryCode: (0, import_fields62.text)({ defaultValue: "US" }),
    deliveryPolicy: (0, import_fields62.json)({ defaultValue: { version: 1, postalPrefixes: [], pickupMinimumCents: 0, deliveryMinimumCents: 0, deliveryFeeCents: 0, feeTaxRateBasisPoints: 0 }, access: { create: () => false, update: () => false } }),
    hours: (0, import_fields62.json)({
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
    isActive: (0, import_fields62.checkbox)({ access: { update: () => false }, defaultValue: true }),
    ...trackingFields
  }
});

// features/keystone/models/Supplier.ts
var import_core62 = require("@keystone-6/core");
var import_fields63 = require("@keystone-6/core/fields");
init_access();
var Supplier = (0, import_core62.list)({
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
    name: (0, import_fields63.text)({
      validation: { isRequired: true },
      label: "Supplier Name"
    }),
    contactName: (0, import_fields63.text)({
      label: "Contact Name"
    }),
    email: (0, import_fields63.text)({
      validation: { isRequired: true },
      label: "Email"
    }),
    phone: (0, import_fields63.text)({
      label: "Phone"
    }),
    paymentTerms: (0, import_fields63.select)({
      type: "enum",
      options: [
        { label: "Net 30", value: "net_30" },
        { label: "Net 60", value: "net_60" },
        { label: "Cash on Delivery", value: "cod" }
      ],
      defaultValue: "net_30",
      label: "Payment Terms"
    }),
    deliveryDays: (0, import_fields63.multiselect)({
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
    minimumOrder: (0, import_fields63.float)({
      access: { update: () => false },
      label: "Minimum Order Amount (legacy display)",
      ui: { description: "Legacy display value; minimumOrderCents is authoritative" }
    }),
    minimumOrderCents: (0, import_fields63.integer)({
      defaultValue: 0,
      validation: { isRequired: true, min: 0 },
      access: { create: () => false, update: () => false },
      label: "Minimum Order (minor units)"
    }),
    // Relationships
    store: (0, import_fields63.relationship)({
      ref: "Store.suppliers",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: permissions.canManageSuppliers, update: () => false }
    }),
    products: (0, import_fields63.relationship)({
      access: { update: () => false },
      ref: "Product.supplier",
      many: true,
      label: "Products"
    }),
    inventoryLots: (0, import_fields63.relationship)({
      access: { update: () => false },
      ref: "InventoryLot.supplier",
      many: true,
      label: "Inventory Lots"
    }),
    purchaseOrders: (0, import_fields63.relationship)({
      access: { update: () => false },
      ref: "PurchaseOrder.supplier",
      many: true,
      label: "Purchase Orders"
    }),
    ...trackingFields
  }
});

// features/keystone/models/User.ts
var import_core63 = require("@keystone-6/core");
var import_access56 = require("@keystone-6/core/access");
var import_fields64 = require("@keystone-6/core/fields");
init_access();
var User = (0, import_core63.list)({
  access: {
    operation: {
      query: isSignedIn,
      // Account creation is intentionally closed at the generic list boundary.
      // A future public signup flow must use a dedicated, rate-limited contract.
      create: () => false,
      update: async ({ session, context }) => {
        if (!session?.itemId) return false;
        const user = await context.prisma.user.findUnique({ where: { id: session.itemId }, select: { privacyErasedAt: true } });
        return Boolean(user && !user.privacyErasedAt);
      },
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
    name: (0, import_fields64.text)({
      validation: { isRequired: true },
      label: "Name"
    }),
    email: (0, import_fields64.text)({
      validation: { isRequired: true },
      isIndexed: "unique",
      label: "Email"
    }),
    password: (0, import_fields64.password)({
      validation: {
        isRequired: true,
        length: { min: 8, max: 128 }
      },
      access: {
        read: import_access56.denyAll,
        update: ({ session, item }) => session?.itemId === item.id
      }
    }),
    store: (0, import_fields64.relationship)({
      ref: "Store.users",
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      access: { create: () => false, update: () => false }
    }),
    role: (0, import_fields64.relationship)({
      access: { create: () => false, update: () => false },
      ref: "Role.assignedTo",
      label: "Role"
    }),
    paymentRefunds: (0, import_fields64.relationship)({
      ref: "PaymentRefund.requestedBy",
      many: true,
      access: { update: () => false }
    }),
    onboardingStatus: (0, import_fields64.select)({
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
    staffAccessEvents: (0, import_fields64.relationship)({ ref: "StaffAccessEvent.subject", many: true, access: { update: () => false } }),
    privacyErasedAt: (0, import_fields64.timestamp)({ db: { isNullable: true }, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});

// features/keystone/models/UserCoupon.ts
var import_core64 = require("@keystone-6/core");
var import_fields65 = require("@keystone-6/core/fields");
init_access();
var UserCoupon = (0, import_core64.list)({
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
    usedByOrder: (0, import_fields65.relationship)({
      ref: "Order",
      access: { create: () => false, update: () => false },
      ui: { itemView: { fieldMode: "read" } }
    }),
    user: (0, import_fields65.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "User",
      label: "User",
      ui: {
        description: "User who clipped this coupon"
      }
    }),
    coupon: (0, import_fields65.relationship)({
      access: { create: () => false, update: () => false },
      db: { extendPrismaSchema: requiredRelationshipPrisma },
      graphql: { isNonNull: { read: true, create: true } },
      ref: "Coupon.userCoupons",
      label: "Coupon",
      ui: {
        description: "The coupon that was clipped"
      }
    }),
    clippedAt: (0, import_fields65.timestamp)({
      label: "Clipped At",
      ui: {
        description: "When the user clipped this coupon"
      },
      defaultValue: { kind: "now" }
    }),
    usedAt: (0, import_fields65.timestamp)({
      label: "Used At",
      ui: {
        description: "When the coupon was used in an order"
      }
    }),
    used: (0, import_fields65.checkbox)({
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
  InventoryConversion,
  CatalogImport,
  CustomerPrivacyRequest,
  StaffAccessEvent,
  StaffInvitation,
  OrderLineRefund,
  LoyaltyRedemption,
  SubscriptionRun,
  SettlementMatch,
  FinancialClose,
  SupplierCredit,
  SupplierInvoice,
  ProductInformationVersion,
  CustomerMessage,
  PurchaseReceipt,
  InventoryCount,
  InventoryRecall,
  InventoryMovement,
  OrderSettlement,
  OrderLineFulfillment,
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

// features/keystone/mutations/convertInventoryCases.ts
init_access();
init_storeScope();
init_inventoryMovements();

// features/keystone/lib/inventorySafety.ts
function isInventoryLotEligible(lot, promisedAt = /* @__PURE__ */ new Date()) {
  return (lot.safetyStatus || "available") === "available" && (lot.conditionStatus || "accepted") === "accepted" && Number.isFinite(new Date(lot.expirationDate).getTime()) && new Date(lot.expirationDate).getTime() > promisedAt.getTime();
}
function traceAffectedOrders(orders, lotIds) {
  const scope = new Set(lotIds);
  return orders.flatMap((order) => {
    const lines = (order.lineItems || []).flatMap((line) => {
      const allocations = [...line.inventoryAllocations || [], ...line.fulfillment?.allocations || [], ...line.metadata?.inventoryAllocations || []];
      const ids = [line.inventoryLotId, ...allocations.map((allocation) => allocation.inventoryLotId || allocation.lotId)];
      return ids.some((id) => scope.has(id)) ? [{ lineItemId: line.id, lotIds: [...new Set(ids.filter((id) => scope.has(id)))] }] : [];
    });
    return lines.length ? [{ orderId: order.id, status: order.status, customerId: order.userId || order.customerId || null, email: order.email || order.customerEmail || order.user?.email || null, lines }] : [];
  });
}
async function assertOrderInventoryEligible(tx, orderId, storeId, promisedAt = /* @__PURE__ */ new Date()) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { lineItems: { include: { inventoryAllocations: true, fulfillment: true } } } });
  if (!order || order.storeId !== storeId) throw new Error("Order not found in active store");
  const allocations = order.lineItems.flatMap((line) => line.fulfillment ? line.fulfillment.allocations || [] : line.inventoryAllocations?.length ? line.inventoryAllocations : line.metadata?.inventoryAllocations || (line.inventoryLotId ? [{ lotId: line.inventoryLotId, productId: line.productId }] : []));
  const lotIds = [...new Set(allocations.map((allocation) => allocation.lotId || allocation.inventoryLotId))].sort();
  const identities = await tx.inventoryLot.findMany({ where: { id: { in: lotIds }, storeId }, select: { id: true, productId: true } });
  if (identities.length !== lotIds.length) throw new Error("Order allocation lot is missing or outside the active store");
  for (const productId of [...new Set(identities.map((lot) => lot.productId))].sort()) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
  for (const lotId of lotIds) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
    const lot = await tx.inventoryLot.findUnique({ where: { id: lotId } });
    if (!lot || lot.storeId !== storeId || !isInventoryLotEligible(lot, promisedAt)) throw new Error("Order contains held, recalled, quarantined or expired stock; resolve actual goods before fulfillment");
  }
}

// features/keystone/lib/inventoryConversion.ts
var import_node_crypto = require("node:crypto");
init_inventoryMovements();
var conversionHash = (value) => (0, import_node_crypto.createHash)("sha256").update(JSON.stringify(value)).digest("hex");
function splitWholeCaseCost(cases, unitsPerCase, costPerCaseCents) {
  if (![cases, unitsPerCase, costPerCaseCents].every((value) => Number.isSafeInteger(value)) || cases < 1 || unitsPerCase < 2 || costPerCaseCents < 0) throw new Error("Conversion requires whole cases, at least two units per case and integer non-negative case cost");
  const units = BigInt(cases) * BigInt(unitsPerCase), cost = BigInt(cases) * BigInt(costPerCaseCents);
  if (units > BigInt(2147483647) || cost > BigInt(2147483647)) throw new Error("Conversion exceeds supported quantity or cost; use smaller batches");
  const floorCost = cost / units, higherUnits = cost % units;
  const lots = [{ quantity: Number(units - higherUnits), costPerUnitCents: Number(floorCost) }, { quantity: Number(higherUnits), costPerUnitCents: Number(floorCost + BigInt(1)) }].filter((lot) => lot.quantity > 0);
  return { quantityCases: cases, unitsPerCase, destinationQuantity: Number(units), totalCostCents: Number(cost), lots };
}
async function lockInventoryConversionScope(tx, storeId) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-inventory-conversion'), hashtext($1))", storeId);
}
async function unconvertedLotCapacityMilli(tx, storeId, lot) {
  let converted = 0;
  for (let skip = 0; ; skip += 100) {
    const page = await tx.inventoryConversion.findMany({ where: { storeId, sourceInventoryLotId: lot.id }, orderBy: { id: "asc" }, take: 100, skip });
    for (const record2 of page) converted += quantityMilli(record2.quantityCases);
    if (page.length < 100) break;
  }
  const capacity = quantityMilli(lot.quantity) - converted;
  if (!Number.isSafeInteger(capacity) || capacity < 0) throw new Error("Conversion provenance exceeds original received lot quantity");
  return capacity;
}
async function expandConvertedLotScope(tx, storeId, initialLotIds) {
  const known = new Set(initialLotIds), convertedOutMilli = /* @__PURE__ */ new Map(), conversions = [];
  let frontier = [...known];
  while (frontier.length) {
    const next = /* @__PURE__ */ new Set();
    for (let offset = 0; offset < frontier.length; offset += 100) {
      const ids = frontier.slice(offset, offset + 100);
      for (let skip = 0; ; skip += 100) {
        const page = await tx.inventoryConversion.findMany({ where: { storeId, sourceInventoryLotId: { in: ids } }, orderBy: { id: "asc" }, take: 100, skip });
        for (const conversion of page) {
          conversions.push(conversion);
          convertedOutMilli.set(conversion.sourceInventoryLotId, (convertedOutMilli.get(conversion.sourceInventoryLotId) || 0) + quantityMilli(conversion.quantityCases));
          for (const lot of conversion.destinations || []) {
            if (!lot.lotId) throw new Error("Conversion provenance is incomplete");
            if (!known.has(lot.lotId)) {
              known.add(lot.lotId);
              next.add(lot.lotId);
            }
          }
        }
        if (page.length < 100) break;
      }
    }
    frontier = [...next];
  }
  return { lotIds: [...known].sort(), convertedOutMilli, conversions };
}

// features/keystone/mutations/convertInventoryCases.ts
init_serializableTransaction();
async function convertInventoryCases(_root, args, context) {
  await requireFreshCapability(context, "canManageInventory");
  const store = await requireSessionStore(context);
  const reason = args.reason?.trim(), conditionNote = args.conditionNote?.trim(), destinationLocation = args.destinationLocation?.trim() || "";
  if (!["dry_run", "commit"].includes(args.mode) || !reason || reason.length > 500 || !conditionNote || conditionNote.length > 500 || destinationLocation.length > 200 || typeof args.idempotencyKey !== "string" || args.idempotencyKey.length < 12 || args.idempotencyKey.length > 150) throw new Error("Conversion requires mode, reason, condition evidence and a stable request identity");
  const fingerprint = conversionHash({ storeId: store.id, sourceInventoryLotId: args.sourceInventoryLotId, quantityCases: args.quantityCases, reason, conditionNote, destinationLocation });
  const idempotencyKey = conversionHash([store.id, args.idempotencyKey]);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await lockInventoryConversionScope(tx, store.id);
    const prior = await tx.inventoryConversion.findUnique({ where: { idempotencyKey } });
    if (prior) {
      if (prior.storeId !== store.id || prior.inputFingerprint !== fingerprint) throw new Error("Conversion request identity was reused with different physical evidence");
      return { success: true, committed: true, reused: true, conversionId: prior.id, reviewHash: prior.reviewHash, source: prior.sourceSnapshot, destinations: prior.destinations, totalCostCents: prior.totalCostCents, currencyCode: prior.currencyCode };
    }
    const identity2 = await tx.inventoryLot.findUnique({ where: { id: args.sourceInventoryLotId } });
    if (!identity2 || identity2.storeId !== store.id || !identity2.productId) throw new Error("Source lot not found in active Store");
    const originalProduct = await tx.product.findUnique({ where: { id: identity2.productId } });
    if (!originalProduct?.variantOfId) throw new Error("Source product must be a configured case variant of its base product");
    for (const id of [identity2.productId, originalProduct.variantOfId].sort()) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', id);
    await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', identity2.id);
    const lot = await tx.inventoryLot.findUnique({ where: { id: identity2.id } });
    const source = await tx.product.findUnique({ where: { id: identity2.productId } });
    const target = await tx.product.findUnique({ where: { id: originalProduct.variantOfId } });
    if (!lot || !source || !target || lot.storeId !== store.id || source.storeId !== store.id || target.storeId !== store.id || lot.productId !== source.id || source.variantOfId !== target.id || source.id === target.id || target.variantOfId) throw new Error("Conversion products and physical lot must share one Store and an unchanged root relationship");
    if ([source, target].some((product) => product.unitOfMeasure !== "each" || product.pricingMethod !== "unit" || product.status === "archived") || Number(target.packBaseUnitsMilli ?? 1e3) !== 1e3 || Number(source.packBaseUnitsMilli) % 1e3 !== 0) throw new Error("Only whole case-to-each conversion with an integer configured pack factor is supported");
    if (!isInventoryLotEligible(lot)) throw new Error("Held, recalled, quarantined or expired cases cannot be converted");
    if (lot.costPerUnitCents === null || lot.costPerUnitCents === void 0) throw new Error("Source case cost evidence is required");
    const plan = splitWholeCaseCost(args.quantityCases, Number(source.packBaseUnitsMilli) / 1e3, Number(lot.costPerUnitCents));
    const capacity = await unconvertedLotCapacityMilli(tx, store.id, lot);
    if (quantityMilli(lot.quantityRemaining) > capacity || quantityMilli(plan.quantityCases) > capacity) throw new Error("Source stock exceeds the original quantity left after prior case conversions");
    if (quantityMilli(lot.quantityRemaining) < quantityMilli(args.quantityCases) || quantityMilli(source.stockQuantity) < quantityMilli(args.quantityCases)) throw new Error("Conversion exceeds unallocated source stock");
    const supplierLotNumber = lot.supplierLotNumber || lot.lotNumber;
    for (let skip = 0; ; skip += 100) {
      const recalls = await tx.inventoryRecall.findMany({ where: { storeId: store.id }, orderBy: { id: "asc" }, take: 100, skip });
      if (recalls.some((recall) => recall.scope?.productId === target.id || (recall.scope?.lots || []).some((scope) => scope.productId === target.id && scope.supplierId === (lot.supplierId || null) && scope.supplierLotNumber === supplierLotNumber))) throw new Error("The destination product or supplier batch is in a recorded recall scope");
      if (recalls.length < 100) break;
    }
    const receipt = await tx.purchaseReceipt.findFirst({ where: { inventoryLotId: lot.id, storeId: store.id } });
    const sourceSnapshot = { lotId: lot.id, productId: source.id, productTitle: source.title, productSku: source.sku, unitOfMeasure: source.unitOfMeasure, quantityRemaining: Number(lot.quantityRemaining), costPerUnitCents: Number(lot.costPerUnitCents), supplierId: lot.supplierId || null, supplierLotNumber, expirationDate: new Date(lot.expirationDate).toISOString(), receivedDate: new Date(lot.receivedDate).toISOString(), location: lot.location || "", safetyStatus: lot.safetyStatus, conditionStatus: lot.conditionStatus, receiptId: receipt?.id || null, purchaseOrderId: receipt?.purchaseOrderId || null, poItemId: receipt?.poItemId || null, destinationProductId: target.id, destinationProductTitle: target.title, sourceStockQuantity: Number(source.stockQuantity), destinationStockQuantity: Number(target.stockQuantity), unitsPerCase: plan.unitsPerCase, quantityCases: plan.quantityCases };
    const reviewHash = conversionHash({ fingerprint, sourceSnapshot, plan });
    if (args.mode === "dry_run") return { success: true, committed: false, reused: false, conversionId: null, reviewHash, source: sourceSnapshot, destinations: plan.lots, totalCostCents: plan.totalCostCents, currencyCode: store.currencyCode };
    if (args.expectedReviewHash !== reviewHash) throw new Error("Physical conversion changed after review; review the current case stock again");
    const nextSourceLot = (quantityMilli(lot.quantityRemaining) - quantityMilli(plan.quantityCases)) / 1e3, nextSourceStock = (quantityMilli(source.stockQuantity) - quantityMilli(plan.quantityCases)) / 1e3;
    const nextTargetStock = (quantityMilli(target.stockQuantity) + quantityMilli(plan.destinationQuantity)) / 1e3;
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityRemaining: nextSourceLot } });
    await tx.product.update({ where: { id: source.id }, data: { stockQuantity: nextSourceStock, inStock: nextSourceStock > 0 } });
    await tx.product.update({ where: { id: target.id }, data: { stockQuantity: nextTargetStock, inStock: nextTargetStock > 0 } });
    const destinations = [];
    for (const [index, split] of plan.lots.entries()) {
      const child = await tx.inventoryLot.create({ data: { storeId: store.id, productId: target.id, supplierId: lot.supplierId || null, lotNumber: `C-${idempotencyKey.slice(0, 32)}-${index}`, supplierLotNumber, expirationDate: lot.expirationDate, receivedDate: lot.receivedDate, quantity: split.quantity, quantityRemaining: split.quantity, costPerUnitCents: split.costPerUnitCents, costPerUnit: split.costPerUnitCents / 100, location: destinationLocation || lot.location || "", safetyStatus: "available", conditionStatus: "accepted", safetyReason: conditionNote } });
      destinations.push({ lotId: child.id, productId: target.id, ...split, totalCostCents: split.quantity * split.costPerUnitCents, unitOfMeasure: "each", supplierLotNumber, supplierId: lot.supplierId || null, expirationDate: sourceSnapshot.expirationDate, receivedDate: sourceSnapshot.receivedDate });
    }
    const record2 = await tx.inventoryConversion.create({ data: { storeId: store.id, idempotencyKey, inputFingerprint: fingerprint, reviewHash, sourceInventoryLotId: lot.id, sourceProductId: source.id, destinationProductId: target.id, quantityCases: plan.quantityCases, unitsPerCase: plan.unitsPerCase, destinationQuantity: plan.destinationQuantity, totalCostCents: plan.totalCostCents, currencyCode: store.currencyCode, sourceSnapshot, destinations, actorId: context.session.itemId, reason, conditionNote, committedAt: /* @__PURE__ */ new Date() } });
    await appendInventoryMovement(tx, { storeId: store.id, productId: source.id, inventoryLotId: lot.id, sourceType: "case_conversion_out", sourceId: record2.id, idempotencyKey: `conversion:${record2.id}:source`, actorId: context.session.itemId, reason, quantityBefore: lot.quantityRemaining, quantityAfter: nextSourceLot, productStockBefore: source.stockQuantity, productStockAfter: nextSourceStock, metadata: { conversionId: record2.id, valueDeltaCents: -plan.totalCostCents, destinations, conditionNote } });
    let targetBalance = Number(target.stockQuantity);
    for (const child of destinations) {
      const after = (quantityMilli(targetBalance) + quantityMilli(child.quantity)) / 1e3;
      await appendInventoryMovement(tx, { storeId: store.id, productId: target.id, inventoryLotId: child.lotId, sourceType: "case_conversion_in", sourceId: record2.id, idempotencyKey: `conversion:${record2.id}:${child.lotId}`, actorId: context.session.itemId, reason, quantityBefore: 0, quantityAfter: child.quantity, productStockBefore: targetBalance, productStockAfter: after, metadata: { conversionId: record2.id, sourceInventoryLotId: lot.id, sourceProductId: source.id, costPerUnitCents: child.costPerUnitCents, valueDeltaCents: child.totalCostCents, supplierLotNumber, conditionNote } });
      targetBalance = after;
    }
    return { success: true, committed: true, reused: false, conversionId: record2.id, reviewHash, source: sourceSnapshot, destinations, totalCostCents: plan.totalCostCents, currencyCode: store.currencyCode };
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/recoverGroceryPaymentCreation.ts
var import_node_crypto8 = require("node:crypto");
init_access();
init_storeScope();

// features/keystone/lib/checkoutIdentity.ts
init_groceryOutbox();
function checkoutRequestFingerprint(data) {
  if (!data || typeof data !== "object") throw new Error("Checkout request evidence is missing");
  const address = data.deliveryAddress || {};
  const ownerId = data.checkoutOwnerId || null;
  return groceryOutboxPayloadHash({
    cartId: data.cartId,
    ownerId,
    sessionId: ownerId ? null : String(data.sessionId || "").trim() || null,
    email: String(data.email || "").trim().toLowerCase(),
    address: Object.fromEntries(["firstName", "lastName", "address1", "address2", "city", "province", "postalCode", "phone"].map((key2) => [key2, String(address[key2] || "").trim()])),
    fulfillmentMethod: data.fulfillmentMethod,
    deliverySlotId: data.deliverySlotId || null,
    pickupSlotId: data.pickupSlotId || null,
    couponCode: String(data.couponCode || "").trim().toUpperCase(),
    substitutionPreference: data.substitutionPreference,
    deliveryInstructions: String(data.deliveryInstructions || "").trim()
  });
}
function checkoutCartFingerprint(cart) {
  return groceryOutboxPayloadHash({ items: (cart.items || []).map((item) => ({
    id: item.id,
    quantity: item.quantity,
    productId: item.product?.id,
    unitPriceCents: item.product?.priceCents,
    taxRateBasisPoints: item.product?.taxRateBasisPoints ?? null,
    substitutionPreference: item.substitutionPreference || null,
    pricingMethod: item.product?.pricingMethod,
    unitOfMeasure: item.product?.unitOfMeasure
  })).sort((a, b) => a.id.localeCompare(b.id)) });
}
function assertProviderCreationRetry(data, now = Date.now()) {
  if (data?.paymentIntentId) return;
  const raw = data?.firstProviderRequestAt ?? data?.claimedAt;
  if (raw === void 0 || raw === null) return;
  const first = Number(raw);
  if (!Number.isSafeInteger(first) || first <= 0 || first > now || now - first >= 23 * 60 * 60 * 1e3) throw new Error("Payment creation outcome is unknown beyond its safe retry window; operator reconciliation is required");
}
function claimPaymentCreationData(existing, input, token, now = Date.now()) {
  if (existing?.checkoutFingerprint && existing.checkoutFingerprint !== input.checkoutFingerprint) throw new Error("Payment request no longer matches the original customer instructions");
  if (existing?.cartFingerprint && existing.cartFingerprint !== input.cartFingerprint) throw new Error("Payment request no longer matches the original basket");
  if (existing?.status === "completed" || existing?.compensationStatus) throw new Error("Checkout payment has already completed or entered compensation");
  if (existing?.paymentIntentId) return { action: "reuse", data: existing };
  if (existing && Object.keys(existing).length && existing.firstProviderRequestAt == null && existing.claimedAt == null) throw new Error("Unknown legacy payment creation time requires operator reconciliation");
  assertProviderCreationRetry(existing, now);
  if (existing?.creationClaimToken && Number(existing.claimedAt) + 3e4 > now) return { action: "wait", data: existing };
  return { action: "create", data: {
    ...input,
    ...existing,
    checkoutFingerprint: input.checkoutFingerprint,
    cartFingerprint: input.cartFingerprint,
    firstProviderRequestAt: existing?.firstProviderRequestAt ?? existing?.claimedAt ?? now,
    status: "initiating",
    claimedAt: now,
    creationClaimToken: token
  } };
}
async function writePaymentCreationResult(context, input) {
  return context.transaction(async (tc) => {
    const tx = tc.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentSession" WHERE "id"=$1 FOR UPDATE', input.sessionId);
    const session = await tx.paymentSession.findUnique({ where: { id: input.sessionId }, include: { paymentProvider: true } });
    if (!session) throw new Error("Payment session disappeared during creation");
    const current = session.data || {};
    if (input.paymentIntentId && current.paymentIntentId && input.paymentIntentId !== current.paymentIntentId) throw new Error("Provider retry returned a conflicting payment identity");
    if (current.status === "completed" || current.compensationStatus) return session;
    if (input.phase === "unknown") {
      if (current.creationClaimToken !== input.claimToken || current.paymentIntentId) return session;
      return tx.paymentSession.update({ where: { id: session.id }, data: { isInitiated: false, data: {
        ...current,
        status: "unknown",
        creationClaimToken: null,
        error: "Payment initialization requires recovery; retry the same request"
      } }, include: { paymentProvider: true } });
    }
    if (input.phase === "provider_ready" && current.creationClaimToken !== input.claimToken) {
      if (current.paymentIntentId === input.paymentIntentId) return session;
      throw new Error("Payment creation claim changed; retry the same checkout");
    }
    const paymentIntentId = input.paymentIntentId || current.paymentIntentId;
    const clientSecret = input.clientSecret || current.clientSecret;
    const noCharge = input.noCharge || current.noCharge;
    if (noCharge) noChargeCheckoutState({ ...session, data: { ...current, paymentIntentId, noCharge } });
    if (!paymentIntentId || !clientSecret && !noCharge) throw new Error("Payment provider did not return a durable payment identity and client secret");
    if (input.phase === "ready" && current.paymentIntentId !== paymentIntentId) throw new Error("Payment identity changed before checkout recovery was saved");
    return tx.paymentSession.update({ where: { id: session.id }, data: { isInitiated: true, data: {
      ...current,
      paymentIntentId,
      clientSecret: clientSecret || null,
      ...noCharge ? { noCharge } : {},
      status: input.phase === "ready" ? "ready" : "attempt_pending",
      creationClaimToken: input.phase === "ready" ? null : current.creationClaimToken,
      error: null
    } }, include: { paymentProvider: true } });
  });
}
function noChargeCheckoutState(session) {
  const evidence = session?.data?.noCharge;
  if (!evidence) return null;
  if (evidence.version !== 1 || evidence.amountCents !== 0 || evidence.paymentSessionId !== session.id || !["coupon_covers_total", "zero_priced_goods"].includes(evidence.reason) || session.amountCents !== 0 || session.data.amountInCents !== 0 || !session.data.checkoutFingerprint || !session.data.cartFingerprint || session.data.paymentIntentId !== `grocery_no_charge:${session.id}`) throw new Error("Invalid server no-charge checkout evidence");
  return { status: "succeeded", amount: 0, amountCents: 0, capturedAmountCents: 0, currency: "usd", noCharge: evidence };
}
function noChargeOrderPaymentState(payment) {
  if (!payment?.providerData?.noCharge) return null;
  return noChargeCheckoutState({
    id: payment.providerData.noCharge.paymentSessionId,
    amountCents: payment.amountCents,
    data: { ...payment.providerData, paymentIntentId: payment.providerPaymentId }
  });
}
function assertCheckoutAttemptIdentity(attempt, data, cart, session, providerPaymentId) {
  if (!attempt || attempt.providerPaymentId !== providerPaymentId || attempt.providerCode !== session.paymentProvider.code || attempt.storeId !== cart.store.id || attempt.cartId !== cart.id || attempt.paymentSessionId !== session.id || attempt.amountCents !== Number(session.amountCents ?? Math.round(Number(session.amount || 0) * 100)) || attempt.currencyCode !== "usd" || checkoutRequestFingerprint(attempt.requestData) !== checkoutRequestFingerprint(data)) throw new Error("Checkout request differs from the immutable payment instructions");
}

// features/keystone/mutations/recoverGroceryPaymentCreation.ts
init_groceryOutbox();
init_paymentProviderAdapter();

// features/keystone/mutations/submitGroceryOrder.ts
init_storeScope();

// features/keystone/lib/loyaltyAccounting.ts
var import_node_crypto4 = require("node:crypto");
function pointsInteger(value) {
  const valueNumber = Number(value);
  if (!Number.isSafeInteger(valueNumber) || Math.abs(valueNumber) > 2147483647) throw new Error("Loyalty points must fit an integer journal amount");
  return valueNumber;
}
async function lockLoyaltyAccount(tx, storeId, userId) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-loyalty-account'), hashtext($1))", `${storeId}:${userId}`);
}
async function loyaltyBalance(tx, storeId, userId) {
  const aggregate = await tx.loyaltyTransaction.aggregate({ where: { storeId, userId }, _sum: { points: true } });
  return pointsInteger(aggregate._sum.points || 0);
}
async function appendLoyaltyEntry(tx, input) {
  const existing = await tx.loyaltyTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    for (const key2 of ["storeId", "userId", "orderId", "points", "sourceId", "sourceType"]) if ((existing[key2] ?? null) !== (input[key2] ?? null)) throw new Error("Loyalty journal replay conflicts with original evidence");
    return existing;
  }
  const balanceBefore = await loyaltyBalance(tx, input.storeId, input.userId);
  const balanceAfter = pointsInteger(balanceBefore + pointsInteger(input.points));
  return tx.loyaltyTransaction.create({ data: { ...input, balanceBefore, balanceAfter, transactionDate: /* @__PURE__ */ new Date() } });
}
async function reconcileOrderLoyalty(tx, input) {
  if (!input.settled) return null;
  if (!Number.isSafeInteger(input.netGoodsCents) || input.netGoodsCents < 0) throw new Error("Loyalty requires final non-negative net goods cents");
  const order = await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true, storeId: true, userId: true } });
  if (!order || order.storeId !== input.storeId) throw new Error("Loyalty order is outside the active store");
  if (!order.userId) return null;
  await lockLoyaltyAccount(tx, input.storeId, order.userId);
  const original = await tx.loyaltyTransaction.findFirst({ where: { storeId: input.storeId, orderId: order.id, sourceType: "final_order_goods" }, orderBy: { createdAt: "asc" } });
  const program = original?.programId ? await tx.loyaltyProgram.findUnique({ where: { id: original.programId } }) : await tx.loyaltyProgram.findFirst({ where: { storeId: input.storeId, isActive: true }, orderBy: { id: "asc" } });
  if (!program && !original) return null;
  const policy = original?.metadata?.earnPolicy || { earnPointsPer100Cents: Number(program.earnPointsPer100Cents), refundDebtPolicy: program.refundDebtPolicy };
  const targetPoints = pointsInteger(Number(BigInt(input.netGoodsCents) * BigInt(policy.earnPointsPer100Cents) / BigInt(100)));
  const prior = await tx.loyaltyTransaction.aggregate({ where: { storeId: input.storeId, userId: order.userId, orderId: order.id, sourceType: "final_order_goods" }, _sum: { points: true } });
  const delta = targetPoints - Number(prior._sum.points || 0);
  const idempotencyKey = `order-loyalty:${input.orderId}:${input.sourceId}`;
  const replay = await tx.loyaltyTransaction.findUnique({ where: { idempotencyKey } });
  if (replay) {
    if (replay.metadata?.netGoodsCents !== input.netGoodsCents || replay.storeId !== input.storeId) throw new Error("Final goods loyalty replay differs from original settlement");
    return replay;
  }
  if (delta < 0 && policy.refundDebtPolicy !== "offset_future_earnings") throw new Error("A configured refund debt policy is required to reverse spent points");
  return appendLoyaltyEntry(tx, { storeId: input.storeId, userId: order.userId, programId: original?.programId || program?.id, orderId: order.id, sourceId: input.sourceId, sourceType: "final_order_goods", idempotencyKey, actorId: input.actorId, description: input.reason, type: delta < 0 ? "refund_deducted" : "earned_purchase", points: delta, metadata: { netGoodsCents: input.netGoodsCents, targetPoints, earnPolicy: policy, debtPolicy: "Refund debt offsets future earnings; redemption requires positive available balance." } });
}
async function validateLoyaltyCoupon(tx, couponId, userId, storeId) {
  const redemption = await tx.loyaltyRedemption.findFirst({ where: { couponId } });
  if (!redemption) return null;
  if (!userId || redemption.storeId !== storeId || redemption.userId !== userId || redemption.status !== "issued") throw new Error("Loyalty coupon belongs to another customer or is no longer available");
  return redemption;
}
async function markLoyaltyRedemptionUsed(tx, couponId, orderId, storeId) {
  const redemption = await tx.loyaltyRedemption.findFirst({ where: { couponId } });
  if (!redemption) return null;
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { storeId: true, userId: true } });
  if (!order || order.storeId !== storeId || redemption.storeId !== storeId || redemption.userId !== order.userId) throw new Error("Loyalty redemption and order ownership differ");
  if (redemption.status === "used" && redemption.orderId === orderId) return redemption;
  if (redemption.status !== "issued") throw new Error("Loyalty redemption has already been consumed");
  return tx.loyaltyRedemption.update({ where: { id: redemption.id }, data: { status: "used", orderId, usedAt: /* @__PURE__ */ new Date(), events: [...redemption.events || [], { action: "used", orderId, at: (/* @__PURE__ */ new Date()).toISOString() }] } });
}
async function restoreLoyaltyRedemptionForOrder(tx, input) {
  const redemptions = await tx.loyaltyRedemption.findMany({ where: { storeId: input.storeId, orderId: input.orderId, status: "used" } });
  for (const redemption of redemptions) {
    await lockLoyaltyAccount(tx, input.storeId, redemption.userId);
    await appendLoyaltyEntry(tx, { storeId: input.storeId, userId: redemption.userId, programId: redemption.programId, orderId: input.orderId, sourceId: input.sourceId, sourceType: "redemption_reversal", idempotencyKey: `loyalty-reversal:${redemption.id}`, description: input.reason, points: redemption.points, type: "adjusted", metadata: { redemptionId: redemption.id } });
    await tx.loyaltyRedemption.update({ where: { id: redemption.id }, data: { status: "reversed", events: [...redemption.events || [], { action: "reversed", sourceId: input.sourceId, at: (/* @__PURE__ */ new Date()).toISOString(), reason: input.reason }] } });
    await tx.coupon.update({ where: { id: redemption.couponId }, data: { isActive: false } });
  }
}
var loyaltyCouponCode = (key2) => `REWARD-${(0, import_node_crypto4.createHash)("sha256").update(key2).digest("hex").slice(0, 24).toUpperCase()}`;

// features/keystone/lib/recurringOrders.ts
init_groceryOutbox();
init_inventoryMovements();
function localParts(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const number2 = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: number2("year"), month: number2("month"), day: number2("day"), hour: number2("hour"), minute: number2("minute"), second: number2("second") };
}
function subscriptionAnchorDay(value, timezone) {
  return localParts(value, timezone).day;
}
function advanceSubscriptionDate(current, frequency, timezone, anchorDay = subscriptionAnchorDay(current, timezone)) {
  if (!Number.isFinite(current.getTime()) || !["weekly", "biweekly", "monthly"].includes(frequency)) throw new Error("Subscription frequency or date is invalid");
  const parts = localParts(current, timezone);
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  if (frequency === "monthly") {
    calendar.setUTCDate(1);
    calendar.setUTCMonth(calendar.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, 0)).getUTCDate();
    calendar.setUTCDate(Math.min(anchorDay, lastDay));
  } else calendar.setUTCDate(calendar.getUTCDate() + (frequency === "weekly" ? 7 : 14));
  const desired = calendar.getTime();
  let candidate = desired;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const observed = localParts(new Date(candidate), timezone);
    const local = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const delta = desired - local;
    if (delta === 0) return new Date(candidate);
    candidate += delta;
  }
  const adjusted = localParts(new Date(candidate), timezone);
  if (Date.UTC(adjusted.year, adjusted.month - 1, adjusted.day, adjusted.hour, adjusted.minute, adjusted.second) < desired) candidate += 36e5;
  return new Date(candidate);
}
function nextSubscriptionOccurrence(subscription, after) {
  let next = new Date(subscription.nextDeliveryDate);
  let skippedOccurrences = 0;
  do {
    next = advanceSubscriptionDate(next, subscription.frequency, subscription.scheduleTimezone || "UTC", subscription.anchorDay || void 0);
    skippedOccurrences += 1;
    if (skippedOccurrences > 1e4) throw new Error("Subscription schedule requires manual date review");
  } while (next <= after);
  return { next, skippedOccurrences: Math.max(0, skippedOccurrences - 1) };
}
async function prepareSubscriptionRun(tx, subscriptionId, storeId, now = /* @__PURE__ */ new Date()) {
  const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.storeId !== storeId) throw new Error("Subscription not found in active store");
  if (subscription.status === "cancelled" || !subscription.isActive || subscription.pausedUntil && new Date(subscription.pausedUntil) > now || subscription.status === "paused" && !subscription.pausedUntil) return null;
  if (!subscription.consent?.approveEachOrder) return null;
  if (!subscription.nextDeliveryDate || new Date(subscription.nextDeliveryDate) > now) return null;
  const key2 = `subscription:${subscription.id}:${new Date(subscription.nextDeliveryDate).toISOString()}`;
  let run = await tx.subscriptionRun.findUnique({ where: { idempotencyKey: key2 } });
  if (run && ["awaiting_checkout", "ordered", "skipped", "cancelled"].includes(run.status)) return run;
  const user = await tx.user.findUnique({ where: { id: subscription.userId }, select: { id: true, storeId: true, email: true } });
  if (!user || user.storeId !== storeId) throw new Error("Subscription customer no longer belongs to this store");
  const product = await tx.product.findUnique({ where: { id: subscription.productRefId }, include: { inventoryLots: true } });
  const sellable = (product?.inventoryLots || []).filter((lot) => lot.storeId === storeId && isInventoryLotEligible(lot, now)).reduce((sum, lot) => sum + quantityMilli(lot.quantityRemaining), 0) / 1e3;
  let status = !product || product.storeId !== storeId || product.status !== "published" || sellable < subscription.quantity ? "blocked_stock" : "awaiting_checkout";
  let reason = status === "blocked_stock" ? "Product is unavailable or lacks eligible stock for the recurring basket." : "";
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-cart-identity'), hashtext($1))", `user:${user.id}`);
  let cart = await tx.cart.findUnique({ where: { customerId: user.id }, include: { items: true } });
  if (cart && cart.storeId !== storeId) throw new Error("Subscription cart belongs to another store");
  if (cart) await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', cart.id);
  await tx.$queryRawUnsafe('SELECT "id" FROM "Subscription" WHERE "id" = $1 FOR UPDATE', subscriptionId);
  if (subscription.status === "paused" && subscription.pausedUntil && new Date(subscription.pausedUntil) <= now) await tx.subscription.update({ where: { id: subscription.id }, data: { status: "active", pausedUntil: null } });
  const activeRun = cart ? await tx.subscriptionRun.findFirst({ where: { cartId: cart.id, status: "awaiting_checkout" } }) : null;
  if (status === "awaiting_checkout" && ((cart?.items || []).length || activeRun)) {
    status = "blocked_cart";
    reason = "Complete or clear your current basket before preparing this occurrence.";
  }
  const data = { storeId, subscriptionId, userId: user.id, productId: subscription.productRefId, productTitle: product?.title || subscription.product, quantity: subscription.quantity, priceCents: Number(product?.priceCents || 0), dueAt: new Date(subscription.nextDeliveryDate), status, failureReason: reason };
  if (run) run = await tx.subscriptionRun.update({ where: { id: run.id }, data: { ...data, events: [...run.events || [], { action: "retry", status, reason, at: now.toISOString() }] } });
  else run = await tx.subscriptionRun.create({ data: { ...data, idempotencyKey: key2, events: [{ action: "scheduled", status, reason, at: now.toISOString() }] } });
  if (status === "awaiting_checkout") {
    if (!cart) cart = await tx.cart.create({ data: { storeId, customerId: user.id, sessionId: `user:${user.id}`, itemCount: 0, subtotal: 0, subtotalCents: 0 } });
    const subtotalCents = Number(product.priceCents) * subscription.quantity;
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0 || subtotalCents > 2147483647) throw new Error("Recurring basket price exceeds supported minor-unit bounds");
    const cartItem = await tx.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: subscription.quantity, subtotalCents, subtotal: subtotalCents / 100, substitutionPreference: "contact" } });
    await tx.cart.update({ where: { id: cart.id }, data: { itemCount: subscription.quantity, subtotalCents, subtotal: subtotalCents / 100 } });
    run = await tx.subscriptionRun.update({ where: { id: run.id }, data: { cartId: cart.id, cartItemId: cartItem.id } });
    await enqueueGroceryOutboxEvent(tx, { storeId, eventKey: `subscription.cart_ready:${run.id}`, eventType: "subscription.cart_ready", aggregateType: "SubscriptionRun", aggregateId: run.id, occurredAt: now.toISOString(), payload: { subscriptionId, runId: run.id, userId: user.id, email: user.email, cartId: cart.id, productTitle: product.title, quantity: subscription.quantity, checkoutPath: "/checkout", requiresCustomerApproval: true } });
  }
  return run;
}
async function completeSubscriptionRunForCart(tx, cartId, orderId, storeId, userId) {
  const runs = await tx.subscriptionRun.findMany({ where: { cartId, status: "awaiting_checkout" } });
  if (!runs.length) return null;
  if (runs.length > 1) throw new Error("Recurring cart has conflicting pending occurrences");
  const run = runs[0];
  if (!userId || run.storeId !== storeId || run.userId !== userId) throw new Error("Recurring checkout belongs to another customer");
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { lineItems: true } });
  if (!order || order.storeId !== storeId || order.userId !== userId) throw new Error("Recurring order ownership is invalid");
  const containsProduct = (order.lineItems || []).some((line) => line.productId === run.productId);
  await tx.$queryRawUnsafe('SELECT "id" FROM "Subscription" WHERE "id" = $1 FOR UPDATE', run.subscriptionId);
  const subscription = await tx.subscription.findUnique({ where: { id: run.subscriptionId } });
  if (!subscription || subscription.storeId !== storeId) throw new Error("Recurring subscription is unavailable");
  const { next, skippedOccurrences } = nextSubscriptionOccurrence(subscription, /* @__PURE__ */ new Date());
  await tx.subscription.update({ where: { id: subscription.id }, data: { nextDeliveryDate: next, events: [...subscription.events || [], { action: containsProduct ? "ordered" : "basket_item_removed", orderId, runId: run.id, skippedOccurrences, at: (/* @__PURE__ */ new Date()).toISOString() }] } });
  return tx.subscriptionRun.update({ where: { id: run.id }, data: { status: containsProduct ? "ordered" : "skipped", orderId, events: [...run.events || [], { action: containsProduct ? "ordered" : "basket_item_removed", orderId, at: (/* @__PURE__ */ new Date()).toISOString() }] } });
}

// features/keystone/mutations/submitGroceryOrder.ts
init_inventoryMovements();

// features/keystone/lib/couponRedemptions.ts
async function consumeOrderCoupon(tx, input) {
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.storeId !== input.storeId || (order.userId || null) !== (input.userId || null) || order.metadata?.coupon?.id !== input.couponId) throw new Error("Coupon consumption must belong to the current order and Store");
  const previous = order.metadata?.couponConsumption;
  if (previous) {
    if (previous.orderId !== order.id || previous.couponId !== input.couponId || previous.storeId !== input.storeId) throw new Error("Coupon consumption identity conflicts with this order");
    return { ...previous, reused: true };
  }
  const coupon = await tx.coupon.findUnique({ where: { id: input.couponId } });
  if (!coupon || coupon.storeId !== input.storeId) throw new Error("Coupon belongs to another Store");
  const consumedAt = /* @__PURE__ */ new Date();
  let clipId = null;
  if (input.userId) {
    const candidate = await tx.userCoupon.findFirst({ where: { userId: input.userId, couponId: input.couponId, used: false }, orderBy: [{ clippedAt: "asc" }, { id: "asc" }] });
    if (candidate) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "UserCoupon" WHERE "id"=$1 FOR UPDATE', candidate.id);
      const clip = await tx.userCoupon.findUnique({ where: { id: candidate.id } });
      if (clip && clip.userId === input.userId && clip.couponId === input.couponId && !clip.used) {
        await tx.userCoupon.update({ where: { id: clip.id }, data: { used: true, usedAt: consumedAt, usedByOrderId: order.id } });
        clipId = clip.id;
      }
    }
  }
  const currentUsesBefore = Number(coupon.currentUses || 0);
  if (!Number.isSafeInteger(currentUsesBefore) || currentUsesBefore < 0) throw new Error("Coupon usage counter is invalid");
  await tx.coupon.update({ where: { id: coupon.id }, data: { currentUses: currentUsesBefore + 1 } });
  const consumption = { orderId: order.id, couponId: coupon.id, storeId: input.storeId, userId: input.userId || null, clipId, consumedAt: consumedAt.toISOString(), currentUsesBefore };
  await tx.order.update({ where: { id: order.id }, data: { metadata: { ...order.metadata || {}, couponConsumption: consumption } } });
  return { ...consumption, reused: false };
}
async function releaseOrderCoupon(tx, input) {
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.storeId !== input.storeId) throw new Error("Coupon release order is outside the active Store");
  const metadata = order.metadata || {}, consumption = metadata.couponConsumption;
  const couponId = consumption?.couponId || metadata.coupon?.id;
  if (!couponId) return { released: false, reused: false, metadata };
  if (metadata.couponRelease || metadata.cancellation?.couponRedemptionReleased) return { released: true, reused: true, metadata };
  if (consumption && (consumption.orderId !== order.id || consumption.storeId !== input.storeId || (consumption.userId || null) !== (order.userId || null) || metadata.coupon?.id !== couponId)) throw new Error("Coupon consumption owner differs from the released order");
  await tx.$queryRawUnsafe('SELECT "id" FROM "Coupon" WHERE "id"=$1 FOR UPDATE', couponId);
  const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
  if (coupon && coupon.storeId !== input.storeId) throw new Error("Coupon release cannot change another Store");
  let clipRestored = false;
  if (consumption?.clipId && order.userId) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "UserCoupon" WHERE "id"=$1 FOR UPDATE', consumption.clipId);
    const clip = await tx.userCoupon.findUnique({ where: { id: consumption.clipId } });
    if (clip && clip.userId === order.userId && clip.couponId === couponId && clip.used && clip.usedByOrderId === order.id) {
      await tx.userCoupon.update({ where: { id: clip.id }, data: { used: false, usedAt: null, usedByOrderId: null } });
      clipRestored = true;
    }
  }
  const currentUsesBefore = Number(coupon?.currentUses || 0);
  if (!Number.isSafeInteger(currentUsesBefore) || currentUsesBefore < 0) throw new Error("Coupon usage counter is invalid");
  if (coupon && currentUsesBefore > 0) await tx.coupon.update({ where: { id: couponId }, data: { currentUses: currentUsesBefore - 1 } });
  const release = { orderId: order.id, couponId, sourceId: input.sourceId, reason: input.reason, releasedAt: (/* @__PURE__ */ new Date()).toISOString(), counterDecremented: Boolean(coupon && currentUsesBefore > 0), clipRestored, clipId: consumption?.clipId || null, evidenceKind: consumption ? "order_consumption" : "legacy_coupon_snapshot_no_clip_link" };
  const nextMetadata = { ...metadata, couponRelease: release };
  await tx.order.update({ where: { id: order.id }, data: { metadata: nextMetadata } });
  return { released: true, reused: false, metadata: nextMetadata };
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

// features/keystone/lib/commercialPricing.ts
function cents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Money must be nonnegative integer minor units");
  return value;
}
function allocateCents(amount, lines) {
  cents(amount);
  if (new Set(lines.map((l) => l.id)).size !== lines.length) throw new Error("Duplicate commercial line identity");
  const total = lines.reduce((n, l) => n + cents(l.basis), 0);
  if (!Number.isSafeInteger(total) || amount > total) throw new Error("Allocation exceeds eligible line value");
  const rows = lines.map((l) => {
    const product = BigInt(amount) * BigInt(l.basis);
    return { id: l.id, value: total ? Number(product / BigInt(total)) : 0, remainder: total ? product % BigInt(total) : BigInt(0) };
  });
  let remaining = amount - rows.reduce((n, l) => n + l.value, 0);
  for (const row of [...rows].sort((a, b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining-- > 0) row.value++;
  }
  return new Map(rows.map((l) => [l.id, l.value]));
}
function priceCommercialLines(lines, discountCents = 0, feeCents = 0, feeTaxRateBasisPoints = 0) {
  if (lines.length > 500) throw new Error("Order has too many commercial lines");
  cents(feeCents);
  const eligible = lines.filter((l) => l.discountEligible !== false);
  const discounts = allocateCents(discountCents, eligible.map((l) => ({ id: l.id, basis: l.subtotalCents })));
  const priced = lines.map((l) => {
    const subtotalCents2 = cents(l.subtotalCents);
    const rate = normalizeTaxRateBps(l.taxRateBasisPoints);
    const discount = discounts.get(l.id) || 0;
    const taxCents2 = Number((BigInt(subtotalCents2 - discount) * BigInt(rate) + BigInt(5e3)) / BigInt(1e4));
    return { ...l, discountCents: discount, taxCents: taxCents2, totalCents: subtotalCents2 - discount + taxCents2 };
  });
  const feeTaxCents = Number((BigInt(feeCents) * BigInt(normalizeTaxRateBps(feeTaxRateBasisPoints)) + BigInt(5e3)) / BigInt(1e4));
  const subtotalCents = priced.reduce((n, l) => n + l.subtotalCents, 0);
  const taxCents = priced.reduce((n, l) => n + l.taxCents, feeTaxCents);
  const totalCents = cents(subtotalCents - discountCents + taxCents + feeCents);
  return { lines: priced, subtotalCents, discountCents, taxCents, feeCents, feeTaxCents, totalCents };
}
function isCouponLineEligible(product, coupon) {
  if (!coupon) return true;
  const categories = Array.isArray(coupon.productCategories) ? coupon.productCategories : [];
  const excluded = Array.isArray(coupon.excludedProducts) ? coupon.excludedProducts : [];
  return !!product?.id && (!categories.length || categories.includes(product.department)) && !excluded.includes(product.id);
}

// features/keystone/mutations/submitGroceryOrder.ts
var import_node_crypto7 = require("node:crypto");

// features/keystone/utils/guestOrderToken.ts
var import_node_crypto5 = require("node:crypto");
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
  return (0, import_node_crypto5.createHmac)("sha256", tokenSecret()).update(`${TOKEN_VERSION}:${orderId}:${sessionId}:${issuedAtSeconds}`).digest("base64url");
}
function v1Signature(orderId, sessionId) {
  return (0, import_node_crypto5.createHmac)("sha256", tokenSecret()).update(`${LEGACY_TOKEN_VERSION}:${orderId}:${sessionId}`).digest("base64url");
}
function signaturesMatch(expectedSignature, suppliedSignature) {
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && (0, import_node_crypto5.timingSafeEqual)(expected, supplied);
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

// features/keystone/mutations/submitGroceryOrder.ts
init_paymentProviderAdapter();
init_groceryOutbox();
init_serializableTransaction();

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
  return Math.max(0, Math.min(eligibleSubtotalCents, discountCents)) / 100;
}

// features/keystone/lib/sellableInventory.ts
init_inventoryMovements();
function deriveSellableQuantity(product, storeId, now = /* @__PURE__ */ new Date()) {
  if (product.store?.id !== storeId) return 0;
  const unexpiredLotQuantity = (product.inventoryLots || []).reduce((total, lot) => {
    if (lot.store?.id !== storeId) return total;
    const remaining = Math.max(0, quantityMilli(lot.quantityRemaining || 0) / 1e3);
    return remaining > 0 && isInventoryLotEligible(lot, now) ? (quantityMilli(total) + quantityMilli(remaining)) / 1e3 : total;
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
  if (quantityMilli(requestedQuantity) < 0) throw new Error("Requested quantity cannot be negative");
  let remaining = requestedQuantity;
  const allocations = [];
  const candidates = [...lots].filter((lot) => lot.store?.id === storeId && Number(lot.quantityRemaining || 0) > 0 && isInventoryLotEligible(lot, now)).sort((left, right) => new Date(left.expirationDate).getTime() - new Date(right.expirationDate).getTime() || String(left.id || "").localeCompare(String(right.id || "")));
  for (const lot of candidates) {
    if (remaining === 0) break;
    const quantity = Math.min(remaining, quantityMilli(lot.quantityRemaining || 0) / 1e3);
    allocations.push({ lot, quantity });
    remaining = (quantityMilli(remaining) - quantityMilli(quantity)) / 1e3;
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
      inventoryLots { expirationDate quantityRemaining safetyStatus conditionStatus store { id } }
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

// features/keystone/utils/checkoutAttemptLease.ts
var import_node_crypto6 = require("node:crypto");
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
  const leaseToken = (0, import_node_crypto6.randomUUID)();
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
         SET "idempotencyKey" = "CheckoutAttempt"."idempotencyKey"
       RETURNING "id", "status"::text AS "status", "order" AS "orderId"`,
      (0, import_node_crypto7.randomUUID)(),
      idempotencyKey,
      session.paymentProvider.code,
      providerPaymentId,
      Number(session.amountCents ?? Math.round(Number(session.amount || 0) * 100)),
      JSON.stringify(data),
      cart.store.id,
      cart.id,
      session.id
    );
    if (!attempts[0]) throw new Error("Unable to establish checkout attempt");
    const frozen = await tx.checkoutAttempt.findUnique({ where: { id: attempts[0].id } });
    assertCheckoutAttemptIdentity(frozen, data, cart, session, providerPaymentId);
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
          stockQuantity
          taxRateBasisPoints
          pricingMethod
          unitOfMeasure
          department
          imageUrl
          status
          store { id }
          inventoryLots {
            id
            expirationDate
            quantityRemaining
            safetyStatus
            conditionStatus
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
    const noCharge = noChargeCheckoutState({ id: claim.paymentSessionId, amountCents: claim.amountCents, data: paymentSessionBeforeRefund?.data });
    const state = noCharge || await getPaymentStatus({ provider, paymentId: claim.providerPaymentId });
    const isAuthorization = ["requires_capture", "authorized", "canceled", "cancelled"].includes(state.status);
    const result = noCharge ? { status: "succeeded", amount: 0, data: { id: claim.providerPaymentId } } : isAuthorization ? await cancelPayment({ provider, paymentId: claim.providerPaymentId, idempotencyKey: eventKey }) : await refundPayment({
      provider,
      paymentId: claim.providerPaymentId,
      amount: fullRefund ? void 0 : claim.amountCents,
      idempotencyKey: eventKey
    });
    compensation = {
      status: ["succeeded", "canceled", "cancelled"].includes(result.status) ? "refunded" : "refund_required",
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
async function lockCheckoutRows(transactionContext, data, finalizationLease, ownerId) {
  const tx = transactionContext.prisma;
  if (ownerId) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', ownerId);
    const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { id: true, privacyErasedAt: true } });
    if (!owner || owner.privacyErasedAt) throw new Error("Checkout customer is no longer active");
  }
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
function calculateTotals(cart, deliverySlot, fulfillmentMethod, taxRateBps, discount = 0, coupon = null, feeTaxRateBasisPoints = 0) {
  const subtotalCents = cart.items.reduce(
    (sum, item) => sum + Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity,
    0
  );
  const discountCents = Math.round(discount * 100);
  const feeCents = fulfillmentMethod === "delivery" ? Number(deliverySlot?.deliveryFee || 0) : 0;
  const commercial = priceCommercialLines(cart.items.map((item) => ({
    id: item.id,
    subtotalCents: Number(item.product.priceCents) * item.quantity,
    taxRateBasisPoints: item.product.taxRateBasisPoints ?? taxRateBps,
    discountEligible: isCouponLineEligible(item.product, coupon)
  })), discountCents, feeCents, feeTaxRateBasisPoints);
  const taxCents = commercial.taxCents;
  const deliveryFeeCents = fulfillmentMethod === "delivery" ? Number(deliverySlot?.deliveryFee || 0) : 0;
  const totalCents = Math.max(0, subtotalCents + taxCents + deliveryFeeCents - discountCents);
  return {
    commercialLines: commercial.lines,
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
    await lockCheckoutRows(transactionContext, data, finalizationLease, sessionUserId);
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
      tx.storeSettings.findFirst({ where: { storeId, isActive: true }, select: { hours: true, deliveryPolicy: true } })
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
    const promiseEndsAt = zonedDateTimeForDateKey(zonedDateKey(selectedLiveSlot.date, store.timezone), selectedLiveSlot.endTime, store.timezone);
    const inventoryCutoff = new Date(Math.max(Date.now(), promiseEndsAt.getTime()));
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
      await validateLoyaltyCoupon(tx, coupon.id, sessionUserId, storeId);
      discount = calculateCouponDiscount(coupon, cart.items);
    }
    const taxRateBps = await getStoreTaxRateBps(transactionContext, storeId);
    const goodsCents = cart.items.reduce((sum, item) => sum + Number(item.product.priceCents) * item.quantity, 0);
    const service = evaluateDeliveryPolicy(storeSettings.deliveryPolicy, fulfillmentMethod, data.deliveryAddress.postalCode, goodsCents - Math.round(discount * 100));
    const pricedSlot = deliverySlot ? { ...deliverySlot, deliveryFee: Number(deliverySlot.deliveryFee || 0) + service.feeCents } : null;
    const totals = calculateTotals(cart, pricedSlot, fulfillmentMethod, taxRateBps, discount, coupon, service.feeTaxRateBasisPoints);
    if (Math.round(Number(data.expectedTotal) * 100) !== totals.totalCents) {
      throw new Error("Order total changed before checkout. Please review your cart and fulfillment slot.");
    }
    if (Math.round(Number(data.deliveryFee) * 100) !== totals.deliveryFeeCents) {
      throw new Error("Delivery fee changed before checkout. Please review your fulfillment slot.");
    }
    const selectedSession = await loadPaymentSession(sudoContext, data.paymentSessionId);
    if (selectedSession?.data?.cartFingerprint && selectedSession.data.cartFingerprint !== checkoutCartFingerprint(cart)) throw new Error("Basket changed after payment authorization; recover the original checkout before replacing it");
    if (selectedSession?.data?.checkoutFingerprint && selectedSession.data.checkoutFingerprint !== checkoutRequestFingerprint(data)) throw new Error("Customer instructions changed after payment authorization");
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
    if (!["succeeded", "captured", "requires_capture", "authorized"].includes(settledPayment.status)) {
      throw new Error(`Payment is not settled: ${settledPayment.status}`);
    }
    if (!Number.isSafeInteger(settledPayment.amountCents) || settledPayment.amountCents !== totals.totalCents || settledPayment.currency !== "usd") {
      throw new Error("Provider settlement amount or currency differs from the locked checkout");
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
          promiseEndsAt: promiseEndsAt.toISOString(),
          deliveryPolicySnapshot: service.policy,
          shippingAddressSnapshot: { ...data.deliveryAddress },
          guestSessionId: sessionUserId ? null : data.sessionId?.trim() || null,
          deliverySlotId: data.deliverySlotId || null,
          pickupSlotId: data.pickupSlotId || null,
          ...totals,
          coupon: coupon ? { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount: discount, productCategories: coupon.productCategories, excludedProducts: coupon.excludedProducts, minPurchaseCents: coupon.minPurchaseCents, discountValueCents: coupon.discountValueCents } : null,
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
      let physicalQuantity = Number(product.stockQuantity);
      for (const { lot, quantity } of plannedAllocations) {
        await sudoContext.db.InventoryLot.updateOne({
          where: { id: lot.id },
          data: { quantityRemaining: String((Math.round(Number(lot.quantityRemaining || 0) * 1e3) - Math.round(quantity * 1e3)) / 1e3) }
        });
        const physicalAfter = (Math.round(physicalQuantity * 1e3) - Math.round(quantity * 1e3)) / 1e3;
        if (physicalAfter < 0) throw new Error("Physical stock cache requires an inventory count before checkout");
        await tx.product.update({ where: { id: product.id }, data: { stockQuantity: physicalAfter } });
        await appendInventoryMovement(tx, { storeId, productId: product.id, inventoryLotId: lot.id, orderId: order.id, sourceType: "checkout_allocation", sourceId: order.id, idempotencyKey: `checkout:${order.id}:${item.id}:${lot.id}`, actorId: sessionUserId || void 0, reason: "Reserve ordered goods", quantityBefore: Number(lot.quantityRemaining), quantityAfter: (Math.round(Number(lot.quantityRemaining) * 1e3) - Math.round(quantity * 1e3)) / 1e3, productStockBefore: physicalQuantity, productStockAfter: physicalAfter, metadata: { cartItemId: item.id } });
        physicalQuantity = physicalAfter;
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
            commercial: {
              ...totals.commercialLines.find((line) => line.id === item.id),
              pricingMethod: product.pricingMethod,
              unitOfMeasure: product.unitOfMeasure
            },
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
            quantity: String(allocation.quantity),
            provenance: { source: "checkout-fefo", cartItemId: item.id }
          }
        });
      }
      const nextSellableQuantity = Math.max(0, deriveSellableQuantity(product, storeId) - item.quantity);
      await sudoContext.db.Product.updateOne({
        where: { id: product.id },
        // Physical balance changes above follow each lot journal entry; public
        // availability remains derived from currently eligible lots.
        data: { stockQuantity: String(physicalQuantity), inStock: nextSellableQuantity > 0 }
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
      await consumeOrderCoupon(tx, { couponId: coupon.id, orderId: order.id, storeId, userId: sessionUserId });
      await markLoyaltyRedemptionUsed(tx, coupon.id, order.id, storeId);
    }
    const { clientSecret: _discardedClientSecret, ...paymentSessionEvidence } = selectedSession.data || {};
    await sudoContext.db.Payment.createOne({
      data: {
        store: { connect: { id: storeId } },
        amount: totals.orderTotal.toFixed(2),
        amountCents: totals.totalCents,
        deliveryTipCents: 0,
        status: ["requires_capture", "authorized"].includes(settledPayment.status) ? "authorized" : "succeeded",
        paymentMethod: "credit_card",
        providerPaymentId,
        providerData: {
          ...paymentSessionEvidence,
          status: settledPayment.status,
          authorizedAmountCents: settledPayment.amountCents,
          capturedAmountCents: ["requires_capture", "authorized"].includes(settledPayment.status) ? 0 : settledPayment.amountCents,
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
    if (sessionUserId) await completeSubscriptionRunForCart(tx, cart.id, order.id, storeId, sessionUserId);
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
    await enqueueGroceryOutboxEvent(tx, { storeId, eventKey: `order.confirmed:${order.id}`, eventType: "order.confirmed", aggregateType: "Order", aggregateId: order.id, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { orderId: order.id } });
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
  if (context.session?.itemId) await requireSessionStore(context);
  assertFulfillmentInput(data);
  const sessionUserId = context.session?.itemId || null;
  data.checkoutOwnerId = sessionUserId;
  const sudoContext = context.sudo();
  const [cart, selectedSession] = await Promise.all([
    loadCart(sudoContext, data.cartId),
    loadPaymentSession(sudoContext, data.paymentSessionId)
  ]);
  if (!cart) throw new Error("Cart not found");
  if (selectedSession?.data?.checkoutFingerprint && selectedSession.data.checkoutFingerprint !== checkoutRequestFingerprint(data)) throw new Error("Checkout request differs from authorized customer instructions");
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
      message: "Order submitted successfully",
      displayId: (await context.prisma.order.findUnique({ where: { id: existingAttempt.orderId }, select: { displayId: true } }))?.displayId,
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
  if (attempt.status === "finalized" && attempt.orderId) return { success: true, message: "Order submitted successfully", displayId: (await context.prisma.order.findUnique({ where: { id: attempt.orderId }, select: { displayId: true } }))?.displayId, orderId: attempt.orderId, guestOrderToken: !sessionUserId && data.sessionId?.trim() ? createGuestOrderToken(attempt.orderId, data.sessionId.trim()) : null };
  if (["compensation_required", "compensation_processing", "compensated", "failed"].includes(attempt.status)) {
    throw new Error(`Checkout attempt cannot be finalized from ${attempt.status}`);
  }
  const paymentStatus = noChargeCheckoutState(selectedSession) || await getPaymentStatus({
    provider: paymentProvider,
    paymentId: providerPaymentId
  });
  const normalizedStatus = paymentStatus?.status || "unknown";
  if (!["succeeded", "captured", "requires_capture", "authorized"].includes(normalizedStatus)) {
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

// features/keystone/mutations/recoverGroceryPaymentCreation.ts
init_payment();
var defaults = { requireFreshCapability, requireSessionStore, getPaymentStatus, ensureCheckoutAttempt, now: Date.now, token: import_node_crypto8.randomUUID };
var reviewMessage = "Payment remains held. The provider reference could not be safely attached; review its original metadata and checkout evidence.";
async function recoverPaymentCreationWithDependencies(_root, input, context, ports = defaults) {
  const args = { paymentSessionId: input.paymentSessionId.trim(), providerPaymentId: input.providerPaymentId.trim(), reason: input.reason.trim() };
  if (!args.paymentSessionId || args.paymentSessionId.length > 180 || !/^pi_[A-Za-z0-9_]{1,180}$/.test(args.providerPaymentId) || args.reason.length < 3 || args.reason.length > 470) throw new Error("A checkout session, provider payment reference and recovery reason are required");
  const authorize = async (tc) => {
    await ports.requireFreshCapability(tc, "canManagePayments");
    await ports.requireFreshCapability(tc, "canManageOrders");
    return ports.requireSessionStore(tc);
  };
  const store = await authorize(context);
  const token = ports.token();
  const result = (status, message, reused = false) => ({ status, paymentSessionId: args.paymentSessionId, message, reused });
  async function locked(tc) {
    const tx = tc.prisma;
    const identity2 = await tx.paymentSession.findUnique({ where: { id: args.paymentSessionId }, include: { cart: true } });
    if (!identity2?.cart || identity2.cart.storeId !== store.id) throw new Error("Checkout session not found in active Store");
    const ownerId = identity2.cart.customerId;
    if (ownerId) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', ownerId);
      const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { id: true, storeId: true, privacyErasedAt: true } });
      if (!owner || owner.privacyErasedAt || owner.storeId !== store.id) throw new Error("Checkout customer is no longer active");
    }
    await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id"=$1 FOR UPDATE', identity2.cart.id);
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentSession" WHERE "id"=$1 FOR UPDATE', args.paymentSessionId);
    const session = await tx.paymentSession.findUnique({ where: { id: args.paymentSessionId }, include: { cart: true, paymentProvider: true } });
    if (!session?.cart || session.cart.id !== identity2.cart.id || session.cart.storeId !== store.id || session.cart.customerId !== ownerId) throw new Error("Checkout ownership changed during recovery");
    if (session.data?.noCharge || session.paymentProvider?.code !== STRIPE_PROVIDER_CODE || !session.paymentProvider?.isInstalled) throw new Error("Checkout provider is unavailable for reference recovery");
    return session;
  }
  const claim = await context.transaction(async (tc) => {
    if ((await authorize(tc)).id !== store.id) throw new Error("Active Store changed during recovery");
    const session = await locked(tc);
    const data = session.data || {};
    if (data.paymentIntentId && data.paymentIntentId !== args.providerPaymentId) throw new Error("Checkout already has a different payment identity");
    if (data.compensationStatus) throw new Error("Checkout compensation already owns this payment");
    if (data.status === "completed") return { response: result("completed", "Checkout is already completed.", true) };
    if (data.creationRecovery?.status === "recovered" && data.paymentIntentId === args.providerPaymentId) return { response: result("recovered", "Verified payment is already available to checkout reconciliation.", true) };
    if (data.creationClaimToken && Number(data.claimedAt) + 3e4 > ports.now()) return { response: result("processing", "Payment creation or recovery is in progress; retry shortly.", true) };
    const draft = data.recoveryRequest;
    const validDraft = data.creationBindingVersion === 1 && draft && draft.paymentSessionId === session.id && draft.cartId === session.cart.id && (draft.checkoutOwnerId || null) === (session.cart.customerId || null) && (session.cart.customerId || draft.sessionId === session.cart.sessionId) && data.checkoutFingerprint && data.cartFingerprint && checkoutRequestFingerprint(draft) === data.checkoutFingerprint && Number.isSafeInteger(session.amountCents) && session.amountCents > 0 && data.amountInCents === session.amountCents && String(data.currency).toLowerCase() === "usd";
    const evidence = { actorId: context.session.itemId, reason: args.reason, requestedAt: new Date(ports.now()).toISOString() };
    if (!validDraft) {
      await tc.prisma.paymentSession.update({ where: { id: session.id }, data: { data: { ...data, creationRecovery: { ...evidence, status: "manual_review", cause: "missing_original_binding" } } } });
      return { response: result("manual_review", reviewMessage) };
    }
    await tc.prisma.paymentSession.update({ where: { id: session.id }, data: { data: {
      ...data,
      status: "unknown",
      creationClaimToken: token,
      claimedAt: ports.now(),
      creationRecovery: { ...evidence, status: "retrieving", token }
    } } });
    return { session, draft, evidence };
  });
  if (claim.response) return claim.response;
  let state;
  let failure = null;
  try {
    state = await ports.getPaymentStatus({ provider: claim.session.paymentProvider, paymentId: args.providerPaymentId });
  } catch {
    failure = "provider_unavailable";
  }
  if (!failure) {
    const metadata = state?.data?.metadata;
    if (state?.data?.id !== args.providerPaymentId || metadata?.paymentSessionId !== claim.session.id || metadata?.checkoutFingerprint !== claim.session.data.checkoutFingerprint || metadata?.cartFingerprint !== claim.session.data.cartFingerprint || metadata?.cartId !== claim.session.cart.id || state?.amountCents !== claim.session.amountCents || String(state?.currency).toLowerCase() !== "usd" || !state?.data?.client_secret || !["requires_payment_method", "requires_confirmation", "requires_action", "processing", "requires_capture", "authorized", "succeeded", "captured"].includes(state?.status)) failure = "provider_binding_mismatch";
  }
  return context.transaction(async (tc) => {
    if ((await authorize(tc)).id !== store.id) throw new Error("Active Store changed during recovery");
    const current = await locked(tc);
    const data = current.data || {};
    if (data.creationClaimToken !== token || data.creationRecovery?.token !== token || data.status === "completed" || data.compensationStatus || (current.cart.customerId || null) !== (claim.session.cart.customerId || null) || !current.cart.customerId && current.cart.sessionId !== claim.session.cart.sessionId || current.paymentProvider.id !== claim.session.paymentProvider.id || data.creationBindingVersion !== 1 || data.checkoutFingerprint !== claim.session.data.checkoutFingerprint || data.cartFingerprint !== claim.session.data.cartFingerprint || current.amountCents !== claim.session.amountCents || groceryOutboxPayloadHash(data.recoveryRequest) !== groceryOutboxPayloadHash(claim.draft) || data.paymentIntentId && data.paymentIntentId !== args.providerPaymentId) throw new Error("Checkout recovery claim changed; retry after the active operation completes");
    if (failure) {
      await tc.prisma.paymentSession.update({ where: { id: current.id }, data: { data: {
        ...data,
        creationClaimToken: null,
        creationRecovery: { ...data.creationRecovery, status: failure === "provider_unavailable" ? "unknown" : "manual_review", cause: failure }
      } } });
      return result(failure === "provider_unavailable" ? "unknown" : "manual_review", failure === "provider_unavailable" ? "Provider lookup could not be confirmed. No payment was attached; retry this reference." : reviewMessage);
    }
    const existingAttempt = await tc.prisma.checkoutAttempt.findFirst({ where: { paymentSessionId: current.id } });
    if (existingAttempt && (existingAttempt.providerPaymentId !== args.providerPaymentId || existingAttempt.status !== "pending")) throw new Error("Checkout reconciliation already owns this request");
    const draft = { ...claim.draft, paymentSessionId: current.id, paymentIntentId: args.providerPaymentId };
    const attempt = await ports.ensureCheckoutAttempt(
      { ...tc, transaction: async (operation) => operation(tc) },
      draft,
      { ...current.cart, store: { id: store.id } },
      current,
      args.providerPaymentId
    );
    if (attempt.status !== "pending") throw new Error("Checkout reconciliation already owns this request");
    await tc.prisma.paymentSession.update({ where: { id: current.id }, data: { isInitiated: true, data: {
      ...data,
      status: "ready",
      creationClaimToken: null,
      paymentIntentId: args.providerPaymentId,
      clientSecret: state.data.client_secret,
      error: null,
      creationRecovery: { ...data.creationRecovery, status: "recovered", completedAt: new Date(ports.now()).toISOString(), providerStatus: state.status }
    } } });
    return result("recovered", "Verified payment is available to checkout reconciliation. The customer can resume any required payment confirmation.");
  });
}
function recoverGroceryPaymentCreation(root, args, context) {
  return recoverPaymentCreationWithDependencies(root, args, context);
}

// features/keystone/mutations/rescheduleReturnedGroceryDelivery.ts
init_access();
init_storeScope();

// features/keystone/lib/fulfillmentPayment.ts
async function assertOrderHandoffPayment(tx, order) {
  await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "order" = $1 ORDER BY "id" FOR UPDATE', order.id);
  const payments = await tx.payment.findMany({ where: { orderId: order.id }, include: { refunds: true } });
  if (order.metadata?.finalSale?.status !== "finalized") throw new Error("Finalize actual goods and payment before handoff");
  const desired = Number(order.metadata.finalSale.totalCents);
  if (!Number.isSafeInteger(desired) || desired < 0) throw new Error("Invalid final goods amount");
  const noCharge = order.metadata.finalSale.noChargeAuthorized;
  if (desired === 0 && !(noCharge?.actorId && noCharge?.reason && order.metadata.finalSale.actuals?.some((line) => line.quantityMilli > 0))) throw new Error("An empty or fully reversed order must be canceled, not handed over");
  let net = 0;
  for (const payment of payments) {
    if (payment.refunds.some((r) => r.status === "processing")) throw new Error("Refund reconciliation is pending");
    if (!["succeeded", "partially_refunded"].includes(payment.status)) continue;
    net += Number(payment.amountCents) - payment.refunds.filter((r) => r.status === "succeeded").reduce((n, r) => n + Number(r.amountCents), 0);
  }
  if (net !== desired) throw new Error("Current net payment does not match the final goods; resolve refunds before handoff");
}

// features/keystone/lib/deliveryReschedule.ts
init_groceryOutbox();
function normalizeReturnedDeliveryReschedule(input) {
  const result = Object.fromEntries(["orderId", "deliverySlotId", "customerApproval", "conditionEvidence", "idempotencyKey"].map((key2) => [key2, String(input[key2] || "").trim()]));
  if (!result.orderId || !result.deliverySlotId) throw new Error("Order and new delivery slot are required");
  if (result.customerApproval.length < 12 || result.customerApproval.length > 1e3) throw new Error("Record the customer identity, contact channel and approval of the new window");
  if (result.conditionEvidence.length < 12 || result.conditionEvidence.length > 1e3) throw new Error("Record the returned goods inspection and cold-chain condition");
  if (result.idempotencyKey.length < 12 || result.idempotencyKey.length > 200) throw new Error("A bounded reschedule request identity is required");
  return result;
}
function assertReturnedDelivery(order, storeId) {
  if (!order || order.storeId !== storeId) throw new Error("Order not found in active store");
  if (order.status !== "returned" || order.deliveryRouteId || order.metadata?.fulfillmentMethod !== "delivery" || order.metadata?.deliveryOutcome?.status !== "returned" || order.metadata?.deliveryOutcome?.custody !== "store") throw new Error("Return the failed delivery to confirmed store custody before booking another window");
  if (order.metadata?.inventoryReleasedAt || order.metadata?.cancellation) throw new Error("Returned goods were already released or entered cancellation");
}
function rescheduleSlotDecision(order, slot, store, settings, now = /* @__PURE__ */ new Date()) {
  if (!slot || slot.storeId !== store.id || !slot.isActive) throw new Error("New delivery slot is not active in this Store");
  if (!Number.isSafeInteger(slot.currentBookings) || !Number.isSafeInteger(slot.capacity) || slot.currentBookings >= slot.capacity) throw new Error("New delivery slot is fully booked");
  const decision = evaluateFulfillmentWindow({ hours: settings?.hours, timeZone: store.timezone, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, now });
  if (!settings || !decision.allowed) throw new Error("New delivery slot is outside hours, cutoff, blackout or booking horizon");
  const dateKey = zonedDateKey(slot.date, store.timezone);
  const startsAt = zonedDateTimeForDateKey(dateKey, slot.startTime, store.timezone);
  const endsAt = zonedDateTimeForDateKey(dateKey, slot.endTime, store.timezone);
  const oldEnd = new Date(order.metadata?.promiseEndsAt).getTime();
  if (!Number.isFinite(oldEnd) || startsAt.getTime() <= oldEnd) throw new Error("Choose a later delivery window after the original promise");
  const sale = order.metadata?.finalSale;
  const service = evaluateDeliveryPolicy(settings.deliveryPolicy, "delivery", order.metadata?.shippingAddressSnapshot?.postalCode || "", Number(sale?.subtotalCents) - Number(sale?.discountCents));
  const fee = Number(slot.deliveryFee) + service.feeCents;
  if (!Number.isSafeInteger(fee) || fee !== sale?.feeCents || service.feeTaxRateBasisPoints !== Number(order.metadata?.deliveryPolicySnapshot?.feeTaxRateBasisPoints || 0)) throw new Error("New window changes the agreed delivery price or tax; resolve payment adjustment before rescheduling");
  return { startsAt, endsAt, feeCents: fee, policy: service.policy };
}
async function rescheduleReturnedDeliveryInTransaction(tx, actor, rawInput, now = /* @__PURE__ */ new Date()) {
  const input = normalizeReturnedDeliveryReschedule(rawInput);
  const fingerprint = groceryOutboxPayloadHash(input);
  await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', input.orderId);
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.storeId !== actor.storeId) throw new Error("Order not found in active store");
  const history = Array.isArray(order.metadata?.deliveryReschedules) ? order.metadata.deliveryReschedules : [];
  const prior = history.find((event2) => event2.idempotencyKey === input.idempotencyKey);
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new Error("Reschedule request key was reused with different evidence");
    return { success: true, orderId: order.id, deliverySlotId: prior.after.deliverySlotId, promiseEndsAt: prior.after.promiseEndsAt, reused: true };
  }
  assertReturnedDelivery(order, actor.storeId);
  const oldSlotId = order.deliverySlotId;
  if (!oldSlotId || oldSlotId === input.deliverySlotId) throw new Error("Select a different delivery booking");
  for (const id of [oldSlotId, input.deliverySlotId].sort()) await tx.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id"=$1 FOR UPDATE', id);
  const [oldSlot, newSlot, store, settings] = await Promise.all([
    tx.deliverySlot.findUnique({ where: { id: oldSlotId } }),
    tx.deliverySlot.findUnique({ where: { id: input.deliverySlotId } }),
    tx.store.findUnique({ where: { id: actor.storeId } }),
    tx.storeSettings.findFirst({ where: { storeId: actor.storeId, isActive: true } })
  ]);
  if (!store?.isActive || !oldSlot || oldSlot.storeId !== actor.storeId || !Number.isSafeInteger(oldSlot.currentBookings) || oldSlot.currentBookings < 1) throw new Error("Original delivery booking requires reconciliation");
  const decision = rescheduleSlotDecision(order, newSlot, store, settings, now);
  await assertOrderHandoffPayment(tx, order);
  await assertOrderInventoryEligible(tx, order.id, actor.storeId, decision.endsAt);
  const hour = Number(newSlot.startTime.slice(0, 2));
  const deliveryTimeWindow = hour < 10 ? "time_8_10" : hour < 12 ? "time_10_12" : hour < 14 ? "time_12_14" : hour < 16 ? "time_14_16" : hour < 18 ? "time_16_18" : "time_18_20";
  const before = {
    deliverySlotId: oldSlotId,
    deliveryDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString() : null,
    deliveryTimeWindow: order.deliveryTimeWindow,
    promiseEndsAt: order.metadata.promiseEndsAt,
    selectedFulfillmentSlot: order.metadata.selectedFulfillmentSlot,
    deliveryPolicySnapshot: order.metadata.deliveryPolicySnapshot,
    outcome: order.metadata.deliveryOutcome
  };
  const after = {
    deliverySlotId: newSlot.id,
    deliveryDate: new Date(newSlot.date).toISOString(),
    deliveryTimeWindow,
    promiseEndsAt: decision.endsAt.toISOString(),
    selectedFulfillmentSlot: { date: new Date(newSlot.date).toISOString(), startTime: newSlot.startTime, endTime: newSlot.endTime }
  };
  const event = { ...input, actorId: actor.userId, customerId: order.userId || null, occurredAt: now.toISOString(), fingerprint, before, after };
  await tx.deliverySlot.update({ where: { id: oldSlotId }, data: { currentBookings: oldSlot.currentBookings - 1 } });
  await tx.deliverySlot.update({ where: { id: newSlot.id }, data: { currentBookings: newSlot.currentBookings + 1 } });
  await tx.order.update({ where: { id: order.id }, data: {
    status: "packed",
    deliverySlotId: newSlot.id,
    deliveryDate: new Date(newSlot.date),
    deliveryTimeWindow,
    metadata: {
      ...order.metadata,
      ...after,
      deliveryPolicySnapshot: decision.policy,
      deliveryReschedules: [...history, event],
      deliveryOutcome: { status: "rescheduled", custody: "store", occurredAt: event.occurredAt, reason: "Customer-approved later delivery window", retryAt: decision.startsAt.toISOString() }
    }
  } });
  await enqueueGroceryOutboxEvent(tx, {
    storeId: actor.storeId,
    eventKey: `order.rescheduled:${groceryOutboxPayloadHash({ orderId: order.id, key: input.idempotencyKey })}`,
    eventType: "order.rescheduled",
    aggregateType: "Order",
    aggregateId: order.id,
    occurredAt: now.toISOString(),
    payload: { orderId: order.id, before, after }
  });
  return { success: true, orderId: order.id, deliverySlotId: newSlot.id, promiseEndsAt: after.promiseEndsAt, reused: false };
}

// features/keystone/mutations/rescheduleReturnedGroceryDelivery.ts
init_serializableTransaction();
async function rescheduleReturnedGroceryDelivery(_root, input, context) {
  await requireFreshCapability(context, "canManageDelivery");
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction((tc) => rescheduleReturnedDeliveryInTransaction(tc.prisma, { storeId: store.id, userId: context.session.itemId }, input)));
}
async function groceryDeliveryRescheduleSlots(_root, { orderId }, context) {
  await requireFreshCapability(context, "canManageDelivery");
  const scope = await requireSessionStore(context);
  const tx = context.prisma;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  assertReturnedDelivery(order, scope.id);
  const [store, settings, slots] = await Promise.all([
    tx.store.findUnique({ where: { id: scope.id } }),
    tx.storeSettings.findFirst({ where: { storeId: scope.id, isActive: true } }),
    tx.deliverySlot.findMany({ where: { storeId: scope.id, isActive: true, date: { gte: new Date(Date.now() - 864e5) } }, orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }], take: 500 })
  ]);
  if (!store?.isActive) throw new Error("Store is unavailable");
  const eligible = slots.flatMap((slot) => {
    try {
      const result = rescheduleSlotDecision(order, slot, store, settings);
      return [{ id: slot.id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, available: slot.capacity - slot.currentBookings, promiseEndsAt: result.endsAt.toISOString() }];
    } catch {
      return [];
    }
  });
  return { slots: eligible, timezone: store.timezone, message: eligible.length ? "Choose a later window at the agreed delivery price." : "No eligible later window at the agreed price. Resolve payment or goods exceptions before rebooking." };
}

// features/keystone/mutations/groceryRecurringOverview.ts
init_access();
init_storeScope();
async function groceryRecurringOverview(_root, { page = 1, customerOnly = true }, context) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 1e6) throw new Error("Invalid recurring history page");
  if (!customerOnly) await requireFreshCapability(context, "canManageOrders");
  const store = await requireSessionStore(context), where = { storeId: store.id, ...customerOnly ? { userId: context.session.itemId } : {} }, take = 25, skip = (page - 1) * take;
  const [subscriptions, runs, subscriptionCount, runCount, program] = await Promise.all([
    context.prisma.subscription.findMany({ where, take, skip, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, product: true, quantity: true, frequency: true, nextDeliveryDate: true, status: true, scheduleTimezone: true, pausedUntil: true, productRef: { select: { id: true, title: true } }, user: { select: { id: true, email: true } } } }),
    context.prisma.subscriptionRun.findMany({ where, take, skip, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, dueAt: true, status: true, failureReason: true, productTitle: true, quantity: true, user: { select: { id: true, email: true } }, order: { select: { id: true } }, subscription: { select: { id: true } } } }),
    context.prisma.subscription.count({ where }),
    context.prisma.subscriptionRun.count({ where }),
    context.prisma.loyaltyProgram.findFirst({ where: { storeId: store.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, name: true, isActive: true, earnPointsPer100Cents: true, redeemPointsPer100Cents: true, minimumRedemptionPoints: true } })
  ]);
  return { subscriptions, runs, program, pagination: { page, pageSize: take, collections: { subscriptions: { total: subscriptionCount, totalPages: Math.max(1, Math.ceil(subscriptionCount / take)) }, runs: { total: runCount, totalPages: Math.max(1, Math.ceil(runCount / take)) } } } };
}

// features/keystone/mutations/groceryPaymentWebhookRecovery.ts
init_access();
init_storeScope();
async function groceryPaymentWebhookRecovery(_root, { page = 1 }, context) {
  await requireFreshCapability(context, "canManagePayments");
  const store = await requireSessionStore(context);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1e6) throw new Error("Invalid recovery page");
  const where = { storeId: store.id, status: { in: ["unmatched", "processing"] } };
  const [total, events] = await Promise.all([context.prisma.paymentWebhookEvent.count({ where }), context.prisma.paymentWebhookEvent.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25, select: { id: true, providerCode: true, providerEventId: true, eventType: true, status: true, processingAttempts: true, nextAttemptAt: true, deadLetterAt: true, lastProcessingError: true } })]);
  return { page, total, totalPages: Math.max(1, Math.ceil(total / 25)), events };
}

// features/keystone/mutations/importGroceryCatalog.ts
init_access();
init_storeScope();

// features/keystone/lib/catalogImport.ts
var import_node_crypto9 = require("node:crypto");
var CATALOG_IMPORT_COLUMNS = ["sku", "title", "priceCents", "unitOfMeasure", "pricingMethod", "departmentId", "supplierId", "taxRateBasisPoints"];
var catalogHash = (value) => (0, import_node_crypto9.createHash)("sha256").update(JSON.stringify(value)).digest("hex");
function parseCatalogCsv(csv, schemaVersion) {
  if (schemaVersion !== 1) throw new Error("Unsupported catalog schemaVersion; use version 1");
  if (typeof csv !== "string" || Buffer.byteLength(csv, "utf8") > 1e6) throw new Error("Catalog CSV must be at most 1 MB");
  const matrix = [];
  let row = [], cell = "", quoted = false, closed = false;
  const finishCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.length)) matrix.push(row);
    row = [];
    if (matrix.length > 501) throw new Error("Use batches of at most 500 catalog rows, each with its own sourceBatchId");
  };
  const input = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
      continue;
    }
    if (char === ",") {
      finishCell();
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      finishRow();
      continue;
    }
    if (closed) throw new Error("Unexpected characters after a quoted CSV value");
    if (char === '"') {
      if (cell.length) throw new Error("Quotes must enclose an entire CSV value");
      quoted = true;
    } else cell += char;
  }
  if (quoted) throw new Error("Unclosed quoted CSV value");
  if (cell.length || row.length || closed) finishRow();
  const header = matrix.shift()?.map((value) => value.trim());
  if (!header || header.length !== CATALOG_IMPORT_COLUMNS.length || header.some((value, index) => value !== CATALOG_IMPORT_COLUMNS[index])) throw new Error(`CSV header must be exactly: ${CATALOG_IMPORT_COLUMNS.join(",")}`);
  if (!matrix.length) throw new Error("At least one catalog row is required");
  const seen = /* @__PURE__ */ new Set();
  const number2 = (value, max, label) => {
    if (!/^(0|[1-9]\d*)$/.test(value) || Number(value) > max) throw new Error(`${label} must be an integer between 0 and ${max}`);
    return Number(value);
  };
  return matrix.map((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== header.length) throw new Error(`Row ${rowNumber}: expected ${header.length} columns`);
    const [sku, title, price, unitOfMeasure, pricingMethod, departmentId, supplierId, tax] = values.map((value) => value.trim());
    if (!sku || sku.length > 100 || /[\r\n\u0000-\u001f]/.test(sku) || !title || title.length > 300) throw new Error(`Row ${rowNumber}: SKU and title are required (100/300 characters maximum)`);
    if (seen.has(sku)) throw new Error(`Row ${rowNumber}: duplicate SKU ${sku}`);
    seen.add(sku);
    const allowedUnits = { unit: ["each"], weight: ["lb", "oz", "kg", "g"], volume: ["L", "mL", "gallon", "quart", "pint"] };
    if (!allowedUnits[pricingMethod]?.includes(unitOfMeasure)) throw new Error(`Row ${rowNumber}: unitOfMeasure must agree with pricingMethod`);
    if ([departmentId, supplierId].some((id) => id.length > 200 || /[\r\n\u0000-\u001f]/.test(id))) throw new Error(`Row ${rowNumber}: invalid relationship identity`);
    return { rowNumber, sku, title, priceCents: number2(price, 2147483647, `Row ${rowNumber} priceCents`), unitOfMeasure, pricingMethod, departmentId: departmentId || null, supplierId: supplierId || null, taxRateBasisPoints: tax === "" ? null : number2(tax, 1e4, `Row ${rowNumber} taxRateBasisPoints`) };
  });
}
function catalogProductSnapshot(product) {
  return product ? { id: product.id, sku: product.sku, title: product.title, priceCents: Number(product.priceCents), unitOfMeasure: product.unitOfMeasure, pricingMethod: product.pricingMethod, departmentId: product.departmentRefId || null, supplierId: product.supplierId || null, taxRateBasisPoints: product.taxRateBasisPoints ?? null, status: product.status, updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : null } : null;
}
async function planCatalogImport(tx, storeId, rows) {
  const products = await tx.product.findMany({ where: { storeId, sku: { in: rows.map((row) => row.sku) } } });
  const departmentIds = [...new Set(rows.map((row) => row.departmentId).filter(Boolean))], supplierIds = [...new Set(rows.map((row) => row.supplierId).filter(Boolean))];
  const [departments, suppliers] = await Promise.all([
    tx.department.findMany({ where: { id: { in: departmentIds }, storeId }, select: { id: true, name: true } }),
    tx.supplier.findMany({ where: { id: { in: supplierIds }, storeId }, select: { id: true, name: true } })
  ]);
  const issues = [];
  const plan = rows.map((row) => {
    const matches = products.filter((product) => product.sku === row.sku);
    if (matches.length > 1) issues.push(`Row ${row.rowNumber}: existing SKU ${row.sku} is ambiguous; resolve duplicate catalog identities first`);
    const before = catalogProductSnapshot(matches[0]);
    if (row.departmentId && !departments.some((department) => department.id === row.departmentId)) issues.push(`Row ${row.rowNumber}: department does not belong to the active Store`);
    if (row.supplierId && !suppliers.some((supplier) => supplier.id === row.supplierId)) issues.push(`Row ${row.rowNumber}: supplier does not belong to the active Store`);
    if (before && (before.unitOfMeasure !== row.unitOfMeasure || before.pricingMethod !== row.pricingMethod)) issues.push(`Row ${row.rowNumber}: an existing product's physical unit and pricing basis cannot be changed by catalog import`);
    return { rowNumber: row.rowNumber, action: before ? "update" : "create", before, after: { sku: row.sku, title: row.title, priceCents: row.priceCents, unitOfMeasure: row.unitOfMeasure, pricingMethod: row.pricingMethod, departmentId: row.departmentId, supplierId: row.supplierId, taxRateBasisPoints: row.taxRateBasisPoints, status: before?.status || "draft" }, departmentName: departments.find((department) => department.id === row.departmentId)?.name || null, supplierName: suppliers.find((supplier) => supplier.id === row.supplierId)?.name || null };
  });
  return { issues, plan, reviewHash: catalogHash({ storeId, plan }) };
}

// features/keystone/mutations/importGroceryCatalog.ts
init_serializableTransaction();
async function importGroceryCatalog(_root, args, context) {
  await requireFreshCapability(context, "canManageProducts");
  const store = await requireSessionStore(context);
  if (context.session?.data.store?.id !== store.id) throw new Error("Refresh the active Store session before importing catalog data");
  if (!["dry_run", "commit"].includes(args.mode)) throw new Error("Choose dry_run or commit");
  const sourceSystem = args.sourceSystem?.trim(), sourceBatchId = args.sourceBatchId?.trim(), requestKey2 = args.idempotencyKey?.trim();
  if (!sourceSystem || sourceSystem.length > 100 || !sourceBatchId || sourceBatchId.length > 150 || !requestKey2 || requestKey2.length < 12 || requestKey2.length > 150) throw new Error("Source system, source batch and a stable request identity are required");
  const rows = parseCatalogCsv(args.csv, args.schemaVersion);
  const payloadHash = catalogHash({ storeId: store.id, schemaVersion: args.schemaVersion, sourceSystem, sourceBatchId, csv: args.csv });
  const identityKey = catalogHash([store.id, sourceSystem, sourceBatchId]), idempotencyKey = catalogHash([store.id, requestKey2]);
  if (args.mode === "commit" && args.expectedPayloadHash !== payloadHash) throw new Error("The exact catalog payload must be reviewed before commit");
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    if (args.mode === "commit") {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-catalog-import'), hashtext($1))", store.id);
      for (const sku of rows.map((row) => row.sku).sort()) await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-catalog-sku'), hashtext($1))", `${store.id}:${sku}`);
    }
    const [existingBatch, existingRequest] = await Promise.all([tx.catalogImport.findUnique({ where: { identityKey } }), tx.catalogImport.findUnique({ where: { idempotencyKey } })]);
    if (existingRequest && (existingRequest.identityKey !== identityKey || existingRequest.payloadHash !== payloadHash)) throw new Error("Catalog request identity was reused for different content or source batch");
    if (existingBatch) {
      if (existingBatch.storeId !== store.id || existingBatch.payloadHash !== payloadHash) throw new Error("Source batch already committed with a different payload");
      return { valid: true, committed: true, reused: true, importId: existingBatch.id, payloadHash, reviewHash: existingBatch.reviewHash, currencyCode: existingBatch.currencyCode, issues: [], plan: existingBatch.result };
    }
    if (args.mode === "commit") {
      const matches = await tx.product.findMany({ where: { storeId: store.id, sku: { in: rows.map((row) => row.sku) } }, select: { id: true } });
      for (const product of matches.sort((a, b) => a.id.localeCompare(b.id))) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', product.id);
    }
    const planned = await planCatalogImport(tx, store.id, rows);
    if (args.mode === "dry_run" || planned.issues.length) return { valid: !planned.issues.length, committed: false, reused: false, importId: null, payloadHash, currencyCode: store.currencyCode, ...planned };
    if (args.expectedReviewHash !== planned.reviewHash) throw new Error("Catalog changed after review; run a fresh dry run before committing");
    const result = [];
    const productDb = transactionContext.sudo().db.Product;
    for (const item of planned.plan) {
      const next = item.after;
      const data = {
        sku: next.sku,
        title: next.title,
        price: next.priceCents / 100,
        unitOfMeasure: next.unitOfMeasure,
        pricingMethod: next.pricingMethod,
        taxRateBasisPoints: next.taxRateBasisPoints,
        departmentRef: next.departmentId ? { connect: { id: next.departmentId } } : { disconnect: true },
        supplier: next.supplierId ? { connect: { id: next.supplierId } } : { disconnect: true }
      };
      let product;
      if (item.before) product = await productDb.updateOne({ where: { id: item.before.id }, data });
      else {
        if (!next.departmentId) delete data.departmentRef;
        if (!next.supplierId) delete data.supplier;
        product = await productDb.createOne({ data: { ...data, status: "draft", handle: `import-${catalogHash([store.id, next.sku]).slice(0, 32)}` } });
      }
      const persisted = await tx.product.findUnique({ where: { id: product.id } });
      if (!persisted || persisted.storeId !== store.id || Number(persisted.priceCents) !== next.priceCents) throw new Error("Product source hooks did not preserve imported Store and price authority");
      result.push({ ...item, productId: product.id, persisted: catalogProductSnapshot(persisted) });
    }
    const record2 = await tx.catalogImport.create({ data: { identityKey, idempotencyKey, sourceSystem, sourceBatchId, schemaVersion: args.schemaVersion, payloadHash, reviewHash: planned.reviewHash, storeId: store.id, currencyCode: store.currencyCode, rowCount: rows.length, rows, result, committedAt: /* @__PURE__ */ new Date(), actorId: context.session.itemId } });
    return { valid: true, committed: true, reused: false, importId: record2.id, payloadHash, reviewHash: planned.reviewHash, currencyCode: store.currencyCode, issues: [], plan: result };
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/handlePaymentProviderWebhook.ts
init_refundAllocations();
var import_node_crypto10 = require("node:crypto");
init_access();
init_paymentProviderAdapter();

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
init_refundRecovery();
init_groceryOutbox();
init_serializableTransaction();
init_storeScope();
function normalizePaymentId(resource) {
  const value = resource?.payment_intent || resource?.id;
  return typeof value === "string" ? value : value?.id || null;
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
  const createdSeconds = Number(verified.event?.created || 0);
  if (createdSeconds && Math.abs(Date.now() - createdSeconds * 1e3) > 7 * 24 * 60 * 60 * 1e3) throw new Error("Payment webhook event is outside the replay window");
  return processVerifiedPaymentEvent(providerCode, verified, (0, import_node_crypto10.createHash)("sha256").update(rawBody).digest("hex"), context);
}
async function processVerifiedPaymentEvent(providerCode, verified, payloadHash, context, expectedStoreId) {
  const eventType = verified.type;
  const providerEventId = verified.eventId;
  if (!providerEventId) throw new Error("Payment webhook event id is required");
  const paymentId = normalizePaymentId(verified.resource);
  const status = eventType === "charge.succeeded" && verified.resource?.captured === false ? null : normalizePaymentStatus(eventType);
  const refundStatus = normalizeRefundStatus(eventType, verified.resource);
  const replayKey = `${providerCode}:${providerEventId}`;
  const claimToken = (0, import_node_crypto10.randomUUID)();
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
    if (expectedStoreId && eventStoreId !== expectedStoreId) throw new Error("Verified event payment does not belong to the replay Store");
    const store = await tx.store.findUnique({ where: { id: eventStoreId }, select: { id: true, currencyCode: true } });
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
        verifiedPayload: { event: verified.event, eventId: providerEventId, type: eventType, resource: verified.resource },
        claimToken,
        status: "processing",
        storeId: store.id
      },
      select: { id: true, claimToken: true, status: true, paymentRecordId: true, payloadHash: true, storeId: true, deadLetterAt: true }
    });
    if (eventRecord.payloadHash !== payloadHash) throw new Error("Webhook event ID was reused with a different payload");
    if (eventRecord.storeId !== store.id) throw new Error("Verified event Store does not match its payment Store");
    if (eventRecord.deadLetterAt || eventRecord.claimToken !== claimToken && !(eventRecord.status === "unmatched" && knownPayment)) {
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
      const resources = eventType === "charge.refunded" ? verified.resource?.refunds?.data || [] : [verified.resource];
      let reconciled = resources.length > 0 && !verified.resource?.refunds?.has_more;
      for (const resource of resources) {
        const incoming = normalizeRefundStatus(eventType === "charge.refunded" ? "refund.updated" : eventType, resource);
        if (!incoming) {
          reconciled = false;
          continue;
        }
        const amountCents = resource?.amount;
        const refundId = resource?.id;
        let candidate = null;
        try {
          normalizeProviderRefund({ ...resource, paymentId: resource?.payment_intent || paymentId }, {
            amountCents,
            currencyCode: store.currencyCode.toLowerCase(),
            providerPaymentId: paymentId
          });
          if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > knownPayment.amountCents) throw new Error("Invalid refund amount");
          candidate = await tx.paymentRefund.findFirst({ where: { providerCode, providerRefundId: refundId } });
          const requestKey2 = resource?.metadata?.groceryRefundKey;
          if (!candidate && typeof requestKey2 === "string") candidate = await tx.paymentRefund.findUnique({ where: { idempotencyKey: requestKey2 } });
          if (candidate && (candidate.paymentId !== knownPayment.id || candidate.amountCents !== amountCents || candidate.providerCode !== providerCode || candidate.providerRefundId && candidate.providerRefundId !== refundId)) throw new Error("Webhook refund does not match existing request");
          await assertRefundBudget(tx, knownPayment.id, knownPayment.amountCents, amountCents, candidate?.id, candidate?.idempotencyKey);
        } catch {
          reconciled = false;
          continue;
        }
        if (!candidate) {
          candidate = await tx.paymentRefund.create({ data: {
            idempotencyKey: `provider-refund:${providerCode}:${refundId}`,
            amount: (amountCents / 100).toFixed(2),
            amountCents,
            status: "processing",
            providerCode,
            providerPaymentId: paymentId,
            providerRefundId: refundId,
            payment: { connect: { id: knownPayment.id } },
            requestedAt: /* @__PURE__ */ new Date(),
            providerData: { origin: "provider_webhook", requestReason: "Refund initiated at payment provider", currencyCode: store.currencyCode.toLowerCase(), originEventId: providerEventId }
          } });
        }
        await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', candidate.id);
        const refund = await tx.paymentRefund.findUnique({ where: { id: candidate.id } });
        if (!refund) throw new Error("Refund disappeared");
        const currentOrder = refund.providerEventId ? { createdAtMs: refund.providerEventCreatedAt?.getTime() || 0, version: refund.providerEventVersion || 0, eventId: refund.providerEventId } : null;
        if (shouldApplyRefundTransition(refund.status, incoming, currentOrder, refundEventOrder)) {
          await tx.paymentRefund.update({ where: { id: refund.id }, data: {
            status: incoming,
            providerRefundId: refundId,
            providerStatus: String(resource.status || eventType).toLowerCase(),
            providerEventId,
            providerEventCreatedAt: refundEventOrder.createdAtMs ? new Date(refundEventOrder.createdAtMs) : null,
            providerEventVersion: refundEventOrder.version,
            processedAt: incoming === "processing" ? null : /* @__PURE__ */ new Date(),
            failureMessage: incoming === "failed" ? "Provider reported refund failure" : incoming === "canceled" ? "Provider canceled refund" : "",
            providerData: refundProviderData(refund.providerData, resource),
            reconciliationOwner: null,
            reconciliationToken: null,
            reconciliationLeaseExpiresAt: null,
            reconciliationDeadLetterAt: null,
            reconciliationNextAttemptAt: incoming === "processing" ? new Date(Date.now() + 1e4) : null
          } });
          await reconcileOrderLineRefundRows(tx, await tx.paymentRefund.findUnique({ where: { id: refund.id } }));
          if (incoming === "succeeded") {
            const aggregate = await tx.paymentRefund.aggregate({ where: { paymentId: knownPayment.id, status: "succeeded" }, _sum: { amountCents: true } });
            const refundedCents = Number(aggregate._sum.amountCents || 0);
            await tx.payment.update({ where: { id: knownPayment.id }, data: { status: refundedCents >= knownPayment.amountCents ? "refunded" : "partially_refunded", providerData: { ...knownPayment.providerData || {}, refundedAmountCents: refundedCents } } });
            await enqueueGroceryOutboxEvent(tx, { storeId: store.id, eventKey: `payment-refund:${refund.id}:completed:v1`, eventType: "payment.refunded", aggregateType: "payment", aggregateId: knownPayment.id, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { paymentId: knownPayment.id, refundId: refund.id, amountCents, cumulativeRefundedCents: refundedCents, providerCode, providerPaymentId: paymentId, providerRefundId: refundId } });
          }
        }
        updatedPaymentId = knownPayment.id;
      }
      eventProcessingStatus = reconciled ? "processed" : "unmatched";
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
var VERIFIED_REFUND_TYPES = ["refund.created", "refund.updated", "refund.failed", "refund.canceled", "refund.cancelled", "charge.refunded"];
var VERIFIED_EVENT_MAX_ATTEMPTS = 5;
async function reconcileOneVerifiedEvent(context, storeId, eventId) {
  const token = (0, import_node_crypto10.randomUUID)();
  const claim = await context.transaction(async (tc) => {
    const tx = tc.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentWebhookEvent" WHERE "id"=$1 FOR UPDATE', eventId);
    const event = await tx.paymentWebhookEvent.findUnique({ where: { id: eventId } });
    if (!event || event.storeId !== storeId || event.status !== "unmatched" || event.deadLetterAt || Number(event.processingAttempts || 0) >= VERIFIED_EVENT_MAX_ATTEMPTS || event.nextAttemptAt && new Date(event.nextAttemptAt).getTime() > Date.now()) return null;
    return tx.paymentWebhookEvent.update({ where: { id: event.id }, data: { processingAttempts: Number(event.processingAttempts || 0) + 1, claimToken: token, nextAttemptAt: new Date(Date.now() + 3e4) } });
  });
  if (!claim) return false;
  let error = "";
  try {
    const verified = claim.verifiedPayload;
    if (!verified?.eventId || verified.eventId !== claim.providerEventId || verified.event?.id !== claim.providerEventId || verified.type !== claim.eventType || !VERIFIED_REFUND_TYPES.includes(claim.eventType)) throw new Error("Persisted verified envelope identity is invalid");
    await processVerifiedPaymentEvent(claim.providerCode, verified, claim.payloadHash, context, storeId);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Verified event reconciliation failed";
  }
  return context.transaction(async (tc) => {
    const tx = tc.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentWebhookEvent" WHERE "id"=$1 FOR UPDATE', eventId);
    const current = await tx.paymentWebhookEvent.findUnique({ where: { id: eventId } });
    if (!current || current.storeId !== storeId || current.claimToken !== token) return false;
    const reconciled = current.status === "processed" || current.status === "ignored";
    const exhausted = !reconciled && Number(current.processingAttempts) >= VERIFIED_EVENT_MAX_ATTEMPTS;
    await tx.paymentWebhookEvent.update({ where: { id: eventId }, data: { nextAttemptAt: reconciled || exhausted ? null : new Date(Date.now() + Math.min(3e5, 1e4 * 2 ** (Number(current.processingAttempts) - 1))), deadLetterAt: exhausted ? /* @__PURE__ */ new Date() : null, lastProcessingError: reconciled ? "" : (error || "Verified refund still lacks matching amount, currency, identity, or complete local payment evidence").slice(0, 2e3) } });
    return reconciled;
  });
}
async function reconcileVerifiedRefundEvents(context, storeId, limit = 20) {
  await requireFreshCapability(context, "canManagePayments");
  const store = await requireSessionStore(context);
  if (store.id !== storeId) throw new Error("Verified event worker Store does not match the active Store");
  await context.prisma.paymentWebhookEvent.updateMany({ where: { storeId, status: "unmatched", deadLetterAt: null, processingAttempts: { gte: VERIFIED_EVENT_MAX_ATTEMPTS }, nextAttemptAt: { lte: /* @__PURE__ */ new Date() } }, data: { deadLetterAt: /* @__PURE__ */ new Date(), nextAttemptAt: null, lastProcessingError: "Final verification claim expired; operator replay review required" } });
  const events = await context.prisma.paymentWebhookEvent.findMany({ where: { storeId, status: "unmatched", deadLetterAt: null, processingAttempts: { lt: VERIFIED_EVENT_MAX_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: /* @__PURE__ */ new Date() } }], eventType: { in: VERIFIED_REFUND_TYPES } }, orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(50, limit)) });
  let reconciled = 0;
  for (const event of events) if (await reconcileOneVerifiedEvent(context, storeId, event.id)) reconciled++;
  return { scanned: events.length, reconciled };
}
async function replayPaymentWebhookEvent(_root, args, context) {
  await requireFreshCapability(context, "canManagePayments");
  const store = await requireSessionStore(context);
  const reason = args.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new Error("A replay review reason of 3\u2013500 characters is required");
  await context.transaction(async (tc) => {
    const tx = tc.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentWebhookEvent" WHERE "id"=$1 FOR UPDATE', args.eventId);
    const event2 = await tx.paymentWebhookEvent.findUnique({ where: { id: args.eventId } });
    if (!event2 || event2.storeId !== store.id || event2.status !== "unmatched" || !event2.deadLetterAt || !VERIFIED_REFUND_TYPES.includes(event2.eventType)) throw new Error("Only dead-lettered unmatched refunds in the active Store can be replayed");
    await tx.paymentWebhookEvent.update({ where: { id: event2.id }, data: { processingAttempts: 0, nextAttemptAt: null, deadLetterAt: null, lastProcessingError: "", replayAudit: [...Array.isArray(event2.replayAudit) ? event2.replayAudit : [], { actorId: context.session.itemId, reason, replayedAt: (/* @__PURE__ */ new Date()).toISOString(), previousAttempts: event2.processingAttempts, previousError: event2.lastProcessingError }] } });
  });
  const reconciled = await reconcileOneVerifiedEvent(context, store.id, args.eventId);
  const event = await context.prisma.paymentWebhookEvent.findUnique({ where: { id: args.eventId }, select: { status: true, processingAttempts: true, nextAttemptAt: true, deadLetterAt: true, lastProcessingError: true } });
  return { success: reconciled, eventId: args.eventId, ...event };
}
async function handlePaymentProviderWebhook(_root, args, context) {
  await requireFreshCapability(context, "canManagePayments");
  return processPaymentProviderWebhook(args, context);
}

// features/keystone/mutations/manageCustomerPrivacy.ts
var import_node_crypto11 = require("node:crypto");
init_access();
init_groceryOutbox();
init_storeScope();

// features/keystone/lib/privacyPolicy.ts
var CUSTOMER_PRIVACY_POLICY = {
  version: "grocery-retention-v1",
  commerceRetentionDays: 2555,
  description: "Commerce evidence is retained for 2,555 days after the latest order. Account erasure is deferred while an order is active or within this period; afterward identity/contact fields are pseudonymized while financial, inventory and audit facts remain."
};
function privacyErasureEligibility(orders, now = /* @__PURE__ */ new Date()) {
  if (orders.some((order) => !["delivered", "cancelled"].includes(order.status))) return { eligible: false, eligibleAt: null, reason: "An order is still active or awaiting resolution" };
  const latest = orders.reduce((time, order) => Math.max(time, new Date(order.createdAt).getTime()), 0);
  const eligibleAt = latest ? new Date(latest + CUSTOMER_PRIVACY_POLICY.commerceRetentionDays * 864e5) : now;
  return { eligible: eligibleAt.getTime() <= now.getTime(), eligibleAt, reason: eligibleAt.getTime() <= now.getTime() ? "" : "Commerce evidence remains within the configured retention period" };
}
function customerExportIdentity(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}
function scrubOrderContactMetadata(metadata) {
  const contactKey = /(email|phone|address|token|secret|password|recipient|contact|customerName|consentCustomer|vehicle|firstName|lastName)/i;
  const retainedString = /(^id$|Id$|Ids$|Hash$|^hash$|^status$|^state$|^kind$|^source$|^sourceType$|^resolution$|^currency(Code)?$|^unitOfMeasure$|^pricingMethod$|^productTitle$|^productSku$|^sku$|^fulfillmentMethod$|^disposition$|^custody$|At$|^date$|^timeWindow$|^policyVersion$)/;
  function scrub(value, key2 = "") {
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return retainedString.test(key2) ? value : "[redacted]";
    if (Array.isArray(value)) return value.map((entry) => scrub(entry, key2));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([name]) => !contactKey.test(name)).map(([name, entry]) => [name, scrub(entry, name)]));
    return null;
  }
  return { ...scrub(metadata || {}), privacy: { policyVersion: CUSTOMER_PRIVACY_POLICY.version, pseudonymized: true } };
}

// features/keystone/mutations/manageCustomerPrivacy.ts
async function privacyCustomer(context) {
  if (!context.session?.itemId) throw new Error("Sign in to manage your privacy requests");
  const user = await context.prisma.user.findUnique({ where: { id: context.session.itemId }, include: { store: true } });
  if (!user || !user.store?.isActive || user.roleId || user.privacyErasedAt) throw new Error("An active customer account is required");
  return user;
}
async function groceryCustomerPrivacy(_root, args, context) {
  const user = await privacyCustomer(context);
  const page = Math.max(1, Math.trunc(Number(args?.page) || 1));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(args?.pageSize) || 25)));
  const requestCount = await context.prisma.customerPrivacyRequest.count({ where: { userId: user.id, storeId: user.storeId } });
  const requests = await context.prisma.customerPrivacyRequest.findMany({ where: { userId: user.id, storeId: user.storeId }, select: { id: true, kind: true, status: true, createdAt: true, completedAt: true, eligibleAt: true, reviewReason: true, policyVersion: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize });
  return { policy: CUSTOMER_PRIVACY_POLICY, requests, pagination: { page, pageSize, totalPages: Math.max(1, Math.ceil(requestCount / pageSize)), requestCount } };
}
async function requestGroceryCustomerPrivacy(_root, { kind }, context) {
  const user = await privacyCustomer(context);
  if (!["export", "erasure"].includes(kind)) throw new Error("Choose export or erasure");
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', user.id);
    const existing = await tx.customerPrivacyRequest.findFirst({ where: { userId: user.id, kind, status: { in: ["requested", "deferred"] } } });
    if (existing) return { success: true, requestId: existing.id, status: existing.status, reused: true };
    const request = await tx.customerPrivacyRequest.create({ data: { userId: user.id, storeId: user.storeId, kind, status: "requested", policyVersion: CUSTOMER_PRIVACY_POLICY.version } });
    return { success: true, requestId: request.id, status: request.status, reused: false };
  });
}
var EXPORT_COLLECTIONS = ["orders", "orderLines", "actuals", "substitutions", "settlements", "payments", "refunds", "lineRefunds", "addresses", "notificationPreferences", "substitutionPreferences", "shoppingLists", "shoppingListItems", "favorites", "priceAlerts", "stockAlerts", "coupons", "loyalty", "redemptions", "subscriptions", "subscriptionRuns", "messages", "carts", "cartItems", "privacyRequests"];
var pick = (value, keys) => Object.fromEntries(keys.filter((key2) => value?.[key2] !== void 0).map((key2) => [key2, value[key2]]));
var publicEvents = (value) => (Array.isArray(value) ? value : []).map((event) => pick(event, ["action", "at", "nextDeliveryDate", "timezone", "status", "reason"]));
async function exportGroceryCustomerData(_root, args, context) {
  const user = await privacyCustomer(context);
  const tx = context.prisma;
  const request = await tx.customerPrivacyRequest.findUnique({ where: { id: args.requestId } });
  if (!request || request.userId !== user.id || request.storeId !== user.storeId || request.kind !== "export" || request.status === "rejected") throw new Error("Owned export request not found");
  const collection = args.collection || "orders";
  if (!EXPORT_COLLECTIONS.includes(collection)) throw new Error("Unsupported export collection");
  const own = { userId: user.id, storeId: user.storeId }, owner = { userId: user.id }, orderOwner = { order: own }, lineOwner = { lineItem: { order: own } };
  const configuration = {
    orders: { model: "order", where: own, fields: ["id", "displayId", "status", "createdAt", "totalCents", "subtotalCents", "discountCents", "taxCents", "deliveryFeeCents", "currencyCode", "email", "deliveryInstructions", "deliveryDate", "deliveryTimeWindow", "metadata"], map: (row) => {
      const { metadata, ...rest } = row;
      return { ...rest, couponConsumption: pick(metadata?.couponConsumption, ["couponId", "clipId", "consumedAt"]), couponRelease: pick(metadata?.couponRelease, ["couponId", "clipId", "releasedAt", "clipRestored", "reason", "evidenceKind"]), fulfillmentMethod: metadata?.fulfillmentMethod, shippingAddress: pick(metadata?.shippingAddressSnapshot, ["firstName", "lastName", "address1", "address2", "city", "province", "postalCode", "phone"]), finalSale: pick(metadata?.finalSale, ["status", "finalizedAt", "subtotalCents", "discountCents", "taxCents", "feeCents", "totalCents"]), reschedules: (metadata?.deliveryReschedules || []).map((entry) => ({ before: pick(entry.before, ["deliveryDate", "deliveryTimeWindow", "selectedFulfillmentSlot"]), after: pick(entry.after, ["deliveryDate", "deliveryTimeWindow", "selectedFulfillmentSlot"]), customerApproval: typeof entry.customerApproval === "string" ? entry.customerApproval : pick(entry.customerApproval, ["channel", "customer", "recordedAt", "details"]) })) };
    } },
    orderLines: { model: "orderLineItem", where: orderOwner, fields: ["id", "orderId", "title", "sku", "quantity", "unitPriceCents"] },
    actuals: { model: "orderLineFulfillment", where: lineOwner, fields: ["id", "lineItemId", "resolution", "productTitle", "productSku", "unitOfMeasure", "quantityMilli", "grossMilli", "tareMilli", "unitPriceCents", "subtotalCents", "taxRateBasisPoints", "createdAt", "evidence"], map: (row) => {
      const { evidence, ...rest } = row;
      return { ...rest, reason: evidence?.reason, consent: pick(evidence?.consent, ["channel", "customer", "recordedAt", "details"]) };
    } },
    substitutions: { model: "orderItemSubstitution", where: lineOwner, fields: ["id", "lineItemId", "originalProduct", "substitutedProduct", "reason", "customerApproved", "approvedAt", "createdAt"] },
    settlements: { model: "orderSettlement", where: orderOwner, fields: ["id", "orderId", "status", "totalCents", "createdAt", "providerEvidence"], map: (row) => {
      const { providerEvidence, ...rest } = row;
      return { ...rest, customerApproval: pick(providerEvidence?.customerApproval, ["at", "totalCents"]) };
    } },
    payments: { model: "payment", where: orderOwner, fields: ["id", "orderId", "status", "amountCents", "paymentMethod", "processedAt", "createdAt"] },
    refunds: { model: "paymentRefund", where: { payment: orderOwner }, fields: ["id", "paymentId", "status", "amountCents", "requestedAt", "processedAt", "providerData"], map: (row) => {
      const { providerData, ...rest } = row;
      return { ...rest, reason: providerData?.requestReason, commercialAdjustments: pick(providerData?.commercialAdjustments, ["kind", "netGoodsCents", "taxCents", "discountCents", "totalCents", "currencyCode"]) };
    } },
    lineRefunds: { model: "orderLineRefund", where: orderOwner, fields: ["id", "orderId", "lineItemId", "paymentRefundId", "productTitle", "quantityMilli", "unitOfMeasure", "subtotalCents", "discountCents", "netGoodsCents", "taxCents", "totalCents", "currencyCode", "disposition", "conditionNote", "reason", "status", "processedAt"] },
    addresses: { model: "address", where: owner, fields: ["id", "firstName", "lastName", "company", "address1", "address2", "city", "province", "postalCode", "phone"] },
    notificationPreferences: { model: "notificationPreference", where: owner, fields: ["id", "orderUpdates", "deliveryAlerts", "priceDrops", "backInStock", "weeklyDeals", "channels", "updatedAt"] },
    substitutionPreferences: { model: "substitutionPreference", where: owner, fields: ["id", "allowSubstitutions", "preferSimilarBrand", "preferSimilarSize", "contactBeforeSubstitute", "updatedAt"] },
    shoppingLists: { model: "shoppingList", where: owner, fields: ["id", "name", "isDefault", "createdAt"] },
    shoppingListItems: { model: "shoppingListItem", where: { list: owner }, fields: ["id", "listId", "product", "quantity", "unit", "checked", "notes", "addedAt"] },
    favorites: { model: "favoriteProduct", where: owner, fields: ["id", "product", "favoritedAt"] },
    priceAlerts: { model: "priceAlert", where: owner, fields: ["id", "product", "targetPrice", "currentPrice", "isTriggered", "notifiedAt"] },
    stockAlerts: { model: "backInStockAlert", where: owner, fields: ["id", "product", "isActive", "createdAt", "notifiedAt"] },
    coupons: { model: "userCoupon", where: owner, fields: ["id", "couponId", "clippedAt", "used", "usedAt", "usedByOrderId"] },
    loyalty: { model: "loyaltyTransaction", where: own, fields: ["id", "orderId", "points", "type", "description", "balanceBefore", "balanceAfter", "transactionDate", "expiresAt"] },
    redemptions: { model: "loyaltyRedemption", where: own, fields: ["id", "orderId", "points", "discountCents", "status", "usedAt", "createdAt"] },
    subscriptions: { model: "subscription", where: own, fields: ["id", "product", "quantity", "frequency", "nextDeliveryDate", "scheduleTimezone", "status", "isActive", "pausedUntil", "createdAt", "consent", "events"], map: (row) => ({ ...row, consent: pick(row.consent, ["approveEachOrder", "at", "policy"]), events: publicEvents(row.events) }) },
    subscriptionRuns: { model: "subscriptionRun", where: own, fields: ["id", "subscriptionId", "dueAt", "status", "productTitle", "quantity", "priceCents", "orderId", "failureReason", "events"], map: (row) => ({ ...row, events: publicEvents(row.events) }) },
    messages: { model: "customerMessage", where: own, fields: ["id", "orderId", "recipient", "subject", "body", "channel", "status", "attempts", "sentAt", "createdAt"], map: (row) => ({ ...row, body: String(row.body || "").replace(/https?:\/\/\S+\/order-access#\S+/g, "[Private access link omitted]") }) },
    carts: { model: "cart", where: { customerId: user.id, storeId: user.storeId }, fields: ["id", "subtotalCents", "itemCount", "createdAt", "updatedAt"] },
    cartItems: { model: "cartItem", where: { cart: { customerId: user.id, storeId: user.storeId } }, fields: ["id", "cartId", "productId", "quantity", "subtotalCents", "substitutionPreference", "addedAt"] },
    privacyRequests: { model: "customerPrivacyRequest", where: own, fields: ["id", "kind", "status", "policyVersion", "reviewReason", "createdAt", "reviewedAt", "eligibleAt", "completedAt"] }
  };
  const config2 = configuration[collection], afterId = args.afterId || (collection === "orders" ? args.afterOrderId : void 0);
  const rows = await tx[config2.model].findMany({ where: { ...config2.where, ...afterId ? { id: { gt: afterId } } : {} }, orderBy: { id: "asc" }, take: 101, select: Object.fromEntries(config2.fields.map((field) => [field, true])) });
  const hasMore = rows.length > 100, records = rows.slice(0, 100).map((row) => config2.map ? config2.map(row) : row);
  if (!hasMore) await context.transaction(async (tc) => {
    await tc.prisma.$queryRawUnsafe('SELECT "id" FROM "CustomerPrivacyRequest" WHERE "id"=$1 FOR UPDATE', request.id);
    const current = await tc.prisma.customerPrivacyRequest.findUnique({ where: { id: request.id } });
    const progress = { ...current.resultSummary?.exportProgress || {}, [collection]: true };
    const complete = EXPORT_COLLECTIONS.every((name) => progress[name]);
    await tc.prisma.customerPrivacyRequest.update({ where: { id: request.id }, data: { status: complete ? "completed" : "requested", completedAt: complete ? /* @__PURE__ */ new Date() : null, resultSummary: { delivery: "Authenticated per-collection paginated download", policyVersion: CUSTOMER_PRIVACY_POLICY.version, exportProgress: progress } } });
  });
  return { policy: CUSTOMER_PRIVACY_POLICY, identity: customerExportIdentity(user), collections: EXPORT_COLLECTIONS, collection, records, nextId: hasMore ? records.at(-1)?.id : null, ...collection === "orders" ? { orders: records, nextOrderId: hasMore ? records.at(-1)?.id : null } : {} };
}
async function reviewGroceryCustomerErasure(_root, args, context) {
  await requireFreshCapability(context, "canManageUsers");
  const store = await requireSessionStore(context);
  const reason = args.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new Error("A review reason of 3\u2013500 characters is required");
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', store.id);
    const actor = await tx.user.findUnique({ where: { id: context.session.itemId }, include: { role: true } });
    if (actor?.storeId !== store.id || actor.privacyErasedAt || !actor.role?.canManageUsers) throw new Error("Current staff-administration capability required");
    const request = await tx.customerPrivacyRequest.findUnique({ where: { id: args.requestId } });
    if (!request || request.storeId !== store.id || request.kind !== "erasure") throw new Error("Erasure request not found in active Store");
    if (request.status === "completed") return { success: true, status: "completed", reused: true };
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', request.userId);
    const user = await tx.user.findUnique({ where: { id: request.userId } });
    if (!user || user.storeId !== store.id || user.roleId) throw new Error("Staff identities require staff lifecycle administration");
    const review = { reviewedById: context.session.itemId, reviewedAt: /* @__PURE__ */ new Date(), reviewReason: reason, policyVersion: CUSTOMER_PRIVACY_POLICY.version };
    if (!args.approve) {
      await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: "rejected" } });
      return { success: true, status: "rejected" };
    }
    const activeDelivery = await tx.customerMessage.findFirst({ where: { userId: user.id, storeId: store.id, deliveryLeaseExpiresAt: { gt: /* @__PURE__ */ new Date() } } });
    if (activeDelivery) {
      await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: "deferred", resultSummary: { reason: "An authorized message or external event delivery is in progress" } } });
      return { success: true, status: "deferred", message: "Wait for the active communication delivery to finish before erasure" };
    }
    let orders = await tx.order.findMany({ where: { userId: user.id, storeId: store.id }, orderBy: { id: "asc" } });
    const carts = await tx.cart.findMany({ where: { customerId: user.id, storeId: store.id }, select: { id: true }, orderBy: { id: "asc" } });
    for (const cart of carts) await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', cart.id);
    const pendingSession = await tx.paymentSession.findFirst({ where: { OR: [{ cartId: { in: carts.map((cart) => cart.id) } }, { data: { path: ["checkoutOwnerId"], equals: user.id } }], NOT: ["completed", "failed", "expired"].map((status) => ({ data: { path: ["status"], equals: status } })) } });
    if (pendingSession && !["completed", "failed", "expired"].includes(pendingSession.data?.status)) {
      await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: "deferred", resultSummary: { reason: "Payment authorization or provider initiation remains unresolved" } } });
      return { success: true, status: "deferred", message: "Resolve the active checkout authorization before erasure" };
    }
    const unresolvedCheckout = await tx.checkoutAttempt.findFirst({ where: { storeId: store.id, OR: [{ cart: { customerId: user.id } }, { requestData: { path: ["checkoutOwnerId"], equals: user.id } }, { order: { userId: user.id } }], status: { notIn: ["finalized", "compensated", "failed"] } } });
    if (unresolvedCheckout) {
      await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: "deferred", resultSummary: { reason: "Checkout payment recovery remains unresolved" } } });
      return { success: true, status: "deferred", message: "Resolve checkout payment recovery before erasure" };
    }
    for (const order of orders) await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', order.id);
    orders = await tx.order.findMany({ where: { userId: user.id, storeId: store.id }, orderBy: { id: "asc" } });
    let finances = await tx.payment.findMany({ where: { orderId: { in: orders.map((order) => order.id) }, storeId: store.id }, orderBy: { id: "asc" } });
    for (const payment of finances) await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', payment.id);
    finances = await tx.payment.findMany({ where: { orderId: { in: orders.map((order) => order.id) }, storeId: store.id }, orderBy: { id: "asc" } });
    const openRefund = await tx.paymentRefund.findFirst({ where: { paymentId: { in: finances.map((payment) => payment.id) }, status: "processing" } });
    const openSettlement = await tx.orderSettlement.findFirst({ where: { orderId: { in: orders.map((order) => order.id) }, status: { in: ["processing", "requires_customer_authorization"] } } });
    if (openRefund || openSettlement || finances.some((payment) => ["authorized", "pending", "processing"].includes(payment.status))) {
      await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: "deferred", resultSummary: { reason: "Financial settlement or refund remains unresolved" } } });
      return { success: true, status: "deferred", message: "Resolve financial processing before erasure" };
    }
    const eligibility = privacyErasureEligibility(orders);
    if (!eligibility.eligible) {
      await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: "deferred", eligibleAt: eligibility.eligibleAt, resultSummary: { retained: "commerce and account evidence", reason: eligibility.reason } } });
      return { success: true, status: "deferred", eligibleAt: eligibility.eligibleAt, message: eligibility.reason };
    }
    for (const order of orders) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', order.id);
      await tx.order.update({ where: { id: order.id }, data: { email: `erased-${user.id}@invalid.local`, deliveryInstructions: "", metadata: scrubOrderContactMetadata(order.metadata) } });
    }
    const orderIds = orders.map((order) => order.id);
    const fulfillmentRows = await tx.orderLineFulfillment.findMany({ where: { lineItem: { orderId: { in: orderIds } } } });
    for (const row of fulfillmentRows) await tx.orderLineFulfillment.update({ where: { id: row.id }, data: { evidence: scrubOrderContactMetadata(row.evidence) } });
    await tx.orderItemSubstitution.updateMany({ where: { lineItem: { orderId: { in: orderIds } } }, data: { reason: "[redacted after privacy review]" } });
    const lineRefunds = await tx.orderLineRefund.findMany({ where: { orderId: { in: orderIds } } });
    for (const row of lineRefunds) await tx.orderLineRefund.update({ where: { id: row.id }, data: { reason: "[redacted after privacy review]", conditionNote: "", failureMessage: "", events: (Array.isArray(row.events) ? row.events : []).map(scrubOrderContactMetadata), returnedLots: (Array.isArray(row.returnedLots) ? row.returnedLots : []).map(scrubOrderContactMetadata) } });
    const settlements = await tx.orderSettlement.findMany({ where: { orderId: { in: orderIds } } });
    for (const row of settlements) await tx.orderSettlement.update({ where: { id: row.id }, data: { snapshot: scrubOrderContactMetadata(row.snapshot), providerEvidence: scrubOrderContactMetadata(row.providerEvidence) } });
    const paymentRows = await tx.payment.findMany({ where: { orderId: { in: orderIds }, storeId: store.id } });
    for (const row of paymentRows) await tx.payment.update({ where: { id: row.id }, data: { providerData: scrubOrderContactMetadata(row.providerData) } });
    const webhookEvents = await tx.paymentWebhookEvent.findMany({ where: { paymentRecordId: { in: paymentRows.map((payment) => payment.id) }, storeId: store.id } });
    for (const event of webhookEvents) await tx.paymentWebhookEvent.update({ where: { id: event.id }, data: { verifiedPayload: scrubOrderContactMetadata(event.verifiedPayload) } });
    const refunds = await tx.paymentRefund.findMany({ where: { paymentId: { in: paymentRows.map((payment) => payment.id) } } });
    for (const row of refunds) await tx.paymentRefund.update({ where: { id: row.id }, data: { providerData: scrubOrderContactMetadata(row.providerData), failureMessage: "" } });
    await tx.checkoutAttempt.updateMany({ where: { storeId: store.id, OR: [{ cart: { customerId: user.id } }, { requestData: { path: ["checkoutOwnerId"], equals: user.id } }, { order: { userId: user.id } }] }, data: { requestData: { privacy: { pseudonymized: true, policyVersion: CUSTOMER_PRIVACY_POLICY.version } } } });
    const sessions = await tx.paymentSession.findMany({ where: { OR: [{ cartId: { in: carts.map((cart) => cart.id) } }, { checkoutAttempts: { some: { orderId: { in: orderIds } } } }] } });
    for (const session of sessions) await tx.paymentSession.update({ where: { id: session.id }, data: { data: scrubOrderContactMetadata(session.data) } });
    const outbox = await tx.groceryOutboxEvent.findMany({ where: { storeId: store.id, OR: [{ aggregateId: { in: [user.id, ...orderIds, ...paymentRows.map((payment) => payment.id)] } }, { payload: { path: ["userId"], equals: user.id } }, ...orderIds.map((orderId) => ({ payload: { path: ["orderId"], equals: orderId } }))] } });
    const redactedEventHashes = [];
    for (const event of outbox) {
      const payload = scrubOrderContactMetadata(event.payload);
      redactedEventHashes.push({ eventId: event.id, originalPayloadHash: event.payloadHash });
      await tx.groceryOutboxEvent.update({ where: { id: event.id }, data: { payload, payloadHash: groceryOutboxPayloadHash(payload), status: "suppressed", claimToken: "", lastError: "Suppressed after approved privacy retention review" } });
    }
    await tx.customerMessage.updateMany({ where: { storeId: store.id, OR: [{ userId: user.id }, { orderId: { in: orderIds } }, { recipient: user.email }] }, data: { recipient: "[erased]", subject: "[erased]", body: "[erased]", status: "suppressed", failureMessage: "", providerEvidence: { privacy: { pseudonymized: true } } } });
    const subscriptions = await tx.subscription.findMany({ where: { userId: user.id, storeId: store.id } });
    for (const row of subscriptions) await tx.subscription.update({ where: { id: row.id }, data: { status: "cancelled", isActive: false, consent: scrubOrderContactMetadata(row.consent), events: (Array.isArray(row.events) ? row.events : []).map(scrubOrderContactMetadata) } });
    const recurringRuns = await tx.subscriptionRun.findMany({ where: { userId: user.id, storeId: store.id } });
    for (const row of recurringRuns) await tx.subscriptionRun.update({ where: { id: row.id }, data: { failureReason: "", events: (Array.isArray(row.events) ? row.events : []).map(scrubOrderContactMetadata) } });
    const rewards = await tx.loyaltyTransaction.findMany({ where: { userId: user.id, storeId: store.id } });
    for (const row of rewards) await tx.loyaltyTransaction.update({ where: { id: row.id }, data: { description: "Retained pseudonymous rewards entry", metadata: scrubOrderContactMetadata(row.metadata) } });
    const redemptions = await tx.loyaltyRedemption.findMany({ where: { userId: user.id, storeId: store.id } });
    for (const row of redemptions) await tx.loyaltyRedemption.update({ where: { id: row.id }, data: { events: (Array.isArray(row.events) ? row.events : []).map(scrubOrderContactMetadata) } });
    const requestedLines = await tx.orderLineItem.findMany({ where: { orderId: { in: orderIds } } });
    for (const row of requestedLines) await tx.orderLineItem.update({ where: { id: row.id }, data: { metadata: scrubOrderContactMetadata(row.metadata) } });
    await tx.substitutionPreference.deleteMany({ where: { userId: user.id } });
    const routes = await tx.deliveryRoute.findMany({ where: { storeId: store.id, orders: { some: { id: { in: orderIds } } } } });
    for (const route of routes) await tx.deliveryRoute.update({ where: { id: route.id }, data: { stops: (Array.isArray(route.stops) ? route.stops : []).map((stop) => orderIds.includes(stop.orderId) ? scrubOrderContactMetadata(stop) : stop) } });
    await tx.address.updateMany({ where: { userId: user.id }, data: { firstName: "", lastName: "", company: "", address1: "[erased]", address2: "", city: "[erased]", province: "", postalCode: "[erased]", phone: "" } });
    const lists = await tx.shoppingList.findMany({ where: { userId: user.id }, select: { id: true } });
    await tx.shoppingListItem.deleteMany({ where: { listId: { in: lists.map((list65) => list65.id) } } });
    await tx.shoppingList.deleteMany({ where: { userId: user.id } });
    await tx.cartItem.deleteMany({ where: { cartId: { in: carts.map((cart) => cart.id) } } });
    for (const cart of carts) await tx.cart.update({ where: { id: cart.id }, data: { customerId: null, sessionId: (0, import_node_crypto11.randomBytes)(32).toString("hex"), subtotal: 0, subtotalCents: 0, itemCount: 0 } });
    await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
    await tx.favoriteProduct.deleteMany({ where: { userId: user.id } });
    await tx.priceAlert.deleteMany({ where: { userId: user.id } });
    await tx.backInStockAlert.deleteMany({ where: { userId: user.id } });
    await transactionContext.sudo().db.User.updateOne({ where: { id: user.id }, data: { name: "Erased customer", email: `erased-${user.id}@invalid.local`, password: (0, import_node_crypto11.randomBytes)(48).toString("base64url") } });
    await tx.user.update({ where: { id: user.id }, data: { privacyErasedAt: /* @__PURE__ */ new Date() } });
    await tx.customerPrivacyRequest.update({ where: { id: request.id }, data: { ...review, status: "completed", completedAt: /* @__PURE__ */ new Date(), resultSummary: { retained: "Pseudonymous transaction, inventory and audit identifiers; monetary records unchanged", erased: "Account identity, addresses, nested order/fulfillment/delivery contact, checkout data, message content, reusable lists and notification preferences", redactedEventHashes, policyVersion: CUSTOMER_PRIVACY_POLICY.version } } });
    return { success: true, status: "completed" };
  });
}

// features/keystone/mutations/manageGroceryStaff.ts
init_access();
init_storeScope();
init_groceryOutbox();

// features/keystone/lib/staffInvitations.ts
var import_node_crypto12 = require("node:crypto");
var STAFF_CAPABILITIES = ["canManageProducts", "canManageOrders", "canManageInventory", "canManageSuppliers", "canManageDelivery", "canManageUsers", "canManagePayments", "canManageOnboarding", "canAccessDashboard"];
function normalizeStaffCapabilities(input, actor) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("An explicit capability map is required");
  if (Object.keys(input).some((key2) => !STAFF_CAPABILITIES.includes(key2))) throw new Error("Unknown staff capability");
  const result = {};
  for (const key2 of STAFF_CAPABILITIES) {
    const value = input[key2] ?? false;
    if (typeof value !== "boolean") throw new Error("Capabilities must be boolean");
    if (value && actor[key2] !== true) throw new Error(`Cannot grant capability not currently held: ${key2}`);
    result[key2] = value;
  }
  if (Object.values(result).some(Boolean) && !result.canAccessDashboard) throw new Error("Staff capabilities require dashboard access");
  return result;
}
function staffInvitationHash(token) {
  return (0, import_node_crypto12.createHash)("sha256").update(token).digest("hex");
}
function verifyStaffInvitationToken(token, hash) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return (0, import_node_crypto12.timingSafeEqual)(Buffer.from(staffInvitationHash(token), "hex"), Buffer.from(hash, "hex"));
}
function encryptionKey(secret2) {
  return (0, import_node_crypto12.createHash)("sha256").update(`grocery-staff-invitation:v1:${secret2}`).digest();
}
function encryptStaffInvitationToken(token, secret2 = getSessionSecret()) {
  const nonce = (0, import_node_crypto12.randomBytes)(12);
  const cipher = (0, import_node_crypto12.createCipheriv)("aes-256-gcm", encryptionKey(secret2), nonce);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}
function createStaffInvitationToken() {
  return (0, import_node_crypto12.randomBytes)(32).toString("base64url");
}
function assertLastManagerSafe(target, next, managerCount) {
  if (target?.role?.canManageUsers && target.role.canAccessDashboard && !(next.canManageUsers && next.canAccessDashboard) && managerCount <= 1) throw new Error("The last staff administrator cannot be revoked or downgraded");
}

// features/keystone/mutations/manageGroceryStaff.ts
async function lockedStaffActor(tx, actorId, storeId) {
  await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', storeId);
  await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', actorId);
  const actor = await tx.user.findUnique({ where: { id: actorId }, include: { role: true, store: true } });
  if (actor?.storeId !== storeId || !actor.store?.isActive || !actor.role?.canManageUsers) throw new Error("Current staff-administration capability required");
  return actor;
}
async function groceryStaffDirectory(_root, args, context) {
  await requireFreshCapability(context, "canManageUsers");
  const store = await requireSessionStore(context);
  const tx = context.prisma;
  const page = Math.max(1, Math.trunc(Number(args?.page) || 1));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(args?.pageSize) || 25)));
  const skip = (page - 1) * pageSize;
  const staffWhere = { storeId: store.id, OR: [{ roleId: { not: null } }, { staffAccessEvents: { some: { storeId: store.id } } }] };
  const [staff, invitations, events, privacyRequests, staffCount, invitationCount, eventCount, privacyCount] = await Promise.all([
    tx.user.findMany({ where: staffWhere, select: { id: true, name: true, email: true, role: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: pageSize, skip }),
    tx.staffInvitation.findMany({ where: { storeId: store.id, status: "pending" }, select: { id: true, email: true, name: true, status: true, capabilities: true, expiresAt: true }, orderBy: { createdAt: "desc" }, take: pageSize, skip }),
    tx.staffAccessEvent.findMany({ where: { storeId: store.id }, select: { id: true, action: true, reason: true, createdAt: true, subject: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: pageSize, skip }),
    tx.customerPrivacyRequest.findMany({ where: { storeId: store.id, status: { in: ["requested", "deferred"] } }, select: { id: true, kind: true, status: true, eligibleAt: true, createdAt: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" }, take: pageSize, skip }),
    tx.user.count({ where: staffWhere }),
    tx.staffInvitation.count({ where: { storeId: store.id, status: "pending" } }),
    tx.staffAccessEvent.count({ where: { storeId: store.id } }),
    tx.customerPrivacyRequest.count({ where: { storeId: store.id, status: { in: ["requested", "deferred"] } } })
  ]);
  return { staff, invitations, events, privacyRequests, pagination: { page, pageSize, totalPages: Math.max(1, Math.ceil(Math.max(staffCount, invitationCount, eventCount, privacyCount) / pageSize)), counts: { staffCount, invitationCount, eventCount, privacyCount } } };
}
async function inviteGroceryStaff(_root, args, context) {
  await requireFreshCapability(context, "canManageUsers");
  const store = await requireSessionStore(context);
  const email = args.email.trim().toLowerCase(), name = args.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2 || name.length > 120) throw new Error("A valid name and email are required");
  const token = createStaffInvitationToken();
  const encryptedToken = encryptStaffInvitationToken(token);
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const actor = await lockedStaffActor(tx, context.session.itemId, store.id);
    const capabilities = normalizeStaffCapabilities(args.capabilities, actor.role);
    if (await tx.user.findUnique({ where: { email } })) throw new Error("An account already uses this email; invite a separate staff identity");
    const pending = await tx.staffInvitation.findFirst({ where: { email, storeId: store.id, status: "pending", expiresAt: { gt: /* @__PURE__ */ new Date() } } });
    if (pending) throw new Error("A pending invitation already exists; revoke it before replacing it");
    const invitation = await tx.staffInvitation.create({ data: { storeId: store.id, name, email, tokenHash: staffInvitationHash(token), capabilities, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1e3), invitedById: actor.id, status: "pending" } });
    await tx.staffAccessEvent.create({ data: { storeId: store.id, actorId: actor.id, invitationId: invitation.id, action: "invited", reason: "Staff invitation", after: capabilities } });
    await enqueueGroceryOutboxEvent(tx, { storeId: store.id, eventKey: `staff-invitation:${invitation.id}`, eventType: "staff.invited", aggregateType: "StaffInvitation", aggregateId: invitation.id, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { invitationId: invitation.id, encryptedToken } });
    return { success: true, invitationId: invitation.id, expiresAt: invitation.expiresAt };
  });
}
async function acceptGroceryStaffInvitation(_root, args, context) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(args.token) || args.password.length < 12 || args.password.length > 128) throw new Error("Valid invitation and a password of 12\u2013128 characters are required");
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const found = await tx.staffInvitation.findUnique({ where: { tokenHash: staffInvitationHash(args.token) } });
    if (!found) throw new Error("Invitation is invalid or expired");
    await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', found.storeId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "StaffInvitation" WHERE "id" = $1 FOR UPDATE', found.id);
    const invitation = await tx.staffInvitation.findUnique({ where: { id: found.id }, include: { store: true } });
    if (!invitation || invitation.status !== "pending" || !invitation.store?.isActive || new Date(invitation.expiresAt).getTime() <= Date.now() || !verifyStaffInvitationToken(args.token, invitation.tokenHash)) throw new Error("Invitation is invalid or expired");
    const actor = await tx.user.findUnique({ where: { id: invitation.invitedById }, include: { role: true } });
    if (actor?.storeId !== invitation.storeId || !actor.role?.canManageUsers) throw new Error("Inviter no longer has staff-administration authority");
    const capabilities = normalizeStaffCapabilities(invitation.capabilities, actor.role);
    if (await tx.user.findUnique({ where: { email: invitation.email } })) throw new Error("An account already uses this invitation email");
    const role = await tx.role.create({ data: { name: `${invitation.name} staff`, storeId: invitation.storeId, ...capabilities } });
    const user = await transactionContext.sudo().db.User.createOne({ data: { name: invitation.name, email: invitation.email, password: args.password, store: { connect: { id: invitation.storeId } }, role: { connect: { id: role.id } }, onboardingStatus: "completed" } });
    await tx.staffInvitation.update({ where: { id: invitation.id }, data: { status: "accepted", acceptedAt: /* @__PURE__ */ new Date(), acceptedUserId: user.id } });
    await tx.staffAccessEvent.create({ data: { storeId: invitation.storeId, actorId: invitation.invitedById, subjectId: user.id, invitationId: invitation.id, action: "accepted", reason: "Invitation accepted by token holder", after: capabilities } });
    return { success: true, message: "Staff account created. Sign in with your email and password." };
  });
}
async function updateGroceryStaffAccess(_root, args, context) {
  await requireFreshCapability(context, "canManageUsers");
  const store = await requireSessionStore(context);
  const reason = args.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new Error("A reason of 3\u2013500 characters is required");
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const actor = await lockedStaffActor(tx, context.session.itemId, store.id);
    const next = normalizeStaffCapabilities(args.capabilities, actor.role);
    const target = await tx.user.findUnique({ where: { id: args.userId }, include: { role: true } });
    if (!target || target.storeId !== store.id || target.privacyErasedAt || !target.role && !await tx.staffAccessEvent.count({ where: { storeId: store.id, subjectId: target.id } })) throw new Error("Staff identity not found in active Store");
    const managers = await tx.user.count({ where: { storeId: store.id, role: { canManageUsers: true, canAccessDashboard: true } } });
    assertLastManagerSafe(target, next, managers);
    const role = Object.values(next).some(Boolean) ? await tx.role.create({ data: { name: `${target.name} staff`, storeId: store.id, ...next } }) : null;
    await tx.user.update({ where: { id: target.id }, data: { roleId: role?.id || null } });
    await tx.staffAccessEvent.create({ data: { storeId: store.id, actorId: actor.id, subjectId: target.id, action: role ? "access_changed" : "access_revoked", reason, before: Object.fromEntries(STAFF_CAPABILITIES.map((key2) => [key2, Boolean(target.role?.[key2])])), after: next } });
    return { success: true, userId: target.id, revoked: !role };
  });
}
async function revokeGroceryStaffInvitation(_root, args, context) {
  await requireFreshCapability(context, "canManageUsers");
  const store = await requireSessionStore(context);
  if (args.reason.trim().length < 3 || args.reason.length > 500) throw new Error("A reason is required");
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const actor = await lockedStaffActor(tx, context.session.itemId, store.id);
    const invitation = await tx.staffInvitation.findUnique({ where: { id: args.invitationId } });
    if (!invitation || invitation.storeId !== store.id || invitation.status !== "pending") throw new Error("Pending invitation not found");
    await tx.staffInvitation.update({ where: { id: invitation.id }, data: { status: "revoked" } });
    await tx.staffAccessEvent.create({ data: { storeId: store.id, actorId: actor.id, invitationId: invitation.id, action: "invitation_revoked", reason: args.reason.trim() } });
    return { success: true };
  });
}

// features/keystone/mutations/voidGroceryPaymentAuthorization.ts
var import_node_crypto13 = require("node:crypto");
init_access();
init_storeScope();
init_paymentProviderAdapter();
init_managePaymentRefund();
init_serializableTransaction();
init_groceryOutbox();
var LEASE_MS = 3e4;
async function voidGroceryPaymentAuthorization(_root, args, context) {
  await requireFreshCapability(context, "canManagePayments");
  const store = await requireSessionStore(context);
  const reason = args.reason.trim();
  const key2 = args.idempotencyKey.trim();
  if (reason.length < 3 || reason.length > 470 || key2.length < 12 || key2.length > 180) throw new Error("A reason and stable authorization void key are required");
  const token = (0, import_node_crypto13.randomUUID)();
  const claim = await withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    const identity2 = await tx.payment.findUnique({ where: { id: args.paymentId }, select: { orderId: true, storeId: true } });
    if (!identity2 || identity2.storeId !== store.id) throw new Error("Payment not found in active Store");
    if (identity2.orderId) await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', identity2.orderId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const payment = await tx.payment.findUnique({ where: { id: args.paymentId }, include: { paymentProvider: true } });
    if (!payment || payment.storeId !== store.id) throw new Error("Payment not found in active Store");
    const noCharge = noChargeOrderPaymentState(payment);
    if (payment.providerPaymentId?.startsWith("grocery_no_charge:") && !noCharge) throw new Error("Invalid server no-charge checkout evidence");
    if (noCharge && noCharge.currency !== store.currencyCode.toLowerCase()) throw new Error("Original no-charge currency does not match the active Store");
    const old = payment.providerData?.authorizationVoid;
    if (old && (old.key !== key2 || old.reason !== reason)) throw new Error("Authorization void key or reason conflicts with existing request");
    if (old?.status === "completed" && (["cancelled", "refunded"].includes(payment.status) || noCharge && payment.status === "succeeded")) return { payment, noCharge, reused: true, execute: false };
    const settlement = identity2.orderId ? await tx.orderSettlement.findFirst({ where: { orderId: identity2.orderId, status: { in: ["processing", "requires_customer_authorization"] } } }) : null;
    if (settlement?.status === "processing") throw new Error("A final sale is processing; resolve it before voiding authorization");
    if (!["authorized", "pending"].includes(payment.status) && !(settlement && ["succeeded", "partially_refunded", "refunded"].includes(payment.status))) throw new Error("Only an active authorization or unresolved revised sale can be voided");
    if (settlement?.providerEvidence?.authorizationInitiatedAt && !settlement.providerEvidence?.reauthorization?.paymentIntentId) throw new Error("Recover the revised authorization identity before abandoning this sale");
    if (settlement?.providerEvidence?.finalizationLease?.expiresAt && new Date(settlement.providerEvidence.finalizationLease.expiresAt).getTime() > Date.now()) throw new Error("Finalization is in flight");
    if (settlement?.providerEvidence?.authorizationCreationLease?.expiresAt && new Date(settlement.providerEvidence.authorizationCreationLease.expiresAt).getTime() > Date.now()) throw new Error("Revised authorization creation is in flight");
    if (old?.leaseExpiresAt && new Date(old.leaseExpiresAt).getTime() > Date.now()) return { payment, noCharge, reused: true, execute: false };
    if (!payment.providerPaymentId || !payment.paymentProvider?.isInstalled) throw new Error("Authorization provider is unavailable");
    await tx.payment.update({ where: { id: payment.id }, data: { providerData: { ...payment.providerData || {}, authorizationVoid: { ...old || {}, key: key2, reason, status: "processing", actorId: context.session.itemId, requestedAt: old?.requestedAt || (/* @__PURE__ */ new Date()).toISOString(), token, leaseExpiresAt: new Date(Date.now() + LEASE_MS).toISOString() } } } });
    if (settlement) await tx.orderSettlement.update({ where: { id: settlement.id }, data: { providerEvidence: { ...settlement.providerEvidence || {}, abandonment: { token, key: key2, reason, status: "processing", leaseExpiresAt: new Date(Date.now() + LEASE_MS).toISOString() } } } });
    return { payment, noCharge, settlement, reused: Boolean(old), execute: true };
  }, { isolationLevel: "ReadCommitted" }));
  if (!claim.execute) return {
    success: ["cancelled", "refunded"].includes(claim.payment.status) || Boolean(claim.noCharge && claim.payment.status === "succeeded" && claim.payment.providerData?.authorizationVoid?.status === "completed"),
    paymentId: args.paymentId,
    status: claim.payment.status,
    reused: true
  };
  let result;
  try {
    const revisedId = claim.settlement?.providerEvidence?.reauthorization?.paymentIntentId;
    if (revisedId) {
      const revised = await getPaymentStatus({ provider: claim.payment.paymentProvider, paymentId: revisedId });
      const voided = ["canceled", "cancelled"].includes(revised.status) ? revised : await cancelPayment({ provider: claim.payment.paymentProvider, paymentId: revisedId, idempotencyKey: `${key2}:revised` });
      if (!["canceled", "cancelled"].includes(voided.status) || Number(voided.capturedAmountCents ?? voided.amountCents ?? voided.amount) !== 0 || String(voided.currency || "").toLowerCase() !== store.currencyCode.toLowerCase()) throw new Error("Revised authorization void is not confirmed");
    }
    const current = claim.noCharge || await getPaymentStatus({ provider: claim.payment.paymentProvider, paymentId: claim.payment.providerPaymentId });
    if (claim.noCharge) {
      result = current;
    } else if (["succeeded", "captured"].includes(current.status)) {
      if (String(current.currency || "").toLowerCase() !== store.currencyCode.toLowerCase() || Number(current.capturedAmountCents ?? current.amountCents ?? current.amount) !== claim.payment.amountCents) throw new Error("Original captured amount or currency does not match the local payment");
      const tx = context.prisma;
      const successful = await tx.paymentRefund.aggregate({ where: { paymentId: args.paymentId, status: "succeeded" }, _sum: { amountCents: true } });
      const remaining = claim.payment.amountCents - Number(successful._sum.amountCents || 0);
      if (remaining > 0) {
        const refund = await refundPaymentForOrder(null, { paymentId: args.paymentId, amountCents: remaining, reason: `Abandoned revised sale: ${reason}`, idempotencyKey: `${key2}:original-refund` }, context);
        if (refund.status !== "succeeded") throw new Error("Original payment refund is unresolved");
      }
      result = { status: "refunded", currency: store.currencyCode, capturedAmountCents: 0 };
    } else {
      result = ["canceled", "cancelled"].includes(current.status) ? current : await cancelPayment({ provider: claim.payment.paymentProvider, paymentId: claim.payment.providerPaymentId, idempotencyKey: key2 });
      if (!["canceled", "cancelled"].includes(result.status) || Number(result.capturedAmountCents ?? result.amountCents ?? result.amount) !== 0 || String(result.currency || "").toLowerCase() !== store.currencyCode.toLowerCase()) throw new Error("Provider did not confirm an uncaptured authorization void");
    }
  } catch (error) {
    await context.transaction(async (transactionContext) => {
      const tx = transactionContext.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
      const current = await tx.payment.findUnique({ where: { id: args.paymentId } });
      if (current?.providerData?.authorizationVoid?.token !== token) return;
      await tx.payment.update({ where: { id: args.paymentId }, data: { providerData: { ...current.providerData || {}, authorizationVoid: { ...current.providerData.authorizationVoid, status: "unknown", leaseExpiresAt: null, lastError: error instanceof Error ? error.message : "Authorization void outcome unknown" } } } });
    });
    throw error;
  }
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    if (claim.payment.orderId) await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', claim.payment.orderId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const current = await tx.payment.findUnique({ where: { id: args.paymentId } });
    if (current?.providerData?.authorizationVoid?.token !== token) throw new Error("Authorization void completion was fenced; retry the same request");
    const unchangedNoCharge = Boolean(claim.noCharge && noChargeOrderPaymentState(current) && current.status === "succeeded" && claim.payment.status === "succeeded" && current.storeId === claim.payment.storeId && current.orderId === claim.payment.orderId && current.providerPaymentId === claim.payment.providerPaymentId && current.providerData.checkoutFingerprint === claim.payment.providerData.checkoutFingerprint && current.providerData.cartFingerprint === claim.payment.providerData.cartFingerprint && groceryOutboxPayloadHash(current.providerData.noCharge) === groceryOutboxPayloadHash(claim.payment.providerData.noCharge));
    if (claim.noCharge && !unchangedNoCharge || !["authorized", "pending", "cancelled", "refunded"].includes(current.status) && !unchangedNoCharge) throw new Error("Financial state changed before authorization void completion");
    const status = unchangedNoCharge ? "succeeded" : result.status === "refunded" ? "refunded" : "cancelled";
    if (claim.settlement) {
      const settlement = await tx.orderSettlement.findUnique({ where: { id: claim.settlement.id } });
      if (settlement?.providerEvidence?.abandonment?.token !== token) throw new Error("Settlement abandonment was fenced");
      await tx.orderSettlement.update({ where: { id: settlement.id }, data: { status: "abandoned", providerEvidence: { ...settlement.providerEvidence || {}, abandonment: { ...settlement.providerEvidence.abandonment, status: "completed", leaseExpiresAt: null, completedAt: (/* @__PURE__ */ new Date()).toISOString() } } } });
    }
    await tx.payment.update({ where: { id: args.paymentId }, data: { status, providerData: { ...current.providerData || {}, authorizationVoid: { ...current.providerData.authorizationVoid, status: "completed", leaseExpiresAt: null, completedAt: (/* @__PURE__ */ new Date()).toISOString(), providerStatus: unchangedNoCharge ? null : result.status, ...unchangedNoCharge ? { noChargeVerified: true } : {} } } } });
    return { success: true, paymentId: args.paymentId, status, reused: claim.reused };
  });
}

// features/keystone/mutations/refundGroceryOrderLines.ts
var import_node_crypto14 = require("node:crypto");
init_access();
init_storeScope();
init_groceryOutbox();
init_refundAllocations();
init_inventoryMovements();
init_serializableTransaction();
async function recordReturnCustody(tx, allocations, storeId, orderId, actorId) {
  const returns = allocations.flatMap((line) => line.returnedLots.map((lot) => ({ ...lot, line })));
  const productIds = [...new Set(returns.map((row) => row.line.productId))].sort();
  const lotIds = [...new Set(returns.map((row) => row.lotId))].sort();
  for (const productId of productIds) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
  for (const lotId of lotIds) await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
  for (const entry of returns) {
    const lot = await tx.inventoryLot.findUnique({ where: { id: entry.lotId } });
    const product = await tx.product.findUnique({ where: { id: entry.line.productId } });
    if (!lot || !product || lot.storeId !== storeId || product.storeId !== storeId || lot.productId !== product.id) throw new Error("Returned lot is outside the refunded product and store");
    if (entry.line.disposition === "return_to_stock" && !isInventoryLotEligible(lot)) throw new Error("Unsafe or expired returned goods require quarantine or waste");
    const delta = entry.line.disposition === "waste" ? 0 : entry.quantityMilli;
    const nextLot = (quantityMilli(lot.quantityRemaining) + delta) / 1e3;
    const nextProduct = (quantityMilli(product.stockQuantity) + delta) / 1e3;
    if (quantityMilli(nextLot) > await unconvertedLotCapacityMilli(tx, storeId, lot)) throw new Error("Returned stock exceeds original received quantity remaining after conversions");
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityRemaining: nextLot, ...entry.line.disposition === "quarantine" && lot.safetyStatus !== "recalled" ? { safetyStatus: "quarantined", safetyReason: entry.line.conditionNote } : {} } });
    await tx.product.update({ where: { id: product.id }, data: { stockQuantity: nextProduct, inStock: nextProduct > 0 } });
    await appendInventoryMovement(tx, { storeId, orderId, productId: product.id, inventoryLotId: lot.id, sourceType: `line_refund_${entry.line.disposition}`, sourceId: entry.line.id, idempotencyKey: `line-return:${entry.line.id}:${lot.id}`, actorId, reason: entry.line.conditionNote || entry.line.reason, quantityBefore: lot.quantityRemaining, quantityAfter: nextLot, productStockBefore: product.stockQuantity, productStockAfter: nextProduct, metadata: { orderLineRefundId: entry.line.id, quantityMilli: entry.quantityMilli, disposition: entry.line.disposition, custodyAcceptedAt: (/* @__PURE__ */ new Date()).toISOString(), paymentOutcomeIndependent: true } });
  }
}
async function refundGroceryOrderLinesWithDependencies(args, context, dependencies) {
  await requireFreshCapability(context, "canManagePayments");
  await requireFreshCapability(context, "canManageOrders");
  const store = await requireSessionStore(context);
  const reason = args.reason?.trim(), requestKey2 = args.idempotencyKey?.trim();
  if (!reason || reason.length < 3 || reason.length > 500 || !requestKey2 || requestKey2.length < 12 || requestKey2.length > 150 || !Array.isArray(args.lines)) throw new Error("Line refund requires a reason, idempotency key and explicit lines");
  const fingerprint = canonicalGroceryOutboxPayload({ orderId: args.orderId, paymentId: args.paymentId, reason, lines: [...args.lines].sort((a, b) => a.lineItemId.localeCompare(b.lineItemId)).map((line) => ({ ...line, conditionNote: line.conditionNote?.trim() || "", returnedLots: [...line.returnedLots || []].sort((a, b) => a.lotId.localeCompare(b.lotId)) })) });
  const providerRefundKey = `line-refund:${(0, import_node_crypto14.createHash)("sha256").update(`${store.id}:${args.orderId}:${requestKey2}`).digest("hex")}`;
  const claim = await withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', args.orderId);
    const order = await tx.order.findUnique({ where: { id: args.orderId } });
    if (!order || order.storeId !== store.id) throw new Error("Refund order not found in active store");
    const existing = await tx.orderLineRefund.findMany({ where: { providerRefundKey }, orderBy: { lineItemId: "asc" } });
    if (existing.length) {
      if (existing.some((row) => row.storeId !== store.id || row.inputFingerprint !== fingerprint || row.paymentId !== args.paymentId)) throw new Error("Line refund replay differs from original allocations or owner");
      return { allocations: existing, amountCents: existing.reduce((sum, row) => sum + row.totalCents, 0), reused: true };
    }
    if (order.status === "cancelled" && args.lines.some((line) => line.disposition !== "refund_only")) throw new Error("Cancelled goods already have custody disposition; a new physical return would duplicate it");
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const payment = await tx.payment.findUnique({ where: { id: args.paymentId } });
    if (!payment || payment.storeId !== store.id || payment.orderId !== order.id || !["succeeded", "partially_refunded"].includes(payment.status)) throw new Error("Select a settled payment belonging to this order and store");
    if (!order.currencyCode || payment.currencyCode !== order.currencyCode) throw new Error("Refund payment currency differs from the finalized order");
    const prior = await tx.orderLineRefund.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    const allocations = allocateFinalSaleRefund(order.metadata?.finalSale, args.lines, prior);
    const amountCents = allocations.reduce((sum, line) => sum + line.totalCents, 0);
    if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 2147483647) throw new Error("Selected line quantities must allocate a positive supported refund amount");
    const existingRefunds = await tx.paymentRefund.aggregate({ where: { paymentId: payment.id, status: { in: ["processing", "succeeded"] } }, _sum: { amountCents: true } });
    const pendingLineCents = await unlinkedLineRefundReservedCents(tx, payment.id, providerRefundKey);
    if (Number(existingRefunds._sum.amountCents || 0) + pendingLineCents + amountCents > Number(payment.amountCents)) throw new Error("Line refund exceeds unreserved settled payment balance; review other goodwill and pending refunds");
    const records = [];
    for (const allocation of allocations) records.push(await tx.orderLineRefund.create({ data: { ...allocation, storeId: store.id, orderId: order.id, paymentId: payment.id, idempotencyKey: `${providerRefundKey}:${allocation.lineItemId}`, requestKey: requestKey2, providerRefundKey, inputFingerprint: fingerprint, currencyCode: order.currencyCode || store.currencyCode, reason, requestedBy: context.session.itemId, status: "reserved", events: [{ action: "reserved", actorId: context.session.itemId, at: (/* @__PURE__ */ new Date()).toISOString(), quantityMilli: allocation.quantityMilli, disposition: allocation.disposition }] } }));
    await recordReturnCustody(tx, records, store.id, order.id, context.session.itemId);
    return { allocations: records, amountCents, reused: false };
  }, { isolationLevel: "Serializable" }));
  let failure = null;
  try {
    await dependencies.refund(null, { paymentId: args.paymentId, amountCents: claim.amountCents, reason, idempotencyKey: providerRefundKey }, context);
  } catch (error) {
    failure = error instanceof Error ? error.message : "Provider outcome requires reconciliation";
  }
  const result = await withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const refund = await tx.paymentRefund.findUnique({ where: { idempotencyKey: providerRefundKey } });
    if (refund) {
      const adjustments = await reconcileOrderLineRefundRows(tx, refund);
      return { success: refund.status === "succeeded", status: refund.status, paymentRefundId: refund.id, amountCents: claim.amountCents, allocations: adjustments, reused: claim.reused, message: failure || (refund.status === "succeeded" ? "Line refund and commercial reversal recorded." : "Line quantities remain reserved while the payment refund is reconciled.") };
    }
    await tx.orderLineRefund.updateMany({ where: { providerRefundKey }, data: { failureMessage: failure || "Provider refund reservation has not been created; retry this request." } });
    return { success: false, status: "reserved", paymentRefundId: null, amountCents: claim.amountCents, allocations: await commercialAdjustmentsForRefund(tx, providerRefundKey), reused: claim.reused, message: failure || "Refund request is reserved. Retry with the same inputs." };
  }, { isolationLevel: "Serializable" }));
  return result;
}
async function refundGroceryOrderLines(_root, args, context) {
  const { refundPaymentForOrder: refundPaymentForOrder2 } = await Promise.resolve().then(() => (init_managePaymentRefund(), managePaymentRefund_exports));
  return refundGroceryOrderLinesWithDependencies(args, context, { refund: refundPaymentForOrder2 });
}
async function getGroceryOrderRefundLines(_root, { orderId }, context) {
  await requireFreshCapability(context, "canManagePayments");
  await requireFreshCapability(context, "canManageOrders");
  const store = await requireSessionStore(context);
  const tx = context.prisma;
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, currencyCode: true, metadata: true } });
  if (!order || order.storeId !== store.id) throw new Error("Order not found in active store");
  const finalSale = order.metadata?.finalSale;
  if (finalSale?.status !== "finalized") return { orderId, currencyCode: order.currencyCode, lines: [], requests: [], message: "Finalize actual goods before issuing a line refund." };
  const prior = await tx.orderLineRefund.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  return { orderId, currencyCode: order.currencyCode, finalSale, settlementId: finalSale.settlementId, lines: finalSale.actuals.map((actual) => ({ lineItemId: actual.lineItemId, productTitle: actual.productTitle, quantityMilli: actual.quantityMilli, unitOfMeasure: actual.unitOfMeasure, reservedQuantityMilli: prior.filter((row) => row.lineItemId === actual.lineItemId).reduce((sum, row) => sum + row.quantityMilli, 0), allocations: actual.allocations, commercial: finalSale.lines.find((line) => line.id === actual.lineItemId) })), requests: prior.map((row) => ({ id: row.id, requestKey: row.requestKey, lineItemId: row.lineItemId, quantityMilli: row.quantityMilli, totalCents: row.totalCents, status: row.status, failureMessage: row.failureMessage, disposition: row.disposition, conditionNote: row.conditionNote, returnedLots: row.returnedLots, reason: row.reason, paymentId: row.paymentId })) };
}

// features/keystone/mutations/updateGroceryNotificationPreferences.ts
init_storeScope();
async function updateGroceryNotificationPreferences(_root, args, context) {
  await requireSessionStore(context);
  const userId = context.session.itemId;
  return context.transaction(async (tx) => {
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-preferences'),hashtext($1))", userId);
    const existing = await tx.prisma.notificationPreference.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    const data = { orderUpdates: args.orderUpdates, deliveryAlerts: args.deliveryAlerts, backInStock: args.backInStock, channels: ["email"] };
    if (existing) await tx.prisma.notificationPreference.update({ where: { id: existing.id }, data });
    else await tx.prisma.notificationPreference.create({ data: { ...data, userId } });
    return true;
  });
}

// features/keystone/mutations/manageGroceryLoyalty.ts
init_access();
init_storeScope();
init_serializableTransaction();
async function configureGroceryLoyalty(_root, args, context) {
  await requireFreshCapability(context, "canManageUsers");
  const store = await requireSessionStore(context);
  if (!args.name?.trim() || !Number.isSafeInteger(args.earnPointsPer100Cents) || args.earnPointsPer100Cents < 0 || !Number.isSafeInteger(args.redeemPointsPer100Cents) || args.redeemPointsPer100Cents < 1 || !Number.isSafeInteger(args.minimumRedemptionPoints) || args.minimumRedemptionPoints < 1) throw new Error("Loyalty requires a name and valid integer earning/redemption rules");
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-loyalty-program'), hashtext($1))", store.id);
    const program = await tx.loyaltyProgram.findFirst({ where: { storeId: store.id }, orderBy: { id: "asc" } });
    if (program) await tx.loyaltyProgram.updateMany({ where: { storeId: store.id, id: { not: program.id } }, data: { isActive: false } });
    const data = { ...args, name: args.name.trim(), pointsPerDollar: args.earnPointsPer100Cents, refundDebtPolicy: "offset_future_earnings", redemptionRules: { pointsPerDollar: args.redeemPointsPer100Cents, minimumRedemption: args.minimumRedemptionPoints }, expirationRules: { enabled: false } };
    const result = program ? await tx.loyaltyProgram.update({ where: { id: program.id }, data }) : await tx.loyaltyProgram.create({ data: { ...data, storeId: store.id } });
    return { success: true, programId: result.id };
  });
}
async function redeemGroceryLoyalty(_root, args, context) {
  const store = await requireSessionStore(context);
  const userId = context.session.itemId;
  if (!Number.isSafeInteger(args.points) || args.points <= 0 || args.idempotencyKey?.trim().length < 12) throw new Error("Positive integer points and redemption idempotency key required");
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await lockLoyaltyAccount(tx, store.id, userId);
    const existing = await tx.loyaltyRedemption.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (existing) {
      if (existing.storeId !== store.id || existing.userId !== userId || existing.points !== args.points) throw new Error("Loyalty redemption replay differs from original owner or points");
      const coupon2 = await tx.coupon.findUnique({ where: { id: existing.couponId } });
      return { success: true, redemptionId: existing.id, couponCode: coupon2.code, points: existing.points, discountCents: existing.discountCents, balance: await loyaltyBalance(tx, store.id, userId), reused: true };
    }
    const program = await tx.loyaltyProgram.findFirst({ where: { storeId: store.id, isActive: true }, orderBy: { id: "asc" } });
    if (!program) throw new Error("No active loyalty program");
    if (args.points < program.minimumRedemptionPoints) throw new Error("Points are below the minimum redemption");
    const balance = await loyaltyBalance(tx, store.id, userId);
    if (balance < args.points) throw new Error("Insufficient available loyalty points; refund debt must be recovered first");
    const discountCents = Number(BigInt(args.points) * BigInt(100) / BigInt(program.redeemPointsPer100Cents));
    if (!Number.isSafeInteger(discountCents) || discountCents <= 0 || discountCents > 2147483647 || BigInt(args.points) * BigInt(100) % BigInt(program.redeemPointsPer100Cents) !== BigInt(0)) throw new Error("Choose a point amount that converts to exact currency minor units");
    const coupon = await tx.coupon.create({ data: { storeId: store.id, code: loyaltyCouponCode(`${store.id}:${userId}:${args.idempotencyKey}`), discountType: "fixed", discountValue: discountCents / 100, discountValueCents: discountCents, minPurchase: discountCents / 100, minPurchaseCents: discountCents, maxUses: 1, currentUses: 0, isActive: true, validFrom: /* @__PURE__ */ new Date(), productCategories: [], excludedProducts: [] } });
    const redemption = await tx.loyaltyRedemption.create({ data: { storeId: store.id, userId, programId: program.id, couponId: coupon.id, points: args.points, discountCents, status: "issued", idempotencyKey: args.idempotencyKey, events: [{ action: "issued", at: (/* @__PURE__ */ new Date()).toISOString(), userId, points: args.points, discountCents }] } });
    const journal = await appendLoyaltyEntry(tx, { storeId: store.id, userId, programId: program.id, idempotencyKey: `redeem:${args.idempotencyKey}`, sourceId: redemption.id, sourceType: "loyalty_redemption", actorId: userId, points: -args.points, type: "redeemed_discount", description: "Points exchanged for a retailer-funded customer-owned single-use reward", metadata: { redemptionId: redemption.id, couponId: coupon.id, discountCents, retailerFunded: true } });
    return { success: true, redemptionId: redemption.id, couponCode: coupon.code, points: args.points, discountCents, balance: journal.balanceAfter, reused: false };
  }, { isolationLevel: "Serializable" }));
}
async function getGroceryLoyalty(_root, _args, context) {
  const store = await requireSessionStore(context);
  const tx = context.prisma;
  const userId = context.session.itemId;
  const program = await tx.loyaltyProgram.findFirst({ where: { storeId: store.id, isActive: true }, orderBy: { id: "asc" } });
  const balance = await loyaltyBalance(tx, store.id, userId);
  const rewards = await tx.loyaltyRedemption.findMany({ where: { storeId: store.id, userId, status: "issued" }, take: 100, orderBy: { createdAt: "desc" }, include: { coupon: { select: { code: true } } } });
  return { balance, redeemablePoints: Math.max(0, balance), refundDebt: Math.max(0, -balance), program: program ? { id: program.id, name: program.name, earnPointsPer100Cents: program.earnPointsPer100Cents, redeemPointsPer100Cents: program.redeemPointsPer100Cents, minimumRedemptionPoints: program.minimumRedemptionPoints, refundDebtPolicy: program.refundDebtPolicy } : null, rewards: rewards.map((reward) => ({ id: reward.id, couponCode: reward.coupon.code, discountCents: reward.discountCents, points: reward.points })) };
}

// features/keystone/mutations/groceryFinancialClose.ts
init_access();
init_storeScope();

// features/keystone/lib/reportingClose.ts
var import_node_crypto15 = require("node:crypto");
init_groceryOutbox();
init_inventoryMovements();
function closePeriod(startDate, endDate, timezone, cutoff = /* @__PURE__ */ new Date()) {
  function dateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (/* @__PURE__ */ new Date(`${value}T00:00:00Z`)).toISOString().slice(0, 10) !== value) throw new Error("Use a valid YYYY-MM-DD trading date");
    return value;
  }
  dateKey(startDate);
  dateKey(endDate);
  const start = zonedStartOfDateKey(startDate, timezone);
  const next = /* @__PURE__ */ new Date(`${endDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = zonedStartOfDateKey(next.toISOString().slice(0, 10), timezone);
  if (end <= start || end.getTime() - start.getTime() > 367 * 864e5 || start > cutoff || endDate > zonedDateKey(cutoff, timezone)) throw new Error("Choose a past or current trading period of at most one year");
  return { startDate, endDate, timezone, start, end, cutoff };
}
function csvCell(value) {
  let text60 = value == null ? "" : String(value);
  if (typeof value !== "number" && /^[\s]*[=+\-@\t\r]/.test(text60)) text60 = `'${text60}`;
  return `"${text60.replaceAll('"', '""')}"`;
}
function rowsToCsv(rows) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
}
function parseCsv(text60) {
  if (text60.length > 1e6) throw new Error("Statement must be at most 1 MB");
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text60.length; index++) {
    const char = text60[index];
    if (char === '"') {
      if (quoted && text60[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(value);
      value = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text60[index + 1] === "\n") index++;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) throw new Error("Statement contains an unclosed quoted field");
  row.push(value);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
var STATEMENT_COLUMNS = ["entryReference", "entryType", "paymentReference", "refundReference", "amountCents", "feeCents", "netCents", "currencyCode", "payoutReference", "settledAt"];
var STATEMENT_TEMPLATE = `${STATEMENT_COLUMNS.join(",")}
entry-001,capture,payment-reference,,1200,35,1165,USD,payout-001,2026-09-05T12:00:00Z`;
function integerCents(value, allowNegative = false) {
  if (!/^-?\d+$/.test(String(value))) throw new Error("Statement amounts must be integer cents");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 2147483647 || !allowNegative && result < 0) throw new Error("Statement amount is outside the supported range");
  return result;
}
function statementEntries(csv, now = /* @__PURE__ */ new Date()) {
  const [header, ...rows] = parseCsv(csv);
  if (!header || header.join(",") !== STATEMENT_COLUMNS.join(",")) throw new Error(`Statement headers must be ${STATEMENT_COLUMNS.join(",")}`);
  if (!rows.length || rows.length > 1e3) throw new Error("Import between 1 and 1000 statement entries");
  const seen = /* @__PURE__ */ new Set();
  return rows.map((row) => {
    if (row.length !== header.length) throw new Error("Statement row has an incorrect number of columns");
    const item = Object.fromEntries(header.map((key2, index) => [key2, row[index].trim()]));
    if (!item.entryReference || !item.paymentReference || seen.has(item.entryReference)) throw new Error("Statement entries need unique references and payment references");
    if (Object.values(item).some((value) => value.length > 200)) throw new Error("Statement reference is too long");
    seen.add(item.entryReference);
    if (!["capture", "refund"].includes(item.entryType) || item.entryType === "refund" && !item.refundReference) throw new Error("Choose capture or refund and supply refund identity when needed");
    if (!/^[A-Za-z]{3}$/.test(item.currencyCode)) throw new Error("Statement currency must use its three-letter code");
    const settledAt = new Date(item.settledAt);
    if (!/Z$|[+-]\d{2}:\d{2}$/.test(item.settledAt) || !Number.isFinite(settledAt.getTime()) || settledAt > now) throw new Error("Settlement time must be a past timestamp with an explicit timezone");
    const amountCents = integerCents(item.amountCents), feeCents = integerCents(item.feeCents), netCents = integerCents(item.netCents, true);
    if (netCents !== (item.entryType === "refund" ? -amountCents : amountCents) - feeCents) throw new Error("Statement net must equal signed amount less provider fee");
    return { ...item, currencyCode: item.currencyCode.toUpperCase(), settledAt: settledAt.toISOString(), amountCents, feeCents, netCents };
  });
}
function matchStatementEntry(entry, payment, storeId, providerCode) {
  let reason = "";
  if (!payment || payment.storeId !== storeId || payment.paymentProvider?.code !== providerCode) reason = "No payment in this store/provider matches the statement reference";
  else if (String(payment.order?.currencyCode || "").toUpperCase() !== entry.currencyCode) reason = "Statement and order currency differ";
  else if (entry.entryType === "capture") {
    if (!["succeeded", "partially_refunded", "refunded"].includes(payment.status)) reason = "Local payment has no confirmed capture";
    else if (Number(payment.amountCents) !== entry.amountCents) reason = "Statement capture amount differs from the local capture";
  } else {
    const refund = payment.refunds?.find((refund2) => refund2.providerRefundId === entry.refundReference);
    if (!refund || refund.status !== "succeeded") reason = "No confirmed local refund matches the statement refund";
    else if (Number(refund.amountCents) !== entry.amountCents) reason = "Statement refund amount differs from the local refund";
  }
  if (!reason && !entry.payoutReference) reason = "Provider deposit/payout reference is missing";
  return { status: reason ? "unresolved" : "matched", reason: reason || "Amount, currency and provider reference match local evidence", paymentId: payment?.storeId === storeId ? payment.id : null };
}
async function readReportRows(delegate, args) {
  const rows = [];
  let cursor;
  while (true) {
    const page = await delegate.findMany({ ...args, orderBy: { id: "asc" }, take: 500, ...cursor ? { cursor: { id: cursor }, skip: 1 } : {} });
    rows.push(...page);
    if (page.length < 500) return rows;
    if (rows.length >= 1e5) throw new Error("Report exceeds 100,000 source rows; choose a shorter period");
    cursor = page[page.length - 1].id;
  }
}
function compileFinancialClose(storeId, currencyCode, period, sources) {
  currencyCode = currencyCode.toUpperCase();
  const rows = [], exceptions = [];
  const totals = {
    requestedGrossCents: 0,
    actualGrossCents: 0,
    discountsCents: 0,
    taxCents: 0,
    feesCents: 0,
    actualTotalCents: 0,
    refundedGoodsCents: 0,
    refundedTaxCents: 0,
    reversedDiscountCents: 0,
    netTaxCents: 0,
    capturedCents: 0,
    refundedCents: 0,
    netPaymentsCents: 0,
    providerFeesCents: 0,
    statementNetCents: 0,
    knownStockValueCents: 0,
    unknownStockLots: 0,
    fixedCouponExposureCents: 0,
    percentageCouponCount: 0
  };
  const owns = (entry, source) => {
    if (entry.storeId !== storeId) throw new Error(`${source} contains a record outside the active store`);
  };
  const inPeriod = (value) => {
    const time = new Date(value).getTime();
    return time >= period.start.getTime() && time < period.end.getTime() && time <= period.cutoff.getTime();
  };
  for (const order of sources.orders) {
    owns(order, "Order");
    const requestedInPeriod = inPeriod(order.createdAt);
    if (requestedInPeriod) {
      totals.requestedGrossCents += Number(order.subtotalCents || 0);
      rows.push({
        sourceType: "order_request",
        sourceId: order.id,
        orderId: order.id,
        occurredAt: new Date(order.createdAt).toISOString(),
        status: order.status,
        currency: currencyCode,
        requestedGrossCents: order.subtotalCents
      });
    }
    const final = order.metadata?.finalSale?.status === "finalized" ? order.metadata.finalSale : null;
    const settlement = order.settlements?.find((item) => item.status === "finalized" && item.id === final?.settlementId);
    const commercial = settlement?.snapshot;
    if (!commercial || !final) {
      exceptions.push({ sourceType: "order", sourceId: order.id, reason: `Order ${order.status} has no identified finalized commercial snapshot` });
      continue;
    }
    if (!final.finalizedAt || !Number.isFinite(new Date(final.finalizedAt).getTime())) {
      exceptions.push({ sourceType: "order", sourceId: order.id, reason: "Finalized sale has no valid original finalization timestamp; actual goods and tax require historical review" });
      continue;
    }
    if (!inPeriod(final.finalizedAt)) continue;
    const gross = Number(commercial.subtotalCents), discount = Number(commercial.discountCents);
    const tax = Number(commercial.taxCents), fee = Number(commercial.feeCents), total = Number(commercial.totalCents);
    totals.actualGrossCents += gross;
    totals.discountsCents += discount;
    totals.taxCents += tax;
    totals.feesCents += fee;
    totals.actualTotalCents += total;
    rows.push({
      sourceType: "order",
      sourceId: order.id,
      orderId: order.id,
      settlementId: settlement.id,
      occurredAt: new Date(final.finalizedAt).toISOString(),
      status: order.status,
      currency: currencyCode,
      actualGrossCents: gross,
      discountCents: discount,
      taxCents: tax,
      feeCents: fee,
      actualTotalCents: total
    });
    for (const line of commercial.lines || []) rows.push({
      sourceType: "actual_line",
      sourceId: line.id,
      orderId: order.id,
      settlementId: settlement.id,
      occurredAt: new Date(final.finalizedAt).toISOString(),
      currency: currencyCode,
      actualGrossCents: line.subtotalCents,
      discountCents: line.discountCents,
      taxCents: line.taxCents,
      actualTotalCents: line.totalCents
    });
  }
  for (const payment of sources.payments) {
    owns(payment, "Payment");
    if (!inPeriod(payment.processedAt || payment.createdAt)) continue;
    const captured2 = ["succeeded", "partially_refunded", "refunded"].includes(payment.status) ? Number(payment.amountCents) : 0;
    totals.capturedCents += captured2;
    rows.push({
      sourceType: "payment",
      sourceId: payment.id,
      orderId: payment.orderId,
      occurredAt: new Date(payment.processedAt || payment.createdAt).toISOString(),
      status: payment.status,
      currency: currencyCode,
      capturedCents: captured2,
      providerReference: payment.providerPaymentId
    });
    if (!captured2) exceptions.push({ sourceType: "payment", sourceId: payment.id, reason: `Payment is ${payment.status}; no confirmed capture included` });
    else if (!sources.statements.some((row) => row.paymentId === payment.id && row.entryType === "capture" && row.status === "matched")) exceptions.push({ sourceType: "payment", sourceId: payment.id, reason: "Capture has no matched provider settlement entry" });
  }
  for (const refund of sources.refunds) {
    owns(refund.payment, "Refund payment");
    if (!inPeriod(refund.processedAt || refund.requestedAt)) continue;
    const amount = refund.status === "succeeded" ? Number(refund.amountCents) : 0;
    totals.refundedCents += amount;
    rows.push({
      sourceType: "refund",
      sourceId: refund.id,
      orderId: refund.payment.orderId,
      occurredAt: new Date(refund.processedAt || refund.requestedAt).toISOString(),
      status: refund.status,
      currency: currencyCode,
      refundedCents: amount,
      providerReference: refund.providerRefundId,
      reason: refund.providerData?.requestReason || refund.failureMessage || ""
    });
    if (refund.status === "processing") exceptions.push({ sourceType: "refund", sourceId: refund.id, reason: "Provider refund outcome is unresolved" });
    const reversal = refund.providerData?.commercialAdjustments;
    if (amount && reversal?.kind === "final_sale_line_refund") {
      if (Number(reversal.totalCents) !== amount || String(reversal.currencyCode).toUpperCase() !== currencyCode) throw new Error("Commercial refund does not match cash/currency evidence");
      totals.refundedGoodsCents += Number(reversal.netGoodsCents);
      totals.refundedTaxCents += Number(reversal.taxCents);
      totals.reversedDiscountCents += Number(reversal.discountCents);
      for (const line of reversal.lines || []) rows.push({ sourceType: "refund_line", sourceId: line.id, refundId: refund.id, orderId: refund.payment.orderId, lineItemId: line.lineItemId, quantityMilli: line.quantityMilli, netGoodsReversedCents: line.netGoodsCents, taxReversedCents: line.taxCents, discountReversedCents: line.discountCents, refundedCents: line.totalCents, disposition: line.disposition, currency: currencyCode });
    }
    if (amount && !refund.providerData?.commercialAdjustments) exceptions.push({ sourceType: "refund", sourceId: refund.id, reason: "Cash refund has no item/tax allocation snapshot; tax reversal requires review" });
  }
  for (const entry of sources.statements) {
    owns(entry, "Statement");
    if (!inPeriod(entry.settledAt)) continue;
    if (entry.currencyCode === currencyCode) {
      totals.providerFeesCents += Number(entry.feeCents);
      totals.statementNetCents += Number(entry.netCents);
    } else exceptions.push({ sourceType: "settlement", sourceId: entry.id, reason: "Foreign-currency statement entry excluded from store-currency totals" });
    rows.push({
      sourceType: "settlement",
      sourceId: entry.id,
      paymentId: entry.paymentId,
      occurredAt: new Date(entry.settledAt).toISOString(),
      currency: entry.currencyCode,
      status: entry.status,
      providerReference: entry.paymentReference,
      refundReference: entry.refundReference,
      statementReference: entry.statementReference,
      payoutReference: entry.payoutReference,
      amountCents: entry.amountCents,
      providerFeeCents: entry.feeCents,
      statementNetCents: entry.netCents,
      reason: entry.reason
    });
    if (entry.status !== "matched") exceptions.push({ sourceType: "settlement", sourceId: entry.id, reason: entry.reason });
  }
  const asOf = new Date(Math.min(period.end.getTime(), period.cutoff.getTime()));
  const latest = /* @__PURE__ */ new Map();
  for (const movement of [...sources.movements].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.sequence - b.sequence)) {
    owns(movement, "Inventory movement");
    if (new Date(movement.createdAt) < asOf) latest.set(movement.inventoryLotId, movement);
    if (inPeriod(movement.createdAt)) rows.push({
      sourceType: "inventory_movement",
      sourceId: movement.id,
      orderId: movement.orderId,
      lotId: movement.inventoryLotId,
      occurredAt: new Date(movement.createdAt).toISOString(),
      quantityDelta: Number(movement.quantityDelta),
      quantityAfter: Number(movement.quantityAfter),
      reason: movement.reason
    });
  }
  for (const lot of sources.lots) {
    owns(lot, "Inventory lot");
    if (new Date(lot.createdAt) >= asOf) continue;
    const movement = latest.get(lot.id);
    const value = movement ? Number((BigInt(quantityMilli(movement.quantityAfter)) * BigInt(lot.costPerUnitCents || 0) + BigInt(500)) / BigInt(1e3)) : null;
    if (value == null) {
      totals.unknownStockLots++;
      exceptions.push({ sourceType: "inventory_lot", sourceId: lot.id, reason: "No movement before stock cutoff; historical opening quantity is unknown" });
    } else totals.knownStockValueCents += value;
    rows.push({
      sourceType: "stock_valuation",
      sourceId: lot.id,
      lotId: lot.id,
      occurredAt: asOf.toISOString(),
      quantity: movement ? Number(movement.quantityAfter) : null,
      costPerUnitCents: lot.costPerUnitCents,
      stockValueCents: value,
      lastMovementId: movement?.id || "",
      basis: "Available physical units at period end \xD7 lot cost recorded at export cutoff"
    });
  }
  for (const clipped of sources.coupons) {
    owns(clipped.user, "Coupon customer");
    const coupon = clipped.coupon;
    if (new Date(clipped.clippedAt) >= asOf || clipped.usedAt && new Date(clipped.usedAt) < asOf || coupon.validTo && new Date(coupon.validTo) < asOf) continue;
    const amount = coupon.discountType === "fixed" ? Number(coupon.discountValueCents || 0) : null;
    if (amount === null) totals.percentageCouponCount++;
    else totals.fixedCouponExposureCents += amount;
    rows.push({
      sourceType: "coupon_exposure",
      sourceId: clipped.id,
      couponId: coupon.id,
      code: coupon.code,
      currency: currencyCode,
      conditionalFaceValueCents: amount,
      basis: "Unused clipped offer at cutoff; eligibility conditions apply; not an unconditional cash liability"
    });
  }
  totals.netTaxCents = totals.taxCents - totals.refundedTaxCents;
  totals.netPaymentsCents = totals.capturedCents - totals.refundedCents;
  if (totals.actualTotalCents !== totals.netPaymentsCents) exceptions.push({
    sourceType: "period",
    sourceId: `${period.startDate}:${period.endDate}`,
    reason: `Final sales and period net cash differ by ${totals.actualTotalCents - totals.netPaymentsCents} cents; review capture/refund timing and order exceptions`
  });
  if (totals.netPaymentsCents - totals.providerFeesCents !== totals.statementNetCents) exceptions.push({
    sourceType: "period",
    sourceId: `${period.startDate}:${period.endDate}`,
    reason: "Net payments less provider fees do not equal the imported settlement net; review settlement timing and missing entries"
  });
  for (const [key2, amount] of Object.entries(totals)) if (!Number.isSafeInteger(amount)) throw new Error(`Invalid report total: ${key2}`);
  rows.sort((a, b) => String(a.sourceType).localeCompare(String(b.sourceType)) || String(a.sourceId).localeCompare(String(b.sourceId)));
  return {
    version: 2,
    storeId,
    currencyCode,
    startDate: period.startDate,
    endDate: period.endDate,
    timezone: period.timezone,
    periodStart: period.start.toISOString(),
    periodEndExclusive: period.end.toISOString(),
    cutoff: period.cutoff.toISOString(),
    basis: "Requested orders by placed date; actual goods, discount, tax and fees by original finalization timestamp. Captures/refunds by processed date and provider entries by settlement date. Missing historical finalization timestamps remain exceptions.",
    totals,
    rows,
    exceptions
  };
}
var reportHash = (value) => (0, import_node_crypto15.createHash)("sha256").update(canonicalGroceryOutboxPayload(value)).digest("hex");

// features/keystone/mutations/groceryFinancialClose.ts
init_serializableTransaction();
async function financialActor(context) {
  await requireFreshCapability(context, "canManagePayments");
  return { store: await requireSessionStore(context), userId: context.session.itemId };
}
function requestKey(value) {
  if (!value || value.length < 12 || value.length > 200) throw new Error("A valid financial request idempotency key is required");
  return value;
}
async function createCloseInTransaction(tx, actor, input, now = /* @__PURE__ */ new Date()) {
  const period = closePeriod(input.startDate, input.endDate, input.timezone, now);
  const key2 = requestKey(input.idempotencyKey), note = input.note?.trim() || "";
  if (note.length > 2e3) throw new Error("Close note must be at most 2000 characters");
  await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', actor.store.id);
  const existing = await tx.financialClose.findUnique({ where: { idempotencyKey: key2 } });
  if (existing) {
    if (existing.storeId !== actor.store.id || existing.snapshot.startDate !== period.startDate || existing.snapshot.endDate !== period.endDate || existing.timezone !== period.timezone || existing.note !== note) throw new Error("Close idempotency key was reused with different scope or input");
    return { id: existing.id, status: existing.status, contentHash: existing.contentHash, snapshot: existing.snapshot, reused: true };
  }
  const range = { gte: period.start, lt: new Date(Math.min(period.end.getTime(), now.getTime() + 1)) };
  const [orders, payments, refunds, statements, movements, lots, coupons] = await Promise.all([
    readReportRows(tx.order, { where: { storeId: actor.store.id, OR: [{ createdAt: range }, { metadata: { path: ["finalSale", "finalizedAt"], gte: period.start.toISOString(), lt: range.lt.toISOString() } }] }, select: { id: true, storeId: true, createdAt: true, status: true, subtotalCents: true, metadata: true } }),
    readReportRows(tx.payment, { where: { storeId: actor.store.id, OR: [{ processedAt: range }, { processedAt: null, createdAt: range }] }, select: { id: true, storeId: true, orderId: true, processedAt: true, createdAt: true, amountCents: true, status: true, providerPaymentId: true } }),
    readReportRows(tx.paymentRefund, { where: { payment: { storeId: actor.store.id }, OR: [{ processedAt: range }, { processedAt: null, requestedAt: range }] }, select: { id: true, amountCents: true, status: true, processedAt: true, requestedAt: true, providerRefundId: true, providerData: true, failureMessage: true, payment: { select: { storeId: true, orderId: true } } } }),
    readReportRows(tx.settlementMatch, { where: { storeId: actor.store.id, settledAt: range, createdAt: { lte: now } } }),
    readReportRows(tx.inventoryMovement, { where: { storeId: actor.store.id, createdAt: { lt: new Date(Math.min(period.end.getTime(), now.getTime())) } }, select: { id: true, storeId: true, inventoryLotId: true, orderId: true, sequence: true, quantityDelta: true, quantityAfter: true, createdAt: true, reason: true } }),
    readReportRows(tx.inventoryLot, { where: { storeId: actor.store.id, createdAt: { lte: now } }, select: { id: true, storeId: true, createdAt: true, costPerUnitCents: true } }),
    readReportRows(tx.userCoupon, { where: { user: { storeId: actor.store.id }, clippedAt: { lte: now } }, select: { id: true, clippedAt: true, usedAt: true, user: { select: { storeId: true } }, coupon: { select: { id: true, code: true, discountType: true, discountValueCents: true, validTo: true } } } })
  ]);
  const capturedOrderIds = [...new Set(payments.map((payment) => payment.orderId).filter(Boolean))].filter((id) => !orders.some((order) => order.id === id));
  if (capturedOrderIds.length) orders.push(...await readReportRows(tx.order, { where: { storeId: actor.store.id, id: { in: capturedOrderIds } }, select: { id: true, storeId: true, createdAt: true, status: true, subtotalCents: true, metadata: true } }));
  const settlements = orders.length ? await readReportRows(tx.orderSettlement, { where: { orderId: { in: orders.map((order) => order.id) }, status: "finalized", createdAt: { lte: now } }, select: { id: true, orderId: true, status: true, snapshot: true } }) : [];
  for (const order of orders) order.settlements = settlements.filter((settlement) => settlement.orderId === order.id);
  const snapshot = compileFinancialClose(actor.store.id, actor.store.currencyCode, period, { orders, payments, refunds, statements, movements, lots, coupons });
  if (snapshot.exceptions.length && note.length < 8) throw new Error(`Record a close note acknowledging ${snapshot.exceptions.length} unresolved exceptions: ${snapshot.exceptions.slice(0, 5).map((entry) => `${entry.sourceType} ${entry.sourceId}: ${entry.reason}`).join("; ")}`);
  const contentHash = reportHash(snapshot), status = snapshot.exceptions.length ? "closed_with_exceptions" : "reconciled";
  const record2 = await tx.financialClose.create({ data: {
    idempotencyKey: key2,
    storeId: actor.store.id,
    recordedById: actor.userId,
    periodStart: period.start,
    periodEnd: period.end,
    timezone: period.timezone,
    cutoff: now,
    status,
    note,
    contentHash,
    snapshot
  } });
  return { id: record2.id, status, contentHash, snapshot, reused: false };
}
async function createGroceryFinancialClose(_root, input, context) {
  const actor = await financialActor(context);
  return withSerializableRetry(() => context.transaction((tc) => createCloseInTransaction(tc.prisma, actor, input), { isolationLevel: "RepeatableRead" }));
}
async function importStatementInTransaction(tx, actor, input, now = /* @__PURE__ */ new Date()) {
  const key2 = requestKey(input.idempotencyKey), statementReference = input.statementReference.trim(), providerCode = input.providerCode.trim();
  if (!statementReference || statementReference.length > 200 || !providerCode || providerCode.length > 200) throw new Error("Provider and statement references are required");
  const entries = statementEntries(input.csv, now), fingerprint = reportHash({ providerCode, statementReference, entries });
  await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', actor.store.id);
  const prior = await tx.settlementMatch.findFirst({ where: { storeId: actor.store.id, evidence: { path: ["importKey"], equals: key2 } } });
  if (prior && prior.evidence.importFingerprint !== fingerprint) throw new Error("Statement idempotency key was reused with different input");
  const imported = [];
  for (const entry of entries) {
    const sourceKey = reportHash([actor.store.id, providerCode, statementReference, entry.entryReference]);
    const existing = await tx.settlementMatch.findUnique({ where: { sourceKey } });
    if (existing) {
      if (existing.evidence.entryFingerprint !== reportHash(entry)) throw new Error("A statement entry reference was reused with changed amounts or evidence");
      imported.push(existing);
      continue;
    }
    const candidates = await tx.payment.findMany({
      where: { storeId: actor.store.id, providerPaymentId: entry.paymentReference, paymentProvider: { code: providerCode } },
      take: 2,
      include: { paymentProvider: true, order: { select: { currencyCode: true } }, refunds: true }
    });
    const payment = candidates.length === 1 ? candidates[0] : null;
    const match = matchStatementEntry(entry, payment, actor.store.id, providerCode);
    if (match.status === "matched") {
      const duplicate = await tx.settlementMatch.findFirst({ where: { storeId: actor.store.id, paymentId: payment.id, entryType: entry.entryType, refundReference: entry.refundReference, status: "matched" } });
      if (duplicate) {
        match.status = "unresolved";
        match.reason = "Duplicate provider entry for the same local capture/refund";
      }
    }
    imported.push(await tx.settlementMatch.create({ data: {
      ...entry,
      settledAt: new Date(entry.settledAt),
      ...match,
      sourceKey,
      storeId: actor.store.id,
      providerCode,
      statementReference,
      recordedById: actor.userId,
      evidence: { importKey: key2, importFingerprint: fingerprint, entryFingerprint: reportHash(entry), importedAt: now.toISOString(), revisions: [] }
    } }));
  }
  return {
    entries: imported.map((entry) => ({ id: entry.id, entryReference: entry.entryReference, status: entry.status, reason: entry.reason })),
    matched: imported.filter((entry) => entry.status === "matched").length,
    unresolved: imported.filter((entry) => entry.status === "unresolved").length,
    reused: Boolean(prior)
  };
}
async function importGrocerySettlementStatement(_root, input, context) {
  const actor = await financialActor(context);
  return withSerializableRetry(() => context.transaction((tc) => importStatementInTransaction(tc.prisma, actor, input), { isolationLevel: "RepeatableRead" }));
}
async function resolveGrocerySettlementMatch(_root, input, context) {
  const actor = await financialActor(context), key2 = requestKey(input.idempotencyKey), reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 1e3) throw new Error("Record a review reason between 8 and 1000 characters");
  return withSerializableRetry(() => context.transaction(async (tc) => {
    const tx = tc.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', actor.store.id);
    const match = await tx.settlementMatch.findFirst({ where: { id: input.matchId, storeId: actor.store.id } });
    if (!match) throw new Error("Statement entry not found in active store");
    const revisions = match.evidence?.revisions || [], previous = revisions.find((entry) => entry.idempotencyKey === key2);
    if (previous) {
      if (previous.reason !== reason) throw new Error("Review idempotency key was reused with changed evidence");
      return { id: match.id, status: previous.status, reason: previous.matchReason, reused: true };
    }
    if (revisions.length >= 100) throw new Error("Statement entry reached the review history limit");
    const candidates = await tx.payment.findMany({
      where: { storeId: actor.store.id, providerPaymentId: match.paymentReference, paymentProvider: { code: match.providerCode } },
      take: 2,
      include: { paymentProvider: true, order: { select: { currencyCode: true } }, refunds: true }
    });
    const result = matchStatementEntry(match, candidates.length === 1 ? candidates[0] : null, actor.store.id, match.providerCode);
    if (result.status === "matched" && await tx.settlementMatch.findFirst({ where: { id: { not: match.id }, storeId: actor.store.id, paymentId: result.paymentId, entryType: match.entryType, refundReference: match.refundReference, status: "matched" } })) {
      result.status = "unresolved";
      result.reason = "Duplicate provider entry for the same local capture/refund";
    }
    await tx.settlementMatch.update({ where: { id: match.id }, data: { ...result, evidence: {
      ...match.evidence,
      revisions: [...revisions, { idempotencyKey: key2, reason, status: result.status, matchReason: result.reason, actorId: actor.userId, occurredAt: (/* @__PURE__ */ new Date()).toISOString() }]
    } } });
    return { id: match.id, status: result.status, reason: result.reason, reused: false };
  }, { isolationLevel: "RepeatableRead" }));
}
async function groceryFinancialCloses(_root, args, context) {
  const actor = await financialActor(context), page = args.page || 1, pageSize = args.pageSize || 25;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Invalid report page");
  const tx = context.prisma;
  const [closes, total, exceptions, totalExceptions] = await Promise.all([
    tx.financialClose.findMany({
      where: { storeId: actor.store.id },
      orderBy: [{ cutoff: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, periodStart: true, periodEnd: true, timezone: true, cutoff: true, status: true, contentHash: true, note: true }
    }),
    tx.financialClose.count({ where: { storeId: actor.store.id } }),
    tx.settlementMatch.findMany({
      where: { storeId: actor.store.id, status: "unresolved" },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: { id: true, statementReference: true, entryReference: true, paymentReference: true, amountCents: true, currencyCode: true, payoutReference: true, reason: true }
    }),
    tx.settlementMatch.count({ where: { storeId: actor.store.id, status: "unresolved" } })
  ]);
  return { closes, total, page, pageSize, exceptions, totalExceptions, currencyCode: actor.store.currencyCode, timezone: actor.store.timezone };
}
async function groceryFinancialCloseExport(_root, { closeId }, context) {
  const actor = await financialActor(context);
  const record2 = await context.prisma.financialClose.findFirst({ where: { id: closeId, storeId: actor.store.id } });
  if (!record2) throw new Error("Financial close not found in active store");
  if (reportHash(record2.snapshot) !== record2.contentHash) throw new Error("Stored close snapshot does not match its content hash");
  return {
    id: record2.id,
    contentHash: record2.contentHash,
    snapshot: record2.snapshot,
    csv: rowsToCsv([
      {
        sourceType: "close_summary",
        sourceId: record2.id,
        ...record2.snapshot.totals,
        contentHash: record2.contentHash,
        periodStart: record2.snapshot.periodStart,
        periodEndExclusive: record2.snapshot.periodEndExclusive,
        timezone: record2.snapshot.timezone,
        cutoff: record2.snapshot.cutoff,
        basis: record2.snapshot.basis
      },
      ...record2.snapshot.rows,
      ...record2.snapshot.exceptions.map((entry) => ({ sourceType: "exception", sourceId: entry.sourceId, relatedSourceType: entry.sourceType, reason: entry.reason }))
    ]),
    filename: `grocery-close-${record2.snapshot.startDate}-${record2.snapshot.endDate}-${record2.id}.csv`
  };
}

// features/keystone/mutations/manageGrocerySubscriptions.ts
init_access();
init_storeScope();
init_groceryOutbox();
init_serializableTransaction();
async function manageGrocerySubscription(_root, args, context) {
  const store = await requireSessionStore(context);
  const userId = context.session.itemId;
  if (!["create", "pause", "resume", "skip", "cancel", "prepare"].includes(args.action) || args.idempotencyKey?.trim().length < 12) throw new Error("Valid recurring order action and idempotency key required");
  const fingerprint = canonicalGroceryOutboxPayload({ ...args, idempotencyKey: void 0 });
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-subscription'), hashtext($1))", args.subscriptionId || args.idempotencyKey);
    if (args.action === "create") {
      const existing = await tx.subscription.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      if (existing) {
        if (existing.storeId !== store.id || existing.userId !== userId || existing.events?.[0]?.fingerprint !== fingerprint) throw new Error("Recurring order replay differs from original owner or schedule");
        return { success: true, subscriptionId: existing.id, status: existing.status, runId: null, reused: true };
      }
      if (!args.approveEachOrder) throw new Error("Explicit approval of each recurring checkout is required");
      if (!Number.isSafeInteger(args.quantity) || Number(args.quantity) < 1 || Number(args.quantity) > 1e4 || !["weekly", "biweekly", "monthly"].includes(args.frequency || "")) throw new Error("Recurring orders require a positive quantity and supported frequency");
      const firstRunAt = new Date(args.firstRunAt || "");
      if (!Number.isFinite(firstRunAt.getTime()) || firstRunAt < new Date(Date.now() - 6e4)) throw new Error("The first recurring occurrence must be a valid present or future time");
      const product = await tx.product.findUnique({ where: { id: args.productId } });
      if (!product || product.storeId !== store.id || product.status !== "published") throw new Error("Recurring product is not available in your store");
      const timezone = store.timezone || "UTC";
      const subscription2 = await tx.subscription.create({ data: { storeId: store.id, userId, productRefId: product.id, product: product.handle || product.title, quantity: args.quantity, frequency: args.frequency, nextDeliveryDate: firstRunAt, scheduleTimezone: timezone, anchorDay: subscriptionAnchorDay(firstRunAt, timezone), status: "active", isActive: true, discount: 0, discountBps: 0, idempotencyKey: args.idempotencyKey, consent: { approveEachOrder: true, userId, at: (/* @__PURE__ */ new Date()).toISOString(), policy: "Prepare a basket at the scheduled time. Customer chooses a current slot and approves prices and payment at each normal checkout." }, events: [{ action: "created", fingerprint, actorId: userId, at: (/* @__PURE__ */ new Date()).toISOString(), nextDeliveryDate: firstRunAt.toISOString(), timezone }] } });
      return { success: true, subscriptionId: subscription2.id, status: subscription2.status, runId: null, reused: false };
    }
    const subscription = await tx.subscription.findUnique({ where: { id: args.subscriptionId } });
    if (!subscription || subscription.storeId !== store.id || subscription.userId !== userId) throw new Error("Recurring order not found in your account");
    const replay = (subscription.events || []).find((event) => event.idempotencyKey === args.idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new Error("Recurring action replay differs from original inputs");
      return { success: true, subscriptionId: subscription.id, status: subscription.status, runId: replay.runId || null, reused: true };
    }
    if (subscription.status === "cancelled") throw new Error("Cancelled recurring orders cannot be changed");
    if (args.action === "prepare") {
      const run = await prepareSubscriptionRun(tx, subscription.id, store.id);
      return { success: true, subscriptionId: subscription.id, status: run?.status || subscription.status, runId: run?.id || null, reused: false };
    }
    const pendingRuns = ["cancel", "skip"].includes(args.action) ? await tx.subscriptionRun.findMany({ where: { subscriptionId: subscription.id, status: { in: ["awaiting_checkout", "blocked_cart", "blocked_stock"] } } }) : [];
    for (const cartId of [...new Set(pendingRuns.map((run) => run.cartId).filter(Boolean))].sort()) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', cartId);
      const cart = await tx.cart.findUnique({ where: { id: cartId } });
      if (!cart || cart.storeId !== store.id || cart.customerId !== userId) throw new Error("Recurring basket belongs to another account");
      for (const run of pendingRuns.filter((run2) => run2.cartId === cartId)) if (run.cartItemId) await tx.cartItem.deleteMany({ where: { id: run.cartItemId, cartId } });
      const items = await tx.cartItem.findMany({ where: { cartId } });
      const subtotalCents = items.reduce((total, item) => total + Number(item.subtotalCents), 0);
      await tx.cart.update({ where: { id: cartId }, data: { itemCount: items.reduce((total, item) => total + Number(item.quantity), 0), subtotalCents, subtotal: subtotalCents / 100 } });
    }
    await tx.$queryRawUnsafe('SELECT "id" FROM "Subscription" WHERE "id" = $1 FOR UPDATE', subscription.id);
    const update = {};
    if (args.action === "pause") {
      const until = args.pausedUntil ? new Date(args.pausedUntil) : null;
      if (until && (!Number.isFinite(until.getTime()) || until <= /* @__PURE__ */ new Date())) throw new Error("Pause end must be a future date");
      Object.assign(update, { status: "paused", pausedUntil: until, isActive: true });
    } else if (args.action === "resume") Object.assign(update, { status: "active", pausedUntil: null, isActive: true });
    else if (args.action === "cancel") Object.assign(update, { status: "cancelled", isActive: false });
    else if (args.action === "skip") Object.assign(update, { nextDeliveryDate: nextSubscriptionOccurrence(subscription, /* @__PURE__ */ new Date()).next });
    if (args.action === "cancel" || args.action === "skip") {
      for (const run of pendingRuns) await tx.subscriptionRun.update({ where: { id: run.id }, data: { status: args.action === "cancel" ? "cancelled" : "skipped", events: [...run.events || [], { action: args.action, actorId: userId, at: (/* @__PURE__ */ new Date()).toISOString() }] } });
    }
    const updated = await tx.subscription.update({ where: { id: subscription.id }, data: { ...update, events: [...subscription.events || [], { action: args.action, idempotencyKey: args.idempotencyKey, fingerprint, actorId: userId, at: (/* @__PURE__ */ new Date()).toISOString() }] } });
    return { success: true, subscriptionId: subscription.id, status: updated.status, runId: null, reused: false };
  }, { isolationLevel: "Serializable" }));
}
async function processDueGrocerySubscriptions(_root, args, context) {
  await requireFreshCapability(context, "canManageOrders");
  const store = await requireSessionStore(context);
  const now = /* @__PURE__ */ new Date();
  const tx = context.prisma;
  const due = await tx.subscription.findMany({ where: { storeId: store.id, isActive: true, status: { not: "cancelled" }, nextDeliveryDate: { lte: now }, OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }] }, orderBy: [{ lastProcessedAt: "asc" }, { nextDeliveryDate: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(100, Math.trunc(args.limit || 25))) });
  const results = [];
  for (const subscription of due) {
    try {
      const run = await withSerializableRetry(() => context.transaction(async (transactionContext) => {
        const run2 = await prepareSubscriptionRun(transactionContext.prisma, subscription.id, store.id, now);
        await transactionContext.prisma.subscription.update({ where: { id: subscription.id }, data: { lastProcessedAt: now } });
        return run2;
      }, { isolationLevel: "Serializable" }));
      results.push({ subscriptionId: subscription.id, runId: run?.id || null, status: run?.status || "paused" });
    } catch (error) {
      results.push({ subscriptionId: subscription.id, status: "failed", error: error instanceof Error ? error.message : "Recurring preparation failed" });
    }
  }
  return { processed: results.length, results };
}

// features/keystone/mutations/manageSupplierSettlement.ts
var import_node_crypto16 = require("node:crypto");
init_access();
init_storeScope();
init_groceryOutbox();
init_inventoryMovements();

// features/keystone/lib/supplierMatching.ts
init_inventoryMovements();
function supplierAmountCents(value, label = "Amount") {
  if (value == null || value === "") throw new Error(`${label} is required`);
  const cents3 = Number(value);
  if (!Number.isSafeInteger(cents3) || cents3 < 0 || cents3 > 2147483647) throw new Error(`${label} must be a non-negative integer amount in minor units`);
  return cents3;
}
function supplierLineCents(quantity, unitCostCents) {
  const milli = quantityMilli(quantity);
  if (milli < 0) throw new Error("Invoice quantity cannot be negative");
  const cents3 = supplierAmountCents(unitCostCents, "Unit cost");
  const total = (BigInt(milli) * BigInt(cents3) + BigInt(500)) / BigInt(1e3);
  return supplierAmountCents(Number(total), "Line total");
}
function supplierInvoicePayable(invoice, credits, cutoff = /* @__PURE__ */ new Date("9999-01-01")) {
  let payable = supplierAmountCents(invoice.grossCents);
  for (const credit of credits) {
    if ((credit.invoiceId || credit.invoice?.id) !== invoice.id || credit.status !== "accepted" || new Date(credit.resolvedAt || credit.createdAt) > cutoff) continue;
    const amount = supplierAmountCents(credit.amountCents);
    if (credit.kind === "credit") payable -= amount;
    else if (credit.kind === "debit") payable += amount;
  }
  if (payable < 0) throw new Error("Supplier credits exceed invoice liability");
  return supplierAmountCents(payable, "Invoice payable");
}
function supplierMatchedQuantity(receiptId, invoices, cutoff = /* @__PURE__ */ new Date("9999-01-01")) {
  return invoices.reduce((total, invoice) => {
    if (new Date(invoice.createdAt) > cutoff) return total;
    const voidedAt = (invoice.events || []).find((event) => event.action === "void_invoice")?.at;
    if (invoice.status === "voided" && (!voidedAt || new Date(voidedAt) <= cutoff)) return total;
    return total + (invoice.lines || []).filter((line) => line.receiptId === receiptId).reduce((sum, line) => sum + quantityMilli(line.matchedQuantity), 0);
  }, 0) / 1e3;
}

// features/keystone/mutations/manageSupplierSettlement.ts
init_serializableTransaction();
var identity = (...parts) => (0, import_node_crypto16.createHash)("sha256").update(JSON.stringify(parts)).digest("hex");
var requiredText = (value, label) => {
  if (typeof value !== "string" || !value.trim() || value.length > 1e3) throw new Error(`${label} is required`);
  return value.trim();
};
var date = (value, label) => {
  const result = new Date(String(value));
  if (!Number.isFinite(result.getTime())) throw new Error(`${label} must be a valid date`);
  return result;
};
async function supplierRows(tx, model, where) {
  const rows = [];
  for (let skip = 0; ; skip += 100) {
    const page = await tx[model].findMany({ where, take: 100, skip, orderBy: { id: "asc" } });
    rows.push(...page);
    if (page.length < 100) return rows;
  }
}
async function manageSupplierSettlement(_root, args, context) {
  if (!["capture_invoice", "approve_invoice", "open_claim", "resolve_claim", "record_debit", "settle_invoice", "void_invoice"].includes(args.action)) throw new Error("Unsupported supplier settlement action");
  await requireFreshCapability(context, args.action === "settle_invoice" ? "canManagePayments" : "canManageInventory");
  const store = await requireSessionStore(context);
  if (args.idempotencyKey?.trim().length < 12) throw new Error("Supplier operation idempotency key is required");
  const input = args.input || {};
  const fingerprint = canonicalGroceryOutboxPayload({ action: args.action, input, invoiceId: args.invoiceId || null, creditId: args.creditId || null });
  const event = { action: args.action, idempotencyKey: args.idempotencyKey.trim(), fingerprint, actorId: context.session.itemId, at: (/* @__PURE__ */ new Date()).toISOString(), input };
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-supplier-settlement'), hashtext($1))", args.invoiceId || `${store.id}:${input.supplierId || args.idempotencyKey}`);
    let invoice;
    if (args.action === "capture_invoice") {
      const supplierId = requiredText(input.supplierId, "Supplier");
      const invoiceNumber = requiredText(input.invoiceNumber, "Supplier invoice number");
      const currencyCode = requiredText(input.currencyCode, "Invoice currency").toUpperCase();
      if (currencyCode !== String(store.currencyCode || "USD").toUpperCase()) throw new Error("Supplier invoice currency must match the active store");
      const invoiceDate = date(input.invoiceDate, "Invoice date");
      const dueDate = input.dueDate ? date(input.dueDate, "Due date") : null;
      if (dueDate && dueDate < invoiceDate) throw new Error("Invoice due date cannot precede the invoice date");
      const documentReference = requiredText(input.documentReference, "Supplier invoice document reference");
      const identityKey = identity(store.id, supplierId, invoiceNumber.toUpperCase());
      const existing = await tx.supplierInvoice.findUnique({ where: { identityKey } }) || await tx.supplierInvoice.findUnique({ where: { idempotencyKey: args.idempotencyKey.trim() } });
      if (existing) {
        if (existing.storeId !== store.id || existing.inputFingerprint !== fingerprint) throw new Error("Supplier invoice identity was reused with different document inputs");
        const credits2 = await supplierRows(tx, "supplierCredit", { storeId: store.id, invoiceId: existing.id });
        return { success: true, invoiceId: existing.id, creditId: null, status: existing.status, grossCents: existing.grossCents, payableCents: supplierInvoicePayable(existing, credits2), reused: true };
      }
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier || supplier.storeId !== store.id) throw new Error("Supplier not found in active store");
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 500 || new Set(input.items.map((line) => line.receiptId)).size !== input.items.length) throw new Error("Invoice requires one to 500 distinct receipt lines");
      const previousInvoices = await supplierRows(tx, "supplierInvoice", { storeId: store.id, supplierId });
      const lines = [];
      for (const item of [...input.items].sort((a, b) => String(a.receiptId).localeCompare(String(b.receiptId)))) {
        await tx.$queryRawUnsafe('SELECT "id" FROM "PurchaseReceipt" WHERE "id" = $1 FOR UPDATE', item.receiptId);
        const receipt = await tx.purchaseReceipt.findUnique({ where: { id: item.receiptId } });
        if (!receipt || receipt.storeId !== store.id || receipt.supplierId !== supplierId) throw new Error("Invoice receipt is outside the active supplier and store");
        const remainingMilli = quantityMilli(receipt.quantity) - quantityMilli(supplierMatchedQuantity(receipt.id, previousInvoices));
        const billedMilli = quantityMilli(item.quantity);
        const matchedMilli = item.matchedQuantity == null ? Math.min(billedMilli, remainingMilli) : quantityMilli(item.matchedQuantity);
        if (billedMilli <= 0 || matchedMilli <= 0 || matchedMilli > remainingMilli || matchedMilli > billedMilli) throw new Error("Invoice match exceeds unmatched receipt quantity or billed quantity");
        const unitCostCents = supplierAmountCents(item.unitCostCents, "Billed unit cost");
        const billedCents = supplierLineCents(billedMilli / 1e3, unitCostCents);
        const expectedCents2 = supplierLineCents(matchedMilli / 1e3, receipt.unitCostCents);
        lines.push({ receiptId: receipt.id, purchaseOrderId: receipt.purchaseOrderId, poItemId: receipt.poItemId, inventoryLotId: receipt.inventoryLotId, productId: receipt.productId, supplierLotNumber: receipt.supplierLotNumber, quantity: billedMilli / 1e3, matchedQuantity: matchedMilli / 1e3, receiptQuantity: Number(receipt.quantity), unitCostCents, expectedUnitCostCents: Number(receipt.unitCostCents), billedCents, expectedCents: expectedCents2, varianceCents: billedCents - expectedCents2, quantityVariance: (billedMilli - matchedMilli) / 1e3, conditionStatus: receipt.conditionStatus, inspectionNote: receipt.inspectionNote || "" });
      }
      const subtotalCents = supplierAmountCents(lines.reduce((total, line) => total + line.billedCents, 0));
      const expectedCents = supplierAmountCents(lines.reduce((total, line) => total + line.expectedCents, 0));
      const taxCents = supplierAmountCents(input.taxCents || 0), freightCents = supplierAmountCents(input.freightCents || 0);
      const grossCents = supplierAmountCents(subtotalCents + taxCents + freightCents);
      const variance = lines.some((line) => line.varianceCents !== 0 || line.quantityVariance !== 0 || line.conditionStatus !== "accepted");
      invoice = await tx.supplierInvoice.create({ data: { storeId: store.id, supplierId, supplierName: supplier.name, invoiceNumber, identityKey, idempotencyKey: args.idempotencyKey.trim(), currencyCode, invoiceDate, dueDate, documentReference, status: variance ? "variance" : "captured", lines, subtotalCents, expectedCents, taxCents, freightCents, grossCents, varianceCents: subtotalCents - expectedCents, capturedBy: context.session.itemId, inputFingerprint: fingerprint, events: [event] } });
      return { success: true, invoiceId: invoice.id, creditId: null, status: invoice.status, grossCents, payableCents: grossCents, reused: false };
    }
    if (!args.invoiceId) throw new Error("Supplier invoice is required");
    await tx.$queryRawUnsafe('SELECT "id" FROM "SupplierInvoice" WHERE "id" = $1 FOR UPDATE', args.invoiceId);
    invoice = await tx.supplierInvoice.findUnique({ where: { id: args.invoiceId } });
    if (!invoice || invoice.storeId !== store.id) throw new Error("Supplier invoice not found in active store");
    const credits = await supplierRows(tx, "supplierCredit", { storeId: store.id, invoiceId: invoice.id });
    const events = invoice.events || [];
    const replay = events.find((entry) => entry.idempotencyKey === args.idempotencyKey.trim());
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new Error("Supplier operation replay conflicts with original evidence");
      return { success: true, invoiceId: invoice.id, creditId: replay.creditId || null, status: invoice.status, grossCents: invoice.grossCents, payableCents: supplierInvoicePayable(invoice, credits), reused: true };
    }
    if (["settled", "voided"].includes(invoice.status)) throw new Error("Settled and voided invoices are immutable");
    let creditId = null;
    const update = {};
    if (args.action === "approve_invoice") {
      if (!["captured", "variance"].includes(invoice.status)) throw new Error("Only captured or variance invoices can be approved");
      requiredText(input.reason, "Approval reason");
      if (invoice.status === "variance" && invoice.capturedBy === context.session.itemId) throw new Error("A different operator must approve supplier invoice variances");
      if (credits.some((credit) => credit.status === "open")) throw new Error("Resolve open supplier claims before invoice approval");
      Object.assign(update, { status: "approved", approvedBy: context.session.itemId, approvedAt: /* @__PURE__ */ new Date() });
    } else if (args.action === "open_claim" || args.action === "record_debit") {
      const reason = requiredText(input.reason, "Supplier claim or debit reason");
      const reference = requiredText(input.reference, "Supplier claim or debit reference");
      const evidence = requiredText(input.evidence, "Supplier claim or debit document evidence");
      const amountCents = supplierAmountCents(input.amountCents);
      if (amountCents <= 0) throw new Error("Supplier claim or debit amount must be positive");
      if (input.receiptId && !(invoice.lines || []).some((line) => line.receiptId === input.receiptId)) throw new Error("Claim receipt does not belong to the invoice");
      if (args.action === "open_claim" && amountCents > supplierInvoicePayable(invoice, credits)) throw new Error("Claim exceeds current supplier invoice liability");
      const identityKey = identity(store.id, invoice.supplierId, args.action, reference.toUpperCase());
      if (await tx.supplierCredit.findUnique({ where: { identityKey } })) throw new Error("Supplier claim or debit reference is already recorded");
      const credit = await tx.supplierCredit.create({ data: { storeId: store.id, supplierId: invoice.supplierId, invoiceId: invoice.id, receiptId: input.receiptId || null, identityKey, responseIdentityKey: identity(store.id, "pending-response", args.idempotencyKey), idempotencyKey: args.idempotencyKey.trim(), kind: args.action === "record_debit" ? "debit" : "claim", status: args.action === "record_debit" ? "accepted" : "open", reference, amountCents, claimedAmountCents: amountCents, currencyCode: invoice.currencyCode, reason, evidence, openedBy: context.session.itemId, ...args.action === "record_debit" ? { resolvedBy: context.session.itemId, resolvedAt: /* @__PURE__ */ new Date() } : {}, events: [event] } });
      creditId = credit.id;
      credits.push(credit);
      if (invoice.status === "approved") Object.assign(update, { status: "variance", approvedAt: null, approvedBy: "" });
    } else if (args.action === "resolve_claim") {
      const credit = credits.find((credit2) => credit2.id === args.creditId);
      if (!credit || credit.kind !== "claim" || credit.status !== "open") throw new Error("An open claim belonging to this invoice is required");
      if (!["credit", "rejected"].includes(input.outcome)) throw new Error("Claim outcome must be credit or rejected");
      requiredText(input.reason, "Claim resolution reason");
      const reference = requiredText(input.reference, "Supplier response or credit document reference");
      const evidence = requiredText(input.evidence, "Supplier response evidence");
      const amountCents = input.outcome === "credit" ? supplierAmountCents(input.amountCents) : 0;
      if (input.outcome === "credit" && (amountCents <= 0 || amountCents > credit.claimedAmountCents || amountCents > supplierInvoicePayable(invoice, credits))) throw new Error("Credit must be positive and cannot exceed claim or invoice liability");
      const acceptedIdentity = identity(store.id, invoice.supplierId, input.outcome === "credit" ? "supplier_credit" : "rejected_claim", reference.toUpperCase());
      if (await tx.supplierCredit.findUnique({ where: { responseIdentityKey: acceptedIdentity } })) throw new Error("Supplier credit response document is already recorded");
      const updated = await tx.supplierCredit.update({ where: { id: credit.id }, data: { responseIdentityKey: acceptedIdentity, kind: input.outcome === "credit" ? "credit" : "claim", status: input.outcome === "credit" ? "accepted" : "rejected", reference, evidence, amountCents, resolvedBy: context.session.itemId, resolvedAt: /* @__PURE__ */ new Date(), events: [...credit.events, event] } });
      credits.splice(credits.indexOf(credit), 1, updated);
      creditId = credit.id;
    } else if (args.action === "settle_invoice") {
      if (invoice.status !== "approved") throw new Error("Invoice must be approved before recording settlement");
      if (credits.some((credit) => credit.status === "open")) throw new Error("Open supplier claims prevent settlement");
      const payableCents = supplierInvoicePayable(invoice, credits);
      if (supplierAmountCents(input.amountCents) !== payableCents) throw new Error("External settlement amount must equal the approved net payable");
      const reference = requiredText(input.reference, "External payment reference");
      const evidence = requiredText(input.evidence, "External payment evidence");
      const paidAt = date(input.paidAt, "External payment date");
      if (paidAt > /* @__PURE__ */ new Date()) throw new Error("External settlement cannot be recorded in the future");
      Object.assign(update, { status: "settled", settledBy: context.session.itemId, settledAt: /* @__PURE__ */ new Date(), settlement: { amountCents: payableCents, currencyCode: invoice.currencyCode, reference, evidence, paidAt: paidAt.toISOString(), recordedBy: context.session.itemId } });
    } else if (args.action === "void_invoice") {
      requiredText(input.reason, "Invoice void reason");
      if (invoice.status === "approved" || credits.some((credit) => credit.status === "accepted" || credit.status === "open")) throw new Error("Resolve claims and liability adjustments before voiding an invoice");
      update.status = "voided";
    }
    await tx.supplierInvoice.update({ where: { id: invoice.id }, data: { ...update, events: [...events, { ...event, creditId }] } });
    return { success: true, invoiceId: invoice.id, creditId, status: update.status || invoice.status, grossCents: invoice.grossCents, payableCents: supplierInvoicePayable(invoice, credits), reused: false };
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/manageDeliveryRoutes.ts
init_groceryOutbox();
init_access();
init_storeScope();
init_serializableTransaction();

// features/keystone/lib/deliveryStops.ts
function normalizeDeliveryStop(input) {
  const normalized = {
    routeId: input.routeId.trim(),
    orderId: input.orderId.trim(),
    status: input.status,
    recipient: input.recipient?.trim() || "",
    proofReference: input.proofReference?.trim() || "",
    reason: input.reason?.trim() || "",
    custody: input.custody.trim(),
    conditionEvidence: input.conditionEvidence.trim(),
    retryAt: input.retryAt?.trim() || "",
    approvalEvidence: input.approvalEvidence?.trim() || "",
    idempotencyKey: input.idempotencyKey.trim()
  };
  if (!normalized.routeId || !normalized.orderId || !["delivered", "failed", "refused", "returned", "rescheduled"].includes(normalized.status)) throw new Error("Route, order and valid stop outcome are required");
  if (normalized.idempotencyKey.length < 12 || normalized.idempotencyKey.length > 200) throw new Error("A valid delivery outcome idempotency key is required");
  if (normalized.conditionEvidence.length < 8 || normalized.conditionEvidence.length > 1e3) throw new Error("Record package and temperature/cold-chain condition evidence");
  if ([normalized.recipient, normalized.proofReference, normalized.reason, normalized.approvalEvidence].some((value) => value.length > 1e3)) throw new Error("Delivery evidence is too long");
  if (normalized.status === "delivered") {
    if (!normalized.recipient || normalized.proofReference.length < 4 || normalized.custody !== "recipient") throw new Error("Delivery requires recipient, handoff proof reference and recipient custody");
  } else {
    if (!normalized.reason) throw new Error("A reason is required for delivery exceptions");
    const expectedCustody = normalized.status === "returned" ? "store" : "driver";
    if (normalized.custody !== expectedCustody) throw new Error(`This outcome requires recorded ${expectedCustody} custody`);
  }
  if (normalized.status === "rescheduled" && (normalized.approvalEvidence.length < 8 || !Number.isFinite(new Date(normalized.retryAt).getTime()))) throw new Error("Record the agreed retry time and customer approval");
  return normalized;
}
function applyDeliveryStopOutcome(stop, order, input, actorId, now = /* @__PURE__ */ new Date()) {
  const fingerprint = JSON.stringify(input);
  const previous = (stop.events || []).find((event2) => event2.idempotencyKey === input.idempotencyKey);
  if (previous) {
    if (previous.inputFingerprint !== fingerprint) throw new Error("Delivery outcome key was reused with different evidence");
    return { stop, reused: true, previous };
  }
  if ((stop.events || []).length >= 100) throw new Error("This stop requires operator review before additional attempts");
  const allowed = {
    out_for_delivery: ["delivered", "failed", "refused", "returned", "rescheduled"],
    rescheduled: ["delivered", "failed", "refused", "returned", "rescheduled"],
    failed: ["rescheduled", "returned"],
    refused: ["rescheduled", "returned"]
  };
  if (!allowed[stop.status]?.includes(input.status)) throw new Error(`Cannot change a ${stop.status} stop to ${input.status}`);
  if (input.status === "rescheduled") {
    const retry = new Date(input.retryAt).getTime(), end = new Date(order.metadata?.promiseEndsAt).getTime();
    if (!Number.isFinite(end) || retry <= now.getTime() || retry > end) throw new Error("Retry must be in the future within the existing customer delivery window");
  }
  const event = { ...input, actorId, customerEmail: order.email || null, occurredAt: now.toISOString(), inputFingerprint: fingerprint };
  return { stop: {
    ...stop,
    status: input.status,
    custody: input.custody,
    updatedAt: event.occurredAt,
    recipient: input.recipient,
    proofReference: input.proofReference,
    reason: input.reason,
    conditionEvidence: input.conditionEvidence,
    retryAt: input.retryAt || null,
    events: [...stop.events || [], event]
  }, reused: false, previous: event };
}
function assertDeliveryRouteComplete(stops, orders) {
  if (!stops.length || new Set(stops.map((stop) => stop.orderId)).size !== stops.length) throw new Error("Route must retain unique stop evidence");
  if (stops.some((stop) => !["delivered", "returned"].includes(stop.status))) throw new Error("Resolve every stop by delivery or confirmed return before completing the route");
  for (const order of orders) {
    const stop = stops.find((stop2) => stop2.orderId === order.id);
    if (!stop || (stop.status === "delivered" ? order.status !== "delivered" : order.status !== "returned")) throw new Error("Order status must match its individual delivery outcome");
  }
}
async function resolveDeliveryStopInTransaction(tx, actor, rawInput, now = /* @__PURE__ */ new Date()) {
  const input = normalizeDeliveryStop(rawInput);
  await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "DeliveryRoute" WHERE "id" = $1 FOR UPDATE', input.routeId);
  const sudo = tx.sudo();
  const route = await sudo.query.DeliveryRoute.findOne({ where: { id: input.routeId }, query: "id status stops store { id } driver { id }" });
  if (!route || route.store?.id !== actor.storeId) throw new Error("Delivery route not found in active store");
  const stops = Array.isArray(route.stops) ? route.stops : [];
  const index = stops.findIndex((stop) => stop.orderId === input.orderId);
  if (index < 0) throw new Error("Order is not a stop on this route");
  await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', input.orderId);
  const order = await sudo.query.Order.findOne({ where: { id: input.orderId }, query: "id email status metadata store { id } deliveryRoute { id }" });
  if (!order || order.store?.id !== actor.storeId) throw new Error("Order not found in active store");
  const result = applyDeliveryStopOutcome(stops[index], order, input, actor.userId, now);
  if (result.reused) return { success: true, routeId: route.id, orderId: order.id, status: result.previous.status, reused: true };
  if (route.status !== "in_progress" || order.deliveryRoute?.id !== route.id) throw new Error("Delivery outcomes require an active assigned route");
  if (input.status === "delivered") {
    await assertOrderHandoffPayment(tx.prisma, order);
    await assertOrderInventoryEligible(tx.prisma, order.id, actor.storeId, now);
  }
  if (input.status === "rescheduled") {
    await assertOrderHandoffPayment(tx.prisma, order);
    await assertOrderInventoryEligible(tx.prisma, order.id, actor.storeId, new Date(input.retryAt));
  }
  stops[index] = result.stop;
  await sudo.db.DeliveryRoute.updateOne({ where: { id: route.id }, data: { stops } });
  const nextStatus = input.status === "failed" ? "delivery_failed" : input.status === "refused" ? "delivery_refused" : input.status === "rescheduled" ? "out_for_delivery" : input.status;
  const previousMetadata = order.metadata || {};
  await sudo.db.Order.updateOne({ where: { id: order.id }, data: {
    status: nextStatus,
    ...input.status === "returned" ? { deliveryRoute: { disconnect: true } } : {},
    metadata: {
      ...previousMetadata,
      deliveryOutcome: {
        status: input.status,
        routeId: route.id,
        custody: input.custody,
        occurredAt: now.toISOString(),
        recipient: input.recipient,
        proofReference: input.proofReference,
        reason: input.reason,
        conditionEvidence: input.conditionEvidence,
        retryAt: input.retryAt || null
      },
      ...input.status === "delivered" ? { deliveredAt: previousMetadata.deliveredAt || now.toISOString() } : {},
      ...input.status === "returned" ? {
        deliveryRouteId: null,
        returnedAt: now.toISOString(),
        deliveryHistory: [...previousMetadata.deliveryHistory || [], { routeId: route.id, status: "returned", returnedAt: now.toISOString(), stop: result.stop }]
      } : {}
    }
  } });
  return { success: true, routeId: route.id, orderId: order.id, status: input.status, reused: false };
}

// features/keystone/mutations/manageDeliveryRoutes.ts
async function assertCanManageDelivery(context) {
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
  const date2 = new Date(value);
  return Number.isFinite(date2.getTime()) ? date2.toISOString().slice(0, 10) : null;
}
function assertValidRouteInput(deliveryDate, deliveryTimeWindow, orderIds) {
  const parsedDate = new Date(deliveryDate);
  if (!Number.isFinite(parsedDate.getTime())) {
    throw new Error("A valid delivery date is required");
  }
  if (!DELIVERY_TIME_WINDOWS.has(deliveryTimeWindow)) {
    throw new Error("A valid delivery time window is required");
  }
  if (orderIds.length > 200) throw new Error("Routes support at most 200 orders");
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
  await assertCanManageDelivery(context);
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
  await assertCanManageDelivery(context);
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
    const assignedIds = (route.orders || []).map((order) => order.id);
    if (!assignedIds.length && status === "in_progress") throw new Error("A route must contain orders before dispatch");
    if (assignedIds.length) await lockOrders(transactionContext, assignedIds);
    const orders = [];
    for (const orderId of assignedIds) orders.push(await getOrderOrThrow(sudoContext, orderId, store.id));
    const stops = Array.isArray(route.stops) ? route.stops : [];
    if (status === "in_progress") {
      if (!route.driver?.id) throw new Error("Routes require an eligible driver before dispatch");
      await assertEligibleDriver(transactionContext, sudoContext, route.driver.id, store.id);
      if (stops.length !== orders.length || stops.some((stop) => stop.status !== "planned" || !orders.some((order) => order.id === stop.orderId))) {
        throw new Error("Planned route stops must match the assigned orders");
      }
      for (const order of orders) {
        if (order.status !== "packed") throw new Error(`Order #${order.displayId} must be packed before dispatch`);
        await assertOrderHandoffPayment(transactionContext.prisma, order);
        await assertOrderInventoryEligible(
          transactionContext.prisma,
          order.id,
          store.id,
          new Date(Math.max(Date.now(), new Date(order.metadata?.promiseEndsAt || Date.now()).getTime()))
        );
      }
    } else {
      assertDeliveryRouteComplete(stops, orders);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await sudoContext.query.DeliveryRoute.updateOne({
      where: { id: routeId },
      data: {
        status,
        ...status === "in_progress" ? { startedAt: route.startedAt || now } : {},
        ...status === "completed" ? { completedAt: route.completedAt || now } : {},
        stops: status === "in_progress" ? stops.map((stop) => ({ ...stop, status: "out_for_delivery", custody: "driver", dispatchedAt: now })) : stops
      }
    });
    if (status === "in_progress") {
      for (const order of orders) {
        await enqueueGroceryOutboxEvent(transactionContext.prisma, { storeId: store.id, eventKey: `order.dispatched:${order.id}:${routeId}`, eventType: "order.dispatched", aggregateType: "Order", aggregateId: order.id, occurredAt: now, payload: { orderId: order.id, routeId } });
        await sudoContext.query.Order.updateOne({
          where: { id: order.id },
          data: {
            status: "out_for_delivery",
            metadata: { ...order.metadata || {}, deliveryRouteId: routeId, dispatchedAt: order.metadata?.dispatchedAt || now }
          }
        });
      }
    }
    return {
      success: true,
      routeId,
      status,
      orderCount: stops.length,
      message: status === "in_progress" ? "Route dispatched." : "Route completed with each individual delivery or return outcome retained."
    };
  }, { isolationLevel: "ReadCommitted" }));
}
async function resolveDeliveryStop(_root, input, context) {
  await assertCanManageDelivery(context);
  const store = await requireSessionStore(context);
  return withSerializableRetry(() => context.transaction(
    (tx) => resolveDeliveryStopInTransaction(tx, { storeId: store.id, userId: context.session.itemId }, input),
    { isolationLevel: "ReadCommitted" }
  ));
}

// features/keystone/mutations/updateProductInformation.ts
init_access();
init_storeScope();
init_groceryOutbox();
async function updateProductInformation(_root, { productId, input, idempotencyKey }, context) {
  await requireFreshCapability(context, "canManageProducts");
  const store = await requireSessionStore(context);
  const normalized = normalizeProductInformation(input);
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new Error("A valid request identity is required");
  return context.transaction(async (tc) => {
    for (const id of [...new Set([productId, normalized.variantOfId].filter(Boolean))].sort()) await tc.prisma.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id"=$1 FOR UPDATE', id);
    const product = await tc.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.storeId !== store.id) throw new Error("Product not found in active store");
    const existing = await tc.prisma.productInformationVersion.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.productId !== productId || groceryOutboxPayloadHash(existing.snapshot.input) !== groceryOutboxPayloadHash(normalized)) throw new Error("Request key was reused with different product information");
      return { success: true, reused: true, versionId: existing.id };
    }
    if (normalized.variantOfId) {
      const parent = await tc.prisma.product.findUnique({ where: { id: normalized.variantOfId } });
      if (!parent || parent.storeId !== store.id || parent.id === product.id || parent.variantOfId) throw new Error("Choose another root product in this Store");
    }
    if (await tc.prisma.product.count({ where: { variantOfId: productId } }) > 0 && normalized.variantOfId) throw new Error("A root product with variants cannot become a variant");
    if ((normalized.packBaseUnitsMilli !== Number(product.packBaseUnitsMilli || 1e3) || (normalized.variantOfId || null) !== (product.variantOfId || null)) && await tc.prisma.inventoryLot.count({ where: { productId } }) > 0) throw new Error("Pack identity on received inventory is immutable; create a separate SKU before changing the pack");
    const version = await tc.prisma.productInformationVersion.create({ data: { storeId: store.id, productId, actorId: context.session.itemId, idempotencyKey, sourceReference: normalized.sourceReference, effectiveAt: /* @__PURE__ */ new Date(), snapshot: { input: normalized, prior: { nutrition: product.nutrition, variantOfId: product.variantOfId, variantLabel: product.variantLabel, packBaseUnitsMilli: product.packBaseUnitsMilli }, commercial: { sku: product.sku, priceCents: product.priceCents, taxRateBasisPoints: product.taxRateBasisPoints, unitOfMeasure: product.unitOfMeasure, allergens: product.allergens } } } });
    await tc.prisma.product.update({ where: { id: productId }, data: { nutrition: normalized.nutrition, ...normalized.allergens === void 0 ? {} : { allergens: normalized.allergens }, variantOfId: normalized.variantOfId, variantLabel: normalized.variantLabel, packBaseUnitsMilli: normalized.packBaseUnitsMilli, informationSource: normalized.sourceReference } });
    return { success: true, reused: false, versionId: version.id };
  });
}

// features/keystone/mutations/authorizeOrderAdjustment.ts
var import_node_crypto17 = require("node:crypto");
init_paymentProviderAdapter();
init_serializableTransaction();
function adjustmentFingerprint(settlement, payment) {
  return (0, import_node_crypto17.createHash)("sha256").update(JSON.stringify([
    settlement.id,
    settlement.actualsHash,
    settlement.totalCents,
    settlement.snapshot?.currency,
    payment.id,
    payment.providerPaymentId,
    payment.paymentProviderId
  ])).digest("hex");
}
var defaults2 = { createPayment, verifyGuestOrderToken, now: () => Date.now(), token: import_node_crypto17.randomUUID };
function makeAuthorizeOrderAdjustment(overrides = {}) {
  const deps = { ...defaults2, ...overrides };
  return async function authorizeOrderAdjustment2(_root, { orderId, sessionId, token }, context) {
    function assertOwner(order) {
      const owns = context.session?.itemId ? order?.userId === context.session.itemId : !order?.userId && sessionId && token && order?.metadata?.guestSessionId === sessionId && deps.verifyGuestOrderToken(orderId, sessionId, token, Math.floor(deps.now() / 1e3), order.createdAt);
      if (!owns || !order?.store?.isActive) throw new Error("Order not found");
    }
    const claim = await withSerializableRetry(() => context.transaction(async (tc) => {
      const tx = tc.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { store: true } });
      assertOwner(order);
      const settlement = await tx.orderSettlement.findUnique({ where: { idempotencyKey: `order-actuals:${orderId}` } });
      const evidence = settlement?.providerEvidence || {};
      if (!settlement || settlement.orderId !== orderId || evidence.abandonment || settlement.status === "abandoned" || !["requires_customer_authorization", "processing"].includes(settlement.status) || order.status !== "picking") throw new Error("Order does not require a revised authorization");
      if (!Number.isSafeInteger(settlement.totalCents) || settlement.totalCents <= 0 || settlement.snapshot?.totalCents !== settlement.totalCents || !settlement.actualsHash || !/^[a-z]{3}$/.test(settlement.snapshot?.currency || "") || settlement.snapshot.currency !== String(order.currencyCode).toLowerCase()) throw new Error("Invalid revised authorization amount or currency");
      if (!evidence.originalPaymentId) throw new Error("Original payment identity is missing");
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id"=$1 FOR UPDATE', evidence.originalPaymentId);
      const payment = await tx.payment.findUnique({ where: { id: evidence.originalPaymentId }, include: { paymentProvider: true } });
      if (!payment || payment.orderId !== orderId || payment.storeId !== order.storeId || !payment.paymentProvider?.isInstalled) throw new Error("Original payment provider is unavailable");
      if (["processing", "unknown"].includes(payment.providerData?.authorizationVoid?.status)) throw new Error("Original authorization void requires reconciliation");
      const fingerprint = adjustmentFingerprint(settlement, payment);
      if (evidence.customerApproval && evidence.customerApproval.fingerprint !== fingerprint) throw new Error("Customer approval no longer matches the frozen sale");
      if (evidence.reauthorization?.paymentIntentId) {
        if (evidence.reauthorization.fingerprint !== fingerprint || !evidence.reauthorization.clientSecret) throw new Error("Revised authorization evidence does not match the frozen sale");
        return { settlement, payment, fingerprint, ready: evidence.reauthorization };
      }
      if (settlement.status !== "requires_customer_authorization") throw new Error("Finalization is already processing");
      const initiatedAt = evidence.authorizationInitiatedAt || new Date(deps.now()).toISOString();
      const elapsed = deps.now() - new Date(initiatedAt).getTime();
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 23 * 36e5) throw new Error("Revised authorization requires operator recovery; automatic provider-key reuse is expired");
      const lease = { token: deps.token(), expiresAt: new Date(deps.now() + 12e4).toISOString() };
      await tx.orderSettlement.update({ where: { id: settlement.id }, data: { providerEvidence: {
        ...evidence,
        authorizationInitiatedAt: initiatedAt,
        authorizationCreationLease: lease,
        customerApproval: { userId: context.session?.itemId || null, at: initiatedAt, totalCents: settlement.totalCents, actualsHash: settlement.actualsHash, fingerprint }
      } } });
      return { settlement, payment, fingerprint, ready: null };
    }));
    if (claim.ready) return { clientSecret: claim.ready.clientSecret, paymentIntentId: claim.ready.paymentIntentId, totalCents: claim.settlement.totalCents };
    const created = await deps.createPayment({
      provider: claim.payment.paymentProvider,
      amount: claim.settlement.totalCents,
      currency: claim.settlement.snapshot.currency,
      captureMethod: "manual",
      idempotencyKey: `${claim.settlement.idempotencyKey}:revised-authorization`
    });
    if (!created.paymentIntentId || !created.clientSecret || created.paymentIntentId === claim.payment.providerPaymentId) throw new Error("Provider did not return a distinct revised authorization");
    const ready = await withSerializableRetry(() => context.transaction(async (tc) => {
      const tx = tc.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { store: true } });
      assertOwner(order);
      const current = await tx.orderSettlement.findUnique({ where: { id: claim.settlement.id } });
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id"=$1 FOR UPDATE', claim.payment.id);
      const currentPayment = await tx.payment.findUnique({ where: { id: claim.payment.id }, include: { paymentProvider: true } });
      if (!current || order.status !== "picking" || current.orderId !== orderId || current.status !== "requires_customer_authorization" || current.providerEvidence?.abandonment || current.providerEvidence?.originalPaymentId !== claim.payment.id || order.storeId !== claim.payment.storeId || String(order.currencyCode).toLowerCase() !== current.snapshot?.currency || !currentPayment || currentPayment.orderId !== orderId || currentPayment.storeId !== order.storeId || !currentPayment.paymentProvider?.isInstalled || ["processing", "unknown"].includes(currentPayment.providerData?.authorizationVoid?.status) || adjustmentFingerprint(current, currentPayment) !== claim.fingerprint || current.providerEvidence?.customerApproval?.fingerprint !== claim.fingerprint) throw new Error("Order or approval changed during authorization; provider intent needs reconciliation");
      const existing = current.providerEvidence?.reauthorization;
      if (existing && (existing.paymentIntentId !== created.paymentIntentId || existing.fingerprint !== claim.fingerprint)) throw new Error("Provider retry returned conflicting authorization evidence");
      const priorPayment = await tx.payment.findUnique({ where: { providerPaymentId: created.paymentIntentId } });
      if (priorPayment && (priorPayment.orderId !== orderId || priorPayment.storeId !== order.storeId || priorPayment.paymentProviderId !== claim.payment.paymentProviderId)) throw new Error("Revised authorization belongs to another order");
      const reauthorization = existing || { paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret, fingerprint: claim.fingerprint };
      await tx.orderSettlement.update({ where: { id: current.id }, data: { providerEvidence: { ...current.providerEvidence, authorizationCreationLease: null, reauthorization } } });
      return reauthorization;
    }));
    return { clientSecret: ready.clientSecret, paymentIntentId: ready.paymentIntentId, totalCents: claim.settlement.totalCents };
  };
}
var authorizeOrderAdjustment = makeAuthorizeOrderAdjustment();

// features/keystone/mutations/requestGuestOrderAccess.ts
var import_node_crypto18 = require("node:crypto");
init_storeScope();
init_groceryOutbox();
async function requestGuestOrderAccess(_root, { orderId, email }, context) {
  if (orderId.length > 200 || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) return true;
  const store = await publicStore(context);
  const order = await context.prisma.order.findFirst({ where: { id: orderId, storeId: store.id, email: { equals: email.trim(), mode: "insensitive" }, userId: null }, select: { id: true } });
  if (order) await context.transaction(async (tc) => {
    const bucket = Math.floor(Date.now() / 3e5);
    const key2 = (0, import_node_crypto18.createHash)("sha256").update(`${order.id}:${bucket}`).digest("hex");
    await enqueueGroceryOutboxEvent(tc.prisma, { storeId: store.id, eventKey: `order.access:${key2}`, eventType: "order.access.requested", aggregateType: "Order", aggregateId: order.id, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { orderId: order.id } });
  });
  return true;
}

// features/keystone/mutations/resumeGroceryCheckout.ts
async function resumeGroceryCheckout(_root, { paymentSessionId, sessionId }, context) {
  const attempt = await context.prisma.checkoutAttempt.findUnique({ where: { idempotencyKey: `checkout:${paymentSessionId}` } });
  const request = attempt?.requestData;
  const userId = context.session?.itemId;
  if (!attempt || !request || (userId ? request.checkoutOwnerId !== userId : !sessionId?.trim() || request.checkoutOwnerId || request.sessionId !== sessionId.trim())) throw new Error("Checkout attempt not found");
  return submitGroceryOrder(null, { data: { ...request, sessionId: userId ? void 0 : sessionId } }, context);
}

// features/keystone/mutations/updateGroceryDeliveryPolicy.ts
init_access();
init_storeScope();
init_groceryOutbox();
var import_node_crypto19 = require("node:crypto");
async function updateGroceryDeliveryPolicy(_root, { policy }, context) {
  await requireFreshCapability(context, "canManageOnboarding");
  const store = await requireSessionStore(context);
  const normalized = normalizeDeliveryPolicy(policy);
  return context.transaction(async (tc) => {
    await tc.prisma.$queryRawUnsafe('SELECT "id" FROM "StoreSettings" WHERE "store" = $1 FOR UPDATE', store.id);
    const old = await tc.prisma.storeSettings.findUnique({ where: { storeId: store.id } });
    if (!old) throw new Error("Store settings are unavailable");
    await tc.prisma.storeSettings.update({ where: { storeId: store.id }, data: { deliveryPolicy: normalized } });
    await enqueueGroceryOutboxEvent(tc.prisma, { storeId: store.id, eventKey: `delivery.policy:${(0, import_node_crypto19.randomUUID)()}`, eventType: "delivery.policy.updated", aggregateType: "Store", aggregateId: store.id, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { before: old.deliveryPolicy, after: normalized, actorId: context.session.itemId } });
    return normalized;
  });
}

// features/keystone/mutations/manageInventoryCounts.ts
init_access();
init_inventoryMovements();
init_serializableTransaction();
async function manageInventoryCount(_root, args, context) {
  const { storeId } = await requireFreshCapability(context, "canManageInventory");
  if (!storeId || !context.session?.itemId) throw new Error("Active store and actor required");
  if (!["observe", "recount", "approve"].includes(args.action)) throw new Error("Unsupported count action");
  if (!args.reason?.trim() || args.idempotencyKey?.trim().length < 12) throw new Error("Count reason and idempotency key required");
  if (args.action !== "approve" && (args.quantity == null || quantityMilli(args.quantity) < 0)) throw new Error("Non-negative observed quantity required");
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-count'), hashtext($1))", args.countId || args.idempotencyKey);
    let count = args.countId ? await tx.inventoryCount.findUnique({ where: { id: args.countId } }) : await tx.inventoryCount.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (count && count.storeId !== storeId) throw new Error("Count not found in active store");
    const events = count?.events || [];
    const replay = events.find((event2) => event2.idempotencyKey === args.idempotencyKey);
    if (replay) {
      if (replay.action !== args.action || replay.reason !== args.reason.trim() || replay.quantity !== (args.quantity ?? null) || args.inventoryLotId && count.inventoryLotId !== args.inventoryLotId) throw new Error("Count replay conflicts with original input");
      return { success: true, countId: count.id, status: count.status, reused: true };
    }
    if (args.action !== "observe" && !count) throw new Error("Count not found");
    if (args.action === "observe" && count) throw new Error("Count already exists");
    const lotId = count?.inventoryLotId || args.inventoryLotId;
    const identity2 = await tx.inventoryLot.findUnique({ where: { id: lotId }, select: { productId: true, storeId: true } });
    if (!identity2 || identity2.storeId !== storeId || !identity2.productId) throw new Error("Lot not found in active store");
    await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', identity2.productId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
    const lot = await tx.inventoryLot.findUnique({ where: { id: lotId } });
    const event = { action: args.action, idempotencyKey: args.idempotencyKey, reason: args.reason.trim(), quantity: args.quantity ?? null, actorId: context.session.itemId, at: (/* @__PURE__ */ new Date()).toISOString() };
    if (args.action === "observe") {
      count = await tx.inventoryCount.create({ data: { storeId, inventoryLotId: lotId, productId: identity2.productId, idempotencyKey: args.idempotencyKey, status: "observed", expectedQuantity: lot.quantityRemaining, observedQuantity: args.quantity, reason: args.reason.trim(), observedBy: context.session.itemId, events: [event] } });
    } else if (args.action === "recount") {
      if (count.status !== "observed") throw new Error("Only an observed count can be recounted");
      count = await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "recounted", recountQuantity: args.quantity, recountedBy: context.session.itemId, events: [...events, event] } });
    } else {
      if (count.status === "approved") throw new Error("Count is already approved");
      const variance = quantityMilli(count.observedQuantity) !== quantityMilli(count.expectedQuantity);
      if (variance && count.status !== "recounted") throw new Error("A count variance requires a recount before approval");
      if (count.observedBy === context.session.itemId || count.recountedBy === context.session.itemId) throw new Error("A different inventory operator must approve the count");
      if (quantityMilli(lot.quantityRemaining) !== quantityMilli(count.expectedQuantity)) throw new Error("Stock changed since observation; start a fresh count");
      const target = Number(count.status === "recounted" ? count.recountQuantity : count.observedQuantity);
      if (quantityMilli(target) > await unconvertedLotCapacityMilli(tx, storeId, lot)) throw new Error("Count exceeds received quantity remaining after case conversions; reconcile receipt provenance first");
      const product = await tx.product.findUnique({ where: { id: identity2.productId } });
      const nextStock = (quantityMilli(product.stockQuantity) + quantityMilli(target) - quantityMilli(lot.quantityRemaining)) / 1e3;
      if (nextStock < 0) throw new Error("Count would make product stock negative");
      await tx.inventoryLot.update({ where: { id: lotId }, data: { quantityRemaining: target } });
      await tx.product.update({ where: { id: product.id }, data: { stockQuantity: nextStock, inStock: nextStock > 0 } });
      await appendInventoryMovement(tx, { storeId, productId: product.id, inventoryLotId: lotId, sourceType: "approved_count", sourceId: count.id, idempotencyKey: `count:${args.idempotencyKey}`, actorId: context.session.itemId, reason: args.reason, quantityBefore: lot.quantityRemaining, quantityAfter: target, productStockBefore: product.stockQuantity, productStockAfter: nextStock });
      count = await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "approved", approvedBy: context.session.itemId, approvedAt: /* @__PURE__ */ new Date(), events: [...events, event] } });
    }
    return { success: true, countId: count.id, status: count.status, reused: false };
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/manageInventorySafety.ts
init_access();
init_inventoryMovements();
init_groceryOutbox();
init_serializableTransaction();
var effectiveDispositions = (events) => events.filter((event) => event.action === "disposition" && !events.some((later) => later.action === "disposition" && later.evidence?.replacesIdempotencyKey === event.idempotencyKey));
async function manageInventorySafety(_root, args, context) {
  const { storeId } = await requireFreshCapability(context, "canManageInventory");
  if (!storeId || !context.session?.itemId) throw new Error("Active store and actor required");
  if (!["hold", "quarantine", "release", "recall", "notice", "disposition", "close"].includes(args.action)) throw new Error("Unsupported safety action");
  if (!args.reason?.trim() || args.idempotencyKey?.trim().length < 12) throw new Error("Safety reason and idempotency key required");
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-safety'), hashtext($1))", args.recallId || args.idempotencyKey);
    await lockInventoryConversionScope(tx, storeId);
    const recall = args.recallId ? await tx.inventoryRecall.findUnique({ where: { id: args.recallId } }) : args.action === "recall" ? await tx.inventoryRecall.findUnique({ where: { idempotencyKey: args.idempotencyKey } }) : null;
    if (recall && recall.storeId !== storeId) throw new Error("Recall not found in active store");
    const events = recall?.events || [];
    const scopeFingerprint = canonicalGroceryOutboxPayload({ action: args.action, productId: args.productId || null, inventoryLotIds: [...new Set(args.inventoryLotIds || [])].sort(), reason: args.reason.trim(), evidence: args.evidence || null });
    const event = { action: args.action, idempotencyKey: args.idempotencyKey, reason: args.reason.trim(), evidence: args.evidence || null, scopeFingerprint, actorId: context.session.itemId, at: (/* @__PURE__ */ new Date()).toISOString() };
    const replay = events.find((value) => value.idempotencyKey === args.idempotencyKey);
    if (replay) {
      if (replay.scopeFingerprint !== scopeFingerprint) throw new Error("Safety replay conflicts with original evidence");
      return { success: true, recallId: recall.id, status: recall.status, affectedOrders: recall.affectedOrders, reused: true };
    }
    if (["notice", "disposition", "close"].includes(args.action)) {
      if (!recall || recall.status !== "open") throw new Error("An open recall is required");
      if (args.action === "notice") {
        if (!(recall.affectedOrders || []).some((order) => order.orderId === args.evidence?.orderId)) throw new Error("Notice order is outside recall scope");
        if (!["phone", "email", "in_person", "sms"].includes(args.evidence?.channel) || !["delivered", "failed", "unreachable"].includes(args.evidence?.outcome) || !args.evidence?.reference?.trim()) throw new Error("Notice requires channel, outcome and communication reference");
      }
      if (args.action === "disposition") {
        if (!(recall.scope?.lots || []).some((lot2) => lot2.id === args.evidence?.lotId)) throw new Error("Disposition lot is outside recall scope");
        if (!["released", "recovered", "disposed", "unaccounted"].includes(args.evidence?.disposition) || quantityMilli(args.evidence?.quantity) <= 0 || !args.evidence?.custody?.trim()) throw new Error("Disposition requires positive quantity and custody evidence");
        if (args.evidence.replacesIdempotencyKey) {
          const replaced = effectiveDispositions(events).find((value) => value.idempotencyKey === args.evidence.replacesIdempotencyKey);
          if (!replaced || replaced.evidence.lotId !== args.evidence.lotId || quantityMilli(replaced.evidence.quantity) !== quantityMilli(args.evidence.quantity)) throw new Error("Disposition correction must replace one current outcome for the same lot and quantity");
        }
        const lotScope = recall.scope.lots.find((lot2) => lot2.id === args.evidence.lotId);
        const assigned = effectiveDispositions([...events, event]).filter((value) => value.evidence.lotId === args.evidence.lotId).reduce((total, value) => total + quantityMilli(value.evidence.quantity), 0);
        if (assigned > quantityMilli(lotScope.quantity)) throw new Error("Disposition evidence exceeds recalled quantity");
        const stockQuantity = quantityMilli(args.evidence?.stockQuantity ?? 0);
        if (stockQuantity < 0 || stockQuantity > quantityMilli(args.evidence.quantity)) throw new Error("Disposition stock quantity must be between zero and the evidenced quantity");
        const identity2 = await tx.inventoryLot.findUnique({ where: { id: args.evidence.lotId } });
        if (!identity2 || identity2.storeId !== storeId) throw new Error("Disposition lot not found in active store");
        await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', identity2.productId);
        await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', identity2.id);
        const lot = await tx.inventoryLot.findUnique({ where: { id: identity2.id } });
        const product = await tx.product.findUnique({ where: { id: identity2.productId } });
        const delta = args.evidence.disposition === "recovered" ? stockQuantity : args.evidence.disposition === "unaccounted" ? 0 : -stockQuantity;
        const nextLot = (quantityMilli(lot.quantityRemaining) + delta) / 1e3;
        const nextProduct = (quantityMilli(product.stockQuantity) + delta) / 1e3;
        if (Math.min(nextLot, nextProduct) < 0 || quantityMilli(nextLot) > quantityMilli(lot.quantity)) throw new Error("Disposition exceeds recorded physical stock");
        await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityRemaining: nextLot } });
        await tx.product.update({ where: { id: product.id }, data: { stockQuantity: nextProduct, inStock: nextProduct > 0 } });
        await appendInventoryMovement(tx, { storeId, productId: product.id, inventoryLotId: lot.id, sourceType: `recall_${args.evidence.disposition}`, sourceId: recall.id, idempotencyKey: `recall-disposition:${args.idempotencyKey}`, actorId: context.session.itemId, reason: args.reason, quantityBefore: lot.quantityRemaining, quantityAfter: nextLot, productStockBefore: product.stockQuantity, productStockAfter: nextProduct, metadata: { ...args.evidence, recallId: recall.id } });
      }
      if (args.action === "close") {
        for (const lot of recall.scope.lots) {
          const dispositions = effectiveDispositions(events).filter((value) => value.evidence.lotId === lot.id);
          const accounted = dispositions.filter((value) => value.evidence.disposition !== "unaccounted").reduce((sum, value) => sum + quantityMilli(value.evidence.quantity), 0);
          if (accounted !== quantityMilli(lot.quantity) || dispositions.some((value) => value.evidence.disposition === "unaccounted")) throw new Error("Recall quantities must be fully reconciled without unaccounted stock before closure");
        }
        for (const order of recall.affectedOrders || []) {
          if (!events.some((value) => value.action === "notice" && value.evidence.orderId === order.orderId && value.evidence.outcome === "delivered")) throw new Error("All affected orders require a delivered notice outcome before closure");
        }
      }
      const updated = await tx.inventoryRecall.update({ where: { id: recall.id }, data: { events: [...events, event], ...args.action === "close" ? { status: "closed", closedBy: context.session.itemId, closedAt: /* @__PURE__ */ new Date(), closure: { reason: args.reason.trim(), evidence: args.evidence || null } } : {} } });
      return { success: true, recallId: recall.id, status: updated.status, affectedOrders: recall.affectedOrders, reused: false };
    }
    const ids = [...new Set(args.inventoryLotIds || [])].sort();
    const priorOperation = await tx.inventoryMovement.findFirst({ where: { storeId, idempotencyKey: { startsWith: `safety:${args.idempotencyKey}:` } } });
    if (priorOperation && priorOperation.metadata?.scopeFingerprint !== scopeFingerprint) throw new Error("Safety replay conflicts with original scope");
    if (!ids.length && !args.productId) throw new Error("Select a product or explicit lot scope");
    const lots = [];
    for (let skip = 0; ; skip += 100) {
      const page = await tx.inventoryLot.findMany({ where: { storeId, ...ids.length ? { id: { in: ids } } : { productId: args.productId } }, orderBy: { id: "asc" }, take: 100, skip });
      lots.push(...page);
      if (page.length < 100) break;
    }
    if (!lots.length || ids.length && lots.length !== ids.length) throw new Error("Lot scope not found in active store");
    const conversionScope = await expandConvertedLotScope(tx, storeId, lots.map((lot) => lot.id));
    const descendants = conversionScope.lotIds.filter((id) => !lots.some((lot) => lot.id === id));
    for (let offset = 0; offset < descendants.length; offset += 100) {
      const requested = descendants.slice(offset, offset + 100);
      const children = await tx.inventoryLot.findMany({ where: { storeId, id: { in: requested } } });
      if (children.length !== requested.length) throw new Error("Converted descendant lot is missing or outside the active Store");
      lots.push(...children);
    }
    lots.sort((left, right) => left.id.localeCompare(right.id));
    for (const productId of [...new Set(lots.map((lot) => lot.productId))].sort()) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
    for (const lot of lots) await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lot.id);
    const affectedOrders = [];
    let cursor;
    for (; ; ) {
      const page = await tx.order.findMany({ where: { storeId }, take: 100, orderBy: { id: "asc" }, ...cursor ? { cursor: { id: cursor }, skip: 1 } : {}, include: { user: { select: { email: true } }, lineItems: { include: { inventoryAllocations: true, fulfillment: true } } } });
      affectedOrders.push(...traceAffectedOrders(page, lots.map((lot) => lot.id)));
      if (page.length < 100) break;
      cursor = page[page.length - 1].id;
    }
    let recallId;
    if (args.action === "recall") {
      const scopeLots = lots.map((lot) => {
        const convertedOut = conversionScope.convertedOutMilli.get(lot.id) || 0;
        const attributable = quantityMilli(lot.quantity) - convertedOut;
        if (attributable < 0 || quantityMilli(lot.quantityRemaining) > attributable) throw new Error("Conversion provenance conflicts with original received lot quantity or remaining stock");
        return { id: lot.id, supplierLotNumber: lot.supplierLotNumber || lot.lotNumber, supplierId: lot.supplierId || null, productId: lot.productId, quantity: attributable / 1e3, originalQuantity: Number(lot.quantity), convertedOutQuantity: convertedOut / 1e3, quantityRemaining: Number(lot.quantityRemaining) };
      });
      const created = await tx.inventoryRecall.create({ data: { storeId, idempotencyKey: args.idempotencyKey, reason: args.reason.trim(), status: "open", openedBy: context.session.itemId, scope: { productId: args.productId || null, conversionIds: conversionScope.conversions.map((record2) => record2.id), lots: scopeLots }, affectedOrders, events: [event] } });
      recallId = created.id;
      for (const order of affectedOrders) await enqueueGroceryOutboxEvent(tx, { storeId, eventKey: `recall:${created.id}:notice:${order.orderId}`, eventType: "inventory.recall.notice", aggregateType: "Order", aggregateId: order.orderId, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { orderId: order.orderId, recallId: created.id, reason: args.reason.trim() } });
    }
    for (const initial of lots) {
      const lot = await tx.inventoryLot.findUnique({ where: { id: initial.id } });
      const key2 = `safety:${args.idempotencyKey}:${lot.id}`;
      const previous = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: key2 } });
      if (previous) {
        if (previous.storeId !== storeId || previous.sourceType !== `safety_${args.action}` || previous.reason !== args.reason.trim()) throw new Error("Safety replay conflicts with original evidence");
        continue;
      }
      if (args.action === "release") {
        if (!args.evidence?.inspection?.trim()) throw new Error("Release requires inspection evidence");
        if (lot.safetyStatus === "recalled") throw new Error("Recalled stock remains excluded; record recall disposition without returning it to sale");
        if (new Date(lot.expirationDate) <= /* @__PURE__ */ new Date()) throw new Error("Expired stock cannot be released");
      }
      const status = args.action === "hold" ? "held" : args.action === "quarantine" ? "quarantined" : args.action === "recall" ? "recalled" : "available";
      const product = await tx.product.findUnique({ where: { id: lot.productId } });
      await tx.inventoryLot.update({ where: { id: lot.id }, data: { safetyStatus: status, safetyReason: args.reason.trim(), ...args.action === "release" ? { conditionStatus: "accepted" } : {} } });
      await appendInventoryMovement(tx, { storeId, productId: lot.productId, inventoryLotId: lot.id, sourceType: `safety_${args.action}`, sourceId: recallId || lot.id, idempotencyKey: key2, actorId: context.session.itemId, reason: args.reason, quantityBefore: lot.quantityRemaining, quantityAfter: lot.quantityRemaining, productStockBefore: product.stockQuantity, productStockAfter: product.stockQuantity, metadata: { previousStatus: lot.safetyStatus, safetyStatus: status, scopeFingerprint, evidence: args.evidence || null, affectedOrders } });
    }
    return { success: true, recallId: recallId || null, status: args.action === "recall" ? "open" : args.action, affectedOrders, reused: false };
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/finalizeGroceryOrderActuals.ts
var import_node_crypto21 = require("node:crypto");

// features/keystone/lib/finalSaleIdentity.ts
var import_node_crypto20 = require("node:crypto");
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key2) => value[key2] !== void 0).map((key2) => [key2, canonical(value[key2])]));
  return value;
}
function finalSaleSnapshotHash(snapshot) {
  return (0, import_node_crypto20.createHash)("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex");
}

// features/keystone/mutations/finalizeGroceryOrderActuals.ts
init_access();
init_storeScope();

// features/keystone/lib/fulfillmentActuals.ts
init_inventoryMovements();
var ACTUAL_FIELDS = `id lineItemIdSnapshot resolution product { id } productTitle productSku
  quantityMilli grossMilli tareMilli unitOfMeasure unitPriceCents subtotalCents taxRateBasisPoints allocations evidence`;
function measureMilli(value, label = "Quantity") {
  if (!/^\d{1,7}(?:\.\d{1,3})?$/.test(value)) throw new Error(`${label} must be nonnegative with at most three decimal places`);
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 1e3 + Number(fraction.padEnd(3, "0"));
  if (!Number.isSafeInteger(result) || result > 2147483647) throw new Error(`${label} is too large`);
  return result;
}
var UNITS = {
  each: ["unit", BigInt(1), BigInt(1)],
  g: ["weight", BigInt(1), BigInt(1)],
  kg: ["weight", BigInt(1e3), BigInt(1)],
  lb: ["weight", BigInt(45359237), BigInt(1e5)],
  oz: ["weight", BigInt(45359237), BigInt(16e5)],
  mL: ["volume", BigInt(1), BigInt(1)],
  L: ["volume", BigInt(1e3), BigInt(1)],
  gallon: ["volume", BigInt(3785411784), BigInt(1e6)],
  quart: ["volume", BigInt(946352946), BigInt(1e6)],
  pint: ["volume", BigInt(473176473), BigInt(1e6)]
};
function roundRatio(numerator, denominator) {
  const value = Number((numerator + denominator / BigInt(2)) / denominator);
  if (!Number.isSafeInteger(value) || value > 2147483647) throw new Error("Measured amount exceeds supported precision");
  return value;
}
function convertMeasureMilli(value, from, to) {
  const source = UNITS[from], target = UNITS[to];
  if (!source || !target || source[0] !== target[0]) throw new Error("Measurement units are incompatible");
  return roundRatio(BigInt(value) * source[1] * target[2], source[2] * target[1]);
}
function measuredSubtotalCents(unitPriceCents, quantityMilli2) {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 || !Number.isSafeInteger(quantityMilli2) || quantityMilli2 < 0) {
    throw new Error("Price and quantity must be nonnegative integers");
  }
  return roundRatio(BigInt(unitPriceCents) * BigInt(quantityMilli2), BigInt(1e3));
}
function normalizeActualInput(input) {
  const result = {
    orderId: input.orderId.trim(),
    lineItemId: input.lineItemId.trim(),
    resolution: input.resolution,
    productId: input.productId?.trim() || "",
    quantity: input.quantity.trim(),
    tare: input.tare?.trim() || "0",
    unitOfMeasure: input.unitOfMeasure.trim(),
    reason: input.reason?.trim() || "",
    consentChannel: input.consentChannel?.trim() || "",
    consentCustomer: input.consentCustomer?.trim() || "",
    consentEvidence: input.consentEvidence?.trim() || "",
    idempotencyKey: input.idempotencyKey.trim()
  };
  if (!result.orderId || !result.lineItemId || !["picked", "short", "substituted"].includes(result.resolution)) throw new Error("Order, line and resolution are required");
  if (result.idempotencyKey.length < 12 || result.idempotencyKey.length > 200) throw new Error("A valid resolution idempotency key is required");
  if (result.reason.length > 1e3 || result.consentEvidence.length > 1e3 || result.consentCustomer.length > 200) throw new Error("Resolution evidence is too long");
  measureMilli(result.quantity);
  measureMilli(result.tare, "Tare");
  if (result.resolution !== "picked" && !result.reason) throw new Error("A reason is required for shortages and substitutions");
  return result;
}
function calculateLineActual(line, order, product, input) {
  const commercial = line.metadata?.commercial || {};
  const replacement = input.resolution === "substituted";
  const pricingMethod = replacement ? product.pricingMethod : commercial.pricingMethod || product.pricingMethod;
  const unit = replacement ? product.unitOfMeasure : commercial.unitOfMeasure || commercial.unitOfMeasurement || product.unitOfMeasure;
  const grossMilli = convertMeasureMilli(measureMilli(input.quantity), input.unitOfMeasure, unit);
  const tareMilli = convertMeasureMilli(measureMilli(input.tare, "Tare"), input.unitOfMeasure, unit);
  if (tareMilli > grossMilli) throw new Error("Tare cannot exceed gross measurement");
  const quantityMilli2 = grossMilli - tareMilli;
  if (pricingMethod === "unit" && (quantityMilli2 % 1e3 !== 0 || tareMilli !== 0 || input.unitOfMeasure !== unit)) throw new Error("Unit products require whole quantities without tare");
  if (input.resolution === "picked" && pricingMethod === "unit" && quantityMilli2 !== line.quantity * 1e3) throw new Error("Use shortage resolution when fewer units are picked");
  if (input.resolution === "short" && quantityMilli2 >= line.quantity * 1e3) throw new Error("Short quantity must be less than the requested quantity");
  if (input.resolution !== "short" && quantityMilli2 === 0) throw new Error("Zero quantity requires shortage resolution");
  if (replacement && product.id === line.product?.id) throw new Error("Select a different replacement product");
  if (!replacement && input.productId && input.productId !== line.product?.id) throw new Error("Only substitutions may change the product");
  const preference = line.metadata?.substitutionPreference;
  if (replacement && (["none", "remove", "no_substitutions", "refund"].includes(preference) || order.substitutionPreference === "refund")) throw new Error("Customer preferences prohibit substitutions");
  const unitPriceCents = replacement ? product.priceCents : line.unitPriceCents;
  const subtotalCents = measuredSubtotalCents(unitPriceCents, quantityMilli2);
  const requiresConsent = replacement && (preference === "contact" || order.substitutionPreference === "call_me") || quantityMilli2 > line.quantity * 1e3 || subtotalCents > measuredSubtotalCents(line.unitPriceCents, line.quantity * 1e3);
  if (requiresConsent || input.consentChannel || input.consentEvidence || input.consentCustomer) {
    if (!["phone", "in_person"].includes(input.consentChannel) || input.consentCustomer.toLowerCase() !== order.email.toLowerCase() || input.consentEvidence.length < 8) {
      throw new Error("Record phone or in-person consent, the order customer email, and approval details");
    }
  }
  const taxRateBasisPoints = replacement ? product.taxRateBasisPoints ?? order.storeTaxRateBasisPoints : commercial.taxRateBasisPoints ?? order.storeTaxRateBasisPoints;
  if (!Number.isInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 1e4) throw new Error("A valid snapshotted tax treatment is required");
  return { grossMilli, tareMilli, quantityMilli: quantityMilli2, unitOfMeasure: unit, unitPriceCents, subtotalCents, taxRateBasisPoints };
}
async function resolveActualInTransaction(tx, actor, rawInput, now = /* @__PURE__ */ new Date()) {
  const input = normalizeActualInput(rawInput);
  await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', input.orderId);
  const sudo = tx.sudo();
  const order = await sudo.query.Order.findOne({ where: { id: input.orderId }, query: "id status email metadata substitutionPreference store { id }" });
  if (!order || order.store?.id !== actor.storeId) throw new Error("Order not found in active store");
  const line = await sudo.query.OrderLineItem.findOne({ where: { id: input.lineItemId }, query: `id title sku quantity unitPriceCents metadata order { id } product { id } fulfillment { ${ACTUAL_FIELDS} } inventoryAllocations { quantity inventoryLot { id product { id } store { id } } }` });
  if (!line || line.order?.id !== order.id) throw new Error("Line does not belong to this order");
  const fingerprint = JSON.stringify(input);
  if (line.fulfillment) {
    if (line.fulfillment.evidence?.inputFingerprint !== fingerprint) throw new Error("This line was already resolved with different input");
    return { ...line.fulfillment, reused: true };
  }
  if (order.status !== "picking" || order.metadata?.finalSale) throw new Error("Actual goods can only be resolved while picking before finalization");
  const payment = await sudo.query.Payment.findMany({ where: { order: { id: { equals: order.id } }, status: { in: ["authorized", "succeeded", "partially_refunded"] } }, take: 1, query: "id" });
  if (!payment.length) throw new Error("Picking requires an authorized or succeeded payment");
  const productId = input.resolution === "substituted" ? input.productId : line.product?.id;
  if (!productId || !line.product?.id) throw new Error("The original and actual products must be identifiable");
  const productIds = [.../* @__PURE__ */ new Set([line.product.id, productId])].sort();
  for (const id of productIds) await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', id);
  for (const id of productIds) await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "product" = $1 ORDER BY "expirationDate", "id" FOR UPDATE', id);
  const products = [];
  for (const id of productIds) products.push(await sudo.query.Product.findOne({ where: { id }, query: `id title sku status department priceCents taxRateBasisPoints pricingMethod unitOfMeasure store { id } inventoryLots(take: 1001) { id quantityRemaining expirationDate safetyStatus conditionStatus store { id } }` }));
  if (products.some((product2) => !product2 || product2.store?.id !== actor.storeId || product2.inventoryLots.length > 1e3)) throw new Error("Product inventory is unavailable in this store");
  const product = products.find((product2) => product2.id === productId);
  if (input.resolution === "substituted" && product.status !== "published") throw new Error("Replacement product is not available");
  const settings = await sudo.query.StoreSettings.findMany({ where: { store: { id: { equals: actor.storeId } } }, take: 1, query: "taxRateBps" });
  order.storeTaxRateBasisPoints = Number(settings[0]?.taxRateBps || 0);
  const actual = calculateLineActual(line, order, product, input);
  const originalAllocations = line.inventoryAllocations || [];
  if (!originalAllocations.length) throw new Error("Original inventory allocation evidence is required");
  const lotBefore = /* @__PURE__ */ new Map();
  const productBefore = new Map(products.map((product2) => [product2.id, product2.inventoryLots.reduce((sum, lot) => sum + Number(lot.quantityRemaining), 0)]));
  for (const product2 of products) for (const lot of product2.inventoryLots) lotBefore.set(lot.id, Number(lot.quantityRemaining));
  for (const allocation of originalAllocations) {
    const original = products.find((product2) => product2.id === allocation.inventoryLot?.product?.id);
    const lot = original?.inventoryLots.find((lot2) => lot2.id === allocation.inventoryLot?.id);
    if (!lot || allocation.inventoryLot?.store?.id !== actor.storeId) throw new Error("Original allocation does not belong to this store and product");
    lot.quantityRemaining = (Math.round(Number(lot.quantityRemaining) * 1e3) + Math.round(Number(allocation.quantity) * 1e3)) / 1e3;
  }
  const promisedAt = new Date(Math.max(now.getTime(), new Date(order.metadata?.fulfillmentPromise?.endsAt || order.metadata?.promiseEndsAt || now).getTime() || 0));
  const planned = planSellableLotAllocation(product.inventoryLots.filter((lot) => isInventoryLotEligible(lot, promisedAt)), actor.storeId, actual.quantityMilli / 1e3, product.title, promisedAt);
  const allocations = planned.map(({ lot, quantity }) => {
    lot.quantityRemaining = (Math.round(Number(lot.quantityRemaining) * 1e3) - Math.round(quantity * 1e3)) / 1e3;
    return { lotId: lot.id, productId, quantity };
  });
  const record2 = await sudo.db.OrderLineFulfillment.createOne({ data: {
    idempotencyKey: input.idempotencyKey,
    lineItemIdSnapshot: line.id,
    lineItem: { connect: { id: line.id } },
    product: { connect: { id: product.id } },
    recordedBy: { connect: { id: actor.userId } },
    resolution: input.resolution,
    productTitle: input.resolution === "substituted" ? product.title : line.title,
    productSku: input.resolution === "substituted" ? product.sku || "" : line.sku || "",
    ...actual,
    allocations,
    evidence: {
      inputFingerprint: fingerprint,
      reason: input.reason,
      department: product.department,
      pricingMethod: product.pricingMethod,
      measuredAt: now.toISOString(),
      enteredUnit: input.unitOfMeasure,
      enteredGross: input.quantity,
      enteredTare: input.tare,
      consent: input.consentChannel ? { channel: input.consentChannel, customer: order.email, actorId: actor.userId, recordedAt: now.toISOString(), details: input.consentEvidence } : null,
      releasedAllocations: originalAllocations.map((entry) => ({ lotId: entry.inventoryLot.id, quantity: Number(entry.quantity) }))
    }
  } });
  const touchedLots = /* @__PURE__ */ new Set([...originalAllocations.map((entry) => entry.inventoryLot.id), ...allocations.map((entry) => entry.lotId)]);
  for (const changedProduct of products) {
    const after = changedProduct.inventoryLots.reduce((sum, lot) => sum + Number(lot.quantityRemaining), 0);
    for (const lot of changedProduct.inventoryLots) {
      const before = lotBefore.get(lot.id);
      if (!touchedLots.has(lot.id)) continue;
      await sudo.db.InventoryLot.updateOne({ where: { id: lot.id }, data: { quantityRemaining: String(lot.quantityRemaining) } });
      await appendInventoryMovement(tx.prisma, {
        storeId: actor.storeId,
        productId: changedProduct.id,
        inventoryLotId: lot.id,
        orderId: order.id,
        sourceType: "fulfillment_actual",
        sourceId: record2.id,
        idempotencyKey: `actuals:${input.idempotencyKey}:lot:${lot.id}`,
        actorId: actor.userId,
        reason: input.reason || "Picked actual goods",
        quantityBefore: before,
        quantityAfter: Number(lot.quantityRemaining),
        productStockBefore: productBefore.get(changedProduct.id),
        productStockAfter: after,
        metadata: { lineItemId: line.id, resolution: input.resolution }
      });
    }
    await sudo.db.Product.updateOne({ where: { id: changedProduct.id }, data: { stockQuantity: String(after), inStock: deriveSellableQuantity(changedProduct, actor.storeId, now) > 0 } });
  }
  return { ...record2, reused: false };
}
async function getFulfillmentActualLines(tx, orderId) {
  const lines = await tx.sudo().query.OrderLineItem.findMany({
    where: { order: { id: { equals: orderId } } },
    take: 1001,
    query: `id fulfillment { ${ACTUAL_FIELDS} }`
  });
  if (!lines.length || lines.length > 1e3 || lines.some((line) => !line.fulfillment)) throw new Error("Resolve every order line before finalizing or packing");
  return lines.map((line) => ({ ...line.fulfillment, lineItemId: line.id, productId: line.fulfillment.product?.id }));
}

// features/keystone/mutations/finalizeGroceryOrderActuals.ts
init_paymentProviderAdapter();
init_groceryOutbox();
init_serializableTransaction();
init_managePaymentRefund();
function cents2(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Settlement requires nonnegative integer minor units");
  return value;
}
function decimalHundredths(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error("Invalid coupon decimal amount");
  return cents2(Number(BigInt(match[1]) * BigInt(100) + BigInt((match[2] || "").padEnd(2, "0"))));
}
function priceActualSale(order, actuals) {
  const coupon = order.metadata?.coupon;
  const subtotal = actuals.reduce((sum, line) => cents2(sum + cents2(line.subtotalCents)), 0);
  for (const line of actuals) {
    cents2(line.quantityMilli);
    cents2(line.unitPriceCents);
  }
  const eligible = actuals.filter((line) => isCouponLineEligible({ id: line.productId, department: line.evidence?.department }, coupon));
  const eligibleCents = eligible.reduce((sum, line) => cents2(sum + line.subtotalCents), 0);
  let discountCents = 0;
  if (coupon && subtotal >= cents2(coupon.minPurchaseCents ?? decimalHundredths(coupon.minPurchase ?? 0))) {
    if (coupon.discountType === "percentage") {
      const bps = decimalHundredths(coupon.discountValue);
      if (bps > 1e4) throw new Error("Coupon percentage exceeds 100");
      discountCents = Number((BigInt(eligibleCents) * BigInt(bps) + BigInt(5e3)) / BigInt(1e4));
    } else if (coupon.discountType === "fixed") discountCents = cents2(coupon.discountValueCents ?? decimalHundredths(coupon.discountValue));
    else if (coupon.discountType === "bogo") discountCents = eligible.reduce((sum, line) => cents2(sum + Math.floor(line.quantityMilli / 2e3) * line.unitPriceCents), 0);
    else throw new Error("Unsupported coupon type");
    discountCents = Math.min(eligibleCents, discountCents);
  }
  const feeCents = actuals.some((line) => line.quantityMilli > 0) ? cents2(order.deliveryFeeCents || 0) : 0;
  return priceCommercialLines(actuals.map((line) => ({
    id: line.lineItemId,
    subtotalCents: line.subtotalCents,
    taxRateBasisPoints: line.taxRateBasisPoints,
    discountEligible: isCouponLineEligible({ id: line.productId, department: line.evidence?.department }, coupon)
  })), discountCents, feeCents, Number(order.metadata?.deliveryPolicySnapshot?.feeTaxRateBasisPoints || 0));
}
function canonical2(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical2);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key2) => value[key2] !== void 0).map((key2) => [key2, canonical2(value[key2])]));
  return value;
}
function finalSaleSnapshot(order, actuals) {
  const stable = actuals.map((line) => ({ ...line, allocations: [...line.allocations || []].sort((a, b) => `${a.productId}:${a.lotId}`.localeCompare(`${b.productId}:${b.lotId}`)) })).sort((a, b) => a.lineItemId.localeCompare(b.lineItemId));
  return canonical2({ ...priceActualSale(order, stable), actuals: stable, currency: String(order.currencyCode).toLowerCase(), originalTotalCents: cents2(order.totalCents) });
}
function customerFinalSaleSnapshot(snapshot) {
  return { ...snapshot, actuals: (snapshot.actuals || []).map((line) => Object.fromEntries([
    "lineItemId",
    "productId",
    "productTitle",
    "productSku",
    "quantityMilli",
    "grossMilli",
    "tareMilli",
    "unitOfMeasure",
    "unitPriceCents",
    "subtotalCents",
    "taxRateBasisPoints",
    "resolution"
  ].filter((key2) => line[key2] !== void 0).map((key2) => [key2, line[key2]]))) };
}
var authorized = (state) => ["requires_capture", "authorized"].includes(state.status);
var captured = (state) => ["succeeded", "captured"].includes(state.status);
var cancelled = (state) => ["canceled", "cancelled"].includes(state.status);
function capturedCents(state) {
  return cents2(state.capturedAmountCents ?? (captured(state) ? state.amountCents ?? state.amount : 0));
}
function checkState(state, currency, paymentId) {
  if (String(state.currency).toLowerCase() !== currency) throw new Error("Payment currency does not match final sale");
  if (state.data?.id && state.data.id !== paymentId) throw new Error("Provider returned a different payment identity");
  if (authorized(state)) {
    cents2(state.authorizedAmountCents ?? state.amountCents ?? state.amount);
    cents2(state.capturableAmountCents ?? state.amountCents ?? state.amount);
  }
  capturedCents(state);
}
function refundsCents(refunds) {
  if (refunds.some((refund) => refund.status === "processing")) throw new Error("Refund is still processing; retry finalization after reconciliation");
  return refunds.filter((refund) => refund.status === "succeeded").reduce((sum, refund) => cents2(sum + cents2(refund.amountCents)), 0);
}
function checkVoid(payment) {
  if (["processing", "unknown"].includes(payment.providerData?.authorizationVoid?.status)) throw new Error("Authorization void requires reconciliation before finalization");
}
var defaults3 = {
  requireFreshCapability,
  requireSessionStore,
  getFulfillmentActualLines,
  capturePayment,
  cancelPayment,
  getPaymentStatus,
  enqueueGroceryOutboxEvent,
  reconcileOrderLoyalty,
  refundPaymentForOrder,
  now: () => Date.now(),
  token: import_node_crypto21.randomUUID
};
function makeFinalizeGroceryOrderActuals(overrides = {}) {
  const deps = { ...defaults3, ...overrides };
  return async function finalizeGroceryOrderActuals2(_root, { orderId }, context) {
    await deps.requireFreshCapability(context, "canManageOrders");
    await deps.requireFreshCapability(context, "canManagePayments");
    const store = await deps.requireSessionStore(context);
    const transaction = (operation) => withSerializableRetry(() => context.transaction(operation));
    const claim = await transaction(async (tc) => {
      const tx = tc.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.storeId !== store.id) throw new Error("Order not found in active store");
      const prior = await tx.orderSettlement.findUnique({ where: { idempotencyKey: `order-actuals:${orderId}` } });
      if (prior?.providerEvidence?.abandonment || prior?.status === "abandoned") throw new Error("Final sale has been abandoned or is being reversed");
      if (prior?.status === "finalized") return { done: true, settlement: prior, status: "finalized" };
      if (order.status !== "picking") throw new Error("Finalize actuals while the order is being picked");
      const snapshot = finalSaleSnapshot(order, await deps.getFulfillmentActualLines(tc, orderId));
      if (!/^[a-z]{3}$/.test(snapshot.currency)) throw new Error("Invalid final sale currency");
      const actualsHash = finalSaleSnapshotHash(snapshot);
      if (prior && (prior.actualsHash !== actualsHash || prior.totalCents !== snapshot.totalCents)) throw new Error("Finalization input changed after payment was requested");
      if (prior?.providerEvidence?.finalizationLease && new Date(prior.providerEvidence.finalizationLease.expiresAt).getTime() > deps.now()) return { done: true, settlement: prior, status: "processing" };
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "order"=$1 ORDER BY "id" FOR UPDATE', orderId);
      const payments = await tx.payment.findMany({ where: { orderId }, include: { paymentProvider: true, refunds: true }, orderBy: { id: "asc" } });
      const candidates = payments.filter((payment3) => ["authorized", "succeeded", "partially_refunded"].includes(payment3.status));
      const payment2 = prior?.providerEvidence?.originalPaymentId ? payments.find((payment3) => payment3.id === prior.providerEvidence.originalPaymentId) : candidates.length === 1 ? candidates[0] : null;
      if (!payment2 || payment2.storeId !== store.id || !payment2.providerPaymentId || !payment2.paymentProvider?.isInstalled) throw new Error("Order requires one unambiguous original payment before finalization");
      for (const row of payments) {
        checkVoid(row);
        refundsCents(row.refunds || []);
      }
      const budget = cents2(payment2.amountCents) - refundsCents(payment2.refunds || []);
      if (budget < 0) throw new Error("Original refund ledger exceeds its payment");
      const revised = prior?.providerEvidence?.reauthorization;
      const status = snapshot.totalCents > budget && !revised?.paymentIntentId ? "requires_customer_authorization" : "processing";
      const lease2 = status === "processing" ? { token: deps.token(), expiresAt: new Date(deps.now() + 12e4).toISOString() } : null;
      const providerEvidence = { ...prior?.providerEvidence, originalPaymentId: payment2.id, finalizationLease: lease2 };
      const settlement2 = prior ? await tx.orderSettlement.update({ where: { id: prior.id }, data: { status, providerEvidence } }) : await tx.orderSettlement.create({ data: { orderId, idempotencyKey: `order-actuals:${orderId}`, actualsHash, status, totalCents: snapshot.totalCents, snapshot, providerEvidence, finalizedById: context.session.itemId } });
      if (revised?.paymentIntentId && (revised.paymentIntentId === payment2.providerPaymentId || revised.fingerprint !== adjustmentFingerprint(settlement2, payment2) || providerEvidence.customerApproval?.fingerprint !== revised.fingerprint)) throw new Error("Customer approval does not match revised authorization");
      await tx.order.update({ where: { id: orderId }, data: { metadata: { ...order.metadata, finalSale: { ...customerFinalSaleSnapshot(snapshot), settlementId: settlement2.id, status } } } });
      if (status === "requires_customer_authorization") await deps.enqueueGroceryOutboxEvent(tx, { storeId: store.id, eventKey: `order.adjustment:${settlement2.id}`, eventType: "order.adjustment.requested", aggregateType: "Order", aggregateId: orderId, occurredAt: new Date(deps.now()).toISOString(), payload: { orderId, totalCents: snapshot.totalCents } });
      return { done: false, settlement: settlement2, order, payment: payment2, status, lease: lease2 };
    });
    if (claim.done || claim.status === "requires_customer_authorization") return {
      status: claim.status,
      totalCents: claim.settlement.totalCents,
      message: claim.status === "finalized" ? "Final sale already recorded" : claim.status === "processing" ? "Final payment reconciliation is already processing" : "Customer must authorize the revised amount before capture"
    };
    const { settlement, payment, lease } = claim;
    const provider = payment.paymentProvider;
    const revisedPaymentId = settlement.providerEvidence?.reauthorization?.paymentIntentId;
    const effectivePaymentId = revisedPaymentId || payment.providerPaymentId;
    const desired = cents2(settlement.totalCents);
    const currency = settlement.snapshot.currency;
    let originalState;
    let awaitingCustomer = false;
    try {
      const originalNoCharge = noChargeOrderPaymentState(payment);
      let state = !revisedPaymentId && originalNoCharge ? originalNoCharge : await deps.getPaymentStatus({ provider, paymentId: effectivePaymentId });
      checkState(state, currency, effectivePaymentId);
      if (revisedPaymentId) {
        if (!authorized(state) && !captured(state)) {
          awaitingCustomer = true;
          throw new Error("Customer has not confirmed the revised authorization");
        }
        const revisedAmount = authorized(state) ? cents2(state.authorizedAmountCents ?? state.amountCents ?? state.amount) : capturedCents(state);
        if (revisedAmount !== desired) throw new Error("Revised authorization amount does not match final sale");
        if (authorized(state) && (capturedCents(state) !== 0 || cents2(state.capturableAmountCents ?? state.amountCents ?? state.amount) < desired)) throw new Error("Revised authorization is not fully capturable");
        originalState = originalNoCharge || await deps.getPaymentStatus({ provider, paymentId: payment.providerPaymentId });
        checkState(originalState, currency, payment.providerPaymentId);
        if (authorized(originalState)) {
          await deps.cancelPayment({ provider, paymentId: payment.providerPaymentId, idempotencyKey: `${settlement.idempotencyKey}:void-original` });
          originalState = await deps.getPaymentStatus({ provider, paymentId: payment.providerPaymentId });
          checkState(originalState, currency, payment.providerPaymentId);
          if (!cancelled(originalState) || capturedCents(originalState) !== 0) throw new Error("Original authorization reversal is not confirmed");
        } else if (captured(originalState)) {
          const rows = await context.prisma.paymentRefund.findMany({ where: { paymentId: payment.id } });
          const remaining = capturedCents(originalState) - refundsCents(rows);
          if (remaining < 0) throw new Error("Original refund ledger exceeds provider capture");
          if (remaining > 0) {
            const refund = await deps.refundPaymentForOrder(null, { paymentId: payment.id, amountCents: remaining, reason: "Customer approved revised final authorization; reverse original payment", idempotencyKey: `${settlement.idempotencyKey}:reverse-original` }, context);
            if (refund.status !== "succeeded") throw new Error("Original payment reversal is still processing");
          }
        } else if (!cancelled(originalState) || capturedCents(originalState) !== 0) throw new Error("Original payment outcome needs reconciliation");
      }
      if (authorized(state)) {
        if (desired > cents2(state.capturableAmountCents ?? state.amountCents ?? state.amount)) throw new Error("Provider authorization is below final sale; customer authorization requires reconciliation");
        if (desired === 0) await deps.cancelPayment({ provider, paymentId: effectivePaymentId, idempotencyKey: settlement.idempotencyKey });
        else await deps.capturePayment({ provider, paymentId: effectivePaymentId, amountCents: desired, idempotencyKey: settlement.idempotencyKey });
        state = await deps.getPaymentStatus({ provider, paymentId: effectivePaymentId });
        checkState(state, currency, effectivePaymentId);
      } else if (!revisedPaymentId && captured(state)) {
        const rows = await context.prisma.paymentRefund.findMany({ where: { paymentId: payment.id } });
        const remaining = capturedCents(state) - refundsCents(rows) - desired;
        if (remaining < 0) throw new Error("Provider net capture is below final sale");
        if (remaining > 0) {
          const refund = await deps.refundPaymentForOrder(null, { paymentId: payment.id, amountCents: remaining, reason: "Actual picked quantities and item tax adjustment", idempotencyKey: `${settlement.idempotencyKey}:refund` }, context);
          if (refund.status !== "succeeded") throw new Error("Final adjustment refund is still processing");
        }
      }
      return await transaction(async (tc) => {
        const tx = tc.prisma;
        await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
        await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "order"=$1 ORDER BY "id" FOR UPDATE', orderId);
        const current = await tx.orderSettlement.findUnique({ where: { id: settlement.id } });
        if (current?.status === "finalized") return { status: "finalized", totalCents: desired, message: "Final sale already recorded" };
        if (current?.providerEvidence?.finalizationLease?.token !== lease.token || current.actualsHash !== settlement.actualsHash || current.providerEvidence?.abandonment) throw new Error("Finalization claim changed; retry reconciliation");
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order || order.storeId !== store.id || order.status !== "picking") throw new Error("Order state changed during finalization");
        const payments = await tx.payment.findMany({ where: { orderId }, include: { refunds: true }, orderBy: { id: "asc" } });
        for (const row of payments) {
          checkVoid(row);
          refundsCents(row.refunds || []);
        }
        const originalPayment = payments.find((row) => row.id === payment.id);
        if (!originalPayment || originalPayment.storeId !== store.id || originalPayment.providerPaymentId !== payment.providerPaymentId) throw new Error("Original payment identity changed");
        const priorPayment = revisedPaymentId ? await tx.payment.findUnique({ where: { providerPaymentId: revisedPaymentId }, include: { refunds: true } }) : originalPayment;
        if (priorPayment && (priorPayment.orderId !== orderId || priorPayment.storeId !== store.id || priorPayment.paymentProviderId !== provider.id)) throw new Error("Final payment belongs to another order or provider");
        const refunded = refundsCents(priorPayment?.refunds || []);
        const gross = capturedCents(state);
        if (!captured(state) && !(desired === 0 && cancelled(state) && gross === 0) || gross - refunded !== desired) throw new Error("Provider net capture does not match the final sale");
        if (revisedPaymentId) {
          const originalRefunded = refundsCents(originalPayment.refunds || []);
          if (capturedCents(originalState) - originalRefunded !== 0) throw new Error("Original payment reversal is not fully settled");
          await tx.payment.update({ where: { id: payment.id }, data: {
            status: originalNoCharge || cancelled(originalState) ? "cancelled" : "refunded",
            providerData: { ...originalPayment.providerData, finalSettlementId: settlement.id, capturedAmountCents: capturedCents(originalState) }
          } });
        }
        for (const other of payments) {
          if (other.id === payment.id || other.providerPaymentId === revisedPaymentId) continue;
          if (other.status === "authorized" || ["succeeded", "partially_refunded", "refunded"].includes(other.status) && cents2(other.amountCents) - refundsCents(other.refunds || []) !== 0) throw new Error("Another order payment remains unsettled");
        }
        const observedAt = new Date(deps.now());
        const existingCapture = priorPayment && ["succeeded", "partially_refunded", "refunded"].includes(priorPayment.status);
        const processedAt = existingCapture || gross === 0 ? priorPayment?.processedAt ?? null : observedAt;
        const priorRecognition = priorPayment?.providerData?.captureRecognition;
        const captureRecognition = {
          ...priorRecognition,
          basis: gross === 0 ? "no_capture" : existingCapture ? priorRecognition?.basis || (processedAt ? "existing_payment_timestamp" : "unknown_existing_capture_time") : "local_confirmation",
          observedAt: observedAt.toISOString(),
          providerCapturedAt: priorRecognition?.providerCapturedAt ?? priorPayment?.providerData?.providerCapturedAt ?? null
        };
        const paymentData = {
          amountCents: gross,
          amount: (gross / 100).toFixed(2),
          status: cancelled(state) ? "cancelled" : refunded > 0 ? refunded === gross ? "refunded" : "partially_refunded" : "succeeded",
          processedAt,
          providerData: { ...priorPayment?.providerData, capturedAmountCents: gross, finalSettlementId: settlement.id, captureRecognition }
        };
        if (priorPayment) await tx.payment.update({ where: { id: priorPayment.id }, data: paymentData });
        else await tx.payment.create({ data: { ...paymentData, storeId: store.id, orderId, paymentProviderId: provider.id, providerPaymentId: revisedPaymentId, paymentMethod: "credit_card", deliveryTipCents: 0, deliveryTipAmount: "0.00" } });
        await tx.orderSettlement.update({ where: { id: settlement.id }, data: { status: "finalized", failureMessage: "", providerEvidence: { ...current.providerEvidence, finalizationLease: null, status: state.status, amountCents: gross, refundedCents: refunded, currency } } });
        const finalSale = { ...customerFinalSaleSnapshot(settlement.snapshot), status: "finalized", settlementId: settlement.id, finalizedAt: new Date(deps.now()).toISOString() };
        if (desired === 0 && settlement.snapshot.actuals.some((line) => line.quantityMilli > 0)) {
          finalSale.noChargeAuthorized = {
            actorId: context.session.itemId,
            paymentId: priorPayment?.id || payment.id,
            reason: finalSale.discountCents > 0 ? "coupon_covers_total" : "zero_priced_goods",
            couponId: order.metadata?.coupon?.id || null,
            authorizedAt: finalSale.finalizedAt
          };
        }
        await tx.order.update({ where: { id: orderId }, data: { metadata: { ...order.metadata, finalSale } } });
        await deps.reconcileOrderLoyalty(tx, { storeId: store.id, orderId, actorId: context.session.itemId, sourceId: `settlement:${settlement.id}`, reason: "Final picked goods settled", netGoodsCents: finalSale.subtotalCents - finalSale.discountCents, settled: true });
        await deps.enqueueGroceryOutboxEvent(tx, { storeId: store.id, eventKey: `order.finalized:${orderId}`, eventType: "order.finalized", aggregateType: "Order", aggregateId: orderId, occurredAt: finalSale.finalizedAt, payload: { orderId, settlementId: settlement.id, totalCents: desired } });
        return { status: "finalized", totalCents: desired, message: "Actual goods and final payment recorded" };
      });
    } catch (error) {
      await transaction(async (tc) => {
        const tx = tc.prisma;
        await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
        const current = await tx.orderSettlement.findUnique({ where: { id: settlement.id } });
        if (!current || current.status === "finalized" || current.providerEvidence?.finalizationLease?.token !== lease.token) return;
        const status = awaitingCustomer ? "requires_customer_authorization" : "processing";
        await tx.orderSettlement.update({ where: { id: current.id }, data: { status, failureMessage: error instanceof Error ? error.message : "Finalization requires reconciliation", providerEvidence: { ...current.providerEvidence, finalizationLease: null } } });
        if (awaitingCustomer) {
          const order = await tx.order.findUnique({ where: { id: orderId } });
          await tx.order.update({ where: { id: orderId }, data: { metadata: { ...order.metadata, finalSale: { ...order.metadata?.finalSale, status } } } });
        }
      });
      if (awaitingCustomer) return { status: "requires_customer_authorization", totalCents: desired, message: "Customer must confirm the revised authorization" };
      throw error;
    }
  };
}
var finalizeGroceryOrderActuals = makeFinalizeGroceryOrderActuals();

// features/keystone/mutations/resolveOrderLineFulfillment.ts
init_access();
init_serializableTransaction();
async function resolveOrderLineFulfillment(_root, input, context) {
  const { storeId } = await requireFreshCapability(context, "canManageOrders");
  if (!storeId || !context.session?.itemId) throw new Error("An active staff store is required");
  return withSerializableRetry(() => context.transaction(async (tx) => {
    const actual = await resolveActualInTransaction(tx, { storeId, userId: context.session.itemId }, input);
    return {
      success: true,
      fulfillmentId: actual.id,
      lineItemId: input.lineItemId,
      resolution: actual.resolution,
      quantityMilli: actual.quantityMilli,
      subtotalCents: actual.subtotalCents,
      reused: actual.reused
    };
  }, { isolationLevel: "ReadCommitted" }));
}

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
init_storeScope();
init_access();
var CLIENT_ONBOARDING_STATUSES = /* @__PURE__ */ new Set(["not_started", "in_progress", "dismissed"]);
async function updateActiveUser(_root, { data }, context) {
  const session = context.session;
  if (!session?.itemId) throw new Error("Not authenticated");
  await requireSessionStore(context);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Profile data is required");
  const update = {};
  if (data.name !== void 0) {
    if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 200) {
      throw new Error("Name must be between 1 and 200 characters");
    }
    update.name = data.name.trim();
  }
  if (data.email !== void 0) {
    if (typeof data.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 320) {
      throw new Error("A valid email address is required");
    }
    update.email = data.email.trim().toLowerCase();
  }
  if (data.onboardingStatus !== void 0) {
    if (typeof data.onboardingStatus !== "string" || !CLIENT_ONBOARDING_STATUSES.has(data.onboardingStatus)) {
      throw new Error("Unsupported onboarding status transition");
    }
    await requireFreshCapability(context, "canManageOnboarding");
    update.onboardingStatus = data.onboardingStatus;
  }
  if (!Object.keys(update).length) throw new Error("No supported profile changes were provided");
  return context.db.User.updateOne({
    where: { id: session.itemId },
    data: update
  });
}
var updateActiveUser_default = updateActiveUser;

// features/keystone/mutations/cartOperations.ts
init_storeScope();

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
      id title handle price priceCents taxRateBasisPoints imageUrl status
      store { id }
      inventoryLots { expirationDate quantityRemaining safetyStatus conditionStatus store { id } }
      pricingMethod unitOfMeasure
    }
  }
`;
async function getOrCreateCart(context, sessionId) {
  const store = context.session?.itemId ? await requireSessionStore(context) : await publicStore(context);
  const ownerId = context.session?.itemId || null;
  const guestSessionId = ownerId ? null : requireGuestSessionId(sessionId);
  const identity2 = ownerId ? `user:${ownerId}` : `guest:${guestSessionId}`;
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-cart-identity'), hashtext($1))",
      identity2
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
  const taxCents = priceCommercialLines(cart.items.map((item) => ({ id: item.id, subtotalCents: Number(item.product.priceCents) * item.quantity, taxRateBasisPoints: item.product.taxRateBasisPoints ?? taxRateBps }))).taxCents;
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
init_storeScope();
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
init_storeScope();
async function getShoppingListForUser(context, listId) {
  const sudoContext = context.sudo();
  if (!context.session?.itemId) {
    throw new Error("Must be logged in to manage shopping lists");
  }
  const list65 = await sudoContext.query.ShoppingList.findOne({
    where: { id: listId },
    query: `
      id
      name
      isDefault
      user { id }
      items {
        id
        product
        productRef { id }
        quantity
        unit
        checked
        notes
        addedAt
      }
    `
  });
  if (!list65) {
    throw new Error("Shopping list not found");
  }
  if (list65.user?.id !== context.session.itemId) {
    throw new Error("Not authorized to access this shopping list");
  }
  return list65;
}
function formatShoppingListResponse(list65) {
  return {
    id: list65.id,
    name: list65.name,
    isDefault: list65.isDefault,
    items: list65.items.map((item) => ({
      id: item.id,
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      notes: item.notes,
      addedAt: item.addedAt
    })),
    itemCount: list65.items.length,
    checkedCount: list65.items.filter((item) => item.checked).length
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
  const list65 = await getShoppingListForUser(context, listId);
  const existingItem = list65.items.find(
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
  const list65 = await getShoppingListForUser(context, listId);
  const uncheckedItems = list65.items.filter((item) => !item.checked);
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
          item.productRef?.id ? { id: { equals: item.productRef.id } } : { title: { equals: item.product, mode: "insensitive" } }
        ]
      },
      query: "id title store { id }",
      take: 2
    });
    if (products.length !== 1) {
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
function normalizeShoppingListGraphQLResult(list65) {
  return {
    ...list65,
    updatedAt: list65.updatedAt ? new Date(list65.updatedAt) : null,
    items: (list65.items || []).map((item) => ({
      ...item,
      addedAt: item.addedAt ? new Date(item.addedAt) : null
    }))
  };
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
  if (existing[0]) return normalizeShoppingListGraphQLResult(existing[0]);
  const created = await sudoContext.query.ShoppingList.createOne({
    data: { name: normalizedName, user: { connect: { id: userId } } },
    query: "id name isDefault updatedAt items { id product quantity unit checked notes addedAt }"
  });
  return normalizeShoppingListGraphQLResult(created);
}
async function deleteShoppingList(_root, { listId }, context) {
  const userId = requireUser(context);
  const sudoContext = context.sudo();
  const list65 = await sudoContext.query.ShoppingList.findOne({
    where: { id: listId },
    query: "id user { id } items { id }"
  });
  if (!list65) return { success: true, listId };
  if (list65.user?.id !== userId) throw new Error("Not authorized to delete this shopping list");
  for (const item of list65.items || []) {
    await sudoContext.query.ShoppingListItem.deleteOne({ where: { id: item.id } });
  }
  await sudoContext.query.ShoppingList.deleteOne({ where: { id: listId } });
  return { success: true, listId };
}

// features/keystone/mutations/getAvailablePickupSlots.ts
init_access();
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
    const date2 = zonedDateKey(slot.date, store.timezone);
    grouped.set(date2, [...grouped.get(date2) || [], slot]);
  }
  return Array.from(grouped, ([date2, daySlots]) => ({
    date: date2,
    slots: daySlots,
    totalSlots: daySlots.length,
    totalAvailableCapacity: daySlots.reduce((sum, slot) => sum + slot.availableCapacity, 0)
  }));
}

// features/keystone/mutations/customerCheckIn.ts
init_access();
init_storeScope();
init_serializableTransaction();
async function assertCanManageDelivery2(context) {
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
  const { storeId } = await assertCanManageDelivery2(context);
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
  const { storeId } = await assertCanManageDelivery2(context);
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
    if (order.status !== "delivered") {
      await assertOrderHandoffPayment(tx, order);
      await assertOrderInventoryEligible(tx, order.id, storeId);
    }
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

// features/keystone/mutations/initiatePaymentSession.ts
init_groceryOutbox();
var import_node_crypto22 = require("node:crypto");
init_storeScope();
init_payment();
init_paymentProviderAdapter();
function fulfillmentWindow2(startTime) {
  const hour = Number.parseInt(startTime.slice(0, 2), 10);
  if (hour < 10) return "time_8_10";
  if (hour < 12) return "time_10_12";
  if (hour < 14) return "time_12_14";
  if (hour < 16) return "time_14_16";
  if (hour < 18) return "time_16_18";
  return "time_18_20";
}
async function initiatePaymentSessionWithDependencies(root, { cartId, paymentProviderId, deliverySlotId, pickupSlotId, sessionId, couponCode, recovery }, context, dependencies = { createPayment, ensureCheckoutAttempt }) {
  assertPublicPaymentProvider(paymentProviderId);
  if (context.session?.itemId) await requireSessionStore(context);
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
      items { id quantity substitutionPreference product { id title price priceCents taxRateBasisPoints pricingMethod unitOfMeasure department status store { id } inventoryLots { id expirationDate quantityRemaining safetyStatus conditionStatus store { id } } } }
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
    select: { hours: true, deliveryPolicy: true }
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
  const now = new Date(Math.max(Date.now(), zonedDateTimeForDateKey(zonedDateKey(selectedSlot.date, cart.store.timezone), selectedSlot.endTime, cart.store.timezone).getTime()));
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
  let deliveryFeeDollars = Number(((deliverySlot?.deliveryFee || 0) / 100).toFixed(2));
  let discountDollars = 0;
  let couponSnapshot = null;
  if (couponCode?.trim()) {
    const coupon = await sudoContext.query.Coupon.findOne({ where: { code: couponCode.trim().toUpperCase() }, query: "id code discountType discountValue discountValueCents minPurchase minPurchaseCents validFrom validTo isActive maxUses currentUses productCategories excludedProducts store { id }" });
    if (!coupon || coupon.store?.id !== cart.store?.id) throw new Error("Coupon is not available for this store");
    await validateLoyaltyCoupon(context.prisma, coupon.id, context.session?.itemId, cart.store.id);
    discountDollars = calculateCouponDiscount(coupon, cart.items || []);
    couponSnapshot = { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, discountAmount: discountDollars, productCategories: coupon.productCategories, excludedProducts: coupon.excludedProducts, minPurchaseCents: coupon.minPurchaseCents, discountValueCents: coupon.discountValueCents };
  }
  const discountCents = Math.round(discountDollars * 100);
  const service = evaluateDeliveryPolicy(storeSettings.deliveryPolicy, fulfillmentMethod, recovery.deliveryAddress.postalCode, subtotalCents - discountCents);
  deliveryFeeDollars += service.feeCents / 100;
  const commercial = priceCommercialLines(cart.items.map((item) => ({
    id: item.id,
    subtotalCents: Number(item.product.priceCents) * item.quantity,
    taxRateBasisPoints: item.product.taxRateBasisPoints ?? taxRateBps,
    discountEligible: isCouponLineEligible(item.product, couponSnapshot)
  })), discountCents, Math.round(deliveryFeeDollars * 100), service.feeTaxRateBasisPoints);
  const taxCents = commercial.taxCents;
  const taxDollars = taxCents / 100;
  const amountInCents = Math.max(0, subtotalCents + taxCents + Math.round(deliveryFeeDollars * 100) - discountCents);
  const totalDollars = amountInCents / 100;
  const slotKey = pickupSlotId ? `pickup:${pickupSlotId}` : `delivery:${deliverySlotId || "no-slot"}`;
  const couponIdentity = couponSnapshot ? `${couponSnapshot.id}:${couponSnapshot.code}` : "none";
  let idempotencyKey = `${cart.id}:${provider.code}:${slotKey}:coupon:${couponIdentity}:amount:${amountInCents}`;
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
    commercial,
    deliveryPolicySnapshot: service.policy,
    captureMethod: "manual",
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
  const checkoutFingerprint = checkoutRequestFingerprint(checkoutRequest("", ""));
  const cartFingerprint = checkoutCartFingerprint(cart);
  idempotencyKey = `grocery-checkout:${groceryOutboxPayloadHash({ commercialKey: idempotencyKey, checkoutFingerprint, cartFingerprint })}`;
  let claim;
  try {
    claim = await context.transaction(async (transactionContext) => {
      if (context.session?.itemId) {
        await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', context.session.itemId);
        const owner = await transactionContext.prisma.user.findUnique({ where: { id: context.session.itemId }, select: { id: true, storeId: true, privacyErasedAt: true } });
        if (!owner || owner.privacyErasedAt || owner.storeId !== cart.store.id) throw new Error("Checkout customer is no longer active");
      }
      await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id"=$1 FOR UPDATE', cart.id);
      const freshCart = await transactionContext.sudo().query.Cart.findOne({ where: { id: cart.id }, query: "id customer { id } sessionId items { id quantity substitutionPreference product { id priceCents taxRateBasisPoints pricingMethod unitOfMeasure } }" });
      if (!freshCart || checkoutCartFingerprint(freshCart) !== cartFingerprint || (context.session?.itemId ? freshCart.customer?.id !== context.session.itemId : freshCart.customer?.id || freshCart.sessionId !== sessionId?.trim())) throw new Error("Cart changed while payment was being prepared; review checkout");
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
      const creation = claimPaymentCreationData(existing?.data, { ...claimData, checkoutFingerprint, cartFingerprint }, (0, import_node_crypto22.randomUUID)(), now2);
      if (creation.action !== "create") return { session: existing, shouldCreate: false };
      const baseData = { ...creation.data, ...!existing ? { creationBindingVersion: 1, recoveryRequest: checkoutRequest("", "") } : {} };
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
      const bound = await transactionContext.sudo().query.PaymentSession.updateOne({
        where: { id: created.id },
        data: { data: { ...baseData, recoveryRequest: { ...baseData.recoveryRequest, paymentSessionId: created.id } } },
        query: sessionSelection
      });
      return { session: bound, shouldCreate: true };
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
      if (ready?.data?.paymentIntentId && ["ready", "attempt_pending", "unknown"].includes(ready.data?.status)) {
        const providerPaymentId = ready.data?.paymentIntentId;
        if (!providerPaymentId) throw new Error("Payment session is missing a durable payment identity");
        await dependencies.ensureCheckoutAttempt(context, checkoutRequest(ready.id, providerPaymentId), cart, ready, providerPaymentId);
        if (ready.data.status !== "ready") return writePaymentCreationResult(context, { sessionId: ready.id, phase: "ready", paymentIntentId: providerPaymentId });
        return ready;
      }
      if (ready?.data?.status === "failed") throw new Error(ready.data.error || "Payment session initiation failed");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Payment session is still being initialized; please retry without changing the cart or slot");
  }
  try {
    const sessionData = amountInCents === 0 ? {
      paymentIntentId: `grocery_no_charge:${claim.session.id}`,
      clientSecret: void 0,
      noCharge: {
        version: 1,
        amountCents: 0,
        paymentSessionId: claim.session.id,
        reason: couponSnapshot && subtotalCents > 0 ? "coupon_covers_total" : "zero_priced_goods",
        couponId: couponSnapshot?.id || null,
        authorizedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    } : await dependencies.createPayment({
      provider,
      cart: claim.session.data.creationBindingVersion === 1 ? { ...cart, checkoutPaymentSessionId: claim.session.id, checkoutFingerprint, cartFingerprint } : cart,
      amount: amountInCents,
      currency: "usd",
      captureMethod: "manual",
      idempotencyKey
    });
    const providerPaymentId = sessionData?.paymentIntentId;
    const ready = await writePaymentCreationResult(context, {
      sessionId: claim.session.id,
      claimToken: claim.session.data.creationClaimToken,
      phase: "provider_ready",
      paymentIntentId: providerPaymentId,
      clientSecret: sessionData?.clientSecret,
      noCharge: sessionData?.noCharge
    });
    if (!providerPaymentId) throw new Error("Payment provider did not return a durable payment identity");
    await dependencies.ensureCheckoutAttempt(context, checkoutRequest(ready.id, providerPaymentId), cart, ready, providerPaymentId);
    return writePaymentCreationResult(context, { sessionId: ready.id, phase: "ready", paymentIntentId: providerPaymentId });
  } catch (error) {
    await writePaymentCreationResult(context, { sessionId: claim.session.id, claimToken: claim.session.data.creationClaimToken, phase: "unknown" });
    throw error;
  }
}
function initiatePaymentSession(root, args, context) {
  return initiatePaymentSessionWithDependencies(root, args, context);
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

// features/keystone/mutations/getPublicGroceryAvailability.ts
init_storeScope();
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
init_storeScope();
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
init_access();
init_storeScope();
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

// features/keystone/lib/catalogPage.ts
function catalogPageQuery(args) {
  const take = Math.min(100, Math.max(1, Math.trunc(Number(args.take || 24))));
  const skip = Math.max(0, Math.trunc(Number(args.skip || 0)));
  if (!Number.isSafeInteger(take) || !Number.isSafeInteger(skip)) throw new Error("Invalid catalog page");
  const params = [args.storeId, args.now];
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const filters = ['p."store" = $1', `p."status" = 'published'`];
  if (args.ids?.length) filters.push(`p."id" = ANY(${bind([...new Set(args.ids)].slice(0, 100))}::text[])`);
  if (args.handle) filters.push(`p."handle" = ${bind(args.handle)}`);
  if (args.department?.trim()) filters.push(`d."handle" = ${bind(args.department.trim())}`);
  if (args.search?.trim()) {
    const p = bind(`%${args.search.trim().slice(0, 200).replace(/[\\%_]/g, "\\$&")}%`);
    filters.push(`(p."title" ILIKE ${p} OR p."sku" ILIKE ${p} OR p."handle" ILIKE ${p})`);
  }
  if (args.organic === true) filters.push('p."organicCertified" = true');
  const availability = args.availability || "in-stock";
  if (!["all", "in-stock", "low-stock"].includes(availability)) throw new Error("Unsupported catalog availability filter");
  if (availability !== "all") filters.push("COALESCE(stock.quantity,0)>0");
  if (availability === "low-stock") filters.push("COALESCE(stock.quantity,0)<10");
  const order = { "price-asc": 'p."priceCents" ASC', "price-desc": 'p."priceCents" DESC', newest: 'p."createdAt" DESC', "low-stock": "COALESCE(stock.quantity,0) ASC" };
  const from = `FROM "Product" p LEFT JOIN "Department" d ON d."id"=p."departmentRef"
    LEFT JOIN (SELECT "product",SUM("quantityRemaining") AS quantity FROM "InventoryLot"
      WHERE "store"=$1 AND "expirationDate">$2 AND "quantityRemaining">0 AND "safetyStatus"='available' AND "conditionStatus"='accepted' GROUP BY "product") stock ON stock."product"=p."id"
    WHERE ${filters.join(" AND ")}`;
  return {
    countSql: `SELECT COUNT(*)::int AS count ${from}`,
    countParams: [...params],
    pageSql: `SELECT p."id",COALESCE(stock.quantity,0) AS quantity ${from} ORDER BY ${order[args.sort || ""] || 'p."title" ASC'},p."title" ASC,p."id" ASC LIMIT ${bind(take)} OFFSET ${bind(skip)}`,
    params,
    take,
    skip
  };
}

// features/keystone/mutations/getPublicGroceryCatalog.ts
init_storeScope();
function mapCatalogProduct(product, storeId, requestedAlerts, now) {
  const sellableQuantity = product.sellableQuantity ?? deriveSellableQuantity(product, storeId, now);
  return {
    nutrition: product.nutrition,
    variantLabel: product.variantLabel,
    variantOf: product.variantOf,
    packBaseUnitsMilli: product.packBaseUnitsMilli,
    informationSource: product.informationSource,
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
async function loadCatalog(context, args, now) {
  const store = await publicStore(context);
  const page = catalogPageQuery({ ...args, storeId: store.id, now });
  const [identities, counts] = await Promise.all([
    context.prisma.$queryRawUnsafe(page.pageSql, ...page.params),
    context.prisma.$queryRawUnsafe(page.countSql, ...page.countParams)
  ]);
  const quantityById = new Map(identities.map((row) => [row.id, Number(row.quantity)]));
  const rows = await context.prisma.product.findMany({
    where: { id: { in: identities.map((row) => row.id) }, storeId: store.id, status: "published" },
    select: {
      nutrition: true,
      variantLabel: true,
      variantOf: { select: { id: true, handle: true, title: true } },
      packBaseUnitsMilli: true,
      informationSource: true,
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
      departmentRef: { select: { id: true, name: true, handle: true, isActive: true } }
    }
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const ordered = identities.flatMap((row) => rowsById.has(row.id) ? [{ ...rowsById.get(row.id), sellableQuantity: quantityById.get(row.id) }] : []);
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
    products: ordered.map((row) => mapCatalogProduct(row, store.id, requestedAlerts, now)),
    totalCount: counts[0]?.count || 0
  };
}
async function getPublicGroceryProducts(_root, args, context) {
  const now = /* @__PURE__ */ new Date();
  return loadCatalog(context, args, now).then(({ products, totalCount }) => ({ products, totalCount }));
}
async function getPublicGroceryProduct(_root, { handle }, context) {
  const normalized = handle.trim();
  if (!normalized) return null;
  const { products } = await loadCatalog(context, { handle: normalized, availability: "all", take: 1 }, /* @__PURE__ */ new Date());
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
        select: { safetyStatus: true, conditionStatus: true, expirationDate: true, quantityRemaining: true, store: { select: { id: true } } }
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

// features/keystone/mutations/index.ts
init_payment();

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
      pricingMethod: "weight",
      unitOfMeasure: "lb",
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
      pricingMethod: "weight",
      unitOfMeasure: "lb",
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

// features/platform/onboarding/lib/groceryOnboardingSeed.ts
var import_zod = require("zod");
var nonEmpty = import_zod.z.string().trim().min(1);
var money = import_zod.z.number().finite().nonnegative();
var wholeNumber = import_zod.z.number().int().nonnegative();
var fulfillmentWindowSchema = import_zod.z.object({
  startTime: import_zod.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: import_zod.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  isActive: import_zod.z.boolean()
});
var groceryOnboardingSeedSchema = import_zod.z.object({
  storeSettings: import_zod.z.object({
    name: nonEmpty,
    tagline: import_zod.z.string(),
    homepageTitle: nonEmpty,
    homepageDescription: nonEmpty,
    contactEmail: import_zod.z.string().email(),
    contactPhone: nonEmpty,
    address: nonEmpty,
    logoUrl: nonEmpty,
    brandHue: import_zod.z.number().int().min(0).max(359),
    currencyCode: import_zod.z.literal("USD"),
    taxRateBps: import_zod.z.number().int().min(0).max(1e4),
    locale: nonEmpty,
    timezone: nonEmpty,
    countryCode: import_zod.z.string().length(2),
    hours: import_zod.z.object({
      fulfillmentPolicy: import_zod.z.object({
        horizonDays: import_zod.z.number().int().min(1).max(31),
        cutoffMinutes: wholeNumber,
        blackoutDates: import_zod.z.array(import_zod.z.string()),
        deliveryWindows: import_zod.z.array(fulfillmentWindowSchema.extend({
          capacity: import_zod.z.number().int().positive(),
          deliveryFee: wholeNumber
        })).min(1),
        pickupWindows: import_zod.z.array(fulfillmentWindowSchema.extend({
          maxOrders: import_zod.z.number().int().positive()
        })).min(1)
      })
    }).passthrough(),
    isActive: import_zod.z.literal(true)
  }),
  departments: import_zod.z.array(import_zod.z.object({
    name: nonEmpty,
    handle: nonEmpty,
    description: import_zod.z.string(),
    imageUrl: nonEmpty,
    sortOrder: wholeNumber,
    temperatureZone: import_zod.z.enum(["ambient", "refrigerated", "frozen"]),
    requiredLicenses: import_zod.z.array(import_zod.z.string())
  })).min(1),
  suppliers: import_zod.z.array(import_zod.z.object({
    name: nonEmpty,
    contactName: nonEmpty,
    email: import_zod.z.string().email(),
    phone: nonEmpty,
    paymentTerms: import_zod.z.enum(["cod", "net_15", "net_30", "net_60"]),
    deliveryDays: import_zod.z.array(import_zod.z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])),
    minimumOrder: money
  })).min(1),
  products: import_zod.z.array(import_zod.z.object({
    title: nonEmpty,
    handle: nonEmpty,
    sku: nonEmpty,
    status: import_zod.z.enum(["draft", "published", "archived"]),
    price: money,
    compareAtPrice: money,
    costPrice: money,
    inStock: import_zod.z.boolean(),
    stockQuantity: wholeNumber,
    lowStockThreshold: wholeNumber,
    imageUrl: nonEmpty,
    thumbnailUrl: nonEmpty,
    departmentCode: import_zod.z.enum(["produce", "meat", "seafood", "dairy", "bakery", "deli", "frozen", "pantry", "beverages", "snacks", "health_beauty", "household"]),
    departmentHandle: nonEmpty,
    supplierEmail: import_zod.z.string().email(),
    isPerishable: import_zod.z.boolean(),
    shelfLife: import_zod.z.number().int().positive(),
    pricingMethod: import_zod.z.enum(["unit", "weight", "volume"]),
    unitOfMeasure: import_zod.z.enum(["each", "lb", "oz", "kg", "g", "L", "mL", "gallon", "quart", "pint"]),
    organicCertified: import_zod.z.boolean(),
    allergens: import_zod.z.array(import_zod.z.enum(["milk", "eggs", "fish", "shellfish", "tree_nuts", "peanuts", "wheat", "soybeans", "sesame"]))
  })).min(1),
  inventoryLots: import_zod.z.array(import_zod.z.object({
    lotNumber: nonEmpty,
    productHandle: nonEmpty,
    supplierEmail: import_zod.z.string().email(),
    expirationOffsetDays: import_zod.z.number().int().positive(),
    receivedOffsetDays: import_zod.z.number().int(),
    quantity: wholeNumber,
    quantityRemaining: wholeNumber,
    costPerUnit: money,
    location: nonEmpty
  })),
  deliverySlots: import_zod.z.array(import_zod.z.object({
    label: nonEmpty,
    dayOffset: import_zod.z.number().int().min(0).max(31),
    startTime: import_zod.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: import_zod.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    capacity: import_zod.z.number().int().positive(),
    currentBookings: wholeNumber,
    deliveryFee: wholeNumber,
    isActive: import_zod.z.boolean()
  })).min(1),
  pickupSlots: import_zod.z.array(import_zod.z.object({
    label: nonEmpty,
    dayOffset: import_zod.z.number().int().min(0).max(31),
    startTime: import_zod.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: import_zod.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    maxOrders: import_zod.z.number().int().positive(),
    currentOrders: wholeNumber,
    isAvailable: import_zod.z.boolean()
  })).min(1),
  parkingSpots: import_zod.z.array(import_zod.z.object({
    spotNumber: nonEmpty,
    description: import_zod.z.string(),
    isAccessible: import_zod.z.boolean(),
    isAvailable: import_zod.z.boolean()
  })),
  coupons: import_zod.z.array(import_zod.z.object({
    code: nonEmpty,
    discountType: import_zod.z.enum(["percentage", "fixed"]),
    discountValue: money,
    minPurchase: money,
    maxUses: import_zod.z.number().int().positive(),
    currentUses: wholeNumber,
    validFromOffsetDays: import_zod.z.number().int(),
    validToOffsetDays: import_zod.z.number().int().positive(),
    productCategories: import_zod.z.array(import_zod.z.string()),
    excludedProducts: import_zod.z.array(import_zod.z.string()),
    isActive: import_zod.z.boolean()
  })),
  paymentProviders: import_zod.z.tuple([import_zod.z.object({
    name: nonEmpty,
    code: import_zod.z.literal("pp_stripe_default"),
    isInstalled: import_zod.z.boolean(),
    metadata: import_zod.z.object({
      provider: import_zod.z.literal("stripe"),
      configuration: import_zod.z.literal("server_environment")
    })
  })])
}).strict().superRefine((seed, ctx) => {
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: import_zod.z.ZodIssueCode.custom, message: `${label} must be unique` });
    }
  };
  unique(seed.departments.map((item) => item.handle), "Department handles");
  unique(seed.suppliers.map((item) => item.email), "Supplier emails");
  unique(seed.products.map((item) => item.handle), "Product handles");
  unique(seed.products.map((item) => item.sku), "Product SKUs");
  unique(seed.inventoryLots.map((item) => item.lotNumber), "Inventory lot numbers");
  unique(seed.parkingSpots.map((item) => item.spotNumber), "Parking spot numbers");
  unique(seed.coupons.map((item) => item.code), "Coupon codes");
  const departments = new Set(seed.departments.map((item) => item.handle));
  const suppliers = new Set(seed.suppliers.map((item) => item.email));
  const products = new Set(seed.products.map((item) => item.handle));
  seed.products.forEach((product, index) => {
    if (!departments.has(product.departmentHandle)) {
      ctx.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: ["products", index, "departmentHandle"], message: `Unknown department ${product.departmentHandle}` });
    }
    if (!suppliers.has(product.supplierEmail)) {
      ctx.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: ["products", index, "supplierEmail"], message: `Unknown supplier ${product.supplierEmail}` });
    }
  });
  seed.inventoryLots.forEach((lot, index) => {
    if (lot.quantityRemaining > lot.quantity) {
      ctx.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: ["inventoryLots", index, "quantityRemaining"], message: "Remaining quantity cannot exceed received quantity" });
    }
    if (!products.has(lot.productHandle)) {
      ctx.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: ["inventoryLots", index, "productHandle"], message: `Unknown product ${lot.productHandle}` });
    }
    if (!suppliers.has(lot.supplierEmail)) {
      ctx.addIssue({ code: import_zod.z.ZodIssueCode.custom, path: ["inventoryLots", index, "supplierEmail"], message: `Unknown supplier ${lot.supplierEmail}` });
    }
  });
});
function parseGroceryOnboardingSeed(input) {
  const result = groceryOnboardingSeedSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue.path.length ? ` at ${issue.path.join(".")}` : "";
  throw new Error(`Invalid grocery onboarding seed${path}: ${issue.message}`);
}

// features/keystone/mutations/runGroceryOnboarding.ts
init_access();
init_storeScope();
function relativeDate(days, hour = 12, minute = 0, now = /* @__PURE__ */ new Date()) {
  const date2 = new Date(now);
  date2.setUTCDate(date2.getUTCDate() + days);
  date2.setUTCHours(hour, minute, 0, 0);
  return date2;
}
function startOfStoreDay(days, timeZone, now = /* @__PURE__ */ new Date()) {
  return zonedStartOfDateKey(zonedDateKeyOffset(now, timeZone, days), timeZone);
}
function assertSeedPolicy(seed) {
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
}
function providerInstalled(code) {
  return code === "pp_stripe_default" && Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
function publicProviderMetadata(metadata) {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return Object.fromEntries(Object.entries(source).filter(([key2]) => !/(secret|token|password|credential|key)/i.test(key2)));
}
async function runGroceryOnboardingTransaction(input, context, failurePoint) {
  const userId = context.session?.itemId;
  if (!userId) throw new Error("You must be signed in to run grocery onboarding");
  const seed = parseGroceryOnboardingSeed(input);
  assertSeedPolicy(seed);
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
    const storeSettingsData = {
      ...seed.storeSettings,
      hours: seed.storeSettings.hours
    };
    await tx.storeSettings.upsert({
      where: { storeId: store.id },
      update: storeSettingsData,
      create: { ...storeSettingsData, storeId: store.id }
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
        sku: normalizeProductSku(product.sku),
        skuIdentity: deriveProductSkuIdentity(store.id, product.sku),
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
        // Source-added field; generated Prisma artifacts remain intentionally preserved until the schema transition.
        ...{ initialInformation: initialProductInformation(product, context.session.itemId, "grocery_onboarding_seed") },
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
      const date2 = startOfStoreDay(slot.dayOffset, seed.storeSettings.timezone);
      const existing = await tx.deliverySlot.findFirst({
        where: { date: date2, startTime: slot.startTime, endTime: slot.endTime, storeId: store.id },
        select: { id: true }
      });
      const common = {
        date: date2,
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
      const date2 = startOfStoreDay(slot.dayOffset, seed.storeSettings.timezone);
      const existing = await tx.pickupSlot.findFirst({
        where: { date: date2, startTime: slot.startTime, endTime: slot.endTime, storeId: store.id },
        select: { id: true }
      });
      const common = { date: date2, startTime: slot.startTime, endTime: slot.endTime, maxOrders: slot.maxOrders, isActive: slot.isAvailable, storeId: store.id };
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
  return runGroceryOnboardingTransaction(args.seed ?? seed_default, context);
}

// features/keystone/mutations/managePurchaseOrderReceiving.ts
init_groceryOutbox();
var import_node_crypto23 = require("node:crypto");
init_inventoryMovements();
init_access();
init_storeScope();
init_serializableTransaction();
async function assertCanManageInventory(context) {
  await requireFreshCapability(context, "canManageInventory");
}
function receiptQuantityDelta({
  targetQuantityReceived,
  orderedQuantity,
  currentQuantityReceived,
  productTitle
}) {
  quantityMilli(targetQuantityReceived);
  quantityMilli(orderedQuantity);
  quantityMilli(currentQuantityReceived);
  if (targetQuantityReceived > orderedQuantity) {
    throw new Error(`Received quantity cannot exceed ordered quantity for ${productTitle}`);
  }
  if (targetQuantityReceived < currentQuantityReceived) {
    throw new Error(`Received quantity cannot move backward for ${productTitle}`);
  }
  return (quantityMilli(targetQuantityReceived) - quantityMilli(currentQuantityReceived)) / 1e3;
}
function assertUniqueReceipts(receipts) {
  if (!receipts.length) throw new Error("At least one purchase order receipt is required");
  if (new Set(receipts.map((receipt) => receipt.poItemId)).size !== receipts.length) {
    throw new Error("Each purchase order item may appear only once per receipt request");
  }
  for (const receipt of receipts) {
    if (quantityMilli(receipt.targetQuantityReceived) < 0) {
      throw new Error("Received quantity targets must be non-negative quantities with at most three decimal places");
    }
    if (!["accepted", "inspection_pending", "rejected"].includes(receipt.conditionStatus || "accepted")) throw new Error("Invalid receipt inspection condition");
    if (receipt.conditionStatus && receipt.conditionStatus !== "accepted" && !receipt.inspectionNote?.trim()) throw new Error("Inspection exception requires evidence");
    if (!receipt.lotNumber.trim()) throw new Error("Each received item requires a lot number");
    const expirationDate = new Date(receipt.expirationDate);
    if (!Number.isFinite(expirationDate.getTime())) throw new Error("Each received item requires a valid expiration date");
    if (receipt.receiptKey != null && receipt.receiptKey.trim().length < 12) throw new Error("Receipt idempotency key must contain at least 12 characters");
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
      supplier { id name email store { id } }
      items {
        id
        quantity
        quantityReceived
        productTitle productSku unitCost unitCostCents
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
    if (status === "sent") {
      const supplier = purchaseOrder.supplier;
      if (!supplier || supplier.store?.id !== store.id || !supplier.email?.trim()) throw new Error("Purchase order needs a same-Store supplier email before sending");
      await enqueueGroceryOutboxEvent(transactionContext.prisma, { storeId: store.id, eventKey: `purchase-order:${purchaseOrderId}:send`, eventType: "purchase_order.send_requested", aggregateType: "PurchaseOrder", aggregateId: purchaseOrderId, occurredAt: (/* @__PURE__ */ new Date()).toISOString(), payload: { purchaseOrderId, supplierId: supplier.id, recipient: supplier.email, poNumber: purchaseOrder.poNumber, currencyCode: store.currencyCode, lines: purchaseOrder.items.map((item) => ({ title: item.productTitle || item.product?.title, sku: item.productSku, quantity: Number(item.quantity), unitCostCents: Number(item.unitCostCents) })) } });
    }
    await sudoContext.db.PurchaseOrder.updateOne({
      where: { id: purchaseOrderId },
      data: { status }
    });
    return { success: true, purchaseOrderId, status, receivedUnits: 0, message: status === "sent" ? "Purchase order queued for supplier delivery; inspect Communications for the delivery outcome." : `Purchase order moved to ${status}.` };
  }, { isolationLevel: "Serializable" }));
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
      const receiptKey = receipt.receiptKey?.trim() || `receipt:${purchaseOrderId}:${item.id}:${receipt.targetQuantityReceived}`;
      const existingReceipt = await transactionContext.prisma.purchaseReceipt.findUnique({ where: { idempotencyKey: receiptKey } });
      if (existingReceipt) {
        if (existingReceipt.storeId !== store.id || existingReceipt.poItemId !== item.id || existingReceipt.supplierLotNumber !== receipt.lotNumber.trim() || quantityMilli(existingReceipt.targetQuantityReceived) !== quantityMilli(receipt.targetQuantityReceived) || existingReceipt.conditionStatus !== (receipt.conditionStatus || "accepted") || (existingReceipt.inspectionNote || "") !== (receipt.inspectionNote?.trim() || "") || (existingReceipt.deliveryReference || "") !== (receipt.deliveryReference?.trim() || "") || new Date(existingReceipt.expirationDate).getTime() !== new Date(receipt.expirationDate).getTime()) throw new Error("Receipt replay conflicts with original delivery evidence");
        resultingTargets.set(item.id, Number(item.quantityReceived || 0));
        continue;
      }
      const currentReceived = Number(item.quantityReceived || 0);
      const quantityDelta = receiptQuantityDelta({
        targetQuantityReceived: receipt.targetQuantityReceived,
        orderedQuantity: Number(item.quantity),
        currentQuantityReceived: currentReceived,
        productTitle: item.product.title
      });
      resultingTargets.set(item.id, receipt.targetQuantityReceived);
      if (quantityDelta === 0) continue;
      if (new Date(receipt.expirationDate).getTime() <= Date.now()) throw new Error("Inventory lot expiration date must be in the future");
      const supplierLotNumber = receipt.lotNumber.trim();
      const batchRecalls = [];
      for (let skip = 0; ; skip += 100) {
        const page = await transactionContext.prisma.inventoryRecall.findMany({ where: { storeId: store.id }, orderBy: { id: "asc" }, take: 100, skip });
        batchRecalls.push(...page.filter((recall) => recall.scope?.productId === item.product.id || (recall.scope?.lots || []).some((lot2) => lot2.productId === item.product.id && lot2.supplierId === (purchaseOrder.supplier?.id || null) && lot2.supplierLotNumber === supplierLotNumber)));
        if (page.length < 100) break;
      }
      const lotNumber = `R-${(0, import_node_crypto23.createHash)("sha256").update(`${store.id}:${receiptKey}`).digest("hex").slice(0, 32)}`;
      const lot = await sudoContext.db.InventoryLot.createOne({
        data: {
          store: { connect: { id: store.id } },
          lotNumber,
          supplierLotNumber,
          safetyStatus: batchRecalls.length ? "recalled" : (receipt.conditionStatus || "accepted") === "accepted" ? "available" : "quarantined",
          conditionStatus: receipt.conditionStatus || "accepted",
          safetyReason: receipt.inspectionNote?.trim() || void 0,
          expirationDate: new Date(receipt.expirationDate).toISOString(),
          receivedDate: (/* @__PURE__ */ new Date()).toISOString(),
          quantity: String(quantityDelta),
          quantityRemaining: String(quantityDelta),
          costPerUnit: item.unitCost,
          costPerUnitCents: Number(item.unitCostCents ?? Math.round(Number(item.unitCost) * 100)),
          location: receipt.location?.trim() || void 0,
          product: { connect: { id: item.product.id } },
          supplier: purchaseOrder.supplier?.id ? { connect: { id: purchaseOrder.supplier.id } } : void 0
        }
      });
      for (const recall of batchRecalls) {
        await transactionContext.prisma.inventoryRecall.update({ where: { id: recall.id }, data: { status: "open", ...recall.status === "closed" ? { closedAt: null, closedBy: "" } : {}, scope: { ...recall.scope, lots: [...recall.scope.lots, { id: lot.id, supplierLotNumber, supplierId: purchaseOrder.supplier?.id || null, productId: item.product.id, quantity: quantityDelta, quantityRemaining: quantityDelta }] }, events: [...recall.events || [], { action: recall.status === "closed" ? "reopened_for_receipt" : "receipt_join", idempotencyKey: receiptKey, actorId: context.session?.itemId, at: (/* @__PURE__ */ new Date()).toISOString(), reason: "New delivery matches active recall scope", evidence: { inventoryLotId: lot.id, quantity: quantityDelta } }] } });
      }
      const stockBefore = productStock.get(item.product.id) || 0;
      const nextStock = (quantityMilli(stockBefore) + quantityMilli(quantityDelta)) / 1e3;
      const receiptRecord = await transactionContext.prisma.purchaseReceipt.create({ data: { storeId: store.id, purchaseOrderId, poItemId: item.id, inventoryLotId: lot.id, productId: item.product.id, supplierId: purchaseOrder.supplier?.id || null, idempotencyKey: receiptKey, supplierLotNumber, deliveryReference: receipt.deliveryReference?.trim() || "", quantity: quantityDelta, targetQuantityReceived: receipt.targetQuantityReceived, unitCostCents: Number(item.unitCostCents ?? Math.round(Number(item.unitCost) * 100)), conditionStatus: receipt.conditionStatus || "accepted", inspectionNote: receipt.inspectionNote?.trim() || "", receivedBy: context.session?.itemId, expirationDate: new Date(receipt.expirationDate) } });
      await appendInventoryMovement(transactionContext.prisma, { storeId: store.id, productId: item.product.id, inventoryLotId: lot.id, sourceType: "purchase_receipt", sourceId: receiptRecord.id, idempotencyKey: `movement:${receiptKey}`, actorId: context.session?.itemId, reason: receipt.inspectionNote?.trim() || (batchRecalls.length ? "Purchase receipt held by active recall" : "Purchase receipt accepted"), quantityBefore: 0, quantityAfter: quantityDelta, productStockBefore: stockBefore, productStockAfter: nextStock, metadata: { purchaseOrderId, poItemId: item.id, supplierLotNumber, conditionStatus: receipt.conditionStatus || "accepted" } });
      productStock.set(item.product.id, nextStock);
      await sudoContext.db.Product.updateOne({
        where: { id: item.product.id },
        data: { stockQuantity: String(nextStock), inStock: true }
      });
      await sudoContext.db.POItem.updateOne({
        where: { id: item.id },
        data: { quantityReceived: String(receipt.targetQuantityReceived) }
      });
      receivedUnits += quantityDelta;
    }
    const fullyReceived = purchaseOrder.items.every(
      (item) => (resultingTargets.get(item.id) ?? Number(item.quantityReceived || 0)) === Number(item.quantity)
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
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/createPurchaseOrderDraft.ts
init_access();
init_storeScope();
init_serializableTransaction();
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
          quantity: String(item.quantity),
          unitCost: item.unitCost,
          unitCostCents: Math.round(item.unitCost * 100),
          quantityReceived: "0",
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
init_access();
init_serializableTransaction();
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
      (sum, candidate) => sum + Number(candidate.quantity) * candidate.unitCostCents,
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
init_access();
init_inventoryMovements();
init_serializableTransaction();
var REASONS = /* @__PURE__ */ new Set(["damage", "spoilage", "correction"]);
async function adjustInventoryLot(_root, args, context) {
  const { storeId } = await requireFreshCapability(context, "canManageInventory");
  if (quantityMilli(args.targetQuantityRemaining) < 0) {
    throw new Error("Target remaining quantity must be a non-negative quantity with at most three decimal places");
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
      if (existing.inventoryLotId !== args.inventoryLotId || quantityMilli(existing.quantityAfter) !== quantityMilli(args.targetQuantityRemaining) || existing.reason !== args.reason || (existing.note || "") !== (args.note?.trim() || "")) throw new Error("Inventory adjustment replay conflicts with original inputs");
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
    const identity2 = await tx.inventoryLot.findUnique({ where: { id: args.inventoryLotId }, select: { productId: true, storeId: true } });
    if (!identity2 || identity2.storeId !== storeId || !identity2.productId) throw new Error("Inventory lot not found in active store");
    await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', identity2.productId);
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
    if (quantityMilli(args.targetQuantityRemaining) > await unconvertedLotCapacityMilli(tx, storeId, lot)) {
      throw new Error("Target remaining quantity cannot exceed the received lot quantity");
    }
    const quantityBefore = Number(lot.quantityRemaining);
    const quantityDelta = (quantityMilli(args.targetQuantityRemaining) - quantityMilli(quantityBefore)) / 1e3;
    const productStockBefore = Number(product.stockQuantity || 0);
    const productStockAfter = (quantityMilli(productStockBefore) + quantityMilli(quantityDelta)) / 1e3;
    if (productStockAfter < 0) throw new Error("Inventory adjustment would make product stock negative");
    const sudoContext = transactionContext.sudo();
    await sudoContext.db.InventoryLot.updateOne({
      where: { id: lot.id },
      data: { quantityRemaining: String(args.targetQuantityRemaining) }
    });
    await sudoContext.db.Product.updateOne({
      where: { id: product.id },
      data: { stockQuantity: String(productStockAfter), inStock: productStockAfter > 0 }
    });
    const adjustment = await sudoContext.db.InventoryAdjustment.createOne({
      data: {
        idempotencyKey,
        reason: args.reason,
        quantityBefore: String(quantityBefore),
        quantityAfter: String(args.targetQuantityRemaining),
        quantityDelta: String(quantityDelta),
        productStockBefore: String(productStockBefore),
        productStockAfter: String(productStockAfter),
        note: args.note?.trim() || void 0,
        store: { connect: { id: storeId } },
        product: { connect: { id: product.id } },
        inventoryLot: { connect: { id: lot.id } },
        adjustedBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : void 0
      }
    });
    await appendInventoryMovement(tx, { storeId, productId: product.id, inventoryLotId: lot.id, sourceType: args.reason === "spoilage" || args.reason === "damage" ? "waste" : "manual_adjustment", sourceId: adjustment.id, idempotencyKey: `adjustment:${idempotencyKey}`, actorId: context.session?.itemId, reason: args.note?.trim() || args.reason, quantityBefore, quantityAfter: args.targetQuantityRemaining, productStockBefore, productStockAfter });
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
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/manageOrderFulfillment.ts
init_groceryOutbox();
init_access();
init_serializableTransaction();
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
    if (target === "packed" || target === "ready_for_pickup") await assertOrderInventoryEligible(transactionContext.prisma, orderId, storeId);
    if (target === "packed") {
      await getFulfillmentActualLines(transactionContext, orderId);
      if (metadata.finalSale?.status !== "finalized") {
        throw new Error("Finalize the actual sale before packing this order");
      }
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
        status: { in: target === "picking" ? ["authorized", "succeeded", "partially_refunded"] : ["succeeded", "partially_refunded"] }
      },
      take: 1,
      query: "id"
    });
    if (!settledPayments.length) {
      throw new Error("Order fulfillment requires an authorized payment for picking and a settled payment for packing");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const nextMetadata = {
      ...metadata,
      ...target === "picking" ? { pickingStartedAt: now } : {},
      ...target === "packed" ? { packedAt: now } : {},
      ...target === "ready_for_pickup" ? { readyForPickup: true, pickupReadyAt: now } : {}
    };
    if (target === "ready_for_pickup") await enqueueGroceryOutboxEvent(transactionContext.prisma, { storeId, eventKey: `order.ready:${orderId}`, eventType: "order.ready", aggregateType: "Order", aggregateId: orderId, occurredAt: now, payload: { orderId } });
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
init_access();
init_groceryOutbox();
init_storeScope();
init_inventoryMovements();
init_serializableTransaction();
function hasOutstandingSettledPayment(statuses) {
  return statuses.some((status) => status === "succeeded" || status === "partially_refunded");
}
function assertCancellationPaymentProof(payments, orderId, storeId, finalized) {
  for (const payment of payments) {
    if (!payment.id || payment.orderId !== orderId || payment.storeId !== storeId || !Number.isSafeInteger(payment.amountCents) || payment.amountCents < 0 || !Array.isArray(payment.refunds)) throw new Error("Cancellation requires complete payment ownership, amount and refund evidence");
    if (["processing", "unknown"].includes(payment.providerData?.authorizationVoid?.status)) throw new Error("Authorization void requires reconciliation before cancellation");
    if (["authorized", "pending"].includes(payment.status)) throw new Error("Void the active payment authorization before cancelling this order");
    if (payment.status === "processing") throw new Error("Payment reconciliation must complete before cancellation");
    let refundedCents = 0;
    for (const refund of payment.refunds) {
      if (!refund.id || refund.paymentId !== payment.id || !Number.isSafeInteger(refund.amountCents) || refund.amountCents <= 0 || !["processing", "succeeded", "failed", "canceled"].includes(refund.status)) throw new Error("Cancellation requires complete and consistent refund evidence");
      if (refund.status === "processing" || refund.providerStatus === "unknown") throw new Error("Refund reconciliation must complete before cancellation");
      if (refund.status === "succeeded") refundedCents += refund.amountCents;
    }
    if (!Number.isSafeInteger(refundedCents) || refundedCents > payment.amountCents) throw new Error("Refund ledger exceeds the recorded payment amount");
    if (payment.amountCents === 0) {
      const noCharge = noChargeOrderPaymentState(payment);
      const checkoutZero = noCharge && payment.status === "succeeded" && !["capturedAmountCents", "authorizedAmountCents", "capturableAmountCents"].some((field) => payment.providerData?.[field] != null && payment.providerData[field] !== 0);
      const settlement = finalized?.settlement;
      const sale = finalized?.finalSale;
      const evidence = settlement?.providerEvidence;
      const snapshot = settlement?.snapshot;
      const finalIdentity = payment.status === "cancelled" && payment.providerData?.capturedAmountCents === 0 && settlement?.id && settlement.orderId === orderId && settlement.status === "finalized" && settlement.idempotencyKey === `order-actuals:${orderId}` && payment.providerData.finalSettlementId === settlement.id && evidence?.originalPaymentId === payment.id && !evidence.finalizationLease && !evidence.abandonment && sale?.status === "finalized" && sale.settlementId === settlement.id && Number.isSafeInteger(settlement.totalCents) && settlement.totalCents >= 0 && sale.totalCents === settlement.totalCents && snapshot?.totalCents === settlement.totalCents && snapshot.currency === String(finalized?.currencyCode).toLowerCase() && sale.currency === snapshot.currency && evidence.currency === snapshot.currency && settlement.actualsHash === finalSaleSnapshotHash(snapshot);
      const revised = finalIdentity && noCharge && evidence.reauthorization?.paymentIntentId ? payments.find((row) => row.id !== payment.id && row.orderId === orderId && row.storeId === storeId && row.providerPaymentId === evidence.reauthorization.paymentIntentId && row.paymentProviderId === payment.paymentProviderId && row.providerData?.finalSettlementId === settlement.id && row.amountCents === evidence.amountCents) : null;
      const replacedZero = revised && revised.status === "refunded" && settlement.totalCents > 0 && ["succeeded", "captured"].includes(evidence.status) && Number.isSafeInteger(evidence.amountCents) && Number.isSafeInteger(evidence.refundedCents) && evidence.refundedCents >= 0 && evidence.amountCents - evidence.refundedCents === settlement.totalCents;
      const voidedToZero = finalIdentity && !noCharge && !evidence.reauthorization?.paymentIntentId && typeof payment.providerPaymentId === "string" && payment.providerPaymentId && !payment.providerPaymentId.startsWith("grocery_no_charge:") && settlement.totalCents === 0 && ["canceled", "cancelled"].includes(evidence.status) && evidence.amountCents === 0 && evidence.refundedCents === 0 && payment.providerData.captureRecognition?.basis === "no_capture";
      if (payment.refunds.length || !(checkoutZero || replacedZero || voidedToZero)) throw new Error("Zero payment cancellation requires verified server no-charge evidence or finalized zero-exposure settlement proof");
      continue;
    }
    if (hasOutstandingSettledPayment([payment.status])) throw new Error("Settled payments must be fully refunded through the refund workflow before cancelling the order");
    if (payment.status === "refunded" && refundedCents !== payment.amountCents) throw new Error("Fully refunded status requires matching succeeded refund evidence before cancellation");
    if (!["refunded", "failed", "cancelled"].includes(payment.status)) throw new Error("Unknown payment state requires reconciliation before cancellation");
  }
}
async function cancelGroceryOrder(_root, { orderId, reason, idempotencyKey, disposition, conditionNote }, context) {
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
        lineItems: {
          select: {
            id: true,
            quantity: true,
            productId: true,
            inventoryLotId: true,
            fulfillment: { select: { id: true, allocations: true } },
            metadata: true,
            inventoryAllocations: { select: { id: true, inventoryLotId: true, quantity: true } }
          }
        }
      }
    });
    if (!order || order.storeId !== store.id) throw new Error("Order not found in active store");
    const cancellation = order.metadata?.cancellation;
    if (order.status === "cancelled") {
      if (cancellation?.idempotencyKey !== normalizedKey || cancellation.reason !== normalizedReason || (cancellation.disposition || "return_to_stock") !== (disposition || "return_to_stock") || (cancellation.conditionNote || "") !== (conditionNote?.trim() || "")) throw new Error("Order was already cancelled by another operation");
      return { success: true, orderId, status: "cancelled", reused: true };
    }
    if (order.deliveryRouteId || order.status === "out_for_delivery" || order.status === "delivered") {
      throw new Error("Dispatched or delivered orders cannot be cancelled");
    }
    if (!["pending", "picking", "packed", "returned"].includes(order.status)) throw new Error(`Order status ${order.status} cannot be cancelled`);
    const settlement = await tx.orderSettlement.findFirst({ where: { orderId, status: { in: ["processing", "requires_customer_authorization"] } } });
    if (settlement) throw new Error("Resolve the reserved final sale before cancelling this order");
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "order" = $1 ORDER BY "id" FOR UPDATE', orderId);
    const payments = await tx.payment.findMany({ where: { orderId }, include: { refunds: true }, orderBy: { id: "asc" } });
    const finalSale = order.metadata?.finalSale;
    const finalized = payments.some((payment) => payment.amountCents === 0 && payment.status === "cancelled") && finalSale?.settlementId ? { settlement: await tx.orderSettlement.findUnique({ where: { id: finalSale.settlementId } }), finalSale, currencyCode: order.currencyCode } : void 0;
    assertCancellationPaymentProof(payments, orderId, store.id, finalized);
    if (["packed", "returned"].includes(order.status) && (!disposition || !conditionNote?.trim())) throw new Error("Packed goods require explicit return, waste or quarantine disposition and condition evidence");
    const returnDisposition = disposition || "return_to_stock";
    if (!["return_to_stock", "waste", "quarantine"].includes(returnDisposition)) throw new Error("Unsupported cancellation disposition");
    const originalAllocations = order.lineItems.flatMap((line) => {
      const allocations = line.fulfillment ? line.fulfillment.allocations || [] : line.inventoryAllocations.length ? line.inventoryAllocations : line.metadata?.inventoryAllocations || (line.inventoryLotId ? [{ inventoryLotId: line.inventoryLotId, quantity: line.quantity }] : []);
      return allocations.map((allocation) => ({ lineItemId: line.id, lotId: allocation.lotId || allocation.inventoryLotId, productId: allocation.productId || line.productId, quantity: Number(allocation.quantity) }));
    });
    const priorReturns = await tx.orderLineRefund.findMany({ where: { orderId, storeId: store.id }, select: { id: true, lineItemId: true, returnedLots: true } });
    const remaining = /* @__PURE__ */ new Map();
    for (const allocation of originalAllocations) {
      const key2 = JSON.stringify([allocation.lineItemId, allocation.lotId]);
      const existing = remaining.get(key2);
      if (existing && existing.productId !== allocation.productId) throw new Error("Cancellation lot has conflicting product provenance");
      remaining.set(key2, { ...allocation, quantityMilli: quantityMilli(allocation.quantity) + (existing?.quantityMilli || 0) });
    }
    for (const prior of priorReturns) for (const returned of prior.returnedLots || []) {
      const allocation = remaining.get(JSON.stringify([prior.lineItemId, returned.lotId]));
      if (!allocation || !Number.isSafeInteger(returned.quantityMilli) || returned.quantityMilli <= 0 || returned.quantityMilli > allocation.quantityMilli) throw new Error("Previously accepted return exceeds actual cancellation allocation");
      allocation.quantityMilli -= returned.quantityMilli;
    }
    const effectiveAllocations = [...remaining.values()].filter((allocation) => allocation.quantityMilli > 0).map(({ quantityMilli: milli, ...allocation }) => ({ ...allocation, quantity: milli / 1e3 }));
    const productIds = [...new Set(effectiveAllocations.map((allocation) => allocation.productId))].sort();
    const lotIds = [...new Set(effectiveAllocations.map((allocation) => allocation.lotId))].sort();
    for (const productId of productIds) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', productId);
    for (const lotId of lotIds) await tx.$queryRawUnsafe('SELECT "id" FROM "InventoryLot" WHERE "id" = $1 FOR UPDATE', lotId);
    if (order.deliverySlotId) await tx.$queryRawUnsafe('SELECT "id" FROM "DeliverySlot" WHERE "id" = $1 FOR UPDATE', order.deliverySlotId);
    if (order.pickupSlotId) await tx.$queryRawUnsafe('SELECT "id" FROM "PickupSlot" WHERE "id" = $1 FOR UPDATE', order.pickupSlotId);
    const couponId = typeof order.metadata?.coupon?.id === "string" ? order.metadata.coupon.id : null;
    if (couponId) await tx.$queryRawUnsafe('SELECT "id" FROM "Coupon" WHERE "id" = $1 FOR UPDATE', couponId);
    for (const allocation of effectiveAllocations) {
      const lot = await tx.inventoryLot.findUnique({ where: { id: allocation.lotId } });
      const product = await tx.product.findUnique({ where: { id: allocation.productId } });
      if (!lot || !product || lot.storeId !== store.id || product.storeId !== store.id || lot.productId !== product.id) throw new Error("Cancellation allocation is outside the active store");
      if (returnDisposition === "return_to_stock" && ["packed", "returned"].includes(order.status) && !isInventoryLotEligible(lot)) throw new Error("Unsafe or expired packed stock requires quarantine or waste disposition");
      const delta = returnDisposition === "waste" ? 0 : quantityMilli(allocation.quantity);
      const nextLot = (quantityMilli(lot.quantityRemaining) + delta) / 1e3;
      const nextStock = (quantityMilli(product.stockQuantity) + delta) / 1e3;
      if (quantityMilli(nextLot) > await unconvertedLotCapacityMilli(tx, store.id, lot)) throw new Error("Cancellation would exceed received lot quantity remaining after conversions");
      await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityRemaining: nextLot, ...returnDisposition === "quarantine" && lot.safetyStatus !== "recalled" ? { safetyStatus: "quarantined", safetyReason: conditionNote?.trim() || normalizedReason } : {} } });
      await tx.product.update({ where: { id: product.id }, data: { stockQuantity: nextStock, inStock: nextStock > 0 } });
      await appendInventoryMovement(tx, { storeId: store.id, productId: product.id, inventoryLotId: lot.id, orderId, sourceType: `cancellation_${returnDisposition}`, sourceId: orderId, idempotencyKey: `cancel:${normalizedKey}:${allocation.lineItemId}:${lot.id}`, actorId: context.session?.itemId, reason: normalizedReason, quantityBefore: lot.quantityRemaining, quantityAfter: nextLot, productStockBefore: product.stockQuantity, productStockAfter: nextStock, metadata: { disposition: returnDisposition, conditionNote: conditionNote?.trim() || null, quantity: allocation.quantity, lineItemId: allocation.lineItemId } });
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
    const couponRelease = await releaseOrderCoupon(tx, { storeId: store.id, orderId, sourceId: `cancel:${normalizedKey}`, reason: normalizedReason });
    await restoreLoyaltyRedemptionForOrder(tx, { storeId: store.id, orderId, sourceId: `cancel:${normalizedKey}`, reason: normalizedReason });
    await reconcileOrderLoyalty(tx, { storeId: store.id, orderId, sourceId: `cancel:${normalizedKey}`, reason: normalizedReason, netGoodsCents: 0, settled: true, actorId: context.session?.itemId });
    const cancelledAt = /* @__PURE__ */ new Date();
    const metadata = {
      ...couponRelease.metadata,
      cancellation: {
        idempotencyKey: normalizedKey,
        reason: normalizedReason,
        cancelledBy: context.session?.itemId,
        cancelledAt: cancelledAt.toISOString(),
        inventoryRestored: returnDisposition !== "waste",
        disposition: returnDisposition,
        conditionNote: conditionNote?.trim() || null,
        allocations: effectiveAllocations,
        priorReturnIds: priorReturns.filter((row) => row.returnedLots?.length).map((row) => row.id),
        fulfillmentCapacityReleased: true,
        couponRedemptionReleased: couponRelease.released
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
      payload: { orderId, reason: normalizedReason, idempotencyKey: normalizedKey, inventoryRestored: returnDisposition !== "waste", disposition: returnDisposition, fulfillmentCapacityReleased: true, couponRedemptionReleased: couponRelease.released }
    });
    return { success: true, orderId, status: "cancelled", reused: false };
  }, { isolationLevel: "Serializable" }));
}

// features/keystone/mutations/reconcileCheckoutAttempts.ts
init_access();
init_storeScope();
init_paymentProviderAdapter();
function isSettled(status) {
  return ["succeeded", "captured", "requires_capture", "authorized"].includes(status);
}
async function checkoutRecoveryPaymentState(context, lease, provider, retrieve = getPaymentStatus) {
  const session = await context.prisma.paymentSession.findUnique({ where: { id: lease.paymentSessionId } });
  const noCharge = noChargeCheckoutState(session);
  if (noCharge && (lease.amountCents !== 0 || lease.providerPaymentId !== session?.data?.paymentIntentId)) {
    throw new Error("No-charge recovery does not match its immutable attempt");
  }
  return noCharge || retrieve({ provider, paymentId: lease.providerPaymentId });
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
    const paymentStatus = await checkoutRecoveryPaymentState(context, lease, provider);
    if (!isSettled(String(paymentStatus?.status || ""))) {
      await context.transaction(async (transactionContext) => releaseCheckoutAttemptLease(
        transactionContext.prisma,
        lease,
        "pending"
      ));
      continue;
    }
    const amountCents = Number(paymentStatus?.amountCents ?? paymentStatus?.amount ?? lease.amountCents);
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
init_refundAllocations();
var import_node_crypto24 = require("node:crypto");
init_access();
init_groceryOutbox();
init_storeScope();
init_paymentProviderAdapter();
init_serializableTransaction();
init_refundRecovery();
var REFUND_RECONCILIATION_LEASE_MS = 3e4;
var REFUND_RECONCILIATION_MAX_ATTEMPTS = 5;
var DEFAULT_PROVIDER_TIMEOUT_MS = 1e4;
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
async function claimNextRefund(context, owner, storeId, currencyCode) {
  const token = (0, import_node_crypto24.randomUUID)();
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
       r."providerPaymentId", r."providerRefundId", r."requestedAt", r."amountCents", r."idempotencyKey", r."reconciliationAttempts" AS "attempts",
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
    providerRefundId: row.providerRefundId || null,
    requestedAt: row.requestedAt,
    currencyCode,
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
  const normalized = normalizeProviderRefund(response, claim);
  const status = normalized.status;
  const providerRefundId = normalized.id;
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentRefund" WHERE "id" = $1 FOR UPDATE', claim.id);
    const refund = await tx.paymentRefund.findUnique({ where: { id: claim.id } });
    if (!refund || refund.status !== "processing" || refund.reconciliationOwner !== claim.owner || refund.reconciliationToken !== claim.token) return "fenced";
    if (status === "processing") {
      const deadLetter = claim.attempts >= REFUND_RECONCILIATION_MAX_ATTEMPTS;
      await tx.paymentRefund.update({ where: { id: claim.id }, data: { providerRefundId, providerData: refundProviderData(refund.providerData, normalized.resource), reconciliationOwner: null, reconciliationToken: null, reconciliationLeaseExpiresAt: null, reconciliationNextAttemptAt: deadLetter ? null : new Date(Date.now() + retryDelayMs(claim.attempts)), reconciliationDeadLetterAt: deadLetter ? /* @__PURE__ */ new Date() : null, reconciliationLastError: "Provider still reports processing", providerStatus: normalized.rawStatus, failureMessage: deadLetter ? "Refund processing requires operator reconciliation after retry limit" : "" } });
      await reconcileOrderLineRefundRows(tx, await tx.paymentRefund.findUnique({ where: { id: claim.id } }));
      return deadLetter ? "dead_letter" : "retry";
    }
    await tx.paymentRefund.update({
      where: { id: claim.id },
      data: {
        status,
        providerRefundId,
        providerStatus: String(response?.status || status).toLowerCase(),
        providerData: refundProviderData(refund.providerData, normalized.resource),
        processedAt: /* @__PURE__ */ new Date(),
        failureMessage: status === "failed" ? "Provider reported refund failure" : status === "canceled" ? "Provider canceled refund" : "",
        reconciliationOwner: null,
        reconciliationToken: null,
        reconciliationLeaseExpiresAt: null,
        reconciliationNextAttemptAt: null,
        reconciliationLastError: null
      }
    });
    await reconcileOrderLineRefundRows(tx, await tx.paymentRefund.findUnique({ where: { id: claim.id } }));
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
    const claim = await claimNextRefund(context, owner, store.id, store.currencyCode.toLowerCase());
    if (!claim) break;
    if (!claim.provider.isInstalled) {
      results.push({ refundId: claim.id, status: await releaseForRetry(context, claim, "Refund provider is unavailable") });
      continue;
    }
    try {
      await context.transaction(async (transactionContext) => {
        const tx = transactionContext.prisma;
        await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', claim.paymentId);
        const current = await tx.paymentRefund.findUnique({ where: { id: claim.id } });
        if (!current || current.status !== "processing" || current.reconciliationToken !== claim.token) throw new Error("Refund worker claim was fenced");
        const payment = await tx.payment.findUnique({ where: { id: claim.paymentId }, select: { amountCents: true } });
        await assertRefundBudget(tx, claim.paymentId, Number(payment?.amountCents), claim.amountCents, claim.id, claim.idempotencyKey);
        claim.providerRefundId = current.providerRefundId || null;
      });
      assertRefundCreationWindow(claim.requestedAt, claim.providerRefundId);
      const providerTimeoutMs = Math.max(25, Number(process.env.REFUND_RECONCILIATION_PROVIDER_TIMEOUT_MS || DEFAULT_PROVIDER_TIMEOUT_MS));
      const response = await withTimeout(claim.providerRefundId ? getRefundStatus({ provider: claim.provider, refundId: claim.providerRefundId }) : refundPayment({ provider: claim.provider, paymentId: claim.providerPaymentId, amount: claim.amountCents, idempotencyKey: claim.idempotencyKey }), providerTimeoutMs);
      results.push({ refundId: claim.id, status: await completeClaim(context, claim, response) });
    } catch (error) {
      results.push({ refundId: claim.id, status: await releaseForRetry(context, claim, error instanceof Error ? error.message : "Refund provider failed") });
    }
  }
  const webhookRecovery = await reconcileVerifiedRefundEvents(context, store.id, boundedLimit);
  return { scanned: results.length, results, webhookRecovery };
}
async function reconcilePaymentRefunds(_root, { limit = 20 }, context) {
  return runRefundReconciliationOnce(context, { limit, owner: `manual:${context.session?.itemId || "unknown"}` });
}

// features/keystone/mutations/updateSupplierMinimumOrder.ts
init_access();
init_storeScope();
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
init_access();
init_groceryOutbox();
init_storeScope();
init_serializableTransaction();
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
    const sudoContext = transactionContext.sudo();
    let lineItem = await sudoContext.query.OrderLineItem.findOne({
      where: { id: args.orderItemId },
      query: "id title order { id }"
    });
    if (!lineItem?.order?.id) throw new Error("Order line item not found");
    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE',
      lineItem.order.id
    );
    lineItem = await sudoContext.query.OrderLineItem.findOne({
      where: { id: args.orderItemId },
      query: "id title metadata order { id } fulfillment { resolution productTitle evidence }"
    });
    const order = await sudoContext.query.Order.findOne({
      where: { id: lineItem.order.id },
      query: "id status substitutionPreference store { id }"
    });
    if (!order || order.store?.id !== store.id) throw new Error("Order not found in active store");
    if (order.status !== "picking") {
      throw new Error("Substitutions can only be recorded while an order is picking");
    }
    if (order.substitutionPreference === "refund" || ["remove", "none", "refund", "no_substitutions"].includes(lineItem.metadata?.substitutionPreference)) {
      throw new Error("Customer preferences prohibit substitutions");
    }
    const actual = lineItem.fulfillment;
    if (actual?.resolution !== "substituted" || actual.productTitle !== args.substitutedProduct) {
      throw new Error("Resolve the actual replacement product and stock before recording substitution evidence");
    }
    if (args.customerApproved !== Boolean(actual.evidence?.consent)) {
      throw new Error("Approval must match the recorded customer consent evidence");
    }
    const settledPayment = await sudoContext.query.Payment.findMany({
      where: {
        order: { id: { equals: order.id } },
        status: { in: ["authorized", "succeeded", "partially_refunded"] }
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

// features/keystone/mutations/index.ts
init_managePaymentRefund();

// features/keystone/mutations/manageGroceryOutbox.ts
init_access();
init_groceryOutbox();
init_storeScope();
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
    await txContext.prisma.groceryOutboxEvent.updateMany({ where: { storeId: store.id, status: "processing", attempts: { gte: 10 }, claimedAt: { lt: new Date(Date.now() - 3e5) } }, data: { status: "failed", claimToken: "", claimedAt: null, lastError: "Delivery claim expired after ten attempts; operator replay required" } });
    const rows = await txContext.prisma.$queryRawUnsafe(
      `SELECT "id" FROM "GroceryOutboxEvent"
       WHERE ("status" = 'pending' OR ("status" = 'failed' AND "nextAttemptAt" <= NOW()) OR ("status" = 'processing' AND "claimedAt" < NOW() - INTERVAL '5 minutes')) AND "store" = $2 AND "attempts" < 10
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
      where: { id: { in: ids } },
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
      data: succeeded ? { status: "delivered", deliveredAt: /* @__PURE__ */ new Date(), claimToken: "", claimedAt: null, lastError: "" } : { status: "failed", claimToken: "", claimedAt: null, nextAttemptAt: Number(event.attempts || 0) < 10 ? new Date(Date.now() + Math.min(36e5, 3e4 * 2 ** Number(event.attempts || 0))) : null, lastError: normalizedError || "Delivery failed" }
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
      data: { status: "pending", attempts: 0, claimToken: "", claimedAt: null, deliveredAt: null }
    });
    return eventResult(updated);
  }, { isolationLevel: "ReadCommitted" });
}

// features/keystone/mutations/manageStoreCapacity.ts
init_access();
init_groceryOutbox();
init_storeScope();
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
init_access();
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
init_payment();
init_access();
init_storeScope();
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
function pageArgs(args) {
  const page = Number(args?.page ?? 1), pageSize = Number(args?.pageSize ?? 50);
  if (!Number.isInteger(page) || page < 1 || page > 1e6 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("Choose a positive page and a page size between 1 and 100");
  }
  return { page, pageSize, skip: (page - 1) * pageSize, search: args?.search?.trim().slice(0, 100) || "", status: args?.status?.trim() || "" };
}
function collectionPage(paging, counts) {
  return { page: paging.page, pageSize: paging.pageSize, collections: Object.fromEntries(Object.entries(counts).map(([key2, total]) => [key2, { total, totalPages: Math.max(1, Math.ceil(total / paging.pageSize)) }])) };
}
function searchFields(search, fields) {
  return search ? { OR: fields.map((field) => ({ [field]: { contains: search, mode: "insensitive" } })) } : {};
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
    metadata: line.metadata || null,
    product: line.product || null,
    fulfillment: line.fulfillment || null
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
  const orderWhere = { storeId: store.id, ...searchFields(pagination.search, ["email"]), ...pagination.status ? { status: pagination.status } : {} };
  const [orders, totalOrders, statuses, todaySales, thirtyDaySales, thirtyDayRefunds] = await Promise.all([
    context.prisma.order.findMany({
      where: orderWhere,
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
        lineItems: { select: { product: { select: { id: true, pricingMethod: true, unitOfMeasure: true } }, fulfillment: true, id: true, title: true, sku: true, quantity: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
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
    context.prisma.order.count({ where: orderWhere }),
    Promise.all(["pending", "picking", "packed", "out_for_delivery", "delivered", "delivery_failed", "delivery_refused", "returned"].map(async (status) => [
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
    pagination: collectionPage(pagination, { orders: totalOrders }),
    totalPages: Math.max(1, Math.ceil(totalOrders / pagination.pageSize))
  };
}
async function ordersByStatus(context, storeId, status, orderBy, pagination) {
  return context.prisma.order.findMany({
    where: { storeId, status, ...searchFields(pagination.search, ["email"]) },
    orderBy: [{ [orderBy]: orderBy === "createdAt" ? "asc" : "desc" }, { id: "asc" }],
    take: pagination.pageSize,
    skip: pagination.skip,
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
      lineItems: { select: { product: { select: { id: true, pricingMethod: true, unitOfMeasure: true } }, fulfillment: true, id: true, quantity: true, title: true, sku: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
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
async function groceryPlatformFulfillment(_root, args, context) {
  await requirePermission(context, "canManageOrders", "Fulfillment projection requires order-management permission");
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const [pending, picking, packed, counts] = await Promise.all([
    ordersByStatus(context, store.id, "pending", "createdAt", pagination),
    ordersByStatus(context, store.id, "picking", "createdAt", pagination),
    ordersByStatus(context, store.id, "packed", "updatedAt", pagination),
    Promise.all(["pending", "picking", "packed"].map((status) => context.prisma.order.count({ where: { storeId: store.id, status, ...searchFields(pagination.search, ["email"]) } })))
  ]);
  const lineIds = [...pending, ...picking, ...packed].flatMap((order) => order.lineItems.map((line) => line.id));
  const substitutions = lineIds.length ? await context.prisma.orderItemSubstitution.findMany({
    where: { lineItemId: { in: lineIds }, lineItem: { order: { storeId: store.id } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    distinct: ["orderItem"],
    take: lineIds.length,
    select: { id: true, orderItem: true, originalProduct: true, substitutedProduct: true, reason: true, customerApproved: true, approvedAt: true }
  }) : [];
  const mapOrder = (order) => ({ ...order, deliveryDate: iso(order.deliveryDate), createdAt: iso(order.createdAt), lineItems: order.lineItems.map(mapLineItem), payments: order.payments.map(mapPayment) });
  return {
    pending: pending.map(mapOrder),
    picking: picking.map(mapOrder),
    packed: packed.map(mapOrder),
    orderItemSubstitutions: substitutions.map((item) => ({ ...item, approvedAt: iso(item.approvedAt) })),
    pagination: collectionPage(pagination, { pending: counts[0], picking: counts[1], packed: counts[2] })
  };
}
async function groceryPlatformDelivery(_root, args, context) {
  await requirePermission(context, "canManageDelivery", "Delivery projection requires delivery-management permission");
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(/* @__PURE__ */ new Date(), store.timezone, -1), store.timezone);
  const routeWhere = { storeId: store.id, ...pagination.status ? { status: pagination.status } : {} };
  const readyWhere = { storeId: store.id, status: "packed", deliveryRouteId: null, metadata: { path: ["fulfillmentMethod"], equals: "delivery" }, ...searchFields(pagination.search, ["email"]) };
  const driverWhere = { storeId: store.id, role: { canManageDelivery: true }, ...searchFields(pagination.search, ["name", "email"]) };
  const slotWhere = { storeId: store.id, date: { gte: slotWindowStart } };
  const [routes, readyCandidates, drivers, slots] = await Promise.all([
    context.prisma.deliveryRoute.findMany({
      where: routeWhere,
      orderBy: [{ date: "desc" }, { id: "asc" }],
      take: pagination.pageSize,
      skip: pagination.skip,
      select: {
        id: true,
        date: true,
        timeWindow: true,
        status: true,
        stops: true,
        startedAt: true,
        completedAt: true,
        driver: { select: { id: true, name: true, email: true } },
        orders: { select: { id: true, displayId: true, status: true, metadata: true } }
      }
    }),
    context.prisma.order.findMany({
      where: readyWhere,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: pagination.pageSize,
      skip: pagination.skip,
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
        lineItems: { select: { product: { select: { id: true, pricingMethod: true, unitOfMeasure: true } }, fulfillment: true, id: true, title: true, sku: true, quantity: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
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
      where: driverWhere,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: pagination.pageSize,
      skip: pagination.skip,
      select: { id: true, name: true, email: true }
    }),
    context.prisma.deliverySlot.findMany({
      where: slotWhere,
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }],
      take: pagination.pageSize,
      skip: pagination.skip,
      select: { id: true, date: true, startTime: true, endTime: true, capacity: true, currentBookings: true, isActive: true, deliveryFee: true }
    })
  ]);
  const counts = await Promise.all([context.prisma.deliveryRoute.count({ where: routeWhere }), context.prisma.order.count({ where: readyWhere }), context.prisma.user.count({ where: driverWhere }), context.prisma.deliverySlot.count({ where: slotWhere })]);
  const readyOrders = readyCandidates.filter((order) => order.metadata?.fulfillmentMethod === "delivery");
  return {
    pagination: collectionPage(pagination, { deliveryRoutes: counts[0], readyOrders: counts[1], drivers: counts[2], deliverySlots: counts[3] }),
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
async function groceryPlatformPickup(_root, args, context) {
  await requirePermission(context, "canManageDelivery", "Pickup projection requires delivery-management permission");
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(/* @__PURE__ */ new Date(), store.timezone, -1), store.timezone);
  const orderWhere = { storeId: store.id, status: "packed", metadata: { path: ["fulfillmentMethod"], equals: "pickup" }, ...searchFields(pagination.search, ["email"]) };
  const slotWhere = { storeId: store.id, date: { gte: slotWindowStart } };
  const parkingWhere = { storeId: store.id, ...searchFields(pagination.search, ["spotNumber"]) };
  const [slots, parkingSpots, orders] = await Promise.all([
    context.prisma.pickupSlot.findMany({ where: slotWhere, orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, date: true, startTime: true, endTime: true, maxOrders: true, currentOrders: true, isAvailable: true } }),
    context.prisma.parkingSpot.findMany({ where: parkingWhere, orderBy: [{ spotNumber: "asc" }, { id: "asc" }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, spotNumber: true, description: true, isAccessible: true, isAvailable: true } }),
    context.prisma.order.findMany({ where: orderWhere, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, displayId: true, email: true, status: true, metadata: true } })
  ]);
  const counts = await Promise.all([context.prisma.pickupSlot.count({ where: slotWhere }), context.prisma.parkingSpot.count({ where: parkingWhere }), context.prisma.order.count({ where: orderWhere })]);
  const pickupOrders = orders.filter((order) => order.metadata?.fulfillmentMethod === "pickup");
  return {
    pagination: collectionPage(pagination, { pickupSlots: counts[0], parkingSpots: counts[1], pickupOrders: counts[2] }),
    pickupSlots: slots.map((slot) => ({ ...slot, date: iso(slot.date), currentOrders: slot.currentOrders || 0 })),
    parkingSpots,
    pickupOrders
  };
}
async function groceryPlatformInventory(_root, args, context) {
  await requirePermission(context, "canManageInventory", "Inventory projection requires inventory-management permission");
  const store = await requireSessionStore(context), pagination = pageArgs(args), now = /* @__PURE__ */ new Date();
  const productWhere = { storeId: store.id, ...searchFields(pagination.search, ["title", "sku"]) };
  const lotWhere = { storeId: store.id, ...searchFields(pagination.search, ["lotNumber"]), ...pagination.status ? { safetyStatus: pagination.status } : {} };
  const prisma = context.prisma;
  const [products, inventoryLots, productCount, lotCount] = await Promise.all([
    prisma.product.findMany({ where: productWhere, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, title: true, sku: true, stockQuantity: true, lowStockThreshold: true, department: true, supplier: { select: { id: true, name: true } }, _count: { select: { backInStockAlerts: { where: { isActive: true } } } } } }),
    prisma.inventoryLot.findMany({ where: lotWhere, orderBy: [{ expirationDate: "asc" }, { id: "asc" }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, lotNumber: true, expirationDate: true, quantity: true, quantityRemaining: true, safetyStatus: true, conditionStatus: true, location: true, productId: true, product: { select: { id: true, title: true } }, supplier: { select: { id: true, name: true } } } }),
    prisma.product.count({ where: productWhere }),
    prisma.inventoryLot.count({ where: lotWhere })
  ]);
  const balances = products.length ? await prisma.inventoryLot.groupBy({
    by: ["productId"],
    where: {
      storeId: store.id,
      productId: { in: products.map((product) => product.id) },
      expirationDate: { gt: now },
      quantityRemaining: { gt: 0 },
      AND: [{ OR: [{ safetyStatus: "available" }, { safetyStatus: null }] }, { OR: [{ conditionStatus: "accepted" }, { conditionStatus: null }] }]
    },
    _sum: { quantityRemaining: true }
  }) : [];
  const sellableByProduct = new Map(balances.map((row) => [row.productId, Number(row._sum.quantityRemaining || 0)]));
  return {
    products: products.map(({ _count, stockQuantity, ...product }) => {
      const sellableQuantity = Number(sellableByProduct.get(product.id) || 0);
      return { ...product, stockQuantity: sellableQuantity, recordedStockQuantity: Number(stockQuantity || 0), inStock: sellableQuantity > 0, activeBackInStockAlerts: _count.backInStockAlerts };
    }),
    inventoryLots: inventoryLots.map(({ productId: _productId, ...lot }) => ({
      ...lot,
      quantity: Number(lot.quantity),
      quantityRemaining: Number(lot.quantityRemaining),
      expirationDate: iso(lot.expirationDate),
      isExpired: lot.expirationDate.getTime() <= now.getTime(),
      isExpiringSoon: lot.expirationDate.getTime() > now.getTime() && lot.expirationDate.getTime() <= now.getTime() + 7 * 864e5
    })),
    pagination: collectionPage(pagination, { products: productCount, inventoryLots: lotCount })
  };
}
async function groceryPlatformSuppliers(_root, args, context) {
  await requirePermission(context, "canManageSuppliers", "Suppliers projection requires supplier-management permission");
  const store = await requireSessionStore(context), pagination = pageArgs(args);
  const where = { storeId: store.id, ...searchFields(pagination.search, ["name", "email"]) };
  const [suppliers, total] = await Promise.all([
    context.prisma.supplier.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: pagination.pageSize,
      skip: pagination.skip,
      select: {
        id: true,
        name: true,
        contactName: true,
        email: true,
        phone: true,
        paymentTerms: true,
        deliveryDays: true,
        minimumOrder: true,
        minimumOrderCents: true,
        _count: { select: { products: true, purchaseOrders: true } }
      }
    }),
    context.prisma.supplier.count({ where })
  ]);
  const openOrders = await context.prisma.purchaseOrder.groupBy({ by: ["supplierId"], where: { storeId: store.id, supplierId: { in: suppliers.map((supplier) => supplier.id) }, status: { in: ["draft", "sent", "confirmed"] } }, _count: { _all: true } });
  const openCounts = new Map(openOrders.map((row) => [row.supplierId, row._count._all]));
  return {
    currencyCode: store.currencyCode,
    suppliers: suppliers.map(({ _count, ...supplier }) => ({ ...supplier, products: [], purchaseOrders: [], openPurchaseOrderCount: openCounts.get(supplier.id) || 0, productCount: _count.products, purchaseOrderCount: _count.purchaseOrders })),
    pagination: collectionPage(pagination, { suppliers: total })
  };
}
async function groceryPlatformPurchasing(_root, args, context) {
  await requirePermission(context, "canManageInventory", "Purchasing projection requires inventory-management permission");
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const dueSoonBoundary = new Date(Date.now() + 3 * 864e5);
  const where = { storeId: store.id, ...searchFields(pagination.search, ["poNumber"]), ...pagination.status ? { status: pagination.status } : {} };
  const total = await context.prisma.purchaseOrder.count({ where });
  const purchaseOrders = await context.prisma.purchaseOrder.findMany({
    where,
    orderBy: [{ orderDate: "desc" }, { id: "asc" }],
    take: pagination.pageSize,
    skip: pagination.skip,
    select: { id: true, poNumber: true, orderDate: true, expectedDeliveryDate: true, status: true, totalAmount: true, totalAmountCents: true, notes: true, supplier: { select: { id: true, name: true } }, items: { select: { id: true, productTitle: true, productSku: true, quantity: true, quantityReceived: true, unitCost: true, unitCostCents: true } } }
  });
  return { currencyCode: store.currencyCode, pagination: collectionPage(pagination, { purchaseOrders: total }), purchaseOrders: purchaseOrders.map((order) => ({ ...order, orderDate: iso(order.orderDate), expectedDeliveryDate: iso(order.expectedDeliveryDate), isDueSoon: Boolean(order.expectedDeliveryDate && order.expectedDeliveryDate <= dueSoonBoundary), totalAmount: Number(order.totalAmountCents || Math.round(Number(order.totalAmount || 0) * 100)) / 100, totalAmountCents: order.totalAmountCents, items: order.items.map((item) => ({ ...item, unitCost: Number(item.unitCostCents || Math.round(Number(item.unitCost || 0) * 100)) / 100, unitCostCents: item.unitCostCents })) })) };
}
async function groceryPlatformMerchandising(_root, args, context) {
  await requirePermission(context, "canManageProducts", "Merchandising projection requires product-management permission");
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const departmentWhere = { storeId: store.id, ...searchFields(pagination.search, ["name", "handle"]) };
  const couponWhere = { storeId: store.id, ...searchFields(pagination.search, ["code"]) };
  const [departments, coupons] = await Promise.all([
    context.prisma.department.findMany({ where: departmentWhere, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, name: true, handle: true, sortOrder: true, isActive: true, temperatureZone: true, _count: { select: { products: true } } } }),
    context.prisma.coupon.findMany({ where: couponWhere, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, code: true, discountType: true, discountValue: true, discountValueCents: true, minPurchase: true, minPurchaseCents: true, maxUses: true, currentUses: true, productCategories: true, isActive: true, validFrom: true, validTo: true } })
  ]);
  const counts = await Promise.all([context.prisma.department.count({ where: departmentWhere }), context.prisma.coupon.count({ where: couponWhere })]);
  return { pagination: collectionPage(pagination, { departments: counts[0], coupons: counts[1] }), currencyCode: store.currencyCode, departments: departments.map(({ _count, ...department }) => ({ ...department, products: [], productCount: _count.products })), coupons: coupons.map((coupon) => ({ ...coupon, discountValue: number(coupon.discountValue), minPurchase: number(coupon.minPurchase), validFrom: iso(coupon.validFrom), validTo: iso(coupon.validTo) })) };
}
async function groceryPlatformCustomers(_root, args, context) {
  await requirePermission(context, "canManageUsers", "Customers projection requires user-management permission");
  const store = await requireSessionStore(context), pagination = pageArgs(args);
  const where = { storeId: store.id, roleId: null, ...searchFields(pagination.search, ["name", "email"]) };
  const [users, totalCustomers, savedCarts] = await Promise.all([
    context.prisma.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, name: true, email: true, onboardingStatus: true, createdAt: true } }),
    context.prisma.user.count({ where }),
    context.prisma.cart.count({ where: { storeId: store.id, itemCount: { gt: 0 } } })
  ]);
  const ids = users.map((user) => user.id);
  const [orderStats, shoppingListStats, latestOrders] = await Promise.all([
    context.prisma.order.groupBy({ by: ["userId"], where: { storeId: store.id, userId: { in: ids } }, _count: { _all: true } }),
    context.prisma.shoppingList.groupBy({ by: ["userId"], where: { userId: { in: ids }, user: { storeId: store.id } }, _count: { _all: true } }),
    context.prisma.order.findMany({
      where: { storeId: store.id, userId: { in: ids } },
      distinct: ["userId"],
      take: pagination.pageSize,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { userId: true, displayId: true, status: true, createdAt: true }
    })
  ]);
  const orderCounts = new Map(orderStats.map((row) => [row.userId, row._count._all]));
  const listCounts = new Map(shoppingListStats.map((row) => [row.userId, row._count._all]));
  const lastOrders = new Map(latestOrders.map((row) => [row.userId, row]));
  return { users: users.map((user) => {
    const last = lastOrders.get(user.id);
    return {
      ...user,
      createdAt: iso(user.createdAt),
      orderCount: orderCounts.get(user.id) || 0,
      shoppingListCount: listCounts.get(user.id) || 0,
      lastOrder: last ? { displayId: last.displayId, status: last.status, createdAt: iso(last.createdAt) } : null
    };
  }), totalCustomers, savedCarts, pagination: collectionPage(pagination, { users: totalCustomers }) };
}
async function groceryPlatformPayments(_root, args, context) {
  await requirePermission(context, "canManagePayments", "Payments projection requires payment-management permission");
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const paymentWhere = { storeId: store.id, ...searchFields(pagination.search, ["providerPaymentId"]), ...pagination.status ? { status: pagination.status } : {} };
  const supportedCodes = Object.keys(paymentProviderDefinitions);
  const [payments, providers, paymentCount, failedCount, processingCount, captured2, refunded, recoveryCounts] = await Promise.all([
    context.prisma.payment.findMany({
      where: paymentWhere,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: pagination.pageSize,
      skip: pagination.skip,
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
  const filteredCount = await context.prisma.payment.count({ where: paymentWhere });
  return {
    pagination: collectionPage(pagination, { payments: filteredCount }),
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
      capturedCents: captured2._sum.amountCents || 0,
      refundedCents: refunded._sum.amountCents || 0,
      netCents: (captured2._sum.amountCents || 0) - (refunded._sum.amountCents || 0),
      recovery: Object.fromEntries(recoveryCounts.map((row) => [row.status, row._count._all]))
    }
  };
}
async function groceryPlatformSettings(_root, args, context) {
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
        deliveryPolicy: true,
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
        stockQuantity: Float
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
        stockQuantity: Float
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
        nutrition: JSON
        variantLabel: String
        variantOf: JSON
        packBaseUnitsMilli: Int
        informationSource: String
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
        stockQuantity: Float!
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
        quantityDelta: Float!
        quantityRemaining: Float!
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
        receiptKey: String
        deliveryReference: String
        conditionStatus: String
        inspectionNote: String
        poItemId: ID!
        targetQuantityReceived: Float!
        lotNumber: String!
        expirationDate: String!
        location: String
      }

      type PurchaseOrderWorkflowResult {
        success: Boolean!
        purchaseOrderId: ID!
        status: String!
        receivedUnits: Float!
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
        product: JSON
        fulfillment: JSON
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

      type GroceryPlatformFulfillmentProjection { pagination: JSON!
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
        stops: JSON
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

      type GroceryPlatformDeliveryProjection { pagination: JSON!
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

      type GroceryPlatformPickupProjection { pagination: JSON!
        pickupSlots: [GroceryPlatformPickupSlot!]!
        parkingSpots: [GroceryPlatformParkingSpot!]!
        pickupOrders: [GroceryPlatformPickupOrder!]!
      }

      type GroceryPlatformInventoryProduct {
        id: ID!
        title: String!
        sku: String!
        stockQuantity: Float
        recordedStockQuantity: Float!
        lowStockThreshold: Int
        inStock: Boolean!
        activeBackInStockAlerts: Int!
        department: String
        supplier: GroceryPlatformSupplier
      }

      type GroceryPlatformInventoryLot {
        safetyStatus: String
        conditionStatus: String
        id: ID!
        lotNumber: String!
        expirationDate: String!
        quantity: Float!
        quantityRemaining: Float!
        location: String
        isExpired: Boolean!
        isExpiringSoon: Boolean!
        product: GroceryPlatformInventoryProductRef
        supplier: GroceryPlatformSupplier
      }

      type GroceryPlatformInventoryProductRef { id: ID!, title: String! }
      type GroceryPlatformSupplier { id: ID!, name: String! }
      type GroceryPlatformInventoryProjection { pagination: JSON!
        products: [GroceryPlatformInventoryProduct!]!
        inventoryLots: [GroceryPlatformInventoryLot!]!
      }

      type GroceryPlatformSupplierRow {
        productCount: Int!
        purchaseOrderCount: Int!
        openPurchaseOrderCount: Int!
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
      type GroceryPlatformSuppliersProjection { pagination: JSON!  currencyCode: String!, suppliers: [GroceryPlatformSupplierRow!]! }

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
      type GroceryPlatformPurchaseItem { id: ID!, productTitle: String!, productSku: String!, quantity: Float!, quantityReceived: Float!, unitCost: Float!, unitCostCents: Int! }
      type GroceryPlatformPurchasingProjection { pagination: JSON!  currencyCode: String!, purchaseOrders: [GroceryPlatformPurchaseOrder!]! }

      type GroceryPlatformDepartment {
        productCount: Int!
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
      type GroceryPlatformMerchandisingProjection { pagination: JSON!
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
      type GroceryPlatformCustomersProjection { pagination: JSON!
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
      type GroceryPlatformPaymentsProjection { pagination: JSON!
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
        deliveryPolicy: JSON
        isActive: Boolean!
      }
      type GroceryPlatformSettingsCounts { products: Int!, suppliers: Int!, deliverySlots: Int!, pickupSlots: Int!, parkingSpots: Int! }
      type GroceryPlatformSettingsProjection { store: GroceryPlatformStoreTruth!, settings: GroceryPlatformSettingsTruth!, counts: GroceryPlatformSettingsCounts! }

      type Query {
        groceryDeliveryRescheduleSlots(orderId: ID!): JSON!
        groceryRecurringOverview(page: Int, customerOnly: Boolean): JSON!
        groceryPaymentWebhookRecovery(page: Int): JSON!
        groceryCustomerPrivacy(page: Int, pageSize: Int): JSON!
        groceryStaffDirectory(page: Int, pageSize: Int): JSON!
        getGroceryOrderRefundLines(orderId: ID!): JSON!
        getGroceryLoyalty: JSON!
        groceryFinancialCloseExport(closeId: ID!): JSON!
        groceryFinancialCloses(page: Int, pageSize: Int): JSON!
        groceryPlatformOrders(page: Int, pageSize: Int): GroceryPlatformOrdersProjection!
        groceryPlatformFulfillment(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformFulfillmentProjection!
        groceryPlatformDelivery(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformDeliveryProjection!
        groceryPlatformPickup(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformPickupProjection!
        groceryPlatformInventory(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformInventoryProjection!
        groceryPlatformSuppliers(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformSuppliersProjection!
        groceryPlatformPurchasing(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformPurchasingProjection!
        groceryPlatformMerchandising(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformMerchandisingProjection!
        groceryPlatformCustomers(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformCustomersProjection!
        groceryPlatformPayments(page: Int, pageSize: Int, search: String, status: String): GroceryPlatformPaymentsProjection!
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

      type GroceryVoidResult { success: Boolean!, paymentId: ID!, status: String!, reused: Boolean! }
      type GroceryLineRefundResult { success: Boolean!, status: String!, paymentRefundId: ID, amountCents: Int!, allocations: JSON!, reused: Boolean!, message: String! }
      type GroceryLoyaltyConfigurationResult { success: Boolean!, programId: ID! }
      type GroceryLoyaltyRedemptionResult { success: Boolean!, redemptionId: ID!, couponCode: String!, points: Int!, discountCents: Int!, balance: Int!, reused: Boolean! }
      type GrocerySubscriptionResult { success: Boolean!, subscriptionId: ID!, status: String!, runId: ID, reused: Boolean! }
      type GrocerySubscriptionProcessingResult { processed: Int!, results: JSON! }
      type GroceryFulfillmentActualResult { success: Boolean! fulfillmentId: ID! lineItemId: ID! resolution: String! quantityMilli: Int! subtotalCents: Int! reused: Boolean! }

      type Mutation {
        recoverGroceryPaymentCreation(paymentSessionId: ID!, providerPaymentId: String!, reason: String!): JSON!
        convertInventoryCases(mode: String!, sourceInventoryLotId: ID!, quantityCases: Int!, reason: String!, conditionNote: String!, destinationLocation: String, idempotencyKey: String!, expectedReviewHash: String): JSON!
        rescheduleReturnedGroceryDelivery(orderId: ID!, deliverySlotId: ID!, customerApproval: String!, conditionEvidence: String!, idempotencyKey: String!): JSON!
        importGroceryCatalog(mode: String!, schemaVersion: Int!, sourceSystem: String!, sourceBatchId: String!, idempotencyKey: String!, csv: String!, expectedPayloadHash: String, expectedReviewHash: String): JSON!
        replayPaymentWebhookEvent(eventId: ID!, reason: String!): JSON!
        exportGroceryCustomerData(requestId: ID!, afterOrderId: ID, collection: String, afterId: ID): JSON!
        reviewGroceryCustomerErasure(requestId: ID!, approve: Boolean!, reason: String!): JSON!
        requestGroceryCustomerPrivacy(kind: String!): JSON!
        revokeGroceryStaffInvitation(invitationId: ID!, reason: String!): JSON!
        updateGroceryStaffAccess(userId: ID!, capabilities: JSON!, reason: String!): JSON!
        acceptGroceryStaffInvitation(token: String!, password: String!): JSON!
        inviteGroceryStaff(name: String!, email: String!, capabilities: JSON!): JSON!
        voidGroceryPaymentAuthorization(paymentId: ID!, reason: String!, idempotencyKey: String!): GroceryVoidResult!
        refundGroceryOrderLines(orderId: ID!, paymentId: ID!, idempotencyKey: String!, reason: String!, lines: JSON!): GroceryLineRefundResult!
        updateGroceryNotificationPreferences(orderUpdates: Boolean!, deliveryAlerts: Boolean!, backInStock: Boolean!): Boolean!
        processDueGrocerySubscriptions(limit: Int): GrocerySubscriptionProcessingResult!
        manageGrocerySubscription(action: String!, subscriptionId: ID, productId: ID, quantity: Int, frequency: String, firstRunAt: String, pausedUntil: String, idempotencyKey: String!, approveEachOrder: Boolean): GrocerySubscriptionResult!
        redeemGroceryLoyalty(points: Int!, idempotencyKey: String!): GroceryLoyaltyRedemptionResult!
        configureGroceryLoyalty(name: String!, earnPointsPer100Cents: Int!, redeemPointsPer100Cents: Int!, minimumRedemptionPoints: Int!, isActive: Boolean!): GroceryLoyaltyConfigurationResult!
        resolveGrocerySettlementMatch(matchId: ID!, reason: String!, idempotencyKey: String!): JSON!
        importGrocerySettlementStatement(providerCode: String!, statementReference: String!, csv: String!, idempotencyKey: String!): JSON!
        createGroceryFinancialClose(startDate: String!, endDate: String!, timezone: String!, idempotencyKey: String!, note: String): JSON!
        manageSupplierSettlement(action: String!, idempotencyKey: String!, invoiceId: ID, creditId: ID, input: JSON!): JSON!
        resolveDeliveryStop(routeId: ID!, orderId: ID!, status: String!, recipient: String, proofReference: String, reason: String, custody: String!, conditionEvidence: String!, retryAt: String, idempotencyKey: String!, approvalEvidence: String): JSON!
        updateProductInformation(productId: ID!, input: JSON!, idempotencyKey: String!): JSON!
        authorizeOrderAdjustment(orderId: ID!, sessionId: String, token: String): JSON!
        requestGuestOrderAccess(orderId: ID!, email: String!): Boolean!
        resumeGroceryCheckout(paymentSessionId: ID!, sessionId: String): SubmitGroceryOrderResult!
        updateGroceryDeliveryPolicy(policy: JSON!): JSON!
        manageInventoryCount(action: String!, inventoryLotId: ID, countId: ID, quantity: Float, reason: String!, idempotencyKey: String!): JSON!
        manageInventorySafety(action: String!, inventoryLotIds: [ID!], productId: ID, recallId: ID, reason: String!, idempotencyKey: String!, evidence: JSON): JSON!
        finalizeGroceryOrderActuals(orderId: ID!): JSON!
        resolveOrderLineFulfillment(orderId: ID!, lineItemId: ID!, resolution: String!, productId: ID, quantity: String!, tare: String, unitOfMeasure: String!, reason: String, consentChannel: String, consentCustomer: String, consentEvidence: String, idempotencyKey: String!): GroceryFulfillmentActualResult!
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
        cancelGroceryOrder(orderId: ID!, reason: String!, idempotencyKey: String!, disposition: String, conditionNote: String): OrderCancellationResult!
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
        adjustInventoryLot(inventoryLotId: ID!, targetQuantityRemaining: Float!, reason: String!, idempotencyKey: String!, note: String): InventoryAdjustmentResult!
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
        groceryDeliveryRescheduleSlots,
        groceryRecurringOverview,
        groceryPaymentWebhookRecovery,
        groceryCustomerPrivacy,
        groceryStaffDirectory,
        getGroceryOrderRefundLines,
        getGroceryLoyalty,
        groceryFinancialCloseExport,
        groceryFinancialCloses,
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
        recoverGroceryPaymentCreation,
        convertInventoryCases,
        rescheduleReturnedGroceryDelivery,
        importGroceryCatalog,
        replayPaymentWebhookEvent,
        exportGroceryCustomerData,
        reviewGroceryCustomerErasure,
        requestGroceryCustomerPrivacy,
        revokeGroceryStaffInvitation,
        updateGroceryStaffAccess,
        acceptGroceryStaffInvitation,
        inviteGroceryStaff,
        voidGroceryPaymentAuthorization,
        refundGroceryOrderLines,
        updateGroceryNotificationPreferences,
        processDueGrocerySubscriptions,
        manageGrocerySubscription,
        redeemGroceryLoyalty,
        configureGroceryLoyalty,
        resolveGrocerySettlementMatch,
        importGrocerySettlementStatement,
        createGroceryFinancialClose,
        manageSupplierSettlement,
        resolveDeliveryStop,
        updateProductInformation,
        authorizeOrderAdjustment,
        requestGuestOrderAccess,
        resumeGroceryCheckout,
        updateGroceryDeliveryPolicy,
        manageInventoryCount,
        manageInventorySafety,
        finalizeGroceryOrderActuals,
        resolveOrderLineFulfillment,
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
var import_node_crypto25 = require("node:crypto");
function normalizeIp(ip) {
  const trimmed = ip.trim();
  return trimmed.startsWith("::ffff:") ? trimmed.slice("::ffff:".length) : trimmed;
}
function verifyProxyIdentity(value, secret2, nowSeconds = Math.floor(Date.now() / 1e3)) {
  const parts = value.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) return null;
  const expected = (0, import_node_crypto25.createHmac)("sha256", secret2).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (parts[2].length !== expected.length || !(0, import_node_crypto25.timingSafeEqual)(Buffer.from(parts[2]), Buffer.from(expected))) return null;
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
  const identity2 = headers?.get("x-grocery-proxy-identity")?.trim() || "";
  const secret2 = process.env.TRUSTED_PROXY_IDENTITY_SECRET?.trim() || "";
  return verifyProxyIdentity(identity2, secret2)?.ip || "unverified-proxy";
}

// features/keystone/lib/graphqlRateLimit.ts
var import_node_crypto26 = require("node:crypto");
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
  identity: identity2,
  query
}) {
  if (query.length > MAX_GRAPHQL_QUERY_LENGTH) throw new import_graphql3.GraphQLError("GraphQL request is too large", { extensions: { code: "QUERY_TOO_LARGE" } });
  if (!prisma) throw new import_graphql3.GraphQLError("Rate limiter unavailable", { extensions: { code: "RATE_LIMITER_UNAVAILABLE" } });
  const ip = requestIp(headers);
  const operationClass = isDangerousAuthOperation(query) ? "auth" : isGraphqlMutation(query) ? "mutation" : "query";
  const limit = operationClass === "auth" ? AUTH_LIMIT : operationClass === "mutation" ? identity2 ? AUTHENTICATED_MUTATION_LIMIT : ANONYMOUS_MUTATION_LIMIT : identity2 ? AUTHENTICATED_QUERY_LIMIT : ANONYMOUS_QUERY_LIMIT;
  const key2 = (0, import_node_crypto26.createHash)("sha256").update(`${ip}:${identity2 || "anonymous"}:${operationClass}`).digest("hex");
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
  (0, import_core65.config)({
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
