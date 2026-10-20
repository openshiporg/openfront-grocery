import type { Context } from '.keystone/types';

import { lockCurrentCustomer } from '../lib/storeScope';
import { publicError } from '../lib/publicError';

const LIST_QUERY = 'id name isDefault updatedAt items { id product productRef { id handle } quantity unit checked notes addedAt }';

function requireUser(context: Context) {
  if (!context.session?.itemId) throw new Error('Must be logged in to manage shopping lists');
  return context.session.itemId;
}

export function normalizeShoppingListGraphQLResult(list: any) {
  return {
    ...list,
    updatedAt: list.updatedAt ? new Date(list.updatedAt) : null,
    items: (list.items || []).map((item: any) => ({
      ...item,
      addedAt: item.addedAt ? new Date(item.addedAt) : null,
    })),
  };
}

/**
 * Create a list, or return the customer's existing list of the same name. The
 * owner+name identity is serialized, and the account is re-checked under its
 * row lock, so concurrent requests produce one list and an erased or
 * deactivated account cannot create one through an old cookie.
 */
export async function createShoppingList(
  _root: unknown,
  { name }: { name: string },
  context: Context
) {
  const userId = requireUser(context);
  const normalizedName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!normalizedName || normalizedName.length > 100) throw publicError('Name your list (up to 100 characters).');
  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-shopping-list'), hashtext($1))",
      `${userId}:${normalizedName.toLowerCase()}`,
    );
    await lockCurrentCustomer(transactionContext);
    const sudoContext = transactionContext.sudo();
    const existing = await sudoContext.query.ShoppingList.findMany({
      where: { user: { id: { equals: userId } }, name: { equals: normalizedName, mode: 'insensitive' } },
      take: 1,
      query: LIST_QUERY,
    });
    if (existing[0]) return normalizeShoppingListGraphQLResult(existing[0]);
    const count = await transactionContext.prisma.shoppingList.count({ where: { userId } });
    if (count >= 50) throw publicError('You can keep up to 50 shopping lists. Delete one you no longer use first.');
    const created = await sudoContext.query.ShoppingList.createOne({
      data: { name: normalizedName, user: { connect: { id: userId } } },
      query: LIST_QUERY,
    });
    return normalizeShoppingListGraphQLResult(created);
  });
}

/**
 * Delete an owned list and its saved items in one transaction under the list
 * lock that every item change also takes: it either disappears completely or
 * not at all. Repeating the delete of an already-deleted list is harmless.
 */
export async function deleteShoppingList(
  _root: unknown,
  { listId }: { listId: string },
  context: Context
) {
  const userId = requireUser(context);
  return context.transaction(async (transactionContext) => {
    await lockCurrentCustomer(transactionContext);
    await transactionContext.prisma.$queryRawUnsafe('SELECT "id" FROM "ShoppingList" WHERE "id" = $1 FOR UPDATE', listId);
    const list = await transactionContext.prisma.shoppingList.findUnique({ where: { id: listId }, select: { id: true, userId: true } });
    if (!list) return { success: true, listId };
    if (list.userId !== userId) throw new Error('Not authorized to delete this shopping list');
    await transactionContext.prisma.shoppingListItem.deleteMany({ where: { listId } });
    await transactionContext.prisma.shoppingList.delete({ where: { id: listId } });
    return { success: true, listId };
  });
}
