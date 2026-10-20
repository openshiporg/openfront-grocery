import { OrderLineRefundForm } from '../components/OrderLineRefundForm';
import { VoidAuthorizationForm } from '../components/VoidAuthorizationForm';
import { WebhookRecoveryPanel } from '../components/WebhookRecoveryPanel';
import { RecoverPaymentCreationForm } from '../components/RecoverPaymentCreationForm';
import { RecoverRevisedAuthorizationForm } from '../components/RecoverRevisedAuthorizationForm';
import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import Link from 'next/link';
import { ClipboardList, CreditCard, ExternalLink, FileBarChart, Flag, Lock, PlugZap } from 'lucide-react';
import {
  PlatformCellLabel,
  PlatformChip,
  PlatformDetails,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformFacts,
  PlatformFeedback,
  PlatformLinkButton,
  PlatformList,
  PlatformListHeader,
  PlatformMetricGrid,
  PlatformPage,
  PlatformSearchParams,
  PlatformStatusBadge,
  PlatformSubsection,
  PlatformSurface,
  PlatformTabs,
  PlatformToolbar,
  humanize,
  platformButton,
  platformHref,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { formatDateTime, formatMoney, formatRelative } from '@/features/platform/lib/format';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { OrderAfterSalesActions } from '@/features/platform/orders/components/OrderAfterSalesActions';
import { parsePageParam } from '@/features/platform/lib/pageParams';

const PATH = '/dashboard/platform/payments';
const rowGrid = 'md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_7.5rem_7rem_6.5rem] md:items-center md:gap-3';

export async function PaymentsPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim();
  const filter = queryValue(params, 'filter') || 'attention';
  const sort = queryValue(params, 'sort') || 'newest';
  let data: Awaited<ReturnType<typeof platformProjections.payments>> = null;
  let loadError: string | null = null;
  // Search, views and sort run on the server across every payment in the store.
  try { data = await platformProjections.payments(parsePageParam(params.page), 50, q, '', filter, sort); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load payments.'; }
  const payments = data?.payments || [];
  const hasAttention = (payment: (typeof payments)[number]) => payment.status === 'failed' || payment.status === 'processing' || payment.refunds.some((refund) => refund.status === 'failed' || refund.reconciliationDeadLetterAt);
  const currencyCode = data?.currencyCode || 'USD';
  const counts = data?.viewCounts || {};
  const providers = data?.providers || [];

  return (
    <PlatformPage
      title="Payments & refunds"
      breadcrumb="Payments"
      description="Payments, refunds and anything that needs attention."
      actions={<PlatformLinkButton href="/dashboard/platform/reports" icon={FileBarChart}>Financial close</PlatformLinkButton>}
    >
      {data ? <PlatformMetricGrid metrics={[
        { label: 'Captured', value: formatMoney(data.summary.capturedCents, currencyCode), note: `${data.summary.paymentCount} payments` },
        { label: 'Refunded', value: formatMoney(data.summary.refundedCents, currencyCode), note: 'Completed refunds' },
        { label: 'Net captured', value: formatMoney(data.summary.netCents, currencyCode), note: 'Captured less completed refunds' },
        { label: 'Needs attention', value: data.summary.attentionCount, note: 'Failed or processing payments, or refunds that failed or need review', tone: data.summary.attentionCount ? 'critical' : 'default', href: platformHref(PATH, params, { filter: 'attention' }) },
      ]} /> : null}

      {loadError || !data ? <PlatformErrorState description={loadError || 'Payments could not be loaded.'} retryHref={PATH} /> : <>
        <PlatformSurface icon={PlugZap} title="Payment providers" count={data.providerConfiguration === 'visible' ? providers.length : undefined} description="Which providers are set up for checkout.">
          {data.providerConfiguration === 'restricted' ? <PlatformEmptyState compact icon={Lock} title="Provider setup is restricted" description="Provider configuration requires store-setup access. You can still review payments and refunds below." />
            : providers.length === 0 ? <PlatformEmptyState compact icon={PlugZap} title="No payment providers" description="No payment provider is set up yet." /> : (
            <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
              {providers.map((provider) => (
                <div key={provider.id} className="flex items-start justify-between gap-3 bg-card px-4 py-3.5 md:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{provider.code}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <PlatformChip>{provider.isInstalled ? 'Installed' : 'Not installed'}</PlatformChip>
                      <PlatformChip>{provider.publicCheckout ? 'Offered at checkout' : 'Not offered at checkout'}</PlatformChip>
                    </div>
                  </div>
                  <PlatformStatusBadge status={provider.runtimeConfigured ? 'active' : provider.isInstalled ? 'processing' : 'failed'} label={provider.runtimeConfigured ? 'Ready' : provider.isInstalled ? 'Needs credentials' : 'Not installed'} />
                </div>
              ))}
            </div>
          )}
          {Object.keys(data.summary.recovery || {}).length ? (
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 md:px-5">
              <span className="text-xs font-medium text-muted-foreground">Checkout attempts</span>
              {Object.entries(data.summary.recovery || {}).map(([state, count]) => <PlatformChip key={state}><span className="capitalize">{humanize(state)}</span> · <strong className="tabular-nums">{count}</strong></PlatformChip>)}
            </div>
          ) : null}
        </PlatformSurface>

        <PlatformSurface
          icon={CreditCard}
          title="Payments"
          description="Expand a payment for its references, refunds and the refund or void action."
          tabs={<PlatformTabs path={PATH} params={params} active={filter} label="Payment state" tabs={[
            { value: 'attention', label: 'Needs attention', count: counts.attention ?? 0, tone: 'attention' },
            { value: 'all', label: 'All', count: counts.all ?? 0 },
            { value: 'authorized', label: 'Authorized', count: counts.authorized ?? 0 },
            { value: 'pending', label: 'Pending', count: counts.pending ?? 0 },
            { value: 'succeeded', label: 'Succeeded', count: counts.succeeded ?? 0 },
            { value: 'processing', label: 'Processing', count: counts.processing ?? 0 },
            { value: 'failed', label: 'Failed', count: counts.failed ?? 0 },
            { value: 'partially_refunded', label: 'Partly refunded', count: counts.partially_refunded ?? 0 },
            { value: 'refunded', label: 'Refunded', count: counts.refunded ?? 0 },
            { value: 'refunds', label: 'Has refunds', count: counts.refunds ?? 0 },
          ]} />}
        >
          <PlatformToolbar
            path={PATH}
            search={q}
            searchPlaceholder="Order number, payment ID, provider ID, or provider code"
            preserve={{ filter }}
            sort={sort}
            sortOptions={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'amount', label: 'Highest amount' }]}
            resultCount={data.pagination.collections.payments?.total ?? payments.length}
          />
          {payments.length === 0 ? (
            <PlatformEmptyState icon={CreditCard} title={filter === 'attention' && !q ? 'Nothing needs attention' : 'No matching payments'} description={filter === 'attention' && !q ? 'No failed or processing payments, and no refunds that need review.' : 'No payment matches the current tab or search.'} action={<Link href={platformHref(PATH, {}, { filter: 'all' })} className={platformButton('secondary', 'sm')}>Show all payments</Link>} />
          ) : (
            <>
              <PlatformListHeader className={rowGrid}>
                <span>Order · status</span><span>Provider reference</span><span className="text-right">Amount</span><span className="text-right">Refunded</span><span className="text-right">Created</span>
              </PlatformListHeader>
              <PlatformList>
                {payments.map((payment) => {
                  const succeededRefunds = payment.refunds.filter((refund) => refund.status === 'succeeded').reduce((sum, refund) => sum + refund.amountCents, 0);
                  const attention = hasAttention(payment);
                  return (
                    <PlatformDetails key={payment.id} summary={
                      <div className={`grid gap-1.5 ${rowGrid}`}>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">#{payment.order.displayId}</span>
                          <PlatformStatusBadge status={payment.status} />
                          {attention ? <PlatformChip icon={Flag} className="border-destructive/30 text-destructive">Review</PlatformChip> : null}
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground"><PlatformCellLabel>Provider reference</PlatformCellLabel>{payment.providerCode} · {payment.providerPaymentId || `payment …${payment.id.slice(-8)}`}</p>
                        <p className="text-sm font-semibold tabular-nums md:text-right"><PlatformCellLabel>Amount</PlatformCellLabel>{formatMoney(payment.amountCents, currencyCode)}</p>
                        <p className={`text-xs tabular-nums md:text-right ${succeededRefunds ? 'text-foreground' : 'text-muted-foreground'}`}><PlatformCellLabel>Refunded</PlatformCellLabel>{succeededRefunds ? `−${formatMoney(succeededRefunds, currencyCode)}` : '—'}<span className="md:hidden"> refunded</span></p>
                        <p className="hidden text-right text-xs text-muted-foreground md:block" title={formatDateTime(payment.createdAt)}><PlatformCellLabel>Created</PlatformCellLabel>{formatRelative(payment.createdAt)}</p>
                      </div>
                    }>
                      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
                        <div className="min-w-0 space-y-5">
                          <PlatformFacts columns={4} items={[
                            { label: 'Created', value: formatDateTime(payment.createdAt) },
                            { label: 'Processed', value: formatDateTime(payment.processedAt) },
                            { label: 'Method', value: <span className="capitalize">{humanize(payment.paymentMethod)}</span> },
                            { label: 'Order status', value: <span className="capitalize">{humanize(payment.order.status)}</span> },
                            { label: 'Provider payment ID', value: payment.providerPaymentId || 'Not recorded', mono: true, wide: true },
                          ]} />
                          {payment.errorMessage ? <PlatformFeedback tone="error" title="Provider error">{payment.errorMessage}</PlatformFeedback> : null}
                          <PlatformSubsection title="Refunds" description={payment.refunds.length ? `${payment.refunds.length} refund requests · ${formatMoney(succeededRefunds, currencyCode)} completed` : undefined}>
                            {payment.refunds.length === 0 ? <p className="text-sm text-muted-foreground">No refund has been requested.</p> : (
                              <div className="divide-y rounded-lg border bg-background">
                                {payment.refunds.map((refund) => (
                                  <div key={refund.id} className="space-y-1 px-3.5 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-sm font-semibold tabular-nums">{formatMoney(refund.amountCents, currencyCode)}</span>
                                      <PlatformStatusBadge status={refund.reconciliationDeadLetterAt ? 'failed' : refund.status} label={refund.reconciliationDeadLetterAt ? 'Needs review' : undefined} />
                                    </div>
                                    <p className="text-xs text-muted-foreground">{refund.reason || 'No reason recorded'} · {refund.reconciliationAttempts} status checks{refund.requestedAt ? ` · requested ${formatDateTime(refund.requestedAt)}` : ''}</p>
                                    {refund.reconciliationLastError || refund.failureMessage ? <p className="text-xs text-destructive">{refund.reconciliationLastError || refund.failureMessage}</p> : null}
                                    {refund.reconciliationNextAttemptAt && !['succeeded', 'failed', 'cancelled'].includes(refund.status) ? <p className="text-xs text-muted-foreground">Next retry {formatDateTime(refund.reconciliationNextAttemptAt)}</p> : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </PlatformSubsection>
                          <div className="flex flex-wrap gap-2">
                            <Link href={`/dashboard/payments/${payment.id}`} className={platformButton('ghost', 'sm', '-ml-2.5')}><ExternalLink aria-hidden="true" />View payment</Link>
                            {data.actorCanManageOrders ? <Link href={platformHref('/dashboard/platform/orders', {}, { order: payment.order.id, filter: 'all' })} className={platformButton('ghost', 'sm')}><ClipboardList aria-hidden="true" />Open order #{payment.order.displayId}</Link> : null}
                          </div>
                        </div>
                        <aside className="min-w-0 space-y-3">
                          {['succeeded', 'partially_refunded'].includes(payment.status) ? <OrderLineRefundForm orderId={payment.order.id} paymentId={payment.id} /> : null}
                          {payment.voidable ? <VoidAuthorizationForm paymentId={payment.id} /> : null}
                          {payment.awaitingRevisedAuthorization ? <RecoverRevisedAuthorizationForm orderId={payment.order.id} /> : null}
                          {/* Only this payment is loaded here, so whole-order cancellation stays in Orders where every payment is known. */}
                          <OrderAfterSalesActions orderId={payment.order.id} orderStatus={payment.order.status} payments={[payment]} currencyCode={currencyCode} canRefund canCancel={false} />
                        </aside>
                      </div>
                    </PlatformDetails>
                  );
                })}
              </PlatformList>
            </>
          )}
          <PlatformPageLinks pagination={data?.pagination} path={PATH} searchParams={params} />
        </PlatformSurface>
      </>}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <WebhookRecoveryPanel />
        <RecoverPaymentCreationForm />
      </div>
    </PlatformPage>
  );
}

export default PaymentsPage;
