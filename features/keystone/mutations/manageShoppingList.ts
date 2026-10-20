import type { Context } from '.keystone/types';

import { lockCurrentCustomer } from '../lib/storeScope';
import { publicError } from '../lib/publicError';
import { exactWholeConversion, measureDimension, normalizeMeasureUnit } from '../lib/fulfillmentActuals';
import { addCartBatch } from './cartOperations';

const LIST_QUERY = `
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
`;

/**
 * Every list change runs here: one transaction holding the customer's row lock
 * (re-checking erasure and active Store membership, in erasure's lock order)
 * and then the list's row lock, so additions, quantity changes and deletion of
 * the same list are serialized and never interleave into partial state.
 */
async function withOwnedList<T>(context: Context, listId: string, operation: (transactionContext: Context, list: any, store: { id: string }) => Promise<T>) {
  if (!context.session?.itemId) throw new Error('Must be logged in to manage shopping lists');
  return context.transaction(async (transactionContext) => {
    const store = await lockCurrentCustomer(transactionContext);
    await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "ShoppingList" WHERE "id" = $1 FOR UPDATE', listId);
    const list = await transactionContext.sudo().query.ShoppingList.findOne({ where: { id: listId }, query: LIST_QUERY });
    if (!list) throw new Error('Shopping list not found');
    if (list.user?.id !== context.session!.itemId) throw new Error('Not authorized to access this shopping list');
    return operation(transactionContext, list, store);
  });
}

