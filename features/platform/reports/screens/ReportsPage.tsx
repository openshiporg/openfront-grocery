import { CreditCard } from 'lucide-react';
import { PlatformErrorState, PlatformLinkButton, PlatformMetricGrid, PlatformPage, PlatformStatusBadge, PlatformTruthNotice } from '@/features/platform/components/PlatformPrimitives';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import { formatInTimeZone } from '@/features/platform/lib/format';
import { getFinancialCloses } from '../actions';
import { FinancialReportsClient } from '../components/FinancialReportsClient';
import { STATEMENT_TEMPLATE } from '@/features/keystone/lib/reportingClose';

const dateOnly: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

export async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  let data: any = null, error = '';
  try { data = await getFinancialCloses(parsePageParam(params.page)); } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not load financial reports'; }
  const latest = data?.latestClose;
  const unresolved = Number(data?.totalExceptions || 0);
  return (
    <PlatformPage
      title="Financial close"
      breadcrumb="Reports"
      description="Close trading periods, match provider statements and export saved closes."
      actions={<PlatformLinkButton href="/dashboard/platform/payments" icon={CreditCard}>Payments</PlatformLinkButton>}
    >
      {error ? <PlatformErrorState description={error} retryHref="/dashboard/platform/reports" /> : <>
        <PlatformMetricGrid metrics={[
          {
            label: 'Latest close',
            value: latest ? <span className="text-base md:text-lg">{formatInTimeZone(latest.periodEnd ? new Date(new Date(latest.periodEnd).getTime() - 1) : null, latest.timezone, dateOnly, 'None')}</span> : 'None',
            note: latest ? <>Last trading day closed · <PlatformStatusBadge status={latest.status} label={latest.status === 'reconciled' ? 'Reconciled' : 'With exceptions'} /></> : 'No trading period has been closed',
            tone: latest ? (latest.status === 'reconciled' ? 'positive' : 'warning') : 'default',
          },
          { label: 'Saved closes', value: data?.total ?? 0, note: 'Saved closes can’t be changed' },
          { label: 'Unmatched statement entries', value: unresolved, note: unresolved ? 'Repair local evidence, then recheck' : 'Imported statements fully matched', tone: unresolved ? 'critical' : 'default' },
          { label: 'Trading timezone', value: <span className="text-base md:text-lg">{data?.timezone || 'UTC'}</span>, note: `Store currency ${data?.currencyCode || 'USD'}` },
        ]} />
        <PlatformTruthNotice title="What a close includes">
          Sales, payments, refunds, settlement references and stock as of the cutoff. It doesn’t post to your accounting system or reconcile your bank account. Dates are shown in each close’s trading timezone.
        </PlatformTruthNotice>
        <FinancialReportsClient data={data} statementTemplate={STATEMENT_TEMPLATE} />
      </>}
    </PlatformPage>
  );
}
