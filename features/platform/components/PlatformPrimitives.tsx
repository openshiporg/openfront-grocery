import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronRight, Inbox, Info, RotateCw, Search, TriangleAlert, type LucideIcon } from 'lucide-react';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { EmptyState } from '@/components/ui/empty-state';
import { platformButton, platformInput, platformSelect } from './platformStyles';

export * from './PlatformForm';
export { humanize, PlatformStatusBadge } from './PlatformStatus';
export { platformButton, platformCheckbox, platformInput, platformNumberInput, platformSelect, platformTable, platformTextarea } from './platformStyles';

export type PlatformSearchParams = Record<string, string | string[] | undefined>;

export function queryValue(params: PlatformSearchParams | undefined, key: string) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

/** Builds an href on `path` from the current params, applying overrides and always dropping `page`. */
export function platformHref(path: string, params: PlatformSearchParams | undefined, overrides: Record<string, string | null | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params || {})) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== 'page') query.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === '') query.delete(key);
    else query.set(key, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/* ───────────────────────────── Page frame ───────────────────────────── */

export function PlatformPage({
  title,
  description,
  breadcrumb,
  actions,
  meta,
  children,
}: {
  title: string;
  description?: ReactNode;
  breadcrumb?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: breadcrumb || title },
  ];
  const header = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-balance md:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p> : null}
        {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
  return (
    <PageContainer title={title} header={header} breadcrumbs={breadcrumbs}>
      <div className="space-y-5 px-4 pb-12 md:px-6">{children}</div>
    </PageContainer>
  );
}

const workflowSteps = [
  { key: 'orders', label: 'Orders', href: '/dashboard/platform/orders' },
  { key: 'fulfillment', label: 'Pick & pack', href: '/dashboard/platform/fulfillment' },
  { key: 'delivery', label: 'Delivery', href: '/dashboard/platform/delivery' },
  { key: 'pickup', label: 'Pickup', href: '/dashboard/platform/pickup' },
] as const;

