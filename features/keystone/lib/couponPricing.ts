export type CouponCandidate = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  discountValueCents?: number | null;
  minPurchase?: number | null;
  minPurchaseCents?: number | null;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
  isActive: boolean;
  maxUses?: number | null;
  currentUses?: number | null;
  productCategories?: unknown;
  excludedProducts?: unknown;
};

export function calculateCouponDiscount(coupon: CouponCandidate, items: Array<{ quantity: number; product?: { id?: string; price?: number; priceCents?: number; department?: string | null } | null }>, now = new Date()) {
  if (!coupon.isActive) throw new Error(`Coupon ${coupon.code} is inactive`);
  if (coupon.validFrom && new Date(coupon.validFrom) > now) throw new Error(`Coupon ${coupon.code} is not yet valid`);
  if (coupon.validTo && new Date(coupon.validTo) < now) throw new Error(`Coupon ${coupon.code} has expired`);
  if ((coupon.maxUses || 0) > 0 && (coupon.currentUses || 0) >= (coupon.maxUses || 0)) throw new Error(`Coupon ${coupon.code} has reached its maximum uses`);

  const subtotalCents = items.reduce((sum, item) => sum + (Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity), 0);
  const minPurchaseCents = Number(coupon.minPurchaseCents || Math.round(Number(coupon.minPurchase || 0) * 100));
  if (minPurchaseCents && subtotalCents < minPurchaseCents) throw new Error(`Coupon ${coupon.code} requires a minimum purchase of ${(minPurchaseCents / 100).toFixed(2)}`);

  const categories = Array.isArray(coupon.productCategories) ? coupon.productCategories : [];
  const excluded = Array.isArray(coupon.excludedProducts) ? coupon.excludedProducts : [];
  const eligible = items.filter((item) => {
    const product = item.product;
    if (!product?.id) return false;
    if (categories.length && !categories.includes(product.department)) return false;
    if (excluded.includes(product.id)) return false;
    return true;
  });
  const eligibleSubtotalCents = eligible.reduce((sum, item) => sum + Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity, 0);
  let discountCents = 0;
  if (coupon.discountType === 'percentage') discountCents = Math.round(eligibleSubtotalCents * (Number(coupon.discountValue) / 100));
  else if (coupon.discountType === 'fixed') discountCents = Number(coupon.discountValueCents || Math.round(Number(coupon.discountValue) * 100));
  else if (coupon.discountType === 'bogo') discountCents = eligible.reduce((sum, item) => sum + Math.floor(item.quantity / 2) * Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)), 0);
  else throw new Error(`Unsupported coupon type ${coupon.discountType}`);
  return Math.max(0, Math.min(subtotalCents, discountCents)) / 100;
}
