'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { exportSupplierGrniTask, supplierSettlementTask } from '../actions/supplierSettlement';
import { centsToInput, parseMoneyToCents } from '@/features/lib/moneyInput';
import { Download, FileSpreadsheet, Receipt } from 'lucide-react';
import { PlatformDisclosure, PlatformFeedback, PlatformField, PlatformSubsection } from '@/features/platform/components/PlatformForm';
import { PlatformStatusBadge } from '@/features/platform/components/PlatformStatus';
import { platformButton, platformCheckbox, platformInput, platformSelect, platformTable } from '@/features/platform/components/platformStyles';

const field = platformInput;
function money(cents: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100); }
export function SupplierSettlementControls({ invoices, credits, receipts, currencyCode, loadError, closedInvoiceCount = 0 }: { invoices: any[]; credits: any[]; receipts: any[]; currencyCode: string; loadError?: string; closedInvoiceCount?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 16));
  const requestKeys = useRef(new Map<string, string>());
  // Remaining quantities and payables are calculated on the server over the full history.
  const availableReceipts = receipts;
  const selectedReceipts = availableReceipts.filter(receipt => selectedReceiptIds.includes(receipt.id));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const action = String(data.get('action'));
    const input: Record<string, unknown> = {};
    // Money is entered in currency units and converted exactly to minor units.
    for (const [key, value] of data) {
      if (['action', 'invoiceId', 'creditId'].includes(key) || key.startsWith('line:')) continue;
      if (['amountCents', 'taxCents', 'freightCents'].includes(key)) {
        const cents = parseMoneyToCents(String(value || '0'));
        if (cents === null) { setMessage('Enter amounts like 12.50 (at most two decimals).'); return; }
        input[key] = cents;
      } else input[key] = value;
    }
    if (action === 'capture_invoice') {
      input.supplierId = selectedReceipts[0]?.supplier?.id;
      input.currencyCode = currencyCode;
      const items = selectedReceipts.map(receipt => ({ receiptId: receipt.id, quantity: Number(data.get(`line:${receipt.id}:quantity`)), unitCostCents: parseMoneyToCents(String(data.get(`line:${receipt.id}:cost`) || '')) }));
      if (items.some(item => item.unitCostCents === null)) { setMessage('Enter unit costs like 2.49 (at most two decimals).'); return; }
      input.items = items;
    }
    const base = { action, invoiceId: String(data.get('invoiceId') || '') || undefined, creditId: String(data.get('creditId') || '') || undefined, input };
    const fingerprint = JSON.stringify(base), key = requestKeys.current.get(fingerprint) || crypto.randomUUID();
    requestKeys.current.set(fingerprint, key);
    startTransition(async () => {
      try {
        const result = await supplierSettlementTask({ ...base, idempotencyKey: key });
        setMessage(result.ok ? `Recorded ${action.replaceAll('_', ' ')}.` : result.error);
        if (result.ok) { requestKeys.current.delete(fingerprint); router.refresh(); }
      } catch { setMessage('The supplier operation could not be confirmed. Retry the same inputs to recover its result.'); }
    });
  }
  function exportGrni() {
    startTransition(async () => {
      const result = await exportSupplierGrniTask(asOf);
      if (!result.ok) { setMessage(result.error); return; }
      const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `unmatched-receipts-${asOf.replaceAll(':', '-')}-UTC.csv`; anchor.click(); URL.revokeObjectURL(url);
    });
  }
  const openInvoices = invoices.filter(invoice => !['settled', 'voided'].includes(invoice.status));
  return <PlatformDisclosure
    icon={Receipt}
    title="Supplier invoices, claims & settlement"
    description="Match supplier documents to received goods, record claims and credits, and log external payments with references."
    badge={openInvoices.length ? <PlatformStatusBadge status="open" label={`${openInvoices.length} open invoices`} /> : undefined}
    defaultOpen={Boolean(loadError)}
  >
    <div className="space-y-6" aria-busy={pending}>
      {loadError ? <PlatformFeedback tone="error">{loadError} Supplier payables and matching are unavailable until the full history loads; refresh to try again.</PlatformFeedback> : null}
      {loadError ? null : <>
      {message ? <PlatformFeedback tone={/^Recorded/.test(message) ? 'success' : 'error'}>{message}</PlatformFeedback> : null}

      <details className="group/capture overflow-hidden rounded-lg border bg-background">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-semibold hover:bg-muted/30 [&::-webkit-details-marker]:hidden"><FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden="true" />Capture supplier invoice<span className="ml-auto text-xs font-normal text-muted-foreground">{availableReceipts.length} receipts available to match</span></summary>
        <form onSubmit={submit} className="space-y-4 border-t bg-muted/20 p-3.5">
          <input type="hidden" name="action" value="capture_invoice" />
          <div className="grid gap-3 sm:grid-cols-3">
            <PlatformField label="Supplier invoice number"><input name="invoiceNumber" required className={field} /></PlatformField>
            <PlatformField label="Invoice date"><input name="invoiceDate" type="date" required className={field} /></PlatformField>
            <PlatformField label="Due date"><input name="dueDate" type="date" className={field} /></PlatformField>
            <PlatformField label="Invoice document reference"><input name="documentReference" required className={field} /></PlatformField>
            <PlatformField label={`Tax (${currencyCode})`}><input name="taxCents" inputMode="decimal" defaultValue="0.00" aria-label="Supplier invoice tax" className={`${field} tabular-nums`} /></PlatformField>
            <PlatformField label={`Freight (${currencyCode})`}><input name="freightCents" inputMode="decimal" defaultValue="0.00" aria-label="Supplier invoice freight" className={`${field} tabular-nums`} /></PlatformField>
          </div>
          <p className="text-xs text-muted-foreground">Choose receipts from one supplier. Enter billed quantities and unit costs in {currencyCode}; differences from receiving are retained as variances.</p>
          <div className="max-h-80 divide-y overflow-y-auto rounded-md border bg-background">
            {availableReceipts.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">No received goods are waiting for an invoice match.</p> : availableReceipts.map(receipt => <div key={receipt.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 has-[:checked]:bg-muted/40">
              <label className="flex min-w-0 flex-1 items-center gap-2.5 text-sm"><input type="checkbox" className={platformCheckbox} checked={selectedReceiptIds.includes(receipt.id)} onChange={event => setSelectedReceiptIds(current => event.target.checked ? [...current, receipt.id] : current.filter(id => id !== receipt.id))} /><span className="min-w-0"><span className="font-medium">{receipt.product?.title}</span><span className="block truncate text-xs text-muted-foreground">{receipt.supplier?.name} · {receipt.purchaseOrder?.poNumber} · batch {receipt.supplierLotNumber} · {receipt.conditionStatus}</span></span></label>
              {selectedReceiptIds.includes(receipt.id) ? <div className="flex gap-2"><input name={`line:${receipt.id}:quantity`} required type="number" min="0.001" step="0.001" defaultValue={receipt.remainingQuantity} aria-label="Billed quantity" title="Billed quantity" className={`${field} w-24 tabular-nums`} /><input name={`line:${receipt.id}:cost`} required inputMode="decimal" defaultValue={centsToInput(receipt.unitCostCents)} aria-label={`Billed unit cost in ${currencyCode}`} title={`Billed unit cost (${currencyCode})`} className={`${field} w-28 tabular-nums`} /></div> : null}
            </div>)}
          </div>
          <button disabled={pending || !selectedReceipts.length} className={platformButton('primary', 'md')}>Capture invoice and match {selectedReceipts.length || ''} receipts</button>
        </form>
      </details>

      <PlatformSubsection title="Supplier invoices" description={invoices.length ? `${openInvoices.length} open · showing the ${invoices.length - openInvoices.length} most recent of ${closedInvoiceCount} settled or voided` : 'Captured invoices appear here with their match variances and next steps.'}>
        {invoices.length === 0 ? <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No supplier invoices captured yet.</p> : <div className="space-y-2">
          {invoices.map(invoice => { const invoiceCredits = credits.filter(credit => credit.invoice?.id === invoice.id); const payable = Number(invoice.payableCents); return <details key={invoice.id} className="group/invoice overflow-hidden rounded-lg border bg-background">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-3 hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
              <span className="font-mono text-sm font-semibold">{invoice.invoiceNumber}</span>
              <PlatformStatusBadge status={invoice.status} />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{invoice.supplierName}</span>
              <span className="text-sm tabular-nums"><span className="text-xs text-muted-foreground">Payable </span><span className="font-semibold">{money(payable, invoice.currencyCode)}</span></span>
            </summary>
            <div className="space-y-4 border-t bg-muted/20 p-3.5">
              <p className="text-xs text-muted-foreground">Merchandise variance <span className={`font-medium tabular-nums ${invoice.varianceCents ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}`}>{money(invoice.varianceCents, invoice.currencyCode)}</span> · document {invoice.documentReference}</p>
              <div className={platformTable.wrap}><table className={platformTable.table}><thead className={platformTable.head}><tr><th className={platformTable.th}>Receipt</th><th className={platformTable.thNumeric}>Billed / matched</th><th className={platformTable.thNumeric}>Unit cost / expected</th><th className={platformTable.thNumeric}>Variance</th></tr></thead><tbody>{(invoice.lines || []).map((line: any) => <tr key={line.receiptId} className={platformTable.row}><td className={`${platformTable.td} font-mono text-xs`}>{line.supplierLotNumber}</td><td className={platformTable.tdNumeric}>{line.quantity} / {line.matchedQuantity}</td><td className={platformTable.tdNumeric}>{money(line.unitCostCents, invoice.currencyCode)} / {money(line.expectedUnitCostCents, invoice.currencyCode)}</td><td className={platformTable.tdNumeric}>{money(line.varianceCents, invoice.currencyCode)}</td></tr>)}</tbody></table></div>
              {!['settled', 'voided'].includes(invoice.status) ? <div className="grid gap-3 xl:grid-cols-2">
                {['captured', 'variance'].includes(invoice.status) ? <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-md border bg-background p-3"><input type="hidden" name="action" value="approve_invoice" /><input type="hidden" name="invoiceId" value={invoice.id} /><PlatformField label="Approval and variance resolution reason" className="min-w-48 flex-1"><input name="reason" required className={field} /></PlatformField><button disabled={pending} className={platformButton('primary', 'md')}>Approve invoice</button></form> : null}
                {invoice.status === 'approved' ? <form onSubmit={submit} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2"><p className="text-xs font-semibold sm:col-span-2">Record external settlement</p><input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="action" value="settle_invoice" /><PlatformField label={`Amount (${invoice.currencyCode})`}><input name="amountCents" required inputMode="decimal" defaultValue={centsToInput(payable)} aria-label="External payment amount" className={`${field} tabular-nums`} /></PlatformField><PlatformField label="Paid on"><input name="paidAt" required type="date" aria-label="External payment date" className={field} /></PlatformField><PlatformField label="External payment reference"><input name="reference" required className={field} /></PlatformField><PlatformField label="Payment evidence document"><input name="evidence" required className={field} /></PlatformField><button disabled={pending} className={platformButton('primary', 'md', 'sm:col-span-2 sm:justify-self-start')}>Record external settlement</button></form> : null}
                <form onSubmit={submit} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2"><p className="text-xs font-semibold sm:col-span-2">Supplier exception</p><input type="hidden" name="invoiceId" value={invoice.id} /><PlatformField label="Type"><select name="action" className={platformSelect}><option value="open_claim">Open supplier claim</option><option value="record_debit">Record supplier debit</option></select></PlatformField><PlatformField label="Claim / debit number"><input name="reference" required className={field} /></PlatformField><PlatformField label={`Amount (${currencyCode})`}><input name="amountCents" required inputMode="decimal" className={`${field} tabular-nums`} /></PlatformField><PlatformField label="Supporting document"><input name="evidence" required className={field} /></PlatformField><PlatformField label="Reason" className="sm:col-span-2"><input name="reason" required className={field} /></PlatformField><button disabled={pending} className={platformButton('secondary', 'md', 'sm:col-span-2 sm:justify-self-start')}>Record supplier exception</button></form>
                {['captured', 'variance'].includes(invoice.status) ? <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed bg-background p-3"><input type="hidden" name="action" value="void_invoice" /><input type="hidden" name="invoiceId" value={invoice.id} /><PlatformField label="Void reason" className="min-w-48 flex-1"><input name="reason" required className={field} /></PlatformField><button disabled={pending} className={platformButton('destructive', 'md')}>Void unapproved invoice</button></form> : null}
              </div> : null}
              {invoiceCredits.length ? <div className="space-y-2">{invoiceCredits.map(credit => <div key={credit.id} className="rounded-md border bg-background p-3"><div className="flex flex-wrap items-center gap-2 text-sm"><PlatformStatusBadge status={credit.status} /><span className="font-medium capitalize">{String(credit.kind).replaceAll('_', ' ')}</span><span className="font-mono text-xs text-muted-foreground">{credit.reference}</span><span className="ml-auto font-semibold tabular-nums">{money(credit.amountCents, invoice.currencyCode)}</span></div><p className="mt-1 text-xs text-muted-foreground">{credit.reason}</p>{credit.status === 'open' ? <form onSubmit={submit} className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3"><input type="hidden" name="action" value="resolve_claim" /><input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="creditId" value={credit.id} /><PlatformField label="Outcome"><select name="outcome" className={platformSelect}><option value="credit">Supplier credit received</option><option value="rejected">Supplier rejected claim</option></select></PlatformField><PlatformField label={`Accepted credit (${currencyCode})`}><input name="amountCents" inputMode="decimal" defaultValue={centsToInput(credit.claimedAmountCents)} aria-label="Accepted supplier credit amount" className={`${field} tabular-nums`} /></PlatformField><PlatformField label="Supplier response / credit number"><input name="reference" required className={field} /></PlatformField><PlatformField label="Resolution reason"><input name="reason" required className={field} /></PlatformField><PlatformField label="Supplier response document"><input name="evidence" required className={field} /></PlatformField><button disabled={pending} className={platformButton('secondary', 'md', 'self-end')}>Resolve claim</button></form> : null}</div>)}</div> : null}
              {(invoice.events || []).length ? <ol className="space-y-1 border-l pl-3 text-xs text-muted-foreground">{(invoice.events || []).map((event: any, index: number) => <li key={index}><span className="font-medium text-foreground">{String(event.action).replaceAll('_', ' ')}</span> · {event.at} · {event.actorId}{event.input?.reason || event.input?.reference ? ` · ${event.input?.reason || event.input?.reference}` : ''}</li>)}</ol> : null}
            </div>
          </details>; })}
        </div>}
      </PlatformSubsection>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3.5 sm:flex-row sm:items-end">
        <PlatformField label="Unmatched receipt cutoff (UTC)" className="sm:w-60"><input type="datetime-local" required value={asOf} onChange={event => setAsOf(event.target.value)} className={field} /></PlatformField>
        <button type="button" disabled={!asOf || pending} onClick={exportGrni} className={platformButton('secondary', 'md')}><Download aria-hidden="true" />Download receipt / GRNI CSV</button>
        <p className="text-xs text-muted-foreground sm:flex-1">Receipt recognition uses captured invoice quantities and excludes invoices voided by the cutoff.</p>
      </div>
      </>}
    </div>
  </PlatformDisclosure>;
}
