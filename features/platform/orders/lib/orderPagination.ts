type OrderSearchParams = Record<string, string | string[] | undefined>;

export function orderPageHref(page: number, params: OrderSearchParams): string {
  const query = new URLSearchParams();
  for (const key of ['q', 'filter', 'sort'] as const) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) query.set(key, value);
  }
  query.set('page', String(page));
  return `/dashboard/platform/orders?${query.toString()}`;
}
