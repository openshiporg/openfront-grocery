import type { Context } from '.keystone/types';

// Tax rate for calculations
const TAX_RATE = 0.08;
const DELIVERY_FEE = 5.99;

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

// Helper to get or create a cart for the current session/user
async function getOrCreateCart(
  context: Context,
  sessionId?: string
): Promise<any> {
  const sudoContext = context.sudo();

  // If user is logged in, find their cart
  if (context.session?.itemId) {
    let cart = await sudoContext.query.Cart.findMany({
      where: {
        customer: { id: { equals: context.session.itemId } },
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
      `,
    });

    if (cart.length > 0) {
      return cart[0];
    }

    // Create new cart for logged-in user
    return await sudoContext.query.Cart.createOne({
      data: {
        customer: { connect: { id: context.session.itemId } },
        itemCount: 0,
        subtotal: 0,
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
      `,
    });
  }

  // For guest users, use sessionId
  if (sessionId) {
    const guestSessionId = requireGuestSessionId(sessionId);

    let cart = await sudoContext.query.Cart.findMany({
      where: {
        sessionId: { equals: guestSessionId },
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
      `,
    });

    if (cart.length > 0) {
      return cart[0];
    }

    // Create new guest cart with 7 day expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return await sudoContext.query.Cart.createOne({
      data: {
        sessionId: guestSessionId,
        itemCount: 0,
        subtotal: 0,
        expiresAt: expiresAt.toISOString(),
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
      `,
    });
  }

  throw new Error('No session ID provided for guest cart');
}

// Helper to recalculate cart totals
async function recalculateCart(context: Context, cartId: string) {
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
    `,
  });

  if (!cart) {
    throw new Error('Cart not found');
  }

  let subtotal = 0;
  let itemCount = 0;

  for (const item of cart.items) {
    const itemSubtotal = (item.product?.price || 0) * item.quantity;
    subtotal += itemSubtotal;
    itemCount += item.quantity;

    // Update item subtotal
    await sudoContext.query.CartItem.updateOne({
      where: { id: item.id },
      data: { subtotal: itemSubtotal },
    });
  }

  // Update cart totals
  await sudoContext.query.Cart.updateOne({
    where: { id: cartId },
    data: {
      subtotal,
      itemCount,
    },
  });

  return { subtotal, itemCount };
}

// Format cart response
function formatCartResponse(cart: any) {
  const subtotal = cart.subtotal || 0;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + DELIVERY_FEE;

  return {
    id: cart.id,
    items: cart.items.map((item: any) => ({
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
        stockQuantity: item.product?.stockQuantity,
      },
    })),
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
    return formatCartResponse(cart);
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
  const sudoContext = context.sudo();

  // Get or create cart
  const cart = await getOrCreateCart(context, sessionId);
  assertCartAccess(cart, context, sessionId);

  // Check if product exists and is in stock
  const product = await sudoContext.query.Product.findOne({
    where: { id: productId },
    query: 'id title price inStock stockQuantity',
  });

  if (!product) {
    throw new Error('Product not found');
  }

  if (!product.inStock) {
    throw new Error('Product is out of stock');
  }

  // Check stock quantity
  if (product.stockQuantity !== null && product.stockQuantity < quantity) {
    throw new Error(`Only ${product.stockQuantity} items available in stock`);
  }

  // Check if item already exists in cart
  const existingItem = cart.items.find(
    (item: any) => item.product?.id === productId
  );

  if (existingItem) {
    // Update quantity
    const newQuantity = existingItem.quantity + quantity;

    // Check stock for combined quantity
    if (product.stockQuantity !== null && product.stockQuantity < newQuantity) {
      throw new Error(`Only ${product.stockQuantity} items available in stock`);
    }

    await sudoContext.query.CartItem.updateOne({
      where: { id: existingItem.id },
      data: { quantity: newQuantity },
    });
  } else {
    // Create new cart item
    await sudoContext.query.CartItem.createOne({
      data: {
        cart: { connect: { id: cart.id } },
        product: { connect: { id: productId } },
        quantity,
        subtotal: (product.price || 0) * quantity,
      },
    });
  }

  // Recalculate cart totals
  await recalculateCart(context, cart.id);

  // Return updated cart
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
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
  const sudoContext = context.sudo();

  // Get the cart item
  const cartItem = await sudoContext.query.CartItem.findOne({
    where: { id: itemId },
    query: `
      id
      cart { id sessionId customer { id } }
      product { id stockQuantity inStock }
    `,
  });

  if (!cartItem) {
    throw new Error('Cart item not found');
  }

  assertCartAccess(cartItem.cart, context, sessionId);

  // Check stock
  if (cartItem.product?.stockQuantity !== null && cartItem.product?.stockQuantity < quantity) {
    throw new Error(`Only ${cartItem.product.stockQuantity} items available in stock`);
  }

  if (quantity <= 0) {
    // Remove item if quantity is 0 or negative
    await sudoContext.query.CartItem.deleteOne({
      where: { id: itemId },
    });
  } else {
    // Update quantity
    await sudoContext.query.CartItem.updateOne({
      where: { id: itemId },
      data: { quantity },
    });
  }

  // Recalculate cart totals
  await recalculateCart(context, cartItem.cart.id);

  // Return updated cart
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
}

// Remove from cart mutation resolver
export async function removeFromCart(
  root: any,
  { itemId, sessionId }: { itemId: string; sessionId?: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get the cart item to find the cart
  const cartItem = await sudoContext.query.CartItem.findOne({
    where: { id: itemId },
    query: 'id cart { id sessionId customer { id } }',
  });

  if (!cartItem) {
    throw new Error('Cart item not found');
  }

  assertCartAccess(cartItem.cart, context, sessionId);

  // Delete the item
  await sudoContext.query.CartItem.deleteOne({
    where: { id: itemId },
  });

  // Recalculate cart totals
  await recalculateCart(context, cartItem.cart.id);

  // Return updated cart
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
}

// Clear cart mutation resolver
export async function clearCart(
  root: any,
  { sessionId }: { sessionId?: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get the cart
  const cart = await getOrCreateCart(context, sessionId);
  assertCartAccess(cart, context, sessionId);

  // Delete all items
  for (const item of cart.items) {
    await sudoContext.query.CartItem.deleteOne({
      where: { id: item.id },
    });
  }

  // Reset cart totals
  await sudoContext.query.Cart.updateOne({
    where: { id: cart.id },
    data: {
      subtotal: 0,
      itemCount: 0,
    },
  });

  // Return empty cart
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
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

  // Find guest cart
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
    `,
  });

  if (guestCarts.length === 0) {
    // No guest cart to merge, just return user's cart
    const userCart = await getOrCreateCart(context);
    return formatCartResponse(userCart);
  }

  const guestCart = guestCarts[0];
  assertCartAccess(guestCart, { ...context, session: undefined } as Context, guestSessionId);

  // Get or create user cart
  const userCart = await getOrCreateCart(context);

  // Merge items
  for (const guestItem of guestCart.items) {
    const existingItem = userCart.items.find(
      (item: any) => item.product?.id === guestItem.product?.id
    );

    if (existingItem) {
      // Add quantities
      await sudoContext.query.CartItem.updateOne({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + guestItem.quantity },
      });
    } else {
      // Move item to user cart
      await sudoContext.query.CartItem.updateOne({
        where: { id: guestItem.id },
        data: {
          cart: { connect: { id: userCart.id } },
        },
      });
    }
  }

  // Delete guest cart
  await sudoContext.query.Cart.deleteOne({
    where: { id: guestCart.id },
  });

  // Recalculate user cart
  await recalculateCart(context, userCart.id);

  // Return merged cart
  const updatedCart = await getOrCreateCart(context);
  return formatCartResponse(updatedCart);
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
  const sudoContext = context.sudo();

  const cartItem = await sudoContext.query.CartItem.findOne({
    where: { id: itemId },
    query: 'id cart { id sessionId customer { id } }',
  });

  if (!cartItem) {
    throw new Error('Cart item not found');
  }

  assertCartAccess(cartItem.cart, context, sessionId);

  await sudoContext.query.CartItem.updateOne({
    where: { id: itemId },
    data: { substitutionPreference: preference as 'allow' | 'contact' | 'remove' },
  });

  // Return updated cart
  const updatedCart = await getOrCreateCart(context, sessionId);
  return formatCartResponse(updatedCart);
}
