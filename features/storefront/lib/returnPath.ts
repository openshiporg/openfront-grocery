/** Relative same-origin navigation only; rejects URL-parser normalization surprises. */
function boundedReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value) || /%5c|%2f|%0[0-9a-f]|%1[0-9a-f]/i.test(value)) return null;
  const target = new URL(value, 'https://grocery.invalid');
  if (target.origin !== 'https://grocery.invalid') return null;
  return target.pathname + target.search + target.hash;
}

/**
 * Where a shopper returns after signing in, creating an account or resetting a password: a
 * same-origin storefront path only. Staff dashboard paths and the auth pages themselves are
 * never return targets for the shopper flow.
 */
export function shopperReturnPath(value: string | null | undefined, fallback = '/account') {
  const path = boundedReturnPath(typeof value === 'string' ? value : null);
  if (!path || path.startsWith('/dashboard') || /^\/account\/(sign-in|register|reset)(?:[/?#]|$)/.test(path)) return fallback;
  return path;
}
