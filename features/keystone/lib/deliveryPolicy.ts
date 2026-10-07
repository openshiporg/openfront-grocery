export type DeliveryPolicy = { version: 1; pickupMinimumCents: number; deliveryMinimumCents: number; postalPrefixes: string[]; deliveryFeeCents: number; feeTaxRateBasisPoints: number };
export function normalizeDeliveryPolicy(raw: any): DeliveryPolicy {
  const value = raw || {};
  const read = (key: string, max = 100000000) => {
    const n = Number(value[key] ?? 0);
    if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(`Invalid ${key}`);
    return n;
  };
  if (value.version !== undefined && value.version !== 1) throw new Error('Unsupported delivery policy version');
  if (value.postalPrefixes !== undefined && !Array.isArray(value.postalPrefixes)) throw new Error('Postal prefixes must be a list');
  const prefixes = (value.postalPrefixes || []).map((s: unknown) => {
    if (typeof s !== 'string') throw new Error('Invalid postal prefix');
    const normalized = s.replace(/\s/g,'').toUpperCase();
    if (!/^[A-Z0-9-]{3,12}$/.test(normalized)) throw new Error('Use explicit postal prefixes of at least three characters');
    return normalized;
  });
  if (prefixes.length > 200) throw new Error('Too many service areas');
  return {version:1,pickupMinimumCents:read('pickupMinimumCents'),deliveryMinimumCents:read('deliveryMinimumCents'),postalPrefixes:[...new Set<string>(prefixes)],deliveryFeeCents:read('deliveryFeeCents'),feeTaxRateBasisPoints:read('feeTaxRateBasisPoints',10000)};
}
export function evaluateDeliveryPolicy(raw: unknown, method: 'delivery'|'pickup', postalCode: string, goodsAfterDiscountCents: number) {
  const policy = normalizeDeliveryPolicy(raw);
  if (!Number.isSafeInteger(goodsAfterDiscountCents) || goodsAfterDiscountCents < 0) throw new Error('Invalid basket amount');
  const minimum = method === 'pickup' ? policy.pickupMinimumCents : policy.deliveryMinimumCents;
  if (goodsAfterDiscountCents < minimum) throw new Error(`The ${method} minimum is ${(minimum/100).toFixed(2)} before tax and fees`);
  if (method === 'delivery') {
    const postal = postalCode.replace(/\s/g,'').toUpperCase();
    if (!/^[A-Z0-9-]{3,12}$/.test(postal) || !policy.postalPrefixes.some(prefix=>postal.startsWith(prefix))) throw new Error('This address is outside the configured delivery area');
  }
  return {policy,feeCents:method==='delivery'?policy.deliveryFeeCents:0,feeTaxRateBasisPoints:method==='delivery'?policy.feeTaxRateBasisPoints:0};
}
