import type { GroceryCart } from '../../types';

/**
 * The cart a page shows once the shared basket has read the cart in the
 * browser. The basket is the same read the header badge and tab bar use, so a
 * page and the badge can never disagree:
 * - a server render that saw no cart cookie (a framed page, Safari blocking
 *   third-party cookies) adopts the basket's cart;
 * - a server cart the basket no longer finds is shown as empty.
 * Until the basket has loaded, the server-rendered cart stands.
 */
export function reconcileWithBasket(page: GroceryCart | null, basket: { loaded: boolean; cart: GroceryCart | null }): GroceryCart | null {
  return basket.loaded ? basket.cart : page;
}

/** Item count shown on the badge for a cart. */
export function basketCount(cart: GroceryCart | null | undefined) {
  return cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
}
