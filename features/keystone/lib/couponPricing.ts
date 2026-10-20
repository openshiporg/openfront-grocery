import { publicError } from './publicError';
import { couponRestrictionsValid, isCouponLineEligible } from './commercialPricing';

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
  categoryTaxonomy?: string | null;
};

export function calculateCouponDiscount(coupon: CouponCandidate, items: Array<{ quantity: number; product?: { id?: string; price?: number; priceCents?: number; department?: string | null; departmentRef?: { handle?: string | null } | null } | null }>, now = new Date()) {
  if (!coupon.isActive) throw publicError(`Coupon ${coupon.code} is not active. Remove it to continue.`, 'COUPON_INVALID');
  if (coupon.validFrom && new Date(coupon.validFrom) > now) throw publicError(`Coupon ${coupon.code} is not valid yet. Remove it to continue.`, 'COUPON_INVALID');
  if (coupon.validTo && new Date(coupon.validTo) < now) throw publicError(`Coupon ${coupon.code} has expired. Remove it to continue.`, 'COUPON_INVALID');
  if ((coupon.maxUses || 0) > 0 && (coupon.currentUses || 0) >= (coupon.maxUses || 0)) throw publicError(`Coupon ${coupon.code} has been fully redeemed. Remove it to continue.`, 'COUPON_INVALID');

  const subtotalCents = items.reduce((sum, item) => sum + (Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity), 0);
  const minPurchaseCents = Number(coupon.minPurchaseCents || Math.round(Number(coupon.minPurchase || 0) * 100));
  if (minPurchaseCents && subtotalCents < minPurchaseCents) throw publicError(`Coupon ${coupon.code} requires a minimum purchase of $${(minPurchaseCents / 100).toFixed(2)}.`, 'COUPON_INVALID');

  if (!couponRestrictionsValid(coupon)) throw publicError(`Coupon ${coupon.code} cannot be applied right now. Remove it or contact the store.`, 'COUPON_INVALID');
  const eligible = items.filter((item) => isCouponLineEligible(item.product, coupon));
  const eligibleSubtotalCents = eligible.reduce((sum, item) => sum + Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)) * item.quantity, 0);
  let discountCents = 0;
  if (coupon.discountType === 'percentage') discountCents = Math.round(eligibleSubtotalCents * (Number(coupon.discountValue) / 100));
  else if (coupon.discountType === 'fixed') discountCents = Number(coupon.discountValueCents || Math.round(Number(coupon.discountValue) * 100));
  else if (coupon.discountType === 'bogo') discountCents = eligible.reduce((sum, item) => sum + Math.floor(item.quantity / 2) * Number(item.product?.priceCents || Math.round(Number(item.product?.price || 0) * 100)), 0);
  else throw new Error(`Unsupported coupon type ${coupon.discountType}`);
  return Math.max(0, Math.min(eligibleSubtotalCents, discountCents)) / 100;
}
