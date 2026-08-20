import type { ShoppingList } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

function mapList(list: any): ShoppingList {
  const items = (list.items || []).map((item: any) => ({
    id: item.id,
    name: item.product,
    quantity: item.quantity,
    checked: item.checked,
    unit: item.unit || undefined,
    notes: item.notes || undefined,
    addedAt: item.addedAt || undefined,
  }));

  return {
    id: list.id,
    name: list.name,
    updatedAt: list.updatedAt || new Date().toISOString(),
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

export async function getShoppingLists(): Promise<ShoppingList[]> {
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

export async function createShoppingList(name: string): Promise<ShoppingList | null> {
  try {
    const data = await requestGraphQL<{
      createCustomerShoppingList: {
        id: string;
        name: string;
        isDefault?: boolean;
        updatedAt: string;
        items: any[];
      } | null;
    }>(`
      mutation CreateCustomerShoppingList($name: String!) {
        createCustomerShoppingList(name: $name) {
          id
          name
          isDefault
          updatedAt
          items {
            id
            product
            quantity
            checked
            unit
            notes
            addedAt
          }
        }
      }
    `, { name });

    return data?.createCustomerShoppingList
      ? mapList(data.createCustomerShoppingList)
      : null;
  } catch (error) {
    console.error('Error creating shopping list:', error);
    return null;
  }
}

export async function addItemToList(
  listId: string,
  item: { name: string; quantity?: number; unit?: string; notes?: string }
): Promise<ShoppingList | null> {
  try {
    const data = await requestGraphQL<{ addToShoppingList: any }>(`
      mutation AddItemToShoppingList(
        $listId: ID!
        $product: String!
        $quantity: Int
        $unit: String
        $notes: String
      ) {
        addToShoppingList(
          listId: $listId
          product: $product
          quantity: $quantity
          unit: $unit
          notes: $notes
        ) {
          id
          name
          isDefault
          itemCount
          checkedCount
          items {
            id
            product
            quantity
            unit
            checked
            notes
            addedAt
          }
        }
      }
    `, {
      listId,
      product: item.name,
      quantity: item.quantity || 1,
      unit: item.unit || 'each',
      notes: item.notes || '',
    });

    return data?.addToShoppingList ? mapList(data.addToShoppingList) : null;
  } catch (error) {
    console.error('Error adding item to list:', error);
    return null;
  }
}

export async function updateListItemQuantity(listId: string, itemId: string, quantity: number): Promise<ShoppingList | null> {
  try {
    const data = await requestGraphQL<{ updateShoppingListItemQuantity: any }>(`
      mutation UpdateShoppingListItemQuantity($listId: ID!, $itemId: ID!, $quantity: Int!) {
        updateShoppingListItemQuantity(listId: $listId, itemId: $itemId, quantity: $quantity) {
          id
          name
          isDefault
          itemCount
          checkedCount
          items {
            id
            product
            quantity
            unit
            checked
            notes
            addedAt
          }
        }
      }
    `, {
      listId,
      itemId,
      quantity,
    });

    return data?.updateShoppingListItemQuantity ? mapList(data.updateShoppingListItemQuantity) : null;
  } catch (error) {
    console.error('Error updating list item quantity:', error);
    return null;
  }
}

export async function toggleListItem(listId: string, itemId: string): Promise<ShoppingList | null> {
  try {
    const data = await requestGraphQL<{ toggleShoppingListItemChecked: any }>(`
      mutation ToggleShoppingListItem($listId: ID!, $itemId: ID!) {
        toggleShoppingListItemChecked(listId: $listId, itemId: $itemId) {
          id
          name
          isDefault
          itemCount
          checkedCount
          items {
            id
            product
            quantity
            unit
            checked
            notes
            addedAt
          }
        }
      }
    `, {
      listId,
      itemId,
    });

    return data?.toggleShoppingListItemChecked ? mapList(data.toggleShoppingListItemChecked) : null;
  } catch (error) {
    console.error('Error toggling list item:', error);
    return null;
  }
}

export async function removeListItem(listId: string, itemId: string): Promise<ShoppingList | null> {
  try {
    const data = await requestGraphQL<{ removeFromShoppingList: any }>(`
      mutation RemoveListItem($listId: ID!, $itemId: ID!) {
        removeFromShoppingList(listId: $listId, itemId: $itemId) {
          id
          name
          isDefault
          itemCount
          checkedCount
          items {
            id
            product
            quantity
            unit
            checked
            notes
            addedAt
          }
        }
      }
    `, {
      listId,
      itemId,
    });

    return data?.removeFromShoppingList ? mapList(data.removeFromShoppingList) : null;
  } catch (error) {
    console.error('Error removing list item:', error);
    return null;
  }
}

export async function addShoppingListToCart(listId: string): Promise<{
  success: boolean;
  message: string;
  addedCount: number;
  skippedCount: number;
  skippedItems: string[];
}> {
  try {
    const data = await requestGraphQL<{ addShoppingListToCart: any }>(`
      mutation AddShoppingListToCart($listId: ID!) {
        addShoppingListToCart(listId: $listId) {
          success
          message
          addedCount
          skippedCount
          skippedItems
        }
      }
    `, { listId });

    return data?.addShoppingListToCart || {
      success: false,
      message: 'Failed to add list to cart',
      addedCount: 0,
      skippedCount: 0,
      skippedItems: [],
    };
  } catch (error) {
    console.error('Error adding shopping list to cart:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to add list to cart',
      addedCount: 0,
      skippedCount: 0,
      skippedItems: [],
    };
  }
}

export async function deleteShoppingList(id: string): Promise<boolean> {
  try {
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
  } catch (error) {
    console.error('Error deleting shopping list:', error);
    return false;
  }
}
