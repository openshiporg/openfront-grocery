import { priceCommercialLines } from '../lib/commercialPricing';
import type { Context } from '.keystone/types';

import { lockCurrentCustomer, publicStore, requireSessionStore } from '../lib/storeScope';
import { requireStoreProduct, assertProductStore } from '../lib/catalogAccess';
import { assertSellableQuantity, deriveSellableQuantity } from '../lib/sellableInventory';
import { getStoreTaxRateBps } from '../lib/storeMoney';
import { publicError } from '../lib/publicError';
import { exactWholeConversion, normalizeMeasureUnit } from '../lib/fulfillmentActuals';
import { randomUUID } from 'node:crypto';

const DELIVERY_FEE = 0;

// Browser guest identities are opaque `guest_<uuid>` tokens. Server-owned cart
// namespaces (`user:`, `merged:`, `expired:`) contain a colon and are never a
// guest identity, so a known customer ID cannot be used to address their basket.
const GUEST_SESSION_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function requireGuestSessionId(sessionId?: string) {
  const trimmed = sessionId?.trim();

  if (!trimmed) {
    throw new Error('No session ID provided for guest cart');
  }
  if (!GUEST_SESSION_PATTERN.test(trimmed)) {
    throw publicError('This basket session is not valid. Refresh the page to start a new basket.');
  }

  return trimmed;
}

function assertCartAccess(cart: any, context: Context, sessionId?: string, options: { allowExpired?: boolean } = {}) {
  if (!cart) {
    throw new Error('Cart not found');
  }

  if (context.session?.itemId) {
    if (cart.customer?.id !== context.session.itemId) {
      throw new Error('You do not have access to this cart');
    }
    return;
  }

  const guestSessionId = requireGuestSessionId(sessionId);
  if (cart.customer?.id || cart.sessionId !== guestSessionId) {
    throw new Error('You do not have access to this cart');
  }
  // Guest baskets last seven days. Only the identity path may renew an expired
  // basket (it empties it first); item changes against it are refused.
  if (!options.allowExpired && cart.expiresAt && new Date(cart.expiresAt).getTime() <= Date.now()) {
    throw publicError('Your basket session expired. Refresh the page to start a new basket.');
  }
}

const MAX_CART_PRODUCTS = 200;


// Product prices are authoritative in integer cents; a published price of zero is a real price.
function productPriceCents(product: any) {
  const cents = product?.priceCents;
  if (cents !== null && cents !== undefined && Number.isFinite(Number(cents))) return Math.round(Number(cents));
  return Math.round(Number(product?.price || 0) * 100);
}

