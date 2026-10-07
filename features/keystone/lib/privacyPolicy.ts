// Product retention policy, not a statement of any jurisdiction's law. Operators
// must review this source-owned value before launch and record policy changes.
export const CUSTOMER_PRIVACY_POLICY = {
  version: 'grocery-retention-v1',
  commerceRetentionDays: 2555,
  description: 'Commerce evidence is retained for 2,555 days after the latest order. Account erasure is deferred while an order is active or within this period; afterward identity/contact fields are pseudonymized while financial, inventory and audit facts remain.',
} as const;
export function privacyErasureEligibility(orders: Array<{ status: string; createdAt: Date | string }>, now = new Date()) {
  if (orders.some((order) => !['delivered', 'cancelled'].includes(order.status))) return { eligible: false, eligibleAt: null, reason: 'An order is still active or awaiting resolution' };
  const latest = orders.reduce((time, order) => Math.max(time, new Date(order.createdAt).getTime()), 0);
  const eligibleAt = latest ? new Date(latest + CUSTOMER_PRIVACY_POLICY.commerceRetentionDays * 86_400_000) : now;
  return { eligible: eligibleAt.getTime() <= now.getTime(), eligibleAt, reason: eligibleAt.getTime() <= now.getTime() ? '' : 'Commerce evidence remains within the configured retention period' };
}
export function customerExportIdentity(user: any) { return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }; }
export function scrubOrderContactMetadata(metadata: unknown) {
  const contactKey = /(email|phone|address|token|secret|password|recipient|contact|customerName|consentCustomer|vehicle|firstName|lastName)/i;
  const retainedString = /(^id$|Id$|Ids$|Hash$|^hash$|^status$|^state$|^kind$|^source$|^sourceType$|^resolution$|^currency(Code)?$|^unitOfMeasure$|^pricingMethod$|^productTitle$|^productSku$|^sku$|^fulfillmentMethod$|^disposition$|^custody$|At$|^date$|^timeWindow$|^policyVersion$)/;
  function scrub(value: any, key = ''): any {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return retainedString.test(key) ? value : '[redacted]';
    if (Array.isArray(value)) return value.map(entry => scrub(entry,key));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([name]) => !contactKey.test(name)).map(([name,entry]) => [name,scrub(entry,name)]));
    return null;
  }
  return { ...scrub(metadata || {}), privacy: { policyVersion: CUSTOMER_PRIVACY_POLICY.version, pseudonymized: true } };
}
