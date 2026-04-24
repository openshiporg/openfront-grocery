import type { Context } from '.keystone/types';

// Helper to get shopping list with authorization check
async function getShoppingListForUser(
  context: Context,
  listId: string
): Promise<any> {
  const sudoContext = context.sudo();

  if (!context.session?.itemId) {
    throw new Error('Must be logged in to manage shopping lists');
  }

  const list = await sudoContext.query.ShoppingList.findOne({
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
    `,
  });

  if (!list) {
    throw new Error('Shopping list not found');
  }

  // Verify ownership
  if (list.user?.id !== context.session.itemId) {
    throw new Error('Not authorized to access this shopping list');
  }

  return list;
}

// Format shopping list response
function formatShoppingListResponse(list: any) {
  return {
    id: list.id,
    name: list.name,
    isDefault: list.isDefault,
    items: list.items.map((item: any) => ({
      id: item.id,
      product: item.product,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      notes: item.notes,
      addedAt: item.addedAt,
    })),
    itemCount: list.items.length,
    checkedCount: list.items.filter((item: any) => item.checked).length,
  };
}

// Add item to shopping list
export async function addToList(
  root: any,
  {
    listId,
    product,
    quantity,
    unit,
    notes,
  }: {
    listId: string;
    product: string;
    quantity?: number;
    unit?: string;
    notes?: string;
  },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get and verify list ownership
  const list = await getShoppingListForUser(context, listId);

  // Check if product already exists in list
  const existingItem = list.items.find(
    (item: any) => item.product.toLowerCase() === product.toLowerCase()
  );

  if (existingItem) {
    // Update quantity of existing item
    const newQuantity = existingItem.quantity + (quantity || 1);
    await sudoContext.query.ShoppingListItem.updateOne({
      where: { id: existingItem.id },
      data: {
        quantity: newQuantity,
        ...(unit && { unit }),
        ...(notes && { notes: existingItem.notes ? `${existingItem.notes}; ${notes}` : notes }),
      },
    });
  } else {
    // Create new item
    await sudoContext.query.ShoppingListItem.createOne({
      data: {
        list: { connect: { id: listId } },
        product,
        quantity: quantity || 1,
        unit: unit || 'each',
        notes: notes || '',
        checked: false,
        addedAt: new Date().toISOString(),
      },
    });
  }

  // Return updated list
  const updatedList = await getShoppingListForUser(context, listId);
  return formatShoppingListResponse(updatedList);
}

// Remove item from shopping list
export async function removeFromList(
  root: any,
  { listId, itemId }: { listId: string; itemId: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Verify list ownership
  await getShoppingListForUser(context, listId);

  // Get the item to verify it belongs to this list
  const item = await sudoContext.query.ShoppingListItem.findOne({
    where: { id: itemId },
    query: 'id list { id }',
  });

  if (!item) {
    throw new Error('Item not found');
  }

  if (item.list?.id !== listId) {
    throw new Error('Item does not belong to this shopping list');
  }

  // Delete the item
  await sudoContext.query.ShoppingListItem.deleteOne({
    where: { id: itemId },
  });

  // Return updated list
  const updatedList = await getShoppingListForUser(context, listId);
  return formatShoppingListResponse(updatedList);
}

// Update item quantity in shopping list
export async function updateListItemQuantity(
  root: any,
  {
    listId,
    itemId,
    quantity,
  }: { listId: string; itemId: string; quantity: number },
  context: Context
) {
  const sudoContext = context.sudo();

  // Verify list ownership
  await getShoppingListForUser(context, listId);

  // Get the item to verify it belongs to this list
  const item = await sudoContext.query.ShoppingListItem.findOne({
    where: { id: itemId },
    query: 'id list { id }',
  });

  if (!item) {
    throw new Error('Item not found');
  }

  if (item.list?.id !== listId) {
    throw new Error('Item does not belong to this shopping list');
  }

  if (quantity <= 0) {
    // Remove item if quantity is 0 or negative
    await sudoContext.query.ShoppingListItem.deleteOne({
      where: { id: itemId },
    });
  } else {
    // Update quantity
    await sudoContext.query.ShoppingListItem.updateOne({
      where: { id: itemId },
      data: { quantity },
    });
  }

  // Return updated list
  const updatedList = await getShoppingListForUser(context, listId);
  return formatShoppingListResponse(updatedList);
}

// Toggle item checked status
export async function toggleListItemChecked(
  root: any,
  { listId, itemId }: { listId: string; itemId: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Verify list ownership
  await getShoppingListForUser(context, listId);

  // Get the item to verify it belongs to this list
  const item = await sudoContext.query.ShoppingListItem.findOne({
    where: { id: itemId },
    query: 'id list { id } checked',
  });

  if (!item) {
    throw new Error('Item not found');
  }

  if (item.list?.id !== listId) {
    throw new Error('Item does not belong to this shopping list');
  }

  // Toggle checked status
  await sudoContext.query.ShoppingListItem.updateOne({
    where: { id: itemId },
    data: { checked: !item.checked },
  });

  // Return updated list
  const updatedList = await getShoppingListForUser(context, listId);
  return formatShoppingListResponse(updatedList);
}

// Add all unchecked items from shopping list to cart
export async function addListToCart(
  root: any,
  { listId, sessionId }: { listId: string; sessionId?: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Verify list ownership
  const list = await getShoppingListForUser(context, listId);

  // Get unchecked items
  const uncheckedItems = list.items.filter((item: any) => !item.checked);

  if (uncheckedItems.length === 0) {
    return {
      success: true,
      message: 'No unchecked items to add to cart',
      addedCount: 0,
      skippedCount: 0,
      skippedItems: [],
    };
  }

  // Get or create cart
  let cart;
  if (context.session?.itemId) {
    const carts = await sudoContext.query.Cart.findMany({
      where: {
        customer: { id: { equals: context.session.itemId } },
      },
      query: 'id items { id product { id title } quantity }',
    });

    if (carts.length > 0) {
      cart = carts[0];
    } else {
      cart = await sudoContext.query.Cart.createOne({
        data: {
          customer: { connect: { id: context.session.itemId } },
          itemCount: 0,
          subtotal: 0,
        },
        query: 'id items { id product { id title } quantity }',
      });
    }
  } else if (sessionId) {
    const carts = await sudoContext.query.Cart.findMany({
      where: {
        sessionId: { equals: sessionId },
      },
      query: 'id items { id product { id title } quantity }',
    });

    if (carts.length > 0) {
      cart = carts[0];
    } else {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      cart = await sudoContext.query.Cart.createOne({
        data: {
          sessionId,
          itemCount: 0,
          subtotal: 0,
          expiresAt: expiresAt.toISOString(),
        },
        query: 'id items { id product { id title } quantity }',
      });
    }
  } else {
    throw new Error('No session ID provided for guest cart');
  }

  let addedCount = 0;
  const skippedItems: string[] = [];

  for (const item of uncheckedItems) {
    // Try to find product by title match
    const products = await sudoContext.query.Product.findMany({
      where: {
        OR: [
          { title: { contains: item.product, mode: 'insensitive' } },
          { title: { equals: item.product, mode: 'insensitive' } },
        ],
      },
      query: 'id title price inStock stockQuantity',
      take: 1,
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

    // Check if product already in cart
    const existingCartItem = cart.items.find(
      (cartItem: any) => cartItem.product?.id === product.id
    );

    if (existingCartItem) {
      // Update quantity
      const newQuantity = existingCartItem.quantity + item.quantity;
      await sudoContext.query.CartItem.updateOne({
        where: { id: existingCartItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      // Add new cart item
      await sudoContext.query.CartItem.createOne({
        data: {
          cart: { connect: { id: cart.id } },
          product: { connect: { id: product.id } },
          quantity: item.quantity,
          subtotal: (product.price || 0) * item.quantity,
        },
      });
    }

    addedCount++;
  }

  // Recalculate cart totals
  const updatedCart = await sudoContext.query.Cart.findOne({
    where: { id: cart.id },
    query: `
      id
      items {
        id
        quantity
        product { id price }
      }
    `,
  });

  let subtotal = 0;
  let itemCount = 0;

  for (const cartItem of updatedCart.items) {
    const itemSubtotal = (cartItem.product?.price || 0) * cartItem.quantity;
    subtotal += itemSubtotal;
    itemCount += cartItem.quantity;

    await sudoContext.query.CartItem.updateOne({
      where: { id: cartItem.id },
      data: { subtotal: itemSubtotal },
    });
  }

  await sudoContext.query.Cart.updateOne({
    where: { id: cart.id },
    data: { subtotal, itemCount },
  });

  return {
    success: true,
    message: `Added ${addedCount} items to cart${skippedItems.length > 0 ? `, skipped ${skippedItems.length}` : ''}`,
    addedCount,
    skippedCount: skippedItems.length,
    skippedItems,
  };
}
