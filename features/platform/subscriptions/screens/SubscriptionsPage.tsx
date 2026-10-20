import {PlatformPageLinks} from '@/features/platform/components/PlatformPageLinks';
import Link from 'next/link';
import { Award, CalendarSync, ExternalLink, History, Lock, Repeat, UserRound } from 'lucide-react';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import { RunDueSubscriptionsButton } from '../components/RunDueSubscriptionsButton';
import { LoyaltyRulesForm } from '../components/LoyaltyRulesForm';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import {
  PlatformChip,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformFacts,
  PlatformList,
  PlatformListHeader,
  PlatformMetricGrid,
  PlatformPage,
  PlatformSearchParams,
  PlatformStatusBadge,
  PlatformSurface,
  PlatformTabs,
  PlatformToolbar,
  humanize,
  platformButton,
  platformHref,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { formatDateTime, formatInTimeZone, formatRelative } from '@/features/platform/lib/format';

const PATH = '/dashboard/platform/subscriptions';
const HOUR = 3_600_000;
const waitingStatuses = ['awaiting_checkout', 'blocked_cart', 'blocked_stock'];
const outcomeLabels: Record<string, string> = {
  awaiting_checkout: 'Awaiting checkout',
  blocked_cart: 'Blocked · cart',
  blocked_stock: 'Blocked · stock',
  ordered: 'Order created',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};
const runGrid = 'md:grid md:grid-cols-[minmax(0,1.3fr)_7.5rem_9.5rem_minmax(0,1fr)] md:items-center md:gap-3';

type Schedule = {
  id: string; product: string; quantity: number; frequency: string; nextDeliveryDate: string; status: string;
  scheduleTimezone?: string | null; pausedUntil?: string | null; productRef?: { id: string; title: string } | null; user?: { id: string; email: string } | null;
};
type Run = {
  id: string; dueAt: string; status: string; failureReason?: string | null; productTitle: string; quantity: number;
  user?: { id: string; email: string } | null; order?: { id: string; displayId?: number } | null; subscription?: { id: string } | null;
};

/** Schedules carry their own timezone; show the customer's local delivery time, not the viewer's. */
const scheduleTime: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
function formatInZone(value: string | null | undefined, timeZone?: string | null) {
  return formatInTimeZone(value, timeZone, scheduleTime);
}

function horizon(schedule: Schedule, now: number) {
  const due = new Date(schedule.nextDeliveryDate).getTime();
  if (!Number.isFinite(due)) return 'later';
  if (due < now) return 'overdue';
  if (due - now <= 24 * HOUR) return 'day';
  if (due - now <= 7 * 24 * HOUR) return 'week';
  return 'later';
}

const horizonGroups = [
  { key: 'overdue', label: 'Past due date', hint: 'Prepare due baskets to record an outcome' },
  { key: 'day', label: 'Next 24 hours', hint: 'Customer checkout must finish before the slot cutoff' },
  { key: 'week', label: 'Next 7 days', hint: undefined },
  { key: 'later', label: 'Later', hint: undefined },
] as const;

/** Request time for relative dates; this server screen renders once per request. */
function requestTime() {
  return Date.now();
}

export async function SubscriptionsPage({searchParams}:{searchParams?:Promise<PlatformSearchParams>|PlatformSearchParams}={}) {
  const params = searchParams ? await searchParams : {};
  const page = parsePageParam(params.page);
  const q = queryValue(params, 'q').trim();
  const outcome = queryValue(params, 'outcome') || 'waiting';
  const scheduleView = queryValue(params, 'schedule') || 'active';
  const [result, userResult] = await Promise.all([
    // Search and both views run on the server across every schedule and outcome in the store.
    keystoneClient<any>('query($page:Int,$search:String,$outcome:String,$schedule:String){groceryRecurringOverview(page:$page,customerOnly:false,search:$search,outcome:$outcome,schedule:$schedule)}',{page,search:q,outcome,schedule:scheduleView},{cache:'no-store'}),
    // The shared core's user query carries only dashboard-shell fields; read this page's capabilities here.
    keystoneClient<any>('query { authenticatedItem { ... on User { role { canManageOrders canManageUsers } } } }', {}, { cache: 'no-store' }),
  ]);
  const role = userResult.success ? userResult.data?.authenticatedItem?.role : undefined;
  const canManageOrders = role?.canManageOrders === true;
  const canManageLoyalty = role?.canManageUsers === true;
  const data=result.success?result.data.groceryRecurringOverview:null;
  const error=result.success?undefined:result.error;
  const subscriptions: Schedule[] = data?.subscriptions || [];
  const runs: Run[] = data?.runs || [];
  const program = data?.program;
  const now = requestTime();
  const runCounts: Record<string, number> = data?.runCounts || {};
  const scheduleCounts: Record<string, number> = data?.scheduleCounts || {};
  const visibleRuns = runs;
  const visibleSchedules = subscriptions;
  const collections = data?.pagination?.collections || {};
  const filtered = Boolean(q || outcome !== 'waiting' || scheduleView !== 'active');

  return <PlatformPage
    title="Recurring baskets & rewards"
    breadcrumb="Recurring orders"
    description="Recurring baskets, their results and rewards."
    actions={canManageOrders ? <RunDueSubscriptionsButton /> : null}
  >
    {error ? <PlatformErrorState description={error} retryHref={PATH} /> : null}
    {data ? <>
      <PlatformMetricGrid metrics={[
        { label: 'Active schedules', value: scheduleCounts.active ?? 0, note: `${scheduleCounts.paused ?? 0} paused · ${scheduleCounts.all ?? 0} in total`, href: platformHref(PATH, params, { schedule: 'active' }) },
        { label: 'Due within 7 days', value: data.dueThisWeek ?? 0, note: 'Active schedules, including past due', tone: data.dueThisWeek ? 'warning' : 'default' },
        { label: 'Waiting or blocked', value: runCounts.waiting ?? 0, note: `${runCounts.blocked ?? 0} blocked by cart or stock · ${(runCounts.waiting ?? 0) - (runCounts.blocked ?? 0)} awaiting checkout`, tone: runCounts.blocked ? 'critical' : runCounts.waiting ? 'warning' : 'default', href: platformHref(PATH, params, { outcome: 'waiting' }) },
        { label: 'Orders created', value: runCounts.ordered ?? 0, note: `${runCounts.all ?? 0} results recorded`, tone: runCounts.ordered ? 'positive' : 'default', href: platformHref(PATH, params, { outcome: 'ordered' }) },
      ]} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs [&>form]:border-b-0">
        <PlatformToolbar
          path={PATH}
          search={q}
          searchPlaceholder="Customer email or product"
          preserve={{ outcome, schedule: scheduleView }}
          resultCount={(collections.runs?.total ?? runs.length) + (collections.subscriptions?.total ?? subscriptions.length)}
          resultLabel="matching"
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <PlatformSurface
          icon={History}
          title="Preparation history"
          description="The result of each due basket. Preparing never charges the customer or books a slot; the customer still checks out."
          tabs={<PlatformTabs path={PATH} params={params} param="outcome" active={outcome} label="Result" tabs={[
            { value: 'waiting', label: 'Waiting or blocked', count: runCounts.waiting ?? 0, tone: 'attention' },
            { value: 'ordered', label: 'Orders created', count: runCounts.ordered ?? 0 },
            { value: 'closed', label: 'Skipped · cancelled', count: runCounts.closed ?? 0 },
            { value: 'all', label: 'All', count: runCounts.all ?? 0 },
          ]} />}
        >
          {visibleRuns.length === 0 ? (
            <PlatformEmptyState
              compact
              icon={History}
              title={(runCounts.all ?? 0) === 0 && !q ? 'No results yet' : outcome === 'waiting' && !q ? 'Nothing is waiting or blocked' : 'No matching results'}
              description={(runCounts.all ?? 0) === 0 && !q ? 'Prepare due baskets to record the first results. Each one links to its order or says why no order was created.' : outcome === 'waiting' && !q ? 'Every due basket either created an order or was closed.' : 'Change the tab or clear the search.'}
              action={filtered && (runCounts.all ?? 0) ? <Link href={platformHref(PATH, {}, { outcome: 'all' })} className={platformButton('secondary', 'sm')}>Show all results</Link> : undefined}
            />
          ) : (
            <>
              <PlatformListHeader static className={runGrid}>
                <span>Customer · basket</span><span>Due</span><span>Result</span><span>Details</span>
              </PlatformListHeader>
              <PlatformList>
                {visibleRuns.map((run) => {
                  const blocked = run.status === 'blocked_cart' || run.status === 'blocked_stock';
                  return (
                    <div key={run.id} className={`grid gap-1.5 px-4 py-3 md:px-5 ${runGrid} ${blocked ? 'bg-amber-500/[0.04]' : ''}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{run.productTitle} <span className="font-normal text-muted-foreground tabular-nums">× {run.quantity}</span></p>
                        <p className="truncate text-xs text-muted-foreground">{run.user?.email || 'Customer unavailable'}</p>
                      </div>
                      <p className="text-xs text-muted-foreground" title={formatDateTime(run.dueAt)}>{formatRelative(run.dueAt, now)}</p>
                      <div><PlatformStatusBadge status={run.status} label={outcomeLabels[run.status]} /></div>
                      <div className="min-w-0 text-xs">
                        {run.order?.id ? (
                          <Link href={platformHref('/dashboard/platform/orders', {}, { order: run.order.id, filter: 'all' })} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"><ExternalLink className="size-3.5" aria-hidden="true" />{run.order.displayId ? `Order #${run.order.displayId}` : 'View order'}</Link>
                        ) : (
                          <p className={`[overflow-wrap:anywhere] ${blocked ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>{run.failureReason || (run.status === 'awaiting_checkout' ? 'Customer must choose a slot and approve payment' : 'No order was created')}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </PlatformList>
            </>
          )}
        </PlatformSurface>

        <PlatformSurface
          icon={CalendarSync}
          title="Recurring baskets"
          description="By next delivery, in each customer's timezone."
          tabs={<PlatformTabs path={PATH} params={params} param="schedule" active={scheduleView} label="Schedule status" tabs={[
            { value: 'active', label: 'Active', count: scheduleCounts.active ?? 0 },
            { value: 'paused', label: 'Paused', count: scheduleCounts.paused ?? 0 },
            { value: 'cancelled', label: 'Cancelled', count: scheduleCounts.cancelled ?? 0 },
            { value: 'all', label: 'All', count: scheduleCounts.all ?? 0 },
          ]} />}
        >
          {visibleSchedules.length === 0 ? (
            <PlatformEmptyState
              compact
              icon={CalendarSync}
              title={(scheduleCounts.all ?? 0) === 0 && !q ? 'No recurring baskets yet' : 'No matching baskets'}
              description={(scheduleCounts.all ?? 0) === 0 && !q ? 'Customers create recurring baskets from their account. They appear here with the next delivery and frequency.' : 'Change the status tab or clear the search.'}
            />
          ) : scheduleView === 'active' ? (
            <div>
              {horizonGroups.map((group) => {
                const rows = visibleSchedules.filter((schedule) => horizon(schedule, now) === group.key);
                if (!rows.length) return null;
                return (
                  <section key={group.key} aria-label={group.label}>
                    <h3 className={`flex flex-wrap items-baseline gap-x-2 border-b bg-muted/30 px-4 py-2 text-[11px] font-medium tracking-wide uppercase md:px-5 ${group.key === 'overdue' ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
                      {group.label} <span className="tabular-nums">· {rows.length}</span>
                      {group.hint ? <span className="font-normal tracking-normal normal-case">{group.hint}</span> : null}
                    </h3>
                    <ScheduleRows schedules={rows} now={now} />
                  </section>
                );
              })}
            </div>
          ) : <ScheduleRows schedules={visibleSchedules} now={now} />}
        </PlatformSurface>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card [&>nav]:border-t-0">
        <PlatformPageLinks pagination={data.pagination} path={PATH} searchParams={params} />
      </div>

      <PlatformSurface
        icon={Award}
        title="Rewards"
        description="Customers earn points on the final amount paid for goods. A refund removes the points it earned; if the customer already spent them, redemption is paused until new earnings cover the difference."
        action={<PlatformStatusBadge status={program?.isActive ? 'active' : 'inactive'} label={program ? (program.isActive ? 'Rewards active' : 'Rewards paused') : 'Not configured'} />}
      >
        {program ? (
          <div className="border-b bg-muted/20 px-4 py-3.5 md:px-5">
            <PlatformFacts columns={4} items={[
              { label: 'Program', value: program.name },
              { label: 'A 50.00 basket earns', value: <span className="tabular-nums">{Math.floor(50 * Number(program.earnPointsPer100Cents || 0)).toLocaleString('en-US')} points</span> },
              { label: 'Redemption value', value: <span className="tabular-nums">{Number(program.redeemPointsPer100Cents || 0).toLocaleString('en-US')} points = 1.00</span> },
              { label: 'Smallest redemption', value: <span className="tabular-nums">{Number(program.minimumRedemptionPoints || 0).toLocaleString('en-US')} points{program.redeemPointsPer100Cents ? ` · ${(Number(program.minimumRedemptionPoints || 0) / Number(program.redeemPointsPer100Cents)).toFixed(2)}` : ''}</span> },
            ]} />
          </div>
        ) : null}
        {canManageLoyalty ? (
          <LoyaltyRulesForm program={program} />
        ) : <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground md:px-5"><Lock className="size-4" aria-hidden="true" />Your role can’t manage loyalty program settings.</p>}
      </PlatformSurface>
    </> : null}
  </PlatformPage>;
}

function ScheduleRows({ schedules, now }: { schedules: Schedule[]; now: number }) {
  return (
    <PlatformList>
      {schedules.map((schedule) => {
        const timezone = schedule.scheduleTimezone || 'UTC';
        const paused = schedule.status === 'paused';
        return (
          <div key={schedule.id} className={`flex items-start gap-3 px-4 py-3 md:px-5 ${schedule.status === 'cancelled' ? 'opacity-70' : ''}`}>
            <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground"><Repeat className="size-4" /></span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="min-w-0 truncate text-sm font-medium">{schedule.productRef?.title || schedule.product} <span className="font-normal text-muted-foreground tabular-nums">× {schedule.quantity}</span></p>
                <PlatformChip className="capitalize">{humanize(schedule.frequency)}</PlatformChip>
                {schedule.status !== 'active' ? <PlatformStatusBadge status={schedule.status} /> : null}
              </div>
              <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground"><UserRound className="size-3.5 shrink-0" aria-hidden="true" />{schedule.user?.email || 'Customer unavailable'}</p>
              {paused && schedule.pausedUntil ? <p className="text-xs text-amber-800 dark:text-amber-300">Paused until {formatInZone(schedule.pausedUntil, timezone)}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium tabular-nums">{formatInZone(schedule.nextDeliveryDate, timezone)}</p>
              <p className="text-xs text-muted-foreground">{schedule.status === 'active' ? formatRelative(schedule.nextDeliveryDate, now) : 'Next delivery'} · <span className="font-mono">{timezone}</span></p>
            </div>
          </div>
        );
      })}
    </PlatformList>
  );
}

export default SubscriptionsPage;
