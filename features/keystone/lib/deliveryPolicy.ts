import { publicError } from './publicError';
import { formatDeliveryArea } from '../../storefront/lib/marketFormatting';

export type DeliveryPolicy = { version: 1; pickupMinimumCents: number; deliveryMinimumCents: number; postalPrefixes: string[]; deliveryFeeCents: number; feeTaxRateBasisPoints: number };
export function normalizeDeliveryPolicy(raw: any): DeliveryPolicy {
  const value = raw || {};
  const read = (key: string, max = 100000000) => {
    const n = Number(value[key] ?? 0);
    if (!Number.isSafeInteger(n) || n < 0 || n > max) throw publicError(`Invalid ${key}`);
    return n;
  };
  if (value.version !== undefined && value.version !== 1) throw publicError('Unsupported delivery policy version');
  if (value.postalPrefixes !== undefined && !Array.isArray(value.postalPrefixes)) throw publicError('Postal prefixes must be a list');
  const prefixes = (value.postalPrefixes || []).map((s: unknown) => {
    if (typeof s !== 'string') throw publicError('Invalid postal prefix');
    const normalized = s.replace(/\s/g,'').toUpperCase();
    if (!/^[A-Z0-9-]{3,12}$/.test(normalized)) throw publicError('Use explicit postal prefixes of at least three characters');
    return normalized;
  });
  if (prefixes.length > 200) throw publicError('Too many service areas');
  return {version:1,pickupMinimumCents:read('pickupMinimumCents'),deliveryMinimumCents:read('deliveryMinimumCents'),postalPrefixes:[...new Set<string>(prefixes)],deliveryFeeCents:read('deliveryFeeCents'),feeTaxRateBasisPoints:read('feeTaxRateBasisPoints',10000)};
}
export function evaluateDeliveryPolicy(raw: unknown, method: 'delivery'|'pickup', postalCode: string, goodsAfterDiscountCents: number) {
  const policy = normalizeDeliveryPolicy(raw);
  if (!Number.isSafeInteger(goodsAfterDiscountCents) || goodsAfterDiscountCents < 0) throw new Error('Invalid basket amount');
  const minimum = method === 'pickup' ? policy.pickupMinimumCents : policy.deliveryMinimumCents;
  if (goodsAfterDiscountCents < minimum) throw publicError(`The ${method} minimum is $${(minimum/100).toFixed(2)} before tax and fees. Add $${((minimum-goodsAfterDiscountCents)/100).toFixed(2)} more to your basket${method==='delivery'?' or choose pickup':''}.`, 'FULFILLMENT_MINIMUM');
  if (method === 'delivery') {
    const postal = postalCode.replace(/\s/g,'').toUpperCase();
    if (!/^[A-Z0-9-]{3,12}$/.test(postal)) throw publicError('Enter a valid delivery postal code.', 'DELIVERY_AREA');
    if (!policy.postalPrefixes.some(prefix=>postal.startsWith(prefix))) throw publicError(policy.postalPrefixes.length
      ? `We don't deliver to postal code ${postal}. We deliver to ${formatDeliveryArea(policy.postalPrefixes)}. Change the address or choose pickup.`
      : 'Delivery is not available right now. Choose pickup instead.', 'DELIVERY_AREA');
  }
  return {policy,feeCents:method==='delivery'?policy.deliveryFeeCents:0,feeTaxRateBasisPoints:method==='delivery'?policy.feeTaxRateBasisPoints:0};
}
