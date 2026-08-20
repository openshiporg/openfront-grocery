import type { Context } from '.keystone/types';

import { publicStore, requireSessionStore } from '../lib/storeScope';
import { requireStoreProduct } from '../lib/catalogAccess';
import { addToCart as addProductToCart, getCart as getCanonicalCart } from './cartOperations';

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
  const store = context.session?.itemId ? await requireSessionStore(context) : await publicStore(context);

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
      // Resolve each ingredient through the selected public/active Store.
      const product = ingredient.product
        ? await requireStoreProduct(context, ingredient.product, store.id, { publishedOnly: true })
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
  const store = context.session?.itemId ? await requireSessionStore(context) : await publicStore(context);

  // Get the recipe
  const recipe = await sudoContext.query.Recipe.findOne({
    where: { id: recipeId },
    query: 'id name servings',
  });

  if (!recipe) {
    throw new Error('Recipe not found');
  }

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

    // Resolve each ingredient through the cart Store before writing.
    const product = await requireStoreProduct(context, ingredient.product, store.id, { publishedOnly: true });

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

    try {
      // Delegate all identity, row-lock, Store, lot-expiry, combined-quantity,
      // and exact-money checks to the canonical cart mutation.
      await addProductToCart(null, {
        productId: ingredient.product,
        quantity: scaledQuantity,
        sessionId,
      }, context);
      addedItems.push({
        productId: ingredient.product,
        productName: product.title,
        quantity: scaledQuantity,
        action: 'added',
      });
    } catch (error) {
      unavailableItems.push({
        productId: ingredient.product,
        productName: product.title,
        reason: error instanceof Error ? error.message : 'Product is unavailable',
        requestedQuantity: scaledQuantity,
        availableQuantity: product.stockQuantity,
      });
    }
  }

  // Return the same authoritative lot-derived cart projection used by every
  // other storefront cart path.
  const formattedCart = await getCanonicalCart(null, { sessionId }, context);

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
