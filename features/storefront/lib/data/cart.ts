import type { GroceryCart } from '../../types';
import { storefrontGraphQL } from './graphql';

// Get or generate a session ID for guest carts
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';

  let sessionId = localStorage.getItem('grocery_cart_session');
  if (!sessionId) {
    sessionId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem('grocery_cart_session', sessionId);
  }
  return sessionId;
}

// Dispatch cart update event for real-time UI updates
function dispatchCartUpdate(cart: GroceryCart | null) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: cart }));
  }
}

export async function retrieveCart(): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return null;

    const { data } = await storefrontGraphQL<{ groceryCart: GroceryCart | null }>(`
      query GetCart($sessionId: String) {
        groceryCart(sessionId: $sessionId) {
          id
          items {
            id
            quantity
            subtotal
            substitutionPreference
            product {
              id
              name
              handle
              price
              unitPrice
              unit
              imageUrl
              inStock
              stockQuantity
            }
          }
          subtotal
          tax
          deliveryFee
          total
          itemCount
        }
      }
    `, { sessionId }, { cache: 'no-store' });
    return data?.groceryCart || null;
  } catch (error) {
    console.error('Error retrieving cart:', error);
    return null;
  }
}

export async function addToCart(
  productId: string,
  quantity: number = 1
): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return null;

    const { data } = await storefrontGraphQL<{ addItemToGroceryCart: GroceryCart | null }>(`
      mutation AddToCart($productId: ID!, $quantity: Int!, $sessionId: String) {
        addItemToGroceryCart(productId: $productId, quantity: $quantity, sessionId: $sessionId) {
          id
          items {
            id
            quantity
            subtotal
            product {
              id
              name
              price
            }
          }
          subtotal
          tax
          deliveryFee
          total
          itemCount
        }
      }
    `, { productId, quantity, sessionId }, { cache: 'no-store' });
    const cart = data?.addItemToGroceryCart || null;
    dispatchCartUpdate(cart);
    return cart;
  } catch (error) {
    console.error('Error adding to cart:', error);
    return null;
  }
}

export async function updateCartItem(
  itemId: string,
  quantity: number
): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return null;

    const { data } = await storefrontGraphQL<{ updateGroceryCartItem: GroceryCart | null }>(`
      mutation UpdateCartItem($itemId: ID!, $quantity: Int!, $sessionId: String) {
        updateGroceryCartItem(itemId: $itemId, quantity: $quantity, sessionId: $sessionId) {
          id
          items {
            id
            quantity
            subtotal
            product {
              id
              name
              price
            }
          }
          subtotal
          tax
          deliveryFee
          total
          itemCount
        }
      }
    `, { itemId, quantity, sessionId }, { cache: 'no-store' });
    const cart = data?.updateGroceryCartItem || null;
    dispatchCartUpdate(cart);
    return cart;
  } catch (error) {
    console.error('Error updating cart item:', error);
    return null;
  }
}

export async function removeFromCart(
  itemId: string
): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return null;

    const { data } = await storefrontGraphQL<{ removeItemFromGroceryCart: GroceryCart | null }>(`
      mutation RemoveFromCart($itemId: ID!, $sessionId: String) {
        removeItemFromGroceryCart(itemId: $itemId, sessionId: $sessionId) {
          id
          items {
            id
            quantity
            subtotal
            product {
              id
              name
              price
            }
          }
          subtotal
          tax
          deliveryFee
          total
          itemCount
        }
      }
    `, { itemId, sessionId }, { cache: 'no-store' });
    const cart = data?.removeItemFromGroceryCart || null;
    dispatchCartUpdate(cart);
    return cart;
  } catch (error) {
    console.error('Error removing from cart:', error);
    return null;
  }
}

// Clear entire cart
export async function clearCart(): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return null;

    const { data } = await storefrontGraphQL<{ clearGroceryCart: GroceryCart | null }>(`
      mutation ClearCart($sessionId: String) {
        clearGroceryCart(sessionId: $sessionId) {
          id
          items {
            id
            quantity
            subtotal
            product {
              id
              name
              price
            }
          }
          subtotal
          tax
          deliveryFee
          total
          itemCount
        }
      }
    `, { sessionId }, { cache: 'no-store' });
    return data?.clearGroceryCart || null;
  } catch (error) {
    console.error('Error clearing cart:', error);
    return null;
  }
}

// Merge guest cart into user cart after login
export async function mergeGuestCart(): Promise<GroceryCart | null> {
  try {
    const guestSessionId = localStorage.getItem('grocery_cart_session');
    if (!guestSessionId) {
      return await retrieveCart();
    }

    const { data } = await storefrontGraphQL<{ mergeGuestGroceryCart: GroceryCart | null }>(`
      mutation MergeGuestCart($guestSessionId: String!) {
        mergeGuestGroceryCart(guestSessionId: $guestSessionId) {
          id
          items {
            id
            quantity
            subtotal
            product {
              id
              name
              price
            }
          }
          subtotal
          tax
          deliveryFee
          total
          itemCount
        }
      }
    `, { guestSessionId }, { cache: 'no-store' });

    // Clear the guest session after merge
    localStorage.removeItem('grocery_cart_session');
    return data?.mergeGuestGroceryCart || null;
  } catch (error) {
    console.error('Error merging guest cart:', error);
    return null;
  }
}

// Update substitution preference for a cart item
export async function updateSubstitutionPreference(
  itemId: string,
  preference: 'allow' | 'contact' | 'remove'
): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return null;

    const { data } = await storefrontGraphQL<{ updateGrocerySubstitutionPreference: GroceryCart | null }>(`
      mutation UpdateSubstitutionPreference($itemId: ID!, $preference: String!, $sessionId: String) {
        updateGrocerySubstitutionPreference(itemId: $itemId, preference: $preference, sessionId: $sessionId) {
          id
          items {
            id
            quantity
            subtotal
            substitutionPreference
            product {
              id
              name
              price
            }
          }
          subtotal
          tax
          deliveryFee
          total
          itemCount
        }
      }
    `, { itemId, preference, sessionId }, { cache: 'no-store' });
    return data?.updateGrocerySubstitutionPreference || null;
  } catch (error) {
    console.error('Error updating substitution preference:', error);
    return null;
  }
}