const CART_QUERY = `
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

// Cart identity creation is serialized across web replicas. Expired guest
// identities are detached from historical evidence before a fresh cart is made.
async function getOrCreateCart(context: Context, sessionId?: string): Promise<any> {
  const store = context.session?.itemId ? await requireSessionStore(context) : await publicStore(context);
  const ownerId = context.session?.itemId || null;
  const guestSessionId = ownerId ? null : requireGuestSessionId(sessionId);
  const identity = ownerId ? `user:${ownerId}` : `guest:${guestSessionId}`;

  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-cart-identity'), hashtext($1))",
      identity,
    );
    // An erased or deactivated account cannot get a new basket through a stale cookie.
    if (ownerId) await lockCurrentCustomer(transactionContext);
    const sudoContext = transactionContext.sudo();
    const carts = await sudoContext.query.Cart.findMany({
      where: ownerId
        ? { customer: { id: { equals: ownerId } } }
        : { sessionId: { equals: guestSessionId as string } },
      take: 2,
      query: CART_QUERY,
    });
    if (carts.length > 1) throw new Error('Cart identity is ambiguous');
    const existing = carts[0] || null;
    if (existing) {
      // Ownership is proven before the cart is returned, expired or emptied:
      // a guest identity can only ever reach a customer-less guest cart.
      assertCartAccess(existing, transactionContext, guestSessionId || undefined, { allowExpired: true });
      if (existing.store?.id !== store.id) throw new Error('Cart belongs to another Store');
      const expired = !ownerId && existing.expiresAt && new Date(existing.expiresAt).getTime() <= Date.now();
      if (!expired) return existing;
      await transactionContext.prisma.cartItem.deleteMany({ where: { cartId: existing.id } });
      await transactionContext.prisma.cart.update({ where: { id: existing.id }, data: { sessionId: `expired:${existing.id}:${Date.now()}`, itemCount: 0, subtotal: 0, subtotalCents: 0 } });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return sudoContext.query.Cart.createOne({
      data: {
        store: { connect: { id: store.id } },
        ...(ownerId ? { customer: { connect: { id: ownerId } }, sessionId: `user:${ownerId}` } : { sessionId: guestSessionId, expiresAt: expiresAt.toISOString() }),
        itemCount: 0,
        subtotal: 0,
        subtotalCents: 0,
      },
      query: CART_QUERY,
    });
  });
}

async function withLockedCart<T>(context: Context, cartId: string, operation: (transactionContext: Context, cart: any) => Promise<T>) {
  return context.transaction(async (transactionContext) => {
    // A signed-in shopper's account state (erasure, active Store membership) is
    // re-checked under its row lock, taken before the cart lock like erasure does.
    const actorStore = transactionContext.session?.itemId ? await lockCurrentCustomer(transactionContext) : null;
    await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', cartId);
    const cart = await transactionContext.sudo().query.Cart.findOne({ where: { id: cartId }, query: CART_QUERY });
    if (!cart) throw new Error('Cart not found');
    if (actorStore && cart.store?.id !== actorStore.id) throw new Error('You do not have access to this cart');
    return operation(transactionContext, cart);
  });
}

// Helper to recalculate cart totals
async function recalculateCart(context: Context, cartId: string) {
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
    `,
  });

  if (!cart) {
    throw new Error('Cart not found');
  }

  let subtotalCents = 0;
  let itemCount = 0;

  for (const item of cart.items) {
    const itemSubtotalCents = productPriceCents(item.product) * item.quantity;
    subtotalCents += itemSubtotalCents;
    itemCount += item.quantity;
    const itemSubtotal = itemSubtotalCents / 100;

    // Update item subtotal
    await sudoContext.query.CartItem.updateOne({
      where: { id: item.id },
      data: { subtotal: itemSubtotal, subtotalCents: itemSubtotalCents },
    });
  }

  // Update cart totals
  await sudoContext.query.Cart.updateOne({
    where: { id: cartId },
    data: {
      subtotal: subtotalCents / 100,
      subtotalCents,
      itemCount,
    },
  });

  return { subtotal: subtotalCents / 100, subtotalCents, itemCount };
}

// Format cart response
// Every amount in the response comes from one pricing snapshot: current product
// cents x quantity. The stored cart cache is never mixed with live prices.
async function formatCartResponse(cart: any, context: Context) {
  const lines = cart.items.map((item: any) => ({ item, subtotalCents: productPriceCents(item.product) * item.quantity }));
  const subtotalCents = lines.reduce((sum: number, line: any) => sum + line.subtotalCents, 0);
  const subtotal = subtotalCents / 100;
  const taxRateBps = await getStoreTaxRateBps(context, cart.store?.id);
  const taxCents = priceCommercialLines(lines.map((line: any) => ({ id: line.item.id, subtotalCents: line.subtotalCents, taxRateBasisPoints: line.item.product?.taxRateBasisPoints ?? taxRateBps }))).taxCents;
  const tax = taxCents / 100;
  const total = (subtotalCents + taxCents) / 100 + DELIVERY_FEE;

  return {
    id: cart.id,
    items: lines.map(({ item, subtotalCents: lineCents }: any) => {
      const sellableQuantity = item.product
        ? deriveSellableQuantity(item.product, cart.store?.id)
        : 0;
      return {
        id: item.id,
        quantity: item.quantity,
        subtotal: lineCents / 100,
        substitutionPreference: item.substitutionPreference,
        product: {
          id: item.product?.id,
          name: item.product?.title,
          handle: item.product?.handle,
          price: item.product?.price,
          unitPrice: item.product?.price,
          unit: item.product?.unitOfMeasure,
          imageUrl: item.product?.imageUrl,
          inStock: item.product?.status === 'published' && sellableQuantity >= item.quantity,
          stockQuantity: sellableQuantity,
        },
      };
    }),
    subtotal,
    tax: Math.round(tax * 100) / 100,
    deliveryFee: DELIVERY_FEE,
    total: Math.round(total * 100) / 100,
    itemCount: cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0),
  };
}

// Get cart query resolver
export async function getCart(
  root: any,
  { sessionId }: { sessionId?: string },
  context: Context
) {
  // An anonymous visitor without a guest identity has no basket yet; reading
  // must not invent one. Every other failure propagates so the storefront can
  // show a retry instead of a misleading empty basket.
  if (!context.session?.itemId && !sessionId?.trim()) return null;
  const cart = await getOrCreateCart(context, sessionId);
  assertCartAccess(cart, context, sessionId);
  return formatCartResponse(cart, context);
}

