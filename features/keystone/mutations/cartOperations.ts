import type { Context } from '.keystone/types';

import { publicStore, requireSessionStore } from '../lib/storeScope';
import { requireStoreProduct, assertProductStore } from '../lib/catalogAccess';
import { assertSellableQuantity, deriveSellableQuantity } from '../lib/sellableInventory';
import { calculateTaxCents, getStoreTaxRateBps } from '../lib/storeMoney';

const DELIVERY_FEE = 0;

function requireGuestSessionId(sessionId?: string) {
  const trimmed = sessionId?.trim();

  if (!trimmed) {
    throw new Error('No session ID provided for guest cart');
  }

  return trimmed;
}

function assertCartAccess(cart: any, context: Context, sessionId?: string) {
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
      id title handle price priceCents imageUrl status
      store { id }
      inventoryLots { expirationDate quantityRemaining store { id } }
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
    await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', cartId);
    const cart = await transactionContext.sudo().query.Cart.findOne({ where: { id: cartId }, query: CART_QUERY });
    if (!cart) throw new Error('Cart not found');
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
    const itemSubtotalCents = Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity;
    subtotalCents += itemSubtotalCents;
    itemCount += item.quantity;
    const itemSubtotal = itemSubtotalCents / 100;

    // Update item subtotal
    await sudoContext.query.CartItem.updateOne({
      where: { id: item.id },
      data: { subtotal: itemSubtotal, subtotalCents: Math.round(itemSubtotal * 100) },
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
async function formatCartResponse(cart: any, context: Context) {
  const subtotalCents = Number(cart.subtotalCents ?? Math.round(Number(cart.subtotal || 0) * 100));
  const subtotal = subtotalCents / 100;
  const taxRateBps = await getStoreTaxRateBps(context, cart.store?.id);
  const taxCents = calculateTaxCents(subtotalCents, taxRateBps);
  const tax = taxCents / 100;
  const total = (subtotalCents + taxCents) / 100 + DELIVERY_FEE;

  return {
    id: cart.id,
    items: cart.items.map((item: any) => {
      const sellableQuantity = item.product
        ? deriveSellableQuantity(item.product, cart.store?.id)
        : 0;
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
          inStock: item.product?.status === 'published' && sellableQuantity >= item.quantity,
          stockQuantity: sellableQuantity,
        },
      };
    }),
    subtotal,
    tax: Math.round(tax * 100) / 100,
    deliveryFee: DELIVERY_FEE,
    total: Math.round(total * 100) / 100,
    itemCount: cart.itemCount || 0,
  };
}

// Get cart query resolver
export async function getCart(
  root: any,
  { sessionId }: { sessionId?: string },
  context: Context
) {
  try {
    const cart = await getOrCreateCart(context, sessionId);
    return formatCartResponse(cart, context);
  } catch (error) {
    console.error('Error getting cart:', error);
    return null;
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
    const sudoContext = transactionContext.sudo();
    const product = await requireStoreProduct(transactionContext, productId, cart.store.id, { publishedOnly: true });
    const existingItem = cart.items.find((item: any) => item.product?.id === productId);
    if (!existingItem && cart.items.length >= 200) throw new Error('Cart cannot exceed 200 distinct products');
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
          subtotalCents: unitPriceCents * quantity,
        },
      });
    }
    await recalculateCart(transactionContext, cart.id);
    const updated = await sudoContext.query.Cart.findOne({ where: { id: cart.id }, query: CART_QUERY });
    return formatCartResponse(updated, transactionContext);
  });
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
    assertCartAccess(cartItem.cart, context, sessionId);
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

// Merge guest cart into user cart (for when user logs in)
export async function mergeGuestCart(
  root: any,
  { guestSessionId }: { guestSessionId: string },
  context: Context
) {
  if (!context.session?.itemId) {
    throw new Error('Must be logged in to merge cart');
  }

  const sudoContext = context.sudo();
  const store = await requireSessionStore(context);

  // Find guest cart
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
    `,
  });

  if (guestCarts.length === 0) {
    // No guest cart to merge, just return user's cart
    const userCart = await getOrCreateCart(context);
    return formatCartResponse(userCart, context);
  }

  if (guestCarts.length > 1) throw new Error('Guest cart identity is ambiguous');
  const guestCart = guestCarts[0];
  assertCartAccess(guestCart, { ...context, session: undefined } as Context, guestSessionId);
  if (guestCart.store?.id !== store.id) throw new Error('Guest cart belongs to another Store');
  if (guestCart.expiresAt && new Date(guestCart.expiresAt).getTime() <= Date.now()) throw new Error('Guest cart session has expired');
  if (guestCart.items.some((item: any) => !item.product || item.product.store?.id !== store.id || item.product.status !== 'published')) {
    throw new Error('Guest cart contains a product unavailable to the active Store');
  }

  // Get or create user cart
  const userCart = await getOrCreateCart(context);

  return context.transaction(async (transactionContext) => {
    const ids = [guestCart.id, userCart.id].sort();
    for (const id of ids) await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', id);
    const txSudo = transactionContext.sudo();
    const [currentGuest, currentUser] = await Promise.all([
      txSudo.query.Cart.findOne({ where: { id: guestCart.id }, query: CART_QUERY }),
      txSudo.query.Cart.findOne({ where: { id: userCart.id }, query: CART_QUERY }),
    ]);
    if (!currentGuest || currentGuest.store?.id !== store.id || !currentUser || currentUser.store?.id !== store.id) {
      throw new Error('Cart merge ownership changed');
    }
    for (const guestItem of currentGuest.items) {
      const existingItem = currentUser.items.find((item: any) => item.product?.id === guestItem.product?.id);
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
