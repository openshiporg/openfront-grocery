import type { ShoppingList } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

function mapList(list: any): ShoppingList {
  const items = (list.items || []).map((item: any) => ({
    id: item.id,
    name: item.product,
    productId: item.productRef?.id,
    productHandle: item.productRef?.handle,
    quantity: item.quantity,
    checked: item.checked,
    unit: item.unit || undefined,
    notes: item.notes || undefined,
    addedAt: item.addedAt || undefined,
  }));

  return {
    id: list.id,
    name: list.name,
    updatedAt: list.updatedAt || '',
    isDefault: list.isDefault,
    itemCount: list.itemCount ?? items.length,
    checkedCount: list.checkedCount ?? items.filter((item: any) => item.checked).length,
    items,
  };
}

async function requestGraphQL<T = any>(query: string, variables?: Record<string, unknown>) {
  const result = await storefrontGraphQL<T>(query, variables, { cache: 'no-store' });

  throwGraphQLErrors(result.errors);

  return result.data as T;
}

export async function getShoppingLists(options: { throwOnError?: boolean } = {}): Promise<ShoppingList[]> {
  try {
    const data = await requestGraphQL<{
      shoppingLists: Array<{
        id: string;
        name: string;
        isDefault?: boolean;
        updatedAt: string;
        items: any[];
      }>;
    }>(`
      query GetShoppingLists {
        shoppingLists(orderBy: { updatedAt: desc }) {
          id
          name
          isDefault
          updatedAt
          items {
            id
            product
            productRef { id handle }
            quantity
            checked
            unit
            notes
            addedAt
          }
        }
      }
    `);

    return (data?.shoppingLists || []).map(mapList);
  } catch (error) {
    console.error('Error fetching shopping lists:', error);
    if (options.throwOnError) throw error;
    return [];
  }
}

export async function getShoppingListById(id: string): Promise<ShoppingList | null> {
  try {
    const data = await requestGraphQL<{
      shoppingList: {
        id: string;
        name: string;
        isDefault?: boolean;
        updatedAt: string;
        items: any[];
      } | null;
    }>(`
      query GetShoppingList($id: ID!) {
        shoppingList(where: { id: $id }) {
          id
          name
          isDefault
          updatedAt
          items {
            id
            product
            productRef { id handle }
            quantity
            checked
            unit
            notes
            addedAt
          }
        }
      }
    `, { id });

    return data?.shoppingList ? mapList(data.shoppingList) : null;
  } catch (error) {
    console.error('Error fetching shopping list:', error);
    return null;
  }
}

const LIST_FIELDS = `
  id
  name
  isDefault
  updatedAt
  items {
    id
    product
    productRef { id handle }
    quantity
    checked
    unit
    notes
    addedAt
  }
`;

/** Create a list, or get the existing list with that name (the server reuses it). */
export async function createShoppingList(name: string): Promise<ShoppingList> {
  const data = await requestGraphQL<{ createCustomerShoppingList: any }>(`
    mutation CreateCustomerShoppingList($name: String!) {
      createCustomerShoppingList(name: $name) { ${LIST_FIELDS} }
    }
  `, { name });
  if (!data?.createCustomerShoppingList) throw new Error('The list could not be created. Please try again.');
  return mapList(data.createCustomerShoppingList);
}

async function reloadAfter(listId: string) {
  const list = await getShoppingListById(listId);
  if (!list) throw new Error('Your list was updated, but it could not be reloaded. Refresh the page.');
  return list;
}

/**
 * Add a product to a list. The store adds to an existing line for the same
 * product (it never resets the quantity) and refuses ambiguous names with the
 * choices it found.
 */
export async function addItemToList(
  listId: string,
  item: { name?: string; productId?: string; quantity?: number; unit?: string; notes?: string; mode?: 'add' | 'set' }
): Promise<ShoppingList> {
  await requestGraphQL<{ addToShoppingList: any }>(`
    mutation AddItemToShoppingList($listId: ID!, $product: String, $productId: ID, $quantity: Int, $unit: String, $notes: String, $mode: String) {
      addToShoppingList(listId: $listId, product: $product, productId: $productId, quantity: $quantity, unit: $unit, notes: $notes, mode: $mode) { id }
    }
  `, {
    listId,
    product: item.productId ? null : item.name || null,
    productId: item.productId || null,
    quantity: item.quantity || 1,
    unit: item.unit || null,
    notes: item.notes || null,
    mode: item.mode || 'add',
  });
  return reloadAfter(listId);
}

/** Set a line's quantity; `expectedQuantity` makes a change from another window a conflict instead of an overwrite. */
export async function updateListItemQuantity(listId: string, itemId: string, quantity: number, expectedQuantity?: number): Promise<ShoppingList> {
  await requestGraphQL<{ updateShoppingListItemQuantity: any }>(`
    mutation UpdateShoppingListItemQuantity($listId: ID!, $itemId: ID!, $quantity: Int!, $expectedQuantity: Int) {
      updateShoppingListItemQuantity(listId: $listId, itemId: $itemId, quantity: $quantity, expectedQuantity: $expectedQuantity) { id }
    }
  `, { listId, itemId, quantity, expectedQuantity: expectedQuantity ?? null });
  return reloadAfter(listId);
}

export async function toggleListItem(listId: string, itemId: string): Promise<ShoppingList> {
  await requestGraphQL<{ toggleShoppingListItemChecked: any }>(`
    mutation ToggleShoppingListItem($listId: ID!, $itemId: ID!) {
      toggleShoppingListItemChecked(listId: $listId, itemId: $itemId) { id }
    }
  `, { listId, itemId });
  return reloadAfter(listId);
}

export async function removeListItem(listId: string, itemId: string): Promise<ShoppingList> {
  await requestGraphQL<{ removeFromShoppingList: any }>(`
    mutation RemoveListItem($listId: ID!, $itemId: ID!) {
      removeFromShoppingList(listId: $listId, itemId: $itemId) { id }
    }
  `, { listId, itemId });
  return reloadAfter(listId);
}

export type CartBatchResult = { success: boolean; message: string; addedCount: number; skippedCount: number; skippedItems: string[]; replayed: boolean };

/**
 * Add the list's unchecked items to the basket. Pass the same `requestKey`
 * when retrying after an uncertain response: the store then returns the
 * original result instead of adding the items twice.
 */
export async function addShoppingListToCart(listId: string, requestKey: string): Promise<CartBatchResult> {
  const { getSessionId } = await import('./cart');
  const data = await requestGraphQL<{ addShoppingListToCart: CartBatchResult }>(`
    mutation AddShoppingListToCart($listId: ID!, $requestKey: String, $sessionId: String) {
      addShoppingListToCart(listId: $listId, requestKey: $requestKey, sessionId: $sessionId) {
        success message addedCount skippedCount skippedItems replayed
      }
    }
  `, { listId, requestKey, sessionId: getSessionId() || null });
  if (!data?.addShoppingListToCart) throw new Error('The list could not be added to your basket. Try again.');
  return data.addShoppingListToCart;
}

export async function deleteShoppingList(id: string): Promise<boolean> {
  const data = await requestGraphQL<{
    deleteCustomerShoppingList: { success: boolean; listId: string } | null;
  }>(`
    mutation DeleteCustomerShoppingList($listId: ID!) {
      deleteCustomerShoppingList(listId: $listId) {
        success
        listId
      }
    }
  `, { listId: id });
  return Boolean(data?.deleteCustomerShoppingList?.success);
}
