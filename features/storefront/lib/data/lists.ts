import type { ShoppingList } from '../../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/graphql';

function mapList(list: any): ShoppingList {
  return {
    id: list.id,
    name: list.name,
    updatedAt: list.updatedAt,
    items: (list.items || []).map((item: any) => ({
      id: item.id,
      name: item.product,
      quantity: item.quantity,
      checked: item.checked,
    })),
  };
}

export async function getShoppingLists(): Promise<ShoppingList[]> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
          query GetShoppingLists {
            shoppingLists(orderBy: { updatedAt: desc }) {
              id
              name
              updatedAt
              items {
                id
                product
                quantity
                checked
              }
            }
          }
        `,
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
    return (data?.shoppingLists || []).map(mapList);
  } catch (error) {
    console.error('Error fetching shopping lists:', error);
    return [];
  }
}

export async function getShoppingListById(id: string): Promise<ShoppingList | null> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
          query GetShoppingList($id: ID!) {
            shoppingList(where: { id: $id }) {
              id
              name
              updatedAt
              items {
                id
                product
                quantity
                checked
              }
            }
          }
        `,
        variables: { id },
      }),
      cache: 'no-store',
    });

    const { data } = await response.json();
    return data?.shoppingList ? mapList(data.shoppingList) : null;
  } catch (error) {
    console.error('Error fetching shopping list:', error);
    return null;
  }
}

export async function createShoppingList(name: string): Promise<ShoppingList | null> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
          mutation CreateShoppingList($name: String!) {
            createShoppingList(data: { name: $name }) {
              id
              name
              updatedAt
              items {
                id
                product
                quantity
                checked
              }
            }
          }
        `,
        variables: { name },
      }),
    });

    const { data } = await response.json();
    return data?.createShoppingList ? mapList(data.createShoppingList) : null;
  } catch (error) {
    console.error('Error creating shopping list:', error);
    return null;
  }
}

export async function addItemToList(
  listId: string,
  item: { name: string; quantity?: number }
): Promise<ShoppingList | null> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
          mutation AddItemToList($data: ShoppingListItemCreateInput!) {
            createShoppingListItem(data: $data) {
              id
            }
          }
        `,
        variables: {
          data: {
            list: { connect: { id: listId } },
            product: item.name,
            quantity: item.quantity || 1,
          },
        },
      }),
    });

    const { errors } = await response.json();
    if (errors) return null;
    return await getShoppingListById(listId);
  } catch (error) {
    console.error('Error adding item to list:', error);
    return null;
  }
}

export async function toggleListItem(listId: string, itemId: string): Promise<void> {
  try {
    const list = await getShoppingListById(listId);
    const item = list?.items.find((entry) => entry.id === itemId);
    if (!item) return;

    await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
          mutation ToggleListItem($id: ID!, $data: ShoppingListItemUpdateInput!) {
            updateShoppingListItem(where: { id: $id }, data: $data) {
              id
            }
          }
        `,
        variables: {
          id: itemId,
          data: { checked: !item.checked },
        },
      }),
    });
  } catch (error) {
    console.error('Error toggling list item:', error);
  }
}

export async function deleteShoppingList(id: string): Promise<void> {
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
          mutation DeleteShoppingList($id: ID!) {
            deleteShoppingList(where: { id: $id }) {
              id
            }
          }
        `,
        variables: { id },
      }),
    });
  } catch (error) {
    console.error('Error deleting shopping list:', error);
  }
}
