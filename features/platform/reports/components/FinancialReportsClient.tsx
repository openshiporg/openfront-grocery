'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CalendarCheck2, Download, FileWarning, FolderArchive, Upload } from 'lucide-react';
import { createFinancialClose, exportFinancialClose, importSettlementStatement, reviewSettlementEntry } from '../actions';
import {
  PlatformEmptyState,
  PlatformFeedback,
  PlatformField,
  PlatformMetricGrid,
  PlatformStatusBadge,
  PlatformSurface,
  platformButton,
  platformInput,
  platformTable,
  platformTextarea,
} from '@/features/platform/components/PlatformPrimitives';
import { PlatformPager } from '@/features/platform/components/PlatformPageLinks';
import { formatInTimeZone, formatMoney } from '@/features/platform/lib/format';

const dateOnly: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** Period end is exclusive; the last trading day is the instant before it, read in the close's own timezone. */
function tradingPeriod(record: { periodStart?: string; periodEnd?: string; timezone?: string }) {
  const end = record.periodEnd ? new Date(new Date(record.periodEnd).getTime() - 1) : null;
  return `${formatInTimeZone(record.periodStart, record.timezone, dateOnly)} – ${formatInTimeZone(end, record.timezone, dateOnly)}`;
}

export function FinancialReportsClient({ data, statementTemplate }: { data: any; statementTemplate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [closeKey, setCloseKey] = useState(() => `financial-close:${globalThis.crypto.randomUUID()}`);
  const [importKey, setImportKey] = useState(() => `statement-import:${globalThis.crypto.randomUUID()}`);
  /** Unwraps an action result on the client, where the error message reaches the operator intact. */
  function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Financial operation failed'); } finally { setBusy(false); }
  }
  function close(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(async () => {
      const result = must(await createFinancialClose({ startDate: String(form.get('startDate')), endDate: String(form.get('endDate')), timezone: String(form.get('timezone')), note: String(form.get('note') || ''), idempotencyKey: closeKey }));
      setSummary(result.snapshot); setMessage(`Close saved as ${result.status.replaceAll('_', ' ')}. Exporting this close will reproduce the same snapshot.`);
      setCloseKey(`financial-close:${globalThis.crypto.randomUUID()}`);
    });
  }
  const closes = data.closes || [];
  const exceptions = data.exceptions || [];
  const totalPages = Math.max(1, Math.ceil(Math.max(data.total || 0, data.totalExceptions || 0) / (data.pageSize || 25)));

  return <div className="space-y-5" aria-busy={busy}>
    {error && <PlatformFeedback tone="error">{error}</PlatformFeedback>}
    {message && <PlatformFeedback tone="success">{message}</PlatformFeedback>}

    {summary && <section aria-label="Saved close totals" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Saved close totals</h2>
        <span className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{summary.currencyCode}</span>
        <span className="text-xs text-muted-foreground">{summary.exceptions.length} unresolved exceptions · {summary.totals.unknownStockLots} lots with unknown historical opening quantity</span>
      </div>
      <PlatformMetricGrid metrics={[
        ['Actual goods', 'actualGrossCents'], ['Discounts', 'discountsCents'], ['Tax', 'taxCents'], ['Delivery fees', 'feesCents'],
      ].map(([label, key]) => ({ label, value: formatMoney(summary.totals[key], summary.currencyCode) }))} />
      <PlatformMetricGrid metrics={[
        ['Captures', 'capturedCents'], ['Refunds', 'refundedCents'], ['Net payments', 'netPaymentsCents'], ['Provider fees', 'providerFeesCents'],
      ].map(([label, key]) => ({ label, value: formatMoney(summary.totals[key], summary.currencyCode) }))} />
      {summary.exceptions.length ? <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border bg-card p-3 text-xs">{summary.exceptions.slice(0, 20).map((entry: any, index: number) => <li key={index}><span className="font-medium">{entry.sourceType}</span> <span className="font-mono text-muted-foreground">{entry.sourceId}</span>: {entry.reason}</li>)}</ul> : null}
    </section>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-5">
        <PlatformSurface icon={FolderArchive} title="Saved closes" count={data.total ?? closes.length} description="Trading days are inclusive and shown in each close's timezone. An export reproduces the saved close exactly.">
          {closes.length === 0 ? <PlatformEmptyState compact icon={FolderArchive} title="No saved closes yet" description="Create a financial close to save your first trading period." /> : (
            <div className="overflow-x-auto">
              <table className={`${platformTable.table} min-w-[40rem]`}>
                <thead className={platformTable.head}><tr><th className={`${platformTable.th} md:pl-5`}>Trading days</th><th className={platformTable.th}>Status</th><th className={platformTable.th}>Cutoff · snapshot</th><th className={`${platformTable.th} text-right md:pr-5`}><span className="sr-only">Export</span></th></tr></thead>
                <tbody>{closes.map((record: any) => <tr key={record.id} className={platformTable.row}>
                  <td className={`${platformTable.td} md:pl-5`}>
                    <p className="font-medium tabular-nums">{tradingPeriod(record)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{record.timezone}</p>
                    {record.note ? <p className="mt-1 line-clamp-2 max-w-md text-xs text-muted-foreground" title={record.note}>{record.note}</p> : null}
                  </td>
                  <td className={platformTable.td}><PlatformStatusBadge status={record.status} label={record.status === 'reconciled' ? 'Reconciled' : record.status === 'closed_with_exceptions' ? 'With exceptions' : record.status.replaceAll('_', ' ')} /></td>
                  <td className={`${platformTable.tdMuted} text-xs`}>
                    <p className="whitespace-nowrap tabular-nums">{formatInTimeZone(record.cutoff, record.timezone)}</p>
                    {record.contentHash ? <p className="font-mono text-[11px]" title={record.contentHash}>sha {String(record.contentHash).slice(0, 12)}</p> : null}
                  </td>
                  <td className={`${platformTable.td} text-right md:pr-5`}>
                    <button className={platformButton('secondary', 'sm')} disabled={busy} onClick={() => void run(async () => {
                      const report = must(await exportFinancialClose(record.id)); setSummary(report.snapshot);
                      const url = URL.createObjectURL(new Blob([report.csv], { type: 'text/csv;charset=utf-8' }));
                      const link = document.createElement('a'); link.href = url; link.download = report.filename; link.click(); URL.revokeObjectURL(url);
                      setMessage(`Exported saved close ${record.id}. Content hash ${report.contentHash}.`);
                    })}><Download aria-hidden="true" />CSV</button>
                  </td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
          <PlatformPager page={data.page || 1} totalPages={totalPages} hrefFor={(page) => `/dashboard/platform/reports?page=${page}`} label="Financial close pages" summary={<>Page {data.page || 1} of {totalPages}</>} />
        </PlatformSurface>

        <PlatformSurface icon={FileWarning} title="Settlement exceptions" count={data.totalExceptions ?? exceptions.length} description="Statement entries that did not match local captures or refunds. Repair the local evidence, then recheck.">
          {!exceptions.length ? <PlatformEmptyState compact icon={FileWarning} title="No unresolved entries" description="Every imported statement entry on this page matches local evidence." /> : <div className="divide-y">
            {exceptions.map((entry: any) => <form key={entry.id} className="grid gap-3 px-4 py-3.5 md:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end" onSubmit={event => {
              event.preventDefault(); const form = new FormData(event.currentTarget);
              void run(async () => { const result = must(await reviewSettlementEntry({ matchId: entry.id, reason: String(form.get('reason')), idempotencyKey: `settlement-review:${entry.id}:${globalThis.crypto.randomUUID()}` })); setMessage(`${result.status}: ${result.reason}`); });
            }}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm"><span className="font-semibold tabular-nums">{formatMoney(entry.amountCents, entry.currencyCode)}</span><span className="truncate font-mono text-xs text-muted-foreground">{entry.statementReference} / {entry.entryReference}</span></p>
                <p className="mt-0.5 text-xs text-destructive">{entry.reason}</p>
                {entry.paymentReference || entry.payoutReference ? <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{entry.paymentReference ? `payment ${entry.paymentReference}` : ''}{entry.paymentReference && entry.payoutReference ? ' · ' : ''}{entry.payoutReference ? `payout ${entry.payoutReference}` : ''}</p> : null}
              </div>
              <PlatformField label="Review evidence"><input className={platformInput} name="reason" required minLength={8} placeholder="Local repair or review performed" /></PlatformField>
              <button className={platformButton('secondary', 'md')} disabled={busy}>Recheck matching</button>
            </form>)}
          </div>}
        </PlatformSurface>
      </div>

      <aside className="min-w-0 space-y-5">
        <PlatformSurface icon={CalendarCheck2} title="Close a trading period" description="Saves sales, payments, refunds, settlement references and stock as of a cutoff. Unresolved differences stay listed.">
          <form onSubmit={close} className="space-y-3 p-4 md:p-5">
            <div className="grid grid-cols-2 gap-3">
              <PlatformField label="First trading day"><input className={platformInput} name="startDate" type="date" required /></PlatformField>
              <PlatformField label="Last trading day"><input className={platformInput} name="endDate" type="date" required /></PlatformField>
            </div>
            <PlatformField label="Trading timezone"><input className={platformInput} name="timezone" defaultValue={data.timezone || 'UTC'} required /></PlatformField>
            <PlatformField label="Review notes" hint="Required when closing with exceptions."><textarea className={platformTextarea} name="note" placeholder="Known unsettled payments, statement differences or missing historical evidence" /></PlatformField>
            <button className={platformButton('primary', 'md', 'w-full')} disabled={busy}>{busy ? 'Working…' : 'Save financial close'}</button>
          </form>
        </PlatformSurface>

        <PlatformSurface icon={Upload} title="Import statement" description="CSV with amounts in minor units (cents). Importing only matches entries to payments; it never charges or refunds.">
          <form className="space-y-3 p-4 md:p-5" onSubmit={event => {
            event.preventDefault(); const form = new FormData(event.currentTarget);
            void run(async () => {
              const result = must(await importSettlementStatement({ providerCode: String(form.get('providerCode')), statementReference: String(form.get('statementReference')), csv: String(form.get('csv')), idempotencyKey: importKey }));
              setMessage(`Statement retained: ${result.matched} matched, ${result.unresolved} unresolved entries.`);
              setImportKey(`statement-import:${globalThis.crypto.randomUUID()}`);
            });
          }}>
            <div className="grid grid-cols-2 gap-3">
              <PlatformField label="Provider code"><input className={`${platformInput} font-mono`} name="providerCode" defaultValue="pp_stripe_default" required /></PlatformField>
              <PlatformField label="Statement reference"><input className={platformInput} name="statementReference" required /></PlatformField>
            </div>
            <PlatformField label="Statement CSV"><textarea className={`${platformTextarea} min-h-28 font-mono text-xs`} name="csv" rows={5} required /></PlatformField>
            <details className="group rounded-md border bg-muted/30 text-xs"><summary className="cursor-pointer px-3 py-2 font-medium">CSV format and example</summary><pre className="overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed">{statementTemplate}</pre></details>
            <button className={platformButton('primary', 'md', 'w-full')} disabled={busy}>Import and match statement</button>
          </form>
        </PlatformSurface>
      </aside>
    </div>
  </div>;
}
