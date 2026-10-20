/** One parser for list page numbers in URLs: a whole number from 1 to 100000, otherwise 1. */
export function parsePageParam(value: unknown, max = 100_000) {
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string' || !/^\d{1,6}$/.test(text.trim())) return 1;
  const page = Number(text.trim());
  return Number.isSafeInteger(page) && page >= 1 && page <= max ? page : 1;
}