/** Add one product inside an already locked cart (shared by single additions and batches). */
async function addProductToLockedCart(transactionContext: Context, cart: any, productId: string, quantity: number) {
  const sudoContext = transactionContext.sudo();
  const product = await requireStoreProduct(transactionContext, productId, cart.store.id, { publishedOnly: true });
  const existingItem = cart.items.find((item: any) => item.product?.id === productId);
  if (!existingItem && cart.items.length >= MAX_CART_PRODUCTS) throw publicError(`A basket can hold up to ${MAX_CART_PRODUCTS} different products.`);
  const newQuantity = (existingItem?.quantity || 0) + quantity;
  assertSellableQuantity(product, cart.store.id, newQuantity);
  const unitPriceCents = productPriceCents(product);
  if (existingItem) {
    await sudoContext.query.CartItem.updateOne({ where: { id: existingItem.id }, data: { quantity: newQuantity } });
    existingItem.quantity = newQuantity;
  } else {
    const created = await sudoContext.query.CartItem.createOne({
      data: {
        cart: { connect: { id: cart.id } },
        product: { connect: { id: productId } },
        quantity,
        subtotal: unitPriceCents * quantity / 100,
        subtotalCents: unitPriceCents * quantity,
      },
      query: 'id',
    });
    cart.items.push({ id: created.id, quantity, product: { id: productId } });
  }
}

// Add to cart mutation resolver
export async function addToCart(
  root: any,
  {
    productId,
    quantity,
    sessionId,
  }: { productId: string; quantity: number; sessionId?: string },
  context: Context
) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Cart quantity must be a positive integer');
  const identityCart = await getOrCreateCart(context, sessionId);
  return withLockedCart(context, identityCart.id, async (transactionContext, cart) => {
    assertCartAccess(cart, context, sessionId);
    await addProductToLockedCart(transactionContext, cart, productId, quantity);
    await recalculateCart(transactionContext, cart.id);
    const updated = await transactionContext.sudo().query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}

type BatchLine = { title: string; productId: string | null; quantity: number; unit?: string | null; productUnit?: string | null };

async function batchLines(transactionContext: Context, source: 'list' | 'order', sourceId: string, storeId: string): Promise<BatchLine[]> {
  const userId = transactionContext.session?.itemId;
  if (!userId) throw new Error('Must be logged in to add saved items to the basket');
  const prisma = transactionContext.prisma;
  if (source === 'list') {
    const list = await prisma.shoppingList.findUnique({ where: { id: sourceId }, select: { userId: true, items: { where: { checked: false }, orderBy: [{ addedAt: 'asc' }, { id: 'asc' }], select: { product: true, productRefId: true, quantity: true, unit: true, productRef: { select: { unitOfMeasure: true } } } } } });
    if (!list || list.userId !== userId) throw new Error('Shopping list not found');
    return list.items.map((item) => ({ title: item.product, productId: item.productRefId, quantity: item.quantity, unit: item.unit, productUnit: item.productRef?.unitOfMeasure }));
  }
  const order = await prisma.order.findUnique({ where: { id: sourceId }, select: { userId: true, storeId: true, lineItems: { orderBy: [{ id: 'asc' }], select: { title: true, productId: true, quantity: true } } } });
  if (!order || order.userId !== userId || order.storeId !== storeId) throw new Error('Order not found');
  return order.lineItems.map((line) => ({ title: line.title, productId: line.productId, quantity: line.quantity }));
}

/**
 * Add a list's unchecked items, or a past order's requested items, to the
 * basket as one batch. Every line is added (or explicitly skipped) inside one
 * cart transaction, and the result is stored under the client's request key:
 * replaying the key after a lost response returns the original result and adds
 * nothing again. A deliberate repeat uses a new key and adds again.
 */
export async function addCartBatch(
  context: Context,
  { requestKey, source, sourceId, sessionId }: { requestKey: string | null; source: 'list' | 'order'; sourceId: string; sessionId?: string },
) {
  const key = requestKey?.trim() || `once:${randomUUID()}`;
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(key)) throw publicError('This request could not be identified. Refresh and try again.');
  const ownerKey = context.session?.itemId ? `user:${context.session.itemId}` : `guest:${requireGuestSessionId(sessionId)}`;
  const identityCart = await getOrCreateCart(context, sessionId);
  return withLockedCart(context, identityCart.id, async (transactionContext, cart) => {
    assertCartAccess(cart, context, sessionId);
    const prisma = transactionContext.prisma;
    const previous = await prisma.customerBatchRequest.findUnique({ where: { requestKey: key } });
    if (previous) {
      if (previous.ownerKey !== ownerKey || previous.kind !== source || previous.sourceId !== sourceId || previous.storeId !== cart.store.id) {
        throw publicError('This request was already used for something else. Refresh and try again.');
      }
      return { ...(previous.results as Record<string, unknown>), replayed: true };
    }
    const lines = await batchLines(transactionContext, source, sourceId, cart.store.id);
    const skippedItems: string[] = [];
    let addedCount = 0;
    for (const line of lines) {
      if (!line.productId || !Number.isInteger(line.quantity) || line.quantity <= 0) { skippedItems.push(line.title); continue; }
      const productUnit = normalizeMeasureUnit(line.productUnit) || null;
      const lineUnit = normalizeMeasureUnit(line.unit) || productUnit;
      const quantity = productUnit && lineUnit ? exactWholeConversion(line.quantity, lineUnit, productUnit) : line.quantity;
      if (quantity === null || quantity < 1) {
        skippedItems.push(`${line.title} (${line.quantity} ${line.unit} is not a whole ${productUnit}; choose a quantity on its product page)`);
        continue;
      }
      try {
        await addProductToLockedCart(transactionContext, cart, line.productId, quantity);
        addedCount += 1;
      } catch (error) {
        skippedItems.push(`${line.title} (${error instanceof Error && !/unexpected/i.test(error.message) ? error.message : 'unavailable'})`);
      }
    }
    if (addedCount) await recalculateCart(transactionContext, cart.id);
    const results = {
      success: addedCount > 0 || lines.length === 0,
      message: lines.length === 0 ? 'No unchecked items to add to cart' : `Added ${addedCount} items to cart${skippedItems.length ? `, skipped ${skippedItems.length}` : ''}`,
      addedCount,
      skippedCount: skippedItems.length,
      skippedItems,
    };
    await prisma.customerBatchRequest.create({ data: { requestKey: key, ownerKey, kind: source, sourceId, storeId: cart.store.id, results } });
    return { ...results, replayed: false };
  });
}

