import type { GroceryCart } from '../../types';
import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

const GUEST_CART_STORAGE_KEY = 'grocery_cart_session';
export const GUEST_CART_COOKIE = 'grocery_cart_session';
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

// The basket provider tells this module who the shopper is. A signed-in
// shopper's basket is found through their session, so no new guest identity is
// minted for them (an existing unmerged one is kept for the merge retry).
let signedInShopper = false;
export function setCartShopperIdentity(identity: string) {
  signedInShopper = identity !== 'guest';
}

// Get or generate a session ID for guest carts
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';

  let stored: string | null = null;
  try { stored = localStorage.getItem(GUEST_CART_STORAGE_KEY); } catch { /* Use the cookie when storage is disabled. */ }
  let sessionId = stored || getClientCookie(GUEST_CART_COOKIE);
  if (!sessionId && signedInShopper) return '';
  if (!sessionId) {
    sessionId = `guest_${guestSessionEntropy()}`;
  }

  try { localStorage.setItem(GUEST_CART_STORAGE_KEY, sessionId); } catch { /* Cookie continuity remains available. */ }
  setClientCookie(GUEST_CART_COOKIE, sessionId);
  return sessionId;
}

// Dispatch cart update event for real-time UI updates
function dispatchCartUpdate(cart: GroceryCart | null) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: cart }));
  }
}

export async function retrieveCart(options: { throwOnError?: boolean } = {}): Promise<GroceryCart | null> {
  try {
    // A signed-in shopper's basket is resolved from their session alone; the
    // guest cookie is optional. An anonymous request without one has no basket.
    const sessionId = typeof window === 'undefined' ? await getServerSessionId() : getSessionId();

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
    `, { sessionId: sessionId || null }, { cache: 'no-store' });
    throwGraphQLErrors(errors);
    return data?.groceryCart || null;
  } catch (error) {
    console.error('Error retrieving cart:', error);
    if (options.throwOnError) throw error;
    return null;
  }
}

export async function addToCart(
  productId: string,
  quantity: number = 1
): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId && !signedInShopper) throw new Error('No guest cart session available');

    const { data, errors } = await storefrontGraphQL<{ addItemToGroceryCart: GroceryCart | null }>(`
      mutation AddToCart($productId: ID!, $quantity: Int!, $sessionId: String) {
        addItemToGroceryCart(productId: $productId, quantity: $quantity, sessionId: $sessionId) {
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
    if (!sessionId && !signedInShopper) return null;

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
    if (!sessionId && !signedInShopper) return null;

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
    if (!sessionId && !signedInShopper) return null;

    const { data, errors } = await storefrontGraphQL<{ clearGroceryCart: GroceryCart | null }>(`
      mutation ClearCart($sessionId: String) {
        clearGroceryCart(sessionId: $sessionId) {
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

/** Whether this browser still holds a guest basket identity that has not been merged. */
export function hasGuestCartSession() {
  if (typeof window === 'undefined') return false;
  let stored: string | null = null;
  try { stored = localStorage.getItem(GUEST_CART_STORAGE_KEY); } catch { /* storage disabled */ }
  return Boolean(stored || getClientCookie(GUEST_CART_COOKIE));
}

/** Forget this browser's guest basket identity (the shopper chose to keep only their account basket). */
export function forgetGuestCartSession() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(GUEST_CART_STORAGE_KEY); } catch { /* storage disabled */ }
  clearClientCookie(GUEST_CART_COOKIE);
}

// Merge the guest basket into the signed-in shopper's basket. The guest
// identity is kept until the server confirms the merge, so a failed or
// interrupted merge can be retried; a repeated merge is harmless.
export async function mergeGuestCart(): Promise<{ cart: GroceryCart | null; error: string | null }> {
  let guestSessionId: string | null = null;
  try { guestSessionId = localStorage.getItem(GUEST_CART_STORAGE_KEY); } catch { /* storage disabled */ }
  guestSessionId ||= getClientCookie(GUEST_CART_COOKIE);
  if (!guestSessionId) return { cart: await retrieveCart(), error: null };
  try {
    const { data, errors } = await storefrontGraphQL<{ mergeGuestGroceryCart: GroceryCart | null }>(`
      mutation MergeGuestCart($guestSessionId: String!) {
        mergeGuestGroceryCart(guestSessionId: $guestSessionId) {
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
    `, { guestSessionId }, { cache: 'no-store' });
    throwGraphQLErrors(errors);
    const cart = data?.mergeGuestGroceryCart || null;
    if (!cart) return { cart: null, error: 'Your earlier basket could not be moved to your account. Try again.' };
    forgetGuestCartSession();
    dispatchCartUpdate(cart);
    return { cart, error: null };
  } catch (error) {
    const message = error instanceof Error && error.message && !/unexpected/i.test(error.message)
      ? error.message
      : 'Your earlier basket could not be moved to your account. Try again.';
    return { cart: null, error: message };
  }
}

// Update substitution preference for a cart item
export async function updateSubstitutionPreference(
  itemId: string,
  preference: 'allow' | 'contact' | 'remove'
): Promise<GroceryCart | null> {
  try {
    const sessionId = getSessionId();
    if (!sessionId && !signedInShopper) return null;

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
