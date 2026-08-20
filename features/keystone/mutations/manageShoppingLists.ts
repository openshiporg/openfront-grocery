import type { Context } from '.keystone/types';

function requireUser(context: Context) {
  if (!context.session?.itemId) throw new Error('Must be logged in to manage shopping lists');
  return context.session.itemId;
}

export async function createShoppingList(
  _root: unknown,
  { name }: { name: string },
  context: Context
) {
  const userId = requireUser(context);
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('Shopping list name is required');
  const sudoContext = context.sudo();
  const existing = await sudoContext.query.ShoppingList.findMany({
    where: {
      user: { id: { equals: userId } },
      name: { equals: normalizedName, mode: 'insensitive' },
    },
    take: 1,
    query: 'id name isDefault updatedAt items { id product quantity unit checked notes addedAt }',
  });
  if (existing[0]) return existing[0];

  return sudoContext.query.ShoppingList.createOne({
    data: { name: normalizedName, user: { connect: { id: userId } } },
    query: 'id name isDefault updatedAt items { id product quantity unit checked notes addedAt }',
  });
}

export async function deleteShoppingList(
  _root: unknown,
  { listId }: { listId: string },
  context: Context
) {
  const userId = requireUser(context);
  const sudoContext = context.sudo();
  const list = await sudoContext.query.ShoppingList.findOne({
    where: { id: listId },
    query: 'id user { id } items { id }',
  });
  if (!list) return { success: true, listId };
  if (list.user?.id !== userId) throw new Error('Not authorized to delete this shopping list');
  for (const item of list.items || []) {
    await sudoContext.query.ShoppingListItem.deleteOne({ where: { id: item.id } });
  }
  await sudoContext.query.ShoppingList.deleteOne({ where: { id: listId } });
  return { success: true, listId };
}