/** Shop a past order again as one replay-safe batch (see addCartBatch). */
export async function reorderGroceryOrder(
  root: any,
  { orderId, requestKey, sessionId }: { orderId: string; requestKey: string; sessionId?: string },
  context: Context,
) {
  if (!context.session?.itemId) throw publicError('Sign in to shop this order again.', 'UNAUTHENTICATED');
  return addCartBatch(context, { requestKey, source: 'order', sourceId: orderId, sessionId });
}

// Update cart item mutation resolver
export async function updateCartItem(
  root: any,
  {
    itemId,
    quantity,
    sessionId,
  }: { itemId: string; quantity: number; sessionId?: string },
  context: Context
) {
  if (!Number.isInteger(quantity)) throw new Error('Cart quantity must be a whole number');
  const initial = await context.sudo().query.CartItem.findOne({ where: { id: itemId }, query: 'id cart { id }' });
  if (!initial?.cart?.id) throw new Error('Cart item not found');
  return withLockedCart(context, initial.cart.id, async (transactionContext, cart) => {
    const sudoContext = transactionContext.sudo();
    const cartItem = await sudoContext.query.CartItem.findOne({
      where: { id: itemId },
      query: 'id cart { id sessionId store { id } customer { id } } product { id store { id } status }',
    });
    if (!cartItem || cartItem.cart?.id !== cart.id) throw new Error('Cart item not found');
    assertCartAccess(cart, context, sessionId);
    assertProductStore(cartItem.product, cart.store.id);
    if (cartItem.product?.status !== 'published') throw new Error('Product is not available for public checkout');
    const product = await requireStoreProduct(transactionContext, cartItem.product.id, cart.store.id, { publishedOnly: true });
    if (quantity > 0) assertSellableQuantity(product, cart.store.id, quantity);
    if (quantity <= 0) await sudoContext.query.CartItem.deleteOne({ where: { id: itemId } });
    else await sudoContext.query.CartItem.updateOne({ where: { id: itemId }, data: { quantity } });
    await recalculateCart(transactionContext, cart.id);
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}

// Remove from cart mutation resolver
export async function removeFromCart(
  root: any,
  { itemId, sessionId }: { itemId: string; sessionId?: string },
  context: Context
) {
  const initial = await context.sudo().query.CartItem.findOne({ where: { id: itemId }, query: 'id cart { id }' });
  if (!initial?.cart?.id) throw new Error('Cart item not found');
  return withLockedCart(context, initial.cart.id, async (transactionContext, cart) => {
    assertCartAccess(cart, context, sessionId);
    const sudoContext = transactionContext.sudo();
    const current = await sudoContext.query.CartItem.findOne({ where: { id: itemId }, query: 'id cart { id }' });
    if (!current || current.cart?.id !== cart.id) throw new Error('Cart item not found');
    await sudoContext.query.CartItem.deleteOne({ where: { id: itemId } });
    await recalculateCart(transactionContext, cart.id);
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}

// Clear cart mutation resolver
export async function clearCart(
  root: any,
  { sessionId }: { sessionId?: string },
  context: Context
) {
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

// Merge guest cart into user cart (for when user logs in).
// Replay-safe: the guest cart is re-read under both cart locks and only an
// unexpired, customer-less cart carrying exactly this guest identity is moved.
// A replay after success (the guest cart is renamed `merged:`) simply returns
// the customer's basket. Any failure rolls back and leaves both baskets intact.
export async function mergeGuestCart(
  root: any,
  { guestSessionId: rawGuestSessionId }: { guestSessionId: string },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('Must be logged in to merge cart');
  }

  const guestSessionId = requireGuestSessionId(rawGuestSessionId);
  const store = await requireSessionStore(context);
  const userCart = await getOrCreateCart(context);

  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-cart-identity'), hashtext($1))",
      `guest:${guestSessionId}`,
    );
    const currentStore = await lockCurrentCustomer(transactionContext);
    if (currentStore.id !== store.id) throw new Error('Cart merge ownership changed');
    const txSudo = transactionContext.sudo();
    const guestCarts = await txSudo.query.Cart.findMany({
      where: { sessionId: { equals: guestSessionId } },
      take: 2,
      query: 'id',
    });
    if (guestCarts.length > 1) throw new Error('Guest cart identity is ambiguous');
    const ids = [guestCarts[0]?.id, userCart.id].filter(Boolean).sort() as string[];
    for (const id of ids) await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', id);
    const currentUser = await txSudo.query.Cart.findOne({ where: { id: userCart.id }, query: CART_QUERY });
    if (!currentUser || currentUser.customer?.id !== context.session!.itemId || currentUser.store?.id !== store.id) {
      throw new Error('Cart merge ownership changed');
    }
    const currentGuest = guestCarts[0]
      ? await txSudo.query.Cart.findOne({ where: { id: guestCarts[0].id }, query: CART_QUERY })
      : null;
    const mergeable = currentGuest
      && !currentGuest.customer?.id
      && currentGuest.sessionId === guestSessionId
      && !(currentGuest.expiresAt && new Date(currentGuest.expiresAt).getTime() <= Date.now());
    // Nothing (left) to merge: already merged, expired by policy, or never created.
    if (!mergeable || !currentGuest.items.length) return formatCartResponse(currentUser, transactionContext);
    if (currentGuest.store?.id !== store.id) throw publicError('Your earlier basket belongs to another store and cannot be moved.');

    const mergedProducts = new Set([...currentUser.items, ...currentGuest.items].map((item: any) => item.product?.id));
    if (mergedProducts.size > MAX_CART_PRODUCTS) {
      throw publicError(`Your earlier basket and your account basket together exceed ${MAX_CART_PRODUCTS} different products. Remove some items and try again.`);
    }
    for (const guestItem of currentGuest.items) {
      const existingItem = currentUser.items.find((item: any) => item.product?.id === guestItem.product?.id);
      const quantity = guestItem.quantity + (existingItem?.quantity || 0);
      const product = await requireStoreProduct(transactionContext, guestItem.product?.id, store.id, { publishedOnly: true })
        .catch(() => { throw publicError(`${guestItem.product?.title || 'An item'} from your earlier basket is no longer available.`); });
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

// Update substitution preference for a cart item
export async function updateSubstitutionPreference(
  root: any,
  {
    itemId,
    preference,
    sessionId,
  }: { itemId: string; preference: string; sessionId?: string },
  context: Context
) {
  if (!['allow', 'contact', 'remove'].includes(preference)) throw new Error('Unsupported substitution preference');
  const initial = await context.sudo().query.CartItem.findOne({ where: { id: itemId }, query: 'id cart { id }' });
  if (!initial?.cart?.id) throw new Error('Cart item not found');
  return withLockedCart(context, initial.cart.id, async (transactionContext, cart) => {
    assertCartAccess(cart, context, sessionId);
    const sudoContext = transactionContext.sudo();
    const current = await sudoContext.query.CartItem.findOne({ where: { id: itemId }, query: 'id cart { id }' });
    if (!current || current.cart?.id !== cart.id) throw new Error('Cart item not found');
    await sudoContext.query.CartItem.updateOne({
      where: { id: itemId },
      data: { substitutionPreference: preference as 'allow' | 'contact' | 'remove' },
    });
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
}
