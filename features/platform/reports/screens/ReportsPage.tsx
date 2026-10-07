import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformErrorState } from '@/features/platform/components/PlatformPrimitives';
import { getFinancialCloses } from '../actions';
import { FinancialReportsClient } from '../components/FinancialReportsClient';
import { STATEMENT_TEMPLATE } from '@/features/keystone/lib/reportingClose';

export async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  let data: any = null, error = '';
  try { data = await getFinancialCloses(Number(params.page || 1)); } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not load financial reports'; }
  return <PageContainer title="Financial close" header={<div><h1 className="text-2xl font-semibold tracking-tight">Financial close</h1><p className="mt-1 text-sm text-muted-foreground">Review source transactions, match provider statements and preserve reproducible exports.</p></div>} breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Financial close' }]}>
    <div className="space-y-5 px-4 pb-8 md:px-6">{error ? <PlatformErrorState description={error} /> : <FinancialReportsClient data={data} statementTemplate={STATEMENT_TEMPLATE} />}</div>
  </PageContainer>;
}
