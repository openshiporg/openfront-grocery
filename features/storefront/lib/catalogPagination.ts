export function parseCatalogPage(value: string | undefined) {
  const parsed = Number.parseInt(value || '1', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function catalogTotalPages(totalCount: number, pageSize: number) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('Catalog page size must be a positive integer');
  }
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / pageSize));
}

export function catalogPageHref(
  pathname: string,
  params: Record<string, string | undefined>,
  page: number,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  if (page > 1) query.set('page', String(page));
  else query.delete('page');
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}
