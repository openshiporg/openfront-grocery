'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { createFinancialClose, exportFinancialClose, importSettlementStatement, reviewSettlementEntry } from '../actions';

const inputClass = 'min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm';
const buttonClass = 'min-h-10 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50';

export function FinancialReportsClient({ data, statementTemplate }: { data: any; statementTemplate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [closeKey, setCloseKey] = useState(() => `financial-close:${globalThis.crypto.randomUUID()}`);
  const [importKey, setImportKey] = useState(() => `statement-import:${globalThis.crypto.randomUUID()}`);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Financial operation failed'); } finally { setBusy(false); }
  }
  function close(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(async () => {
      const result = await createFinancialClose({ startDate: String(form.get('startDate')), endDate: String(form.get('endDate')), timezone: String(form.get('timezone')), note: String(form.get('note') || ''), idempotencyKey: closeKey });
      setSummary(result.snapshot); setMessage(`Close saved as ${result.status.replaceAll('_', ' ')}. Exporting this close will reproduce the same snapshot.`);
      setCloseKey(`financial-close:${globalThis.crypto.randomUUID()}`);
    });
  }
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    <section className="rounded-xl border bg-background p-4 space-y-3">
      <h2 className="font-semibold">Close a trading period</h2>
      <p className="text-sm text-muted-foreground">Save source IDs, actual sales, captures, refunds, settlement references and stock evidence at a fixed cutoff. Unresolved differences remain visible in the saved close.</p>
      <form onSubmit={close} className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-medium">First trading day<input className={inputClass} name="startDate" type="date" required /></label>
        <label className="text-xs font-medium">Last trading day<input className={inputClass} name="endDate" type="date" required /></label>
        <label className="text-xs font-medium">Trading timezone<input className={inputClass} name="timezone" defaultValue={data.timezone || 'UTC'} required /></label>
        <label className="text-xs font-medium md:col-span-3">Review notes<textarea className={inputClass} name="note" placeholder="Explain known unsettled payments, statement differences or missing historical evidence. Required when closing with exceptions." /></label>
        <button className={buttonClass} disabled={busy}>Save financial close</button>
      </form>
    </section>
    {summary && <section className="rounded-xl border p-4 space-y-3">
      <h2 className="font-semibold">Saved close totals ({summary.currencyCode})</h2>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Actual goods', 'actualGrossCents'], ['Discounts', 'discountsCents'], ['Tax', 'taxCents'], ['Delivery fees', 'feesCents'], ['Captures', 'capturedCents'], ['Refunds', 'refundedCents'], ['Net payments', 'netPaymentsCents'], ['Provider fees', 'providerFeesCents']].map(([label, key]) => <div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{(summary.totals[key] / 100).toFixed(2)}</dd></div>)}</dl>
      <p className="text-sm">{summary.exceptions.length} unresolved exceptions · {summary.totals.unknownStockLots} lots with unknown historical opening quantity</p>
      <ul className="space-y-1 text-xs">{summary.exceptions.slice(0, 20).map((entry: any, index: number) => <li key={index}>{entry.sourceType} {entry.sourceId}: {entry.reason}</li>)}</ul>
    </section>}
    <section className="rounded-xl border bg-background p-4 space-y-3">
      <h2 className="font-semibold">Import a provider statement</h2>
      <p className="text-sm text-muted-foreground">Paste normalized statement CSV in integer cents. Each capture or refund needs its provider reference, fees, net amount and payout reference. Matching uses local records; importing never charges or refunds a payment.</p>
      <details><summary className="cursor-pointer text-sm underline">CSV format and example</summary><pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{statementTemplate}</pre></details>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void run(async () => {
          const result = await importSettlementStatement({ providerCode: String(form.get('providerCode')), statementReference: String(form.get('statementReference')), csv: String(form.get('csv')), idempotencyKey: importKey });
          setMessage(`Statement retained: ${result.matched} matched, ${result.unresolved} unresolved entries.`);
          setImportKey(`statement-import:${globalThis.crypto.randomUUID()}`);
        });
      }}>
        <label className="text-xs font-medium">Provider code<input className={inputClass} name="providerCode" defaultValue="pp_stripe_default" required /></label>
        <label className="text-xs font-medium">Statement reference<input className={inputClass} name="statementReference" required /></label>
        <label className="text-xs font-medium md:col-span-2">Statement CSV<textarea className={inputClass} name="csv" rows={5} required /></label>
        <button className={buttonClass} disabled={busy}>Import and match statement</button>
      </form>
    </section>
    <section className="rounded-xl border bg-background p-4 space-y-3">
      <h2 className="font-semibold">Settlement exceptions</h2>
      {!data.exceptions?.length && <p className="text-sm text-muted-foreground">No unresolved statement entries on this page.</p>}
      {(data.exceptions || []).map((entry: any) => <form key={entry.id} className="grid gap-2 border-t pt-3" onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void run(async () => { const result = await reviewSettlementEntry({ matchId: entry.id, reason: String(form.get('reason')), idempotencyKey: `settlement-review:${entry.id}:${globalThis.crypto.randomUUID()}` }); setMessage(`${result.status}: ${result.reason}`); });
      }}><p className="text-sm">{entry.statementReference} / {entry.entryReference} · {entry.currencyCode} {(entry.amountCents / 100).toFixed(2)}</p><p className="text-xs text-muted-foreground">{entry.reason}</p>
        <label className="text-xs">Review evidence<input className={inputClass} name="reason" required minLength={8} placeholder="Describe the local repair or review performed" /></label>
        <button className={buttonClass} disabled={busy}>Recheck matching evidence</button>
      </form>)}
    </section>
    <section className="rounded-xl border bg-background p-4 space-y-3">
      <h2 className="font-semibold">Saved closes</h2>
      {(data.closes || []).map((record: any) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3">
        <div><p className="text-sm">{new Date(record.periodStart).toLocaleDateString()} — {new Date(record.periodEnd).toLocaleDateString()} (end exclusive) · {record.status.replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{record.timezone} · Snapshot {new Date(record.cutoff).toLocaleString()}</p></div>
        <button className={buttonClass} disabled={busy} onClick={() => void run(async () => {
          const report = await exportFinancialClose(record.id); setSummary(report.snapshot);
          const url = URL.createObjectURL(new Blob([report.csv], { type: 'text/csv;charset=utf-8' }));
          const link = document.createElement('a'); link.href = url; link.download = report.filename; link.click(); URL.revokeObjectURL(url);
          setMessage(`Exported saved close ${record.id}. Content hash ${report.contentHash}.`);
        })}>Download CSV</button>
      </div>)}
      <nav className="flex gap-3 text-sm" aria-label="Financial close pages">{data.page > 1 && <Link href={`?page=${data.page - 1}`}>Previous</Link>}{data.page * data.pageSize < Math.max(data.total, data.totalExceptions || 0) && <Link href={`?page=${data.page + 1}`}>Next</Link>}</nav>
    </section>
  </div>;
}
