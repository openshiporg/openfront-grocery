/**
 * Merchant-entered amounts are typed in ordinary units ("12.34", "8.75%") and
 * converted exactly to stored integers (1234 cents, 875 basis points) without
 * floating point. Invalid or over-precise input returns null.
 */
function exactHundredths(text: string, max: number) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ''));
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(value) && value <= max ? value : null;
}

/** "12.34" → 1234 (cents). */
export function parseMoneyToCents(text: string, max = 2_147_483_647) {
  return exactHundredths(text.replace(/^\$/, ''), max);
}

/** "8.75" or "8.75%" → 875 (basis points), at most 100%. */
export function parsePercentToBps(text: string) {
  return exactHundredths(text.replace(/%$/, ''), 10_000);
}

export function centsToInput(cents: number | null | undefined) {
  const value = Number(cents || 0);
  return `${Math.trunc(value / 100)}.${String(Math.abs(value % 100)).padStart(2, '0')}`;
}

export function bpsToInput(bps: number | null | undefined) {
  const value = Number(bps || 0);
  return `${Math.trunc(value / 100)}${value % 100 ? `.${String(value % 100).padStart(2, '0').replace(/0$/, '')}` : ''}`;
}