/** In-page switcher across the order → pick → hand-off flow. The dashboard sidebar stays the primary navigation. */
export function PlatformWorkflowNav({ current }: { current: (typeof workflowSteps)[number]['key'] }) {
  return (
    <nav aria-label="Order flow" className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border bg-muted/40 p-0.5 [scrollbar-width:none]">
      {workflowSteps.map((step, index) => {
        const active = step.key === current;
        return (
          <span key={step.key} className="flex items-center">
            {index > 0 && index < 3 ? <ChevronRight className="mx-0.5 size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" /> : index === 3 ? <span className="mx-1 text-xs text-muted-foreground/60" aria-hidden="true">/</span> : null}
            <Link
              href={step.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 ${active ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {step.label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}

export function PlatformLinkButton({ href, children, variant = 'secondary', size = 'md', icon: Icon }: { href: string; children: ReactNode; variant?: Parameters<typeof platformButton>[0]; size?: Parameters<typeof platformButton>[1]; icon?: LucideIcon }) {
  return <Link href={href} className={platformButton(variant, size)}>{Icon ? <Icon aria-hidden="true" /> : null}{children}</Link>;
}

export function PlatformChip({ children, icon: Icon, className = '' }: { children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground ${className}`}>
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* ───────────────────────────── Metrics ───────────────────────────── */

type MetricTone = 'default' | 'warning' | 'critical' | 'positive';
const metricValueTone: Record<MetricTone, string> = {
  default: '',
  warning: 'text-amber-700 dark:text-amber-400',
  critical: 'text-destructive',
  positive: 'text-emerald-700 dark:text-emerald-400',
};
const metricDotTone: Record<MetricTone, string> = {
  default: 'bg-muted-foreground/40',
  warning: 'bg-amber-500',
  critical: 'bg-destructive',
  positive: 'bg-emerald-500',
};
const metricCols: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' };

export function PlatformMetricGrid({
  metrics,
}: {
  metrics: Array<{ label: string; value: ReactNode; note?: ReactNode; tone?: MetricTone; href?: string }>;
}) {
  return (
    <section
      aria-label="Summary metrics"
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-xs ${metricCols[metrics.length] || 'lg:grid-cols-4'} [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1`}
    >
      {metrics.map((metric) => {
        const tone = metric.tone || 'default';
        const body = (
          <>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className={`size-1.5 shrink-0 rounded-full ${metricDotTone[tone]}`} aria-hidden="true" />
              <span className="truncate">{metric.label}</span>
              {metric.href ? <ArrowRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover/metric:opacity-100" aria-hidden="true" /> : null}
            </p>
            <div className={`mt-1.5 text-xl font-semibold tracking-tight tabular-nums md:text-2xl ${metricValueTone[tone]}`}>{metric.value}</div>
            {metric.note ? <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{metric.note}</p> : null}
          </>
        );
        return metric.href ? (
          <Link key={metric.label} href={metric.href} className="group/metric min-w-0 bg-card px-4 py-3.5 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50">{body}</Link>
        ) : (
          <div key={metric.label} className="min-w-0 bg-card px-4 py-3.5">{body}</div>
        );
      })}
    </section>
  );
}

export function PlatformMeter({ value, max, label, tone }: { value: number; max: number; label?: string; tone?: 'auto' | 'neutral' | 'positive' }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const color = tone === 'neutral' ? 'bg-foreground/60' : tone === 'positive' ? 'bg-emerald-500' : percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="min-w-0" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/* ───────────────────────────── Filtering ───────────────────────────── */

export type PlatformTab = { value: string; label: string; count?: number | null; tone?: 'default' | 'attention' };

/** URL-driven status tabs. Each tab is a real link, so filters survive refresh and are shareable. */
export function PlatformTabs({ tabs, active, path, params, param = 'filter', label = 'Filter records' }: { tabs: PlatformTab[]; active: string; path: string; params?: PlatformSearchParams; param?: string; label?: string }) {
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto px-2 [scrollbar-width:none] md:px-3">
      {tabs.map((tab) => {
        const selected = tab.value === active;
        return (
          <Link
            key={tab.value}
            href={platformHref(path, params, { [param]: tab.value })}
            aria-current={selected ? 'page' : undefined}
            scroll={false}
            className={`relative inline-flex h-10 shrink-0 items-center gap-2 rounded-t-md px-2.5 text-sm font-medium outline-none transition-colors focus-visible:bg-muted/50 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors ${selected ? 'text-foreground after:bg-foreground' : 'text-muted-foreground after:bg-transparent hover:text-foreground'}`}
          >
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span className={`min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums ${tab.tone === 'attention' && tab.count > 0 ? 'bg-destructive/10 text-destructive' : selected ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>{tab.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
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
  resultLabel = 'shown',
  preserve,
  path,
  children,
}: {
  search?: string;
  searchPlaceholder?: string;
  filter?: string;
  filterLabel?: string;
  /** Rendered as a select only when no tabs drive the filter. */
  filterOptions?: Array<{ value: string; label: string }>;
  sort?: string;
  sortOptions?: Array<{ value: string; label: string }>;
  resultCount?: number;
  resultLabel?: string;
  /** Hidden params kept on submit (e.g. the active tab). */
  preserve?: Record<string, string | undefined>;
  /** Base path for the reset link; defaults to the current route. */
  path?: string;
  children?: ReactNode;
}) {
  const preserved = Object.entries(preserve || {}).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const resetQuery = new URLSearchParams(preserved).toString();
  const resetHref = `${path || ''}${resetQuery ? `?${resetQuery}` : path ? '' : '?'}`;
  const filtered = Boolean(search || (sort && sort !== sortOptions[0]?.value) || (filterOptions.length && filter && filter !== filterOptions[0]?.value));
  return (
    <form method="get" role="search" className="flex flex-col gap-2 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center md:px-5">
      {preserved.map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <label className="relative min-w-0 flex-1 sm:min-w-56">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input name="q" type="search" defaultValue={search} placeholder={searchPlaceholder} className={`${platformInput} pl-8`} />
      </label>
      {filterOptions.length ? (
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="whitespace-nowrap">{filterLabel}</span>
          <select name="filter" defaultValue={filter || filterOptions[0]?.value} className={`${platformSelect} sm:w-auto`}>
            {filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      ) : null}
      {sortOptions.length ? (
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="whitespace-nowrap">Sort</span>
          <select name="sort" defaultValue={sort || sortOptions[0]?.value} className={`${platformSelect} sm:w-auto`}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      ) : null}
      {children}
      <div className="flex items-center gap-2">
        <button type="submit" className={platformButton('secondary', 'md')}>Apply</button>
        {filtered ? <Link href={resetHref} className={platformButton('ghost', 'md')}>Reset</Link> : null}
      </div>
      {typeof resultCount === 'number' ? <output className="text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:ml-auto">{resultCount} {resultLabel}</output> : null}
    </form>
  );
}

/* ───────────────────────────── Surfaces ───────────────────────────── */

export function PlatformSurface({
  title,
  description,
  action,
  count,
  icon: Icon,
  children,
  className = '',
  id,
  tabs,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  count?: number | null;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Rendered flush under the header, e.g. `<PlatformTabs>`. */
  tabs?: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-20 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs ${className}`}>
      <header className={`flex flex-col gap-3 px-4 pt-3.5 sm:flex-row sm:items-start sm:justify-between md:px-5 ${tabs ? 'pb-1' : 'border-b pb-3.5'}`}>
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold leading-6">
              {title}
              {typeof count === 'number' ? <span className="rounded-full bg-muted px-2 py-px text-xs font-medium tabular-nums text-muted-foreground">{count}</span> : null}
            </h2>
            {description ? <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </header>
      {tabs ? <div className="border-b">{tabs}</div> : null}
      {children}
    </section>
  );
}

/** Expandable record row. The summary holds the scan line; the body holds evidence and actions. */
export function PlatformDetails({ summary, children, className = '', defaultOpen = false }: { summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className={`group/row ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 group-open/row:bg-muted/30 md:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">{summary}</div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/row:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t bg-muted/20 px-4 py-4 md:px-5 md:py-5">{children}</div>
    </details>
  );
}

export function PlatformList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y ${className}`}>{children}</div>;
}

/** Field name for a value in a list row, read by assistive technology (the visual column captions are hidden from it). */
export function PlatformCellLabel({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}: </span>;
}

/**
 * Column captions for list rows, aligned with the `grid` used inside each summary. Hidden on small screens.
 * `static` drops the chevron gutter for plain (non-expandable) rows.
 */
export function PlatformListHeader({ className, children, static: plain = false }: { className: string; children: ReactNode; static?: boolean }) {
  return <div aria-hidden="true" className={`hidden items-center gap-3 border-b bg-muted/30 py-2 pl-4 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:pl-5 ${plain ? 'pr-4 md:pr-5' : 'pr-11 md:pr-12'} ${className}`}>{children}</div>;
}

export function PlatformFacts({ items, columns = 3, className = '' }: { items: Array<{ label: ReactNode; value: ReactNode; mono?: boolean; wide?: boolean }>; columns?: 2 | 3 | 4; className?: string }) {
  const cols = columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3';
  return (
    <dl className={`grid grid-cols-2 gap-x-6 gap-y-3.5 ${cols} ${className}`}>
      {items.map((item, index) => (
        <div key={index} className={`min-w-0 ${item.wide ? 'col-span-2 sm:col-span-full' : ''}`}>
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className={`mt-0.5 text-sm font-medium break-words ${item.mono ? 'font-mono text-xs' : ''}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────────────────────── States ───────────────────────────── */

/**
 * Platform adapter over the family's shared EmptyState: same heading, icon and
 * copy hierarchy. Actions are links or buttons rendered under it (the shared
 * component's own action is a client callback); `compact` only tightens spacing
 * for secondary panels.
 */
export function PlatformEmptyState({ title, description, action, icon: Icon = Inbox, compact = false }: { title: string; description: string; action?: ReactNode; icon?: LucideIcon; compact?: boolean }) {
  return (
    <div className={compact ? 'pb-6' : 'pb-10'}>
      <EmptyState title={title} description={description} icons={[Icon]} className={compact ? 'px-4 pt-8 pb-0' : 'px-6 pt-14 pb-0'} />
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function PlatformErrorState({ title = 'This workspace could not load', description, retryHref }: { title?: string; description?: string; retryHref?: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
        <TriangleAlert className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-destructive">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{description || 'This information could not be loaded. Retry to load the latest records.'}</p>
        {retryHref ? <Link href={retryHref} className={`${platformButton('secondary', 'sm')} mt-3`}><RotateCw aria-hidden="true" />Retry</Link> : null}
      </div>
    </div>
  );
}

/** Operating-boundary disclosure. Kept one click away so policy text never pushes the work queue below the fold. */
export function PlatformTruthNotice({ title, children, tone = 'neutral', defaultOpen }: { title: string; children: ReactNode; tone?: 'neutral' | 'warning'; defaultOpen?: boolean }) {
  const warning = tone === 'warning';
  return (
    <details open={defaultOpen ?? warning} className={`group/notice rounded-lg border text-sm ${warning ? 'border-amber-500/30 bg-amber-500/5' : 'bg-muted/25'}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3.5 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        {warning ? <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" /> : <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="font-medium">{title}</span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/notice:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-3.5 pb-3 pl-9.5 leading-relaxed text-muted-foreground text-pretty">{children}</div>
    </details>
  );
}

/** Groups several boundary notes into one quiet row. */
export function PlatformNotes({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 lg:grid-cols-2 lg:[&>*:only-child]:col-span-2">{children}</div>;
}
