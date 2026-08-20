import type { GroceryCart } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

const GUEST_CART_STORAGE_KEY = 'grocery_cart_session';
const GUEST_CART_COOKIE = 'grocery_cart_session';
const GUEST_CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getClientCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

function setClientCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${GUEST_CART_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

function clearClientCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

async function getServerSessionId() {
  if (typeof window !== 'undefined') return null;

  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    return cookieStore.get(GUEST_CART_COOKIE)?.value || null;
  } catch {
    return null;
  }
}

function guestSessionEntropy() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure browser randomness is required for guest carts');
  return globalThis.crypto.randomUUID();
}

// Get or generate a session ID for guest carts
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';

  let sessionId = localStorage.getItem(GUEST_CART_STORAGE_KEY) || getClientCookie(GUEST_CART_COOKIE);
  if (!sessionId) {
    sessionId = `guest_${guestSessionEntropy()}`;
  }

  localStorage.setItem(GUEST_CART_STORAGE_KEY, sessionId);
  setClientCookie(GUEST_CART_COOKIE, sessionId);
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
    const sessionId = typeof window === 'undefined' ? await getServerSessionId() : getSessionId();
    if (!sessionId) return null;

    const { data, errors } = await storefrontGraphQL<{ groceryCart: GroceryCart | null }>(`
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
    throwGraphQLErrors(errors);
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
    if (!sessionId) throw new Error('No guest cart session available');

    const { data, errors } = await storefrontGraphQL<{ addItemToGroceryCart: GroceryCart | null }>(`
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
    throwGraphQLErrors(errors);
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

    const { data, errors } = await storefrontGraphQL<{ updateGroceryCartItem: GroceryCart | null }>(`
      mutation UpdateCartItem($itemId: ID!, $quantity: Int!, $sessionId: String) {
        updateGroceryCartItem(itemId: $itemId, quantity: $quantity, sessionId: $sessionId) {
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
    `, { itemId, quantity, sessionId }, { cache: 'no-store' });
    throwGraphQLErrors(errors);
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

    const { data, errors } = await storefrontGraphQL<{ removeItemFromGroceryCart: GroceryCart | null }>(`
      mutation RemoveFromCart($itemId: ID!, $sessionId: String) {
        removeItemFromGroceryCart(itemId: $itemId, sessionId: $sessionId) {
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
    `, { itemId, sessionId }, { cache: 'no-store' });
    throwGraphQLErrors(errors);
    const cart = data?.removeItemFromGroceryCart || null;
    dispatchCartUpdate(cart);
    return cart;
  } catch (error) {
    console.error('Error removing from cart:', error);
    return null;
  }
}

// Clear entire cart
export async function clearCart(options: { preserveSession?: boolean } = {}): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return null;

    const { data, errors } = await storefrontGraphQL<{ clearGroceryCart: GroceryCart | null }>(`
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
    throwGraphQLErrors(errors);
    const cart = data?.clearGroceryCart || null;
    if (cart?.itemCount === 0 && !options.preserveSession) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(GUEST_CART_STORAGE_KEY);
      }
      clearClientCookie(GUEST_CART_COOKIE);
    }
    dispatchCartUpdate(cart);
    return cart;
  } catch (error) {
    console.error('Error clearing cart:', error);
    return null;
  }
}

// Merge guest cart into user cart after login
export async function mergeGuestCart(): Promise<GroceryCart | null> {
  try {
    const guestSessionId = localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!guestSessionId) {
      return await retrieveCart();
    }

    const { data, errors } = await storefrontGraphQL<{ mergeGuestGroceryCart: GroceryCart | null }>(`
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
    throwGraphQLErrors(errors);

    // Clear the guest session after merge
    localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    clearClientCookie(GUEST_CART_COOKIE);
    const cart = data?.mergeGuestGroceryCart || null;
    dispatchCartUpdate(cart);
    return cart;
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

    const { data, errors } = await storefrontGraphQL<{ updateGrocerySubstitutionPreference: GroceryCart | null }>(`
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
    `, { itemId, preference, sessionId }, { cache: 'no-store' });
    throwGraphQLErrors(errors);
    const cart = data?.updateGrocerySubstitutionPreference || null;
    dispatchCartUpdate(cart);
    return cart;
  } catch (error) {
    console.error('Error updating substitution preference:', error);
    return null;
  }
}
