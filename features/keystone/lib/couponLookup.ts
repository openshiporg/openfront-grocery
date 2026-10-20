import { publicError } from './publicError';

/** The one coupon identity used everywhere: trimmed and upper-cased. */
export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}

/**
 * Find a Store's coupon by the code a shopper typed. Lookup is case-insensitive
 * so offers saved before codes were normalized still redeem; if two legacy
 * rows differ only by case the code is ambiguous and is refused rather than
 * guessed — the store must resolve it.
 */
export async function findStoreCouponByCode(sudoContext: any, code: string, storeId: string | null | undefined, query: string) {
  const normalized = normalizeCouponCode(code).slice(0, 40);
  if (!normalized || !storeId) return null;
  const matches = await sudoContext.query.Coupon.findMany({
    where: { code: { equals: normalized, mode: 'insensitive' }, store: { id: { equals: storeId } } },
    take: 2,
    query,
  });
  if (matches.length > 1) throw publicError(`Coupon ${normalized} matches more than one offer. Contact the store to use it.`, 'COUPON_INVALID');
  return matches[0] || null;
}
