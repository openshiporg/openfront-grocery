import type { Context } from '.keystone/types';

// Tax rate for calculations
const TAX_RATE = 0.08;
const DELIVERY_FEE = 5.99;

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
    let cart = await sudoContext.query.Cart.findMany({
      where: {
        sessionId: { equals: sessionId },
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
        sessionId,
        itemCount: 0,
        subtotal: 0,
        expiresAt: expiresAt.toISOString(),
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

// Scale recipe ingredients based on servings
export async function scaleRecipe(
  root: any,
  {
    recipeId,
    targetServings,
  }: {
    recipeId: string;
    targetServings: number;
  },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get the recipe
  const recipe = await sudoContext.query.Recipe.findOne({
    where: { id: recipeId },
    query: 'id name servings',
  });

  if (!recipe) {
    throw new Error('Recipe not found');
  }

  if (!recipe.servings || recipe.servings <= 0) {
    throw new Error('Recipe does not have valid serving information');
  }

  // Get recipe ingredients (query directly since no relationship exists)
  const ingredients = await sudoContext.db.RecipeIngredient.findMany({
    where: {
      recipe: { id: { equals: recipeId } },
    },
  });

  // Calculate scaling factor
  const scaleFactor = targetServings / recipe.servings;

  // Scale each ingredient
  const scaledIngredients = await Promise.all(
    ingredients.map(async (ingredient: any) => {
      // Get product details
      const product = ingredient.product
        ? await sudoContext.query.Product.findOne({
            where: { id: ingredient.product },
            query: 'id title price imageUrl inStock stockQuantity',
          })
        : null;

      return {
        id: ingredient.id,
        productId: ingredient.product,
        product: product
          ? {
              id: product.id,
              name: product.title,
              price: product.price,
              imageUrl: product.imageUrl,
              inStock: product.inStock,
              stockQuantity: product.stockQuantity,
            }
          : null,
        originalQuantity: ingredient.quantity,
        scaledQuantity: Math.round(ingredient.quantity * scaleFactor * 100) / 100,
        unit: ingredient.unit,
        notes: ingredient.notes,
        isOptional: ingredient.isOptional,
      };
    })
  );

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    originalServings: recipe.servings,
    targetServings,
    scaleFactor: Math.round(scaleFactor * 100) / 100,
    ingredients: scaledIngredients,
  };
}

// Add all recipe ingredients to cart
export async function addRecipeToCart(
  root: any,
  {
    recipeId,
    servings,
    sessionId,
    includeOptional,
  }: {
    recipeId: string;
    servings?: number;
    sessionId?: string;
    includeOptional?: boolean;
  },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get the recipe
  const recipe = await sudoContext.query.Recipe.findOne({
    where: { id: recipeId },
    query: 'id name servings',
  });

  if (!recipe) {
    throw new Error('Recipe not found');
  }

  // Get or create cart
  const cart = await getOrCreateCart(context, sessionId);

  // Get recipe ingredients
  const ingredients = await sudoContext.db.RecipeIngredient.findMany({
    where: {
      recipe: { id: { equals: recipeId } },
    },
  });

  if (ingredients.length === 0) {
    throw new Error('Recipe has no ingredients');
  }

  // Calculate scaling factor if custom servings provided
  const targetServings = servings || recipe.servings || 1;
  const scaleFactor = recipe.servings ? targetServings / recipe.servings : 1;

  const addedItems: any[] = [];
  const unavailableItems: any[] = [];
  const skippedOptional: any[] = [];

  for (const ingredient of ingredients) {
    // Skip optional ingredients if not requested
    if (ingredient.isOptional && !includeOptional) {
      skippedOptional.push({
        productId: ingredient.product,
        reason: 'Optional ingredient not included',
      });
      continue;
    }

    // Skip if no product linked
    if (!ingredient.product) {
      unavailableItems.push({
        productId: null,
        reason: 'No product linked to ingredient',
      });
      continue;
    }

    // Get product details
    const product = await sudoContext.query.Product.findOne({
      where: { id: ingredient.product },
      query: 'id title price inStock stockQuantity',
    });

    if (!product) {
      unavailableItems.push({
        productId: ingredient.product,
        reason: 'Product not found',
      });
      continue;
    }

    if (!product.inStock) {
      unavailableItems.push({
        productId: ingredient.product,
        productName: product.title,
        reason: 'Out of stock',
      });
      continue;
    }

    // Calculate scaled quantity (round up to ensure enough)
    const scaledQuantity = Math.ceil(ingredient.quantity * scaleFactor);

    // Check stock
    if (product.stockQuantity !== null && product.stockQuantity < scaledQuantity) {
      unavailableItems.push({
        productId: ingredient.product,
        productName: product.title,
        reason: `Insufficient stock (need ${scaledQuantity}, have ${product.stockQuantity})`,
        availableQuantity: product.stockQuantity,
      });
      continue;
    }

    // Check if item already exists in cart
    const existingItem = cart.items.find(
      (item: any) => item.product?.id === ingredient.product
    );

    if (existingItem) {
      // Update quantity
      const newQuantity = existingItem.quantity + scaledQuantity;

      // Check stock for combined quantity
      if (product.stockQuantity !== null && product.stockQuantity < newQuantity) {
        unavailableItems.push({
          productId: ingredient.product,
          productName: product.title,
          reason: `Insufficient stock for combined quantity`,
          requestedQuantity: scaledQuantity,
          existingQuantity: existingItem.quantity,
        });
        continue;
      }

      await sudoContext.query.CartItem.updateOne({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });

      addedItems.push({
        productId: ingredient.product,
        productName: product.title,
        quantity: scaledQuantity,
        action: 'updated',
        newTotal: newQuantity,
      });
    } else {
      // Create new cart item
      await sudoContext.query.CartItem.createOne({
        data: {
          cart: { connect: { id: cart.id } },
          product: { connect: { id: ingredient.product } },
          quantity: scaledQuantity,
          subtotal: (product.price || 0) * scaledQuantity,
        },
      });

      addedItems.push({
        productId: ingredient.product,
        productName: product.title,
        quantity: scaledQuantity,
        action: 'added',
      });
    }
  }

  // Recalculate cart totals
  await recalculateCart(context, cart.id);

  // Return updated cart with summary
  const updatedCart = await getOrCreateCart(context, sessionId);
  const formattedCart = formatCartResponse(updatedCart);

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
      skippedOptional,
    },
  };
}
