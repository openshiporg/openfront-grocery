import Link from 'next/link';

export type PlatformPagination = { page: number; pageSize: number; collections: Record<string, { total: number; totalPages: number }> };

export function PlatformPageLinks({ pagination, path, searchParams = {} }: {
  pagination?: PlatformPagination | null; path: string; searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (!pagination) return null;
  const totalPages = Math.max(1, ...Object.values(pagination.collections).map(collection => collection.totalPages));
  const href = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (typeof value === 'string' && key !== 'page') query.set(key, value);
    query.set('page', String(page)); query.set('pageSize', String(pagination.pageSize));
    return `${path}?${query}`;
  };
  return <nav aria-label="Record pages" className="space-y-3 rounded-xl border bg-background p-4">
    <form action={path} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs font-medium">Search all records<input name="search" defaultValue={typeof searchParams.search === 'string' ? searchParams.search : ''} className="h-10 rounded-md border bg-background px-3 text-sm" /></label>
      <input name="pageSize" type="hidden" value={pagination.pageSize} />
      {typeof searchParams.status === 'string' && <input name="status" type="hidden" value={searchParams.status} />}
      <button className="h-10 rounded-md border px-3 text-sm">Search</button>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>Page {pagination.page} of {totalPages} · Up to {pagination.pageSize} records per collection</p>
      <div className="flex gap-3">{pagination.page > 1 && <Link className="inline-flex min-h-10 items-center rounded-md border px-3" href={href(pagination.page - 1)}>Previous</Link>}{pagination.page < totalPages && <Link className="inline-flex min-h-10 items-center rounded-md border px-3" href={href(pagination.page + 1)}>Next</Link>}</div>
    </div>
    <p className="text-xs text-muted-foreground">{Object.entries(pagination.collections).map(([name, collection]) => `${name.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${collection.total} total`).join(' · ')}</p>
  </nav>;
}
