/** SKU identity is Store-local, case-sensitive and trimmed at the boundary. */
export function normalizeProductSku(value: unknown): string {
  if (value !== null && value !== undefined && typeof value !== 'string') throw new Error('Product SKU must be text');
  const sku = (value || '').trim();
  if (sku.length > 100 || /[\u0000-\u001f\u007f]/.test(sku)) throw new Error('Product SKU must be at most 100 characters without control characters');
  return sku;
}

/** Collision-free tuple encoding; null permits multiple genuinely blank SKUs. */
export function deriveProductSkuIdentity(storeId: string, value: unknown): string | null {
  if (!storeId) throw new Error('Product SKU identity requires a Store');
  const sku = normalizeProductSku(value);
  return sku ? JSON.stringify([storeId, sku]) : null;
}