async function reloadList(transactionContext: Context, listId: string) {
  const list = await transactionContext.sudo().query.ShoppingList.findOne({ where: { id: listId }, query: LIST_QUERY });
  if (!list) throw new Error('Shopping list not found');
  return formatShoppingListResponse(list);
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

/**
 * The exact catalog product a list entry refers to: an explicit product ID
 * first, then a unique handle, then an exact title. A title shared by several
 * products (different packs or SKUs) is never resolved by picking one.
 */
async function resolveListProduct(transactionContext: Context, storeId: string, { productId, product }: { productId?: string | null; product?: string | null }) {
  const sudoContext = transactionContext.sudo();
  const published = { store: { id: { equals: storeId } }, status: { equals: 'published' as const } };
  const query = 'id title handle sku variantLabel unitOfMeasure pricingMethod';
  if (productId) {
    const found = await sudoContext.query.Product.findMany({ where: { ...published, id: { equals: productId } }, query, take: 1 });
    if (!found[0]) throw publicError('That product is no longer available in the shop.');
    return found[0];
  }
  const text = String(product || '').trim();
  if (!text) throw publicError('Choose a product to add.');
  const byHandle = await sudoContext.query.Product.findMany({ where: { ...published, handle: { equals: text } }, query, take: 1 });
  if (byHandle[0]) return byHandle[0];
  const byTitle = await sudoContext.query.Product.findMany({ where: { ...published, title: { equals: text, mode: 'insensitive' as const } }, query, take: 6 });
  if (!byTitle.length) throw publicError(`No product named “${text.slice(0, 80)}” is in the shop. Check the name, or save it from its product page.`);
  if (byTitle.length > 1) {
    const choices = byTitle.slice(0, 5).map((option: any) => [option.title, option.variantLabel, option.sku].filter(Boolean).join(' · ')).join('; ');
    throw publicError(`Several products are named “${text.slice(0, 80)}” (${choices}). Open the one you want and use “Save to a shopping list”.`, 'PRODUCT_CHOICE_REQUIRED');
  }
  return byTitle[0];
}

/** The unit a list entry is kept in: the product's own unit unless a compatible measure was chosen. */
function listUnitFor(productUnit: string, requested?: string | null) {
  const native = normalizeMeasureUnit(productUnit) || 'each';
  if (!requested || !String(requested).trim()) return native;
  const unit = normalizeMeasureUnit(requested);
  if (!unit) throw publicError(`“${String(requested).slice(0, 20)}” is not a unit the shop supports. Use ${native}.`);
  if (measureDimension(unit) !== measureDimension(native)) throw publicError(`This product is sold by ${native}; ${unit} cannot be converted to it.`);
  return unit;
}

// Add item to shopping list
export async function addToList(
  root: any,
  {
    listId,
    product,
    productId,
    quantity,
    unit,
    notes,
    mode,
  }: {
    listId: string;
    product?: string | null;
    productId?: string | null;
    quantity?: number | null;
    unit?: string | null;
    notes?: string | null;
    mode?: string | null;
  },
  context: Context
) {
  const amount = quantity ?? 1;
  if (!Number.isInteger(amount) || amount < 1 || amount > 999) throw publicError('List quantities are whole numbers from 1 to 999.');
  if (mode && mode !== 'add' && mode !== 'set') throw new Error('Unsupported list quantity mode');
  return withOwnedList(context, listId, async (transactionContext, list, store) => {
    const productRecord = await resolveListProduct(transactionContext, store.id, { productId, product });
    const listUnit = listUnitFor(productRecord.unitOfMeasure, unit);
    const prisma = transactionContext.prisma;
    // One line per product identity: the saved title is only a display snapshot.
    const existingItem = list.items.find((item: any) => item.productRef?.id === productRecord.id);
    if (existingItem) {
      const sameUnit = (normalizeMeasureUnit(existingItem.unit) || listUnit) === listUnit;
      if (!sameUnit && mode !== 'set') throw publicError(`${productRecord.title} is already on this list in ${existingItem.unit}. Change that line instead.`);
      const nextQuantity = mode === 'set' ? amount : existingItem.quantity + amount;
      if (nextQuantity > 999) throw publicError('List quantities are whole numbers from 1 to 999.');
      await prisma.shoppingListItem.update({
        where: { id: existingItem.id },
        data: { quantity: nextQuantity, unit: listUnit, ...(notes && notes !== existingItem.notes ? { notes: notes.slice(0, 500) } : {}) },
      });
    } else {
      if (list.items.length >= 200) throw publicError('A list can hold up to 200 products.');
      await prisma.shoppingListItem.create({
        data: { listId, product: productRecord.title, productRefId: productRecord.id, quantity: amount, unit: listUnit, notes: (notes || '').slice(0, 500), checked: false, addedAt: new Date() },
      });
    }
    return reloadList(transactionContext, listId);
  });
}

// Remove item from shopping list
export async function removeFromList(
  root: any,
  { listId, itemId }: { listId: string; itemId: string },
  context: Context
) {
  return withOwnedList(context, listId, async (transactionContext, list) => {
    if (list.items.some((item: any) => item.id === itemId)) await transactionContext.prisma.shoppingListItem.delete({ where: { id: itemId } });
    else {
      const elsewhere = await transactionContext.prisma.shoppingListItem.findUnique({ where: { id: itemId }, select: { listId: true } });
      if (elsewhere) throw new Error('Item does not belong to this shopping list');
    }
    return reloadList(transactionContext, listId);
  });
}

/**
 * Set a line's quantity. When the client says which quantity it last saw
 * (`expectedQuantity`), a change made meanwhile elsewhere is reported instead
 * of silently overwritten.
 */
export async function updateListItemQuantity(
  root: any,
  {
    listId,
    itemId,
    quantity,
    expectedQuantity,
  }: { listId: string; itemId: string; quantity: number; expectedQuantity?: number | null },
  context: Context
) {
  if (!Number.isInteger(quantity) || quantity > 999) throw publicError('List quantities are whole numbers from 1 to 999.');
  return withOwnedList(context, listId, async (transactionContext, list) => {
    const item = list.items.find((entry: any) => entry.id === itemId);
    if (!item) throw new Error('Item does not belong to this shopping list');
    if (expectedQuantity !== null && expectedQuantity !== undefined && item.quantity !== expectedQuantity) {
      throw publicError('This item was changed in another window. Your list has been refreshed; try again.', 'LIST_CHANGED');
    }
    if (quantity <= 0) await transactionContext.prisma.shoppingListItem.delete({ where: { id: itemId } });
    else await transactionContext.prisma.shoppingListItem.update({ where: { id: itemId }, data: { quantity } });
    return reloadList(transactionContext, listId);
  });
}

// Toggle item checked status
export async function toggleListItemChecked(
  root: any,
  { listId, itemId }: { listId: string; itemId: string },
  context: Context
) {
  return withOwnedList(context, listId, async (transactionContext, list) => {
    const item = list.items.find((entry: any) => entry.id === itemId);
    if (!item) throw new Error('Item does not belong to this shopping list');
    await transactionContext.prisma.shoppingListItem.update({ where: { id: itemId }, data: { checked: !item.checked } });
    return reloadList(transactionContext, listId);
  });
}

/**
 * Add the list's unchecked items to the basket as one replay-safe batch. The
 * same `requestKey` (kept by the client across an uncertain response) returns
 * the original result instead of adding the items again; a new deliberate
 * action uses a new key.
 */
export async function addListToCart(
  root: any,
  { listId, sessionId, requestKey }: { listId: string; sessionId?: string; requestKey?: string | null },
  context: Context
) {
  if (!context.session?.itemId) throw new Error('Must be logged in to manage shopping lists');
  return addCartBatch(context, { requestKey: requestKey || null, source: 'list', sourceId: listId, sessionId });
}
