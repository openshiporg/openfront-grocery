import {keystoneClient} from '@/features/platform/lib/platformClient';
import { Mail, RadioTower } from 'lucide-react';
import { DeliverQueuedMessagesButton } from './DeliverQueuedMessagesButton';
import { OutboxEventActions } from './OutboxEventActions';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import {
  PlatformEmptyState,
  PlatformErrorState,
  PlatformFeedback,
  PlatformMetricGrid,
  PlatformPage,
  PlatformStatusBadge,
  PlatformSurface,
  PlatformTruthNotice,
} from '@/features/platform/components/PlatformPrimitives';
import { PlatformPager } from '@/features/platform/components/PlatformPageLinks';
import { formatDateTime, formatRelative } from '@/features/platform/lib/format';

const PATH = '/dashboard/platform/communications';

export async function CommunicationsPage({searchParams}:{searchParams?:Promise<Record<string,string | string[] | undefined>>}) {
  const params=await searchParams || {};const page=parsePageParam(params.page);const skip=(page-1)*50;
  const result=await keystoneClient<any>(`query Health($skip:Int!){groceryOutboxStatus{pending processing delivered failed unknown reconciled} groceryOutboxEvents(take:50,skip:$skip,orderBy:[{occurredAt:desc},{id:asc}]){id eventType status attempts claimedAt nextAttemptAt lastError occurredAt} groceryOutboxEventsCount customerMessages(take:50,skip:$skip,orderBy:[{createdAt:desc},{id:asc}]){id recipient subject status attempts failureMessage sentAt} customerMessagesCount}`,{skip});
  const data=result.success?result.data:null;
  const status = data?.groceryOutboxStatus || {};
  const totalPages = data ? Math.max(1, Math.ceil(Math.max(data.groceryOutboxEventsCount, data.customerMessagesCount) / 50)) : 1;
  // Server-only read of whether outbound email can be sent; no configuration values are shown.
  const emailConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

  return <PlatformPage
    title="Messages & event delivery"
    breadcrumb="Communications"
    description="Service receipts, optional customer alerts and integration events share durable retry records. Resolve failures and unknown outcomes here."
  >
    {!data ? <PlatformErrorState title="Delivery health is unavailable" description={result.error || 'The outbox could not be read.'} retryHref={PATH} /> : <>
      <PlatformMetricGrid metrics={[
        { label: 'Pending', value: status.pending ?? 0, note: emailConfigured ? 'Waiting to be sent' : 'Held: email sending is not configured', tone: !emailConfigured && status.pending ? 'warning' : 'default' },
        { label: 'Processing', value: status.processing ?? 0, note: 'Claimed by a worker' },
        { label: 'Delivered', value: status.delivered ?? 0, note: 'Accepted by provider', tone: 'positive' },
        { label: 'Failed', value: status.failed ?? 0, note: 'Needs a resolved retry', tone: status.failed ? 'critical' : 'default' },
        { label: 'Unknown outcome', value: status.unknown ?? 0, note: 'Verify before acting', tone: status.unknown ? 'warning' : 'default' },
        { label: 'Reconciled', value: status.reconciled ?? 0, note: 'Closed with evidence' },
      ]} />

      {emailConfigured ? <PlatformSurface icon={Mail} title="Send queued messages" description="Order receipts, access links, replacement requests and alerts wait here until sent. Each run processes up to 20 events; failures stay listed with a retry.">
        <div className="p-4 md:p-5"><DeliverQueuedMessagesButton pending={Number(status.pending ?? 0) + Number(status.failed ?? 0)} /></div>
      </PlatformSurface> : <PlatformFeedback tone="warning" title="Email sending is not configured">
        Customer messages are queued but none can be sent until the store&apos;s email service is connected. Nothing listed as pending has reached a customer.
      </PlatformFeedback>}

      <PlatformTruthNotice title="Delivery semantics">
        A sent message records SMTP or provider acceptance; it does not establish that the recipient read it. Retrying an event with an unknown outcome may send a duplicate, so verify provider or recipient evidence first.
      </PlatformTruthNotice>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <PlatformSurface icon={RadioTower} title="Event attempts" count={data.groceryOutboxEventsCount} description="Most recent first. Failed and unknown events carry their resolution actions inline.">
          {data.groceryOutboxEvents.length===0 ? <PlatformEmptyState compact icon={RadioTower} title={data.groceryOutboxEventsCount>0?'No event attempts on this page':'No event delivery attempts yet'} description="Order, payment and customer events will be listed here as they are dispatched." /> : <div className="divide-y">
            {data.groceryOutboxEvents.map((event:any)=><article key={event.id} className={`space-y-2.5 px-4 py-3.5 md:px-5 ${event.status === 'failed' ? 'bg-destructive/[0.03]' : event.status === 'unknown' ? 'bg-amber-500/[0.04]' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium">{event.eventType}</span>
                <PlatformStatusBadge status={event.status} />
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{event.attempts} {Number(event.attempts) === 1 ? 'attempt' : 'attempts'}</span>
              </div>
              <p className="text-xs text-muted-foreground">{event.nextAttemptAt ? <>Next retry {formatRelative(event.nextAttemptAt)} · {formatDateTime(event.nextAttemptAt)}</> : event.claimedAt ? <>Claimed {formatDateTime(event.claimedAt)}</> : <>Recorded {formatDateTime(event.occurredAt)}</>}</p>
              {event.lastError ? <p className="rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 font-mono text-xs text-destructive [overflow-wrap:anywhere]">{event.lastError}</p> : null}
              <OutboxEventActions event={event} />
            </article>)}
          </div>}
        </PlatformSurface>

        <PlatformSurface icon={Mail} title="Customer messages" count={data.customerMessagesCount} description="Receipts and alerts sent to shoppers.">
          {data.customerMessages.length===0 ? <PlatformEmptyState compact icon={Mail} title={data.customerMessagesCount>0?'No customer messages on this page':'No customer messages recorded'} description="Messages appear once order or account events notify a shopper." /> : <div className="divide-y">
            {data.customerMessages.map((message:any)=><article key={message.id} className="space-y-1 px-4 py-3 md:px-5">
              <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-sm font-medium">{message.subject}</p><PlatformStatusBadge status={message.status} /></div>
              <p className="truncate text-xs text-muted-foreground">{message.recipient} · {message.attempts} {Number(message.attempts) === 1 ? 'attempt' : 'attempts'}{message.sentAt ? ` · sent ${formatRelative(message.sentAt)}` : ''}</p>
              {message.failureMessage ? <p className="text-xs text-destructive [overflow-wrap:anywhere]">{message.failureMessage}</p> : null}
            </article>)}
          </div>}
        </PlatformSurface>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card [&>nav]:border-t-0">
        <PlatformPager page={page} totalPages={totalPages} hrefFor={(target) => `${PATH}?page=${target}`} label="Message pages" summary={<>Page {page} of {totalPages} · 50 events and 50 messages per page</>} />
      </div>
    </>}
  </PlatformPage>;
}
