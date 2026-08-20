import type { ReactNode } from 'react';
import Link from 'next/link';

export type PlatformSearchParams = Record<string, string | string[] | undefined>;

export function queryValue(params: PlatformSearchParams | undefined, key: string) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function humanize(value?: string | null) {
  return value ? value.replaceAll('_', ' ') : 'Unknown';
}

export function PlatformMetricGrid({
  metrics,
}: {
  metrics: Array<{ label: string; value: ReactNode; note?: string; tone?: 'default' | 'warning' | 'critical' }>;
}) {
  return (
    <section aria-label="Summary metrics" className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${metric.tone === 'critical' ? 'text-destructive' : metric.tone === 'warning' ? 'text-amber-700 dark:text-amber-400' : ''}`}>{metric.value}</p>
          {metric.note ? <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p> : null}
        </div>
      ))}
    </section>
  );
}

const statusTones: Record<string, string> = {
  pending: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  picking: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  packed: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  ready_for_pickup: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
  out_for_delivery: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  failed: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  cancelled: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  canceled: 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  refunded: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  partially_refunded: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  processing: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
};

export function PlatformStatusBadge({ status, label }: { status?: string | null; label?: string }) {
  const normalized = status || 'unknown';
  return <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTones[normalized] || 'bg-muted/50 text-muted-foreground'}`}>{label || humanize(normalized)}</span>;
}

export function PlatformToolbar({
  search,
  searchPlaceholder = 'Search records',
  filter,
  filterLabel = 'Status',
  filterOptions = [],
  sort,
  sortOptions = [],
  resultCount,
}: {
  search?: string;
  searchPlaceholder?: string;
  filter?: string;
  filterLabel?: string;
  filterOptions?: Array<{ value: string; label: string }>;
  sort?: string;
  sortOptions?: Array<{ value: string; label: string }>;
  resultCount?: number;
}) {
  return (
    <form method="get" role="search" className="flex flex-col gap-3 rounded-xl border bg-background p-3 lg:flex-row lg:items-end">
      <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-muted-foreground">
        Search
        <input name="q" defaultValue={search} placeholder={searchPlaceholder} className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
      </label>
      {filterOptions.length ? (
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          {filterLabel}
          <select name="filter" defaultValue={filter || 'all'} className="h-10 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      ) : null}
      {sortOptions.length ? (
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Sort
          <select name="sort" defaultValue={sort || sortOptions[0]?.value} className="h-10 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      ) : null}
      <div className="flex items-center gap-2">
        <button type="submit" className="h-10 whitespace-nowrap rounded-md bg-foreground px-4 text-sm font-medium text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Apply</button>
        {(search || (filter && filter !== 'all') || sort) ? <Link href="?" className="inline-flex h-10 items-center whitespace-nowrap rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Reset</Link> : null}
      </div>
      {typeof resultCount === 'number' ? <output className="pb-2 text-xs tabular-nums text-muted-foreground lg:ml-auto">{resultCount} shown</output> : null}
    </form>
  );
}

export function PlatformSurface({ title, description, action, children, className = '' }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border bg-background ${className}`}>
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between md:px-5">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function PlatformEmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="grid min-h-40 place-items-center px-5 py-10 text-center"><div className="max-w-md"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</div></div>;
}

export function PlatformErrorState({ title = 'This workspace could not load', description }: { title?: string; description?: string }) {
  return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"><p className="font-semibold text-destructive">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description || 'The request failed safely. Refresh to retry; no workflow action was submitted.'}</p></div>;
}

export function PlatformTruthNotice({ title, children, tone = 'neutral' }: { title: string; children: ReactNode; tone?: 'neutral' | 'warning' }) {
  return <aside className={`rounded-xl border p-4 ${tone === 'warning' ? 'border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20' : 'bg-muted/30'}`}><p className="text-sm font-semibold">{title}</p><div className="mt-1 text-sm text-muted-foreground">{children}</div></aside>;
}

export function PlatformDetails({ summary, children, className = '' }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return <details className={`group ${className}`}><summary className="cursor-pointer list-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{summary}</summary><div className="border-t bg-muted/15 p-4 md:p-5">{children}</div></details>;
}
