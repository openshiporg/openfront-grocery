/** Catalog/cart amounts are dollars; order amounts use the explicit cents formatter. */
export function formatMoney(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '—';
}
export function formatCents(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? `$${(value / 100).toFixed(2)}` : '—';
}
