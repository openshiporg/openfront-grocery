import Link from 'next/link';
import { Inbox, Mail, Phone } from 'lucide-react';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import { PlatformEmptyState, PlatformErrorState, PlatformMetricGrid, PlatformPage, PlatformStatusBadge, PlatformSurface } from '@/features/platform/components/PlatformPrimitives';
import { PlatformPager } from '@/features/platform/components/PlatformPageLinks';
import { formatDateTime, formatRelative } from '@/features/platform/lib/format';
import { ContactMessageFollowUp } from './ContactMessageFollowUp';
import { parsePageParam } from '@/features/platform/lib/pageParams';

const PATH = '/dashboard/platform/messages';
const FILTERS = [['open', 'Open'], ['new', 'New'], ['in_progress', 'In progress'], ['replied', 'Replied'], ['closed', 'Closed'], ['all', 'All']] as const;

type ContactMessageRow = { id: string; reference: string; subject: string; name: string; email: string; phone: string; topic: string; orderNumber: string; message: string; sourcePath: string; status: string; staffNotes: string; createdAt: string };

export async function MessagesPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const params = (await searchParams) || {};
  const page = parsePageParam(params.page);
  const filter = FILTERS.some(([key]) => key === params.filter) ? String(params.filter) : 'open';
  const where = filter === 'all' ? {} : filter === 'open' ? { status: { in: ['new', 'in_progress'] } } : { status: { equals: filter } };
  const result = await keystoneClient<{ contactMessages: ContactMessageRow[]; contactMessagesCount: number; newCount: number; progressCount: number }>(
    `query Inbox($where: ContactMessageWhereInput!, $skip: Int!) {
      contactMessages(where: $where, take: 25, skip: $skip, orderBy: [{ createdAt: desc }, { id: asc }]) { id reference subject name email phone topic orderNumber message sourcePath status staffNotes createdAt }
      contactMessagesCount(where: $where)
      newCount: contactMessagesCount(where: { status: { equals: "new" } })
      progressCount: contactMessagesCount(where: { status: { equals: "in_progress" } })
    }`, { where, skip: (page - 1) * 25 }, { cache: 'no-store' });
  const data = result.success ? result.data : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.contactMessagesCount / 25)) : 1;
  return <PlatformPage title="Customer inbox" breadcrumb="Customer inbox" description="Messages shoppers send from the Help page: order problems, change requests, replacements and refund questions. Reply by email or phone, then record the follow-up here.">
    {!data ? <PlatformErrorState title="The inbox is unavailable" description={result.success ? 'Messages could not be read.' : result.error} retryHref={PATH} /> : <>
      <PlatformMetricGrid metrics={[
        { label: 'New', value: data.newCount, note: 'Not yet picked up', tone: data.newCount ? 'warning' : 'default', href: `${PATH}?filter=new` },
        { label: 'In progress', value: data.progressCount, note: 'Being handled', href: `${PATH}?filter=in_progress` },
      ]} />
      <nav aria-label="Message filters" className="flex flex-wrap gap-2 text-sm">{FILTERS.map(([key, label]) => <Link key={key} href={`${PATH}?filter=${key}`} aria-current={filter === key ? 'page' : undefined} className={`rounded-full border px-3 py-1.5 font-medium ${filter === key ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted'}`}>{label}</Link>)}</nav>
      <PlatformSurface icon={Inbox} title="Messages" count={data.contactMessagesCount} description="Newest first. Each message keeps the sender's reference.">
        {data.contactMessages.length === 0 ? <PlatformEmptyState compact icon={Inbox} title="No messages here" description="Messages from the storefront Help page appear here." /> : <div className="divide-y">
          {data.contactMessages.map((message) => <article key={message.id} className="space-y-3 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 font-medium">{message.subject || message.topic}</p>
              <PlatformStatusBadge status={message.status === 'new' ? 'pending' : message.status === 'closed' ? 'completed' : message.status} label={message.status.replace('_', ' ')} />
              <span className="ml-auto text-xs text-muted-foreground" title={formatDateTime(message.createdAt)}>{formatRelative(message.createdAt)}</span>
            </div>
            <p className="text-sm">{message.name} · <a className="inline-flex items-center gap-1 underline underline-offset-4" href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject || 'your message'} (${message.reference})`)}`}><Mail className="size-3.5" aria-hidden="true" />{message.email}</a>{message.phone ? <> · <a className="inline-flex items-center gap-1 underline underline-offset-4" href={`tel:${message.phone}`}><Phone className="size-3.5" aria-hidden="true" />{message.phone}</a></> : null}{message.orderNumber ? <> · <Link className="underline underline-offset-4" href={`/dashboard/platform/orders?q=${encodeURIComponent(message.orderNumber)}&filter=all`}>Order #{message.orderNumber}</Link></> : null}</p>
            <p className="whitespace-pre-line rounded-md border bg-muted/30 px-3 py-2 text-sm [overflow-wrap:anywhere]">{message.message}</p>
            <p className="font-mono text-xs text-muted-foreground">{message.reference}</p>
            <ContactMessageFollowUp id={message.id} status={message.status} staffNotes={message.staffNotes || ''} />
          </article>)}
        </div>}
      </PlatformSurface>
      <div className="overflow-hidden rounded-xl border bg-card [&>nav]:border-t-0"><PlatformPager page={page} totalPages={totalPages} hrefFor={(target) => `${PATH}?filter=${filter}&page=${target}`} label="Inbox pages" summary={<>Page {page} of {totalPages}</>} /></div>
    </>}
  </PlatformPage>;
}

export default MessagesPage;
