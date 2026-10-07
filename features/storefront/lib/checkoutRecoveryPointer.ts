/** Only the opaque, ownership-checked attempt reference survives navigation. */
export type CheckoutRecoveryPointer = { version: 1; id: string; cartId: string };
export function checkoutRecoveryPointer(value: unknown): CheckoutRecoveryPointer | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim() || candidate.id.length > 200 || typeof candidate.cartId !== 'string' || !candidate.cartId.trim() || candidate.cartId.length > 200) return null;
  return { version: 1, id: candidate.id, cartId: candidate.cartId };
}
export function cleanCheckoutReturnUrl(href: string) {
  const url = new URL(href);
  for (const key of ['payment_intent', 'payment_intent_client_secret', 'redirect_status']) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}
