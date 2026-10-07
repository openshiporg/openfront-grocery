import { normalizeTaxRateBps } from './storeMoney';

export type CommercialLine = { id: string; subtotalCents: number; taxRateBasisPoints: number; discountEligible?: boolean };
function cents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Money must be nonnegative integer minor units');
  return value;
}
/** Largest-remainder allocation, with stable identity ties; no lost discount pennies. */
export function allocateCents(amount: number, lines: Array<{ id: string; basis: number }>) {
  cents(amount);
  if (new Set(lines.map(l => l.id)).size !== lines.length) throw new Error('Duplicate commercial line identity');
  const total = lines.reduce((n, l) => n + cents(l.basis), 0);
  if (!Number.isSafeInteger(total) || amount > total) throw new Error('Allocation exceeds eligible line value');
  const rows = lines.map(l => {
    const product = BigInt(amount) * BigInt(l.basis);
    return { id: l.id, value: total ? Number(product / BigInt(total)) : 0, remainder: total ? product % BigInt(total) : BigInt(0) };
  });
  let remaining = amount - rows.reduce((n,l) => n + l.value, 0);
  for (const row of [...rows].sort((a,b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining-- > 0) row.value++;
  }
  return new Map(rows.map(l => [l.id,l.value]));
}
export function priceCommercialLines(lines: CommercialLine[], discountCents = 0, feeCents = 0, feeTaxRateBasisPoints = 0) {
  if (lines.length > 500) throw new Error('Order has too many commercial lines');
  cents(feeCents);
  const eligible = lines.filter(l => l.discountEligible !== false);
  const discounts = allocateCents(discountCents, eligible.map(l => ({id:l.id,basis:l.subtotalCents})));
  const priced = lines.map(l => {
    const subtotalCents = cents(l.subtotalCents);
    const rate = normalizeTaxRateBps(l.taxRateBasisPoints);
    const discount = discounts.get(l.id) || 0;
    const taxCents = Number((BigInt(subtotalCents - discount) * BigInt(rate) + BigInt(5000)) / BigInt(10000));
    return {...l,discountCents:discount,taxCents,totalCents:subtotalCents-discount+taxCents};
  });
  const feeTaxCents = Number((BigInt(feeCents) * BigInt(normalizeTaxRateBps(feeTaxRateBasisPoints)) + BigInt(5000)) / BigInt(10000));
  const subtotalCents = priced.reduce((n,l)=>n+l.subtotalCents,0);
  const taxCents = priced.reduce((n,l)=>n+l.taxCents,feeTaxCents);
  const totalCents = cents(subtotalCents-discountCents+taxCents+feeCents);
  return {lines:priced,subtotalCents,discountCents,taxCents,feeCents,feeTaxCents,totalCents};
}
export function isCouponLineEligible(product: any, coupon: any) {
  if (!coupon) return true;
  const categories = Array.isArray(coupon.productCategories) ? coupon.productCategories : [];
  const excluded = Array.isArray(coupon.excludedProducts) ? coupon.excludedProducts : [];
  return !!product?.id && (!categories.length || categories.includes(product.department)) && !excluded.includes(product.id);
}
