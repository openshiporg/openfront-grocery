import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { platformButton } from './platformStyles';

export type PlatformPagination = { page: number; pageSize: number; collections: Record<string, { total: number; totalPages: number }> };

const disabledPager = 'pointer-events-none opacity-40';

/** Footer pager rendered at the bottom of a panel. `hrefFor` returns null for out-of-range pages. */
export function PlatformPager({ page, totalPages, hrefFor, summary, label = 'Pages' }: { page: number; totalPages: number; hrefFor: (page: number) => string; summary?: ReactNode; label?: string }) {
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  if (!summary && !hasPrevious && !hasNext) return null;
  return (
    <nav aria-label={label} className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-5">
      <p className="tabular-nums">{summary ?? <>Page {page} of {Math.max(1, totalPages)}</>}</p>
      {hasPrevious || hasNext ? (
        <div className="flex items-center gap-2">
          <Link aria-disabled={!hasPrevious} tabIndex={hasPrevious ? undefined : -1} href={hasPrevious ? hrefFor(page - 1) : '#'} className={platformButton('secondary', 'sm', hasPrevious ? '' : disabledPager)}>
            <ChevronLeft aria-hidden="true" />Previous
          </Link>
          <span className="px-1 tabular-nums">{page} / {Math.max(1, totalPages)}</span>
          <Link aria-disabled={!hasNext} tabIndex={hasNext ? undefined : -1} href={hasNext ? hrefFor(page + 1) : '#'} className={platformButton('secondary', 'sm', hasNext ? '' : disabledPager)}>
            Next<ChevronRight aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </nav>
  );
}

/** Server-paged collections. Search uses the toolbar's `q`, which the projections already send as the server search term. */
export function PlatformPageLinks({ pagination, path, searchParams = {}, pageParam = 'page' }: {
  pagination?: PlatformPagination | null; path: string; searchParams?: Record<string, string | string[] | undefined>;
  /** URL parameter for this pager, so several independently paged queues can share one screen. */
  pageParam?: string;
}) {
  if (!pagination) return null;
  const totalPages = Math.max(1, ...Object.values(pagination.collections).map(collection => collection.totalPages));
  const href = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (typeof value === 'string' && key !== pageParam && key !== 'pageSize') query.set(key, value);
    query.set(pageParam, String(page));
    return `${path}?${query}`;
  };
  const totals = Object.entries(pagination.collections).map(([name, collection]) => `${collection.total} ${name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`).join(' · ');
  return (
    <PlatformPager
      page={pagination.page}
      totalPages={totalPages}
      hrefFor={href}
      label="Record pages"
      summary={<>Page {pagination.page} of {totalPages} · up to {pagination.pageSize} per collection{totals ? <span className="hidden md:inline"> · {totals}</span> : null}</>}
    />
  );
}
