'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supplierSettlementTask } from '../actions/supplierSettlement';
import { grniAt, supplierInvoicePayable, supplierMatchedQuantity } from '@/features/keystone/lib/supplierMatching';

const field = 'h-10 rounded-md border bg-background px-3 text-sm';
function money(cents: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100); }
function csvCell(value: unknown) { const text = String(value ?? ''); return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`; }
export function SupplierSettlementControls({ invoices, credits, receipts, currencyCode, loadError }: { invoices: any[]; credits: any[]; receipts: any[]; currencyCode: string; loadError?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 16));
  const requestKeys = useRef(new Map<string, string>());
  const availableReceipts = receipts.filter(receipt => Number(receipt.quantity) > supplierMatchedQuantity(receipt.id, invoices));
  const selectedReceipts = availableReceipts.filter(receipt => selectedReceiptIds.includes(receipt.id));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const action = String(data.get('action'));
    const input: Record<string, unknown> = {};
    for (const [key, value] of data) if (!['action', 'invoiceId', 'creditId'].includes(key) && !key.startsWith('line:')) input[key] = ['amountCents', 'taxCents', 'freightCents'].includes(key) ? Number(value) : value;
    if (action === 'capture_invoice') {
      input.supplierId = selectedReceipts[0]?.supplier?.id;
      input.currencyCode = currencyCode;
      input.items = selectedReceipts.map(receipt => ({ receiptId: receipt.id, quantity: Number(data.get(`line:${receipt.id}:quantity`)), unitCostCents: Number(data.get(`line:${receipt.id}:cost`)) }));
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
    const cutoff = new Date(`${asOf}Z`);
    const rows = grniAt(receipts, invoices, cutoff);
    const columns = ['receiptId', 'purchaseOrderId', 'poItemId', 'supplierId', 'supplierLotNumber', 'receivedQuantity', 'matchedQuantity', 'unmatchedQuantity', 'unitCostCents', 'unmatchedValueCents', 'conditionStatus'];
    const csv = [columns.map(csvCell).join(','), ...rows.map(row => columns.map(key => csvCell((row as any)[key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `unmatched-receipts-${asOf.replaceAll(':', '-')}-UTC.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section className="space-y-4 rounded-lg border p-4" aria-busy={pending}>
    <div><h2 className="font-semibold">Supplier invoices, claims and settlement</h2><p className="text-sm text-muted-foreground">Match supplier documents to received goods. Record supplier credits and external payments with document references.</p></div>
    {loadError ? <p role="alert">{loadError}</p> : null}{message ? <p role="status">{message}</p> : null}
    <details className="rounded border p-3"><summary>Capture supplier invoice</summary><form onSubmit={submit} className="mt-3 space-y-3"><input type="hidden" name="action" value="capture_invoice" /><div className="grid gap-3 sm:grid-cols-3"><input name="invoiceNumber" required placeholder="Supplier invoice number" className={field} /><label className="grid gap-1 text-xs">Invoice date<input name="invoiceDate" type="date" required className={field} /></label><label className="grid gap-1 text-xs">Due date<input name="dueDate" type="date" className={field} /></label><input name="documentReference" required placeholder="Invoice document reference" className={field} /><input name="taxCents" type="number" min="0" step="1" defaultValue="0" aria-label="Supplier invoice tax in minor units" className={field} /><input name="freightCents" type="number" min="0" step="1" defaultValue="0" aria-label="Supplier invoice freight in minor units" className={field} /></div><p className="text-xs text-muted-foreground">Choose receipts from one supplier. Enter billed quantities and unit costs in {currencyCode} minor units. Differences from receiving are retained as variances.</p>
      {availableReceipts.map(receipt => <div key={receipt.id} className="flex flex-wrap items-center gap-3 rounded border p-2"><label className="flex flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={selectedReceiptIds.includes(receipt.id)} onChange={event => setSelectedReceiptIds(current => event.target.checked ? [...current, receipt.id] : current.filter(id => id !== receipt.id))} />{receipt.supplier?.name} · {receipt.purchaseOrder?.poNumber} · {receipt.product?.title} · batch {receipt.supplierLotNumber} · {receipt.conditionStatus}</label>{selectedReceiptIds.includes(receipt.id) ? <><input name={`line:${receipt.id}:quantity`} required type="number" min="0.001" step="0.001" defaultValue={Number(receipt.quantity) - supplierMatchedQuantity(receipt.id, invoices)} aria-label="Billed quantity" className={field} /><input name={`line:${receipt.id}:cost`} required type="number" min="0" step="1" defaultValue={receipt.unitCostCents} aria-label="Billed unit cost in minor units" className={field} /></> : null}</div>)}<button disabled={pending || !selectedReceipts.length} className={field}>Capture invoice and match receipts</button></form></details>
    {invoices.map(invoice => { const invoiceCredits = credits.filter(credit => credit.invoice?.id === invoice.id); const payable = supplierInvoicePayable(invoice, invoiceCredits); return <details key={invoice.id} className="rounded border p-3"><summary>{invoice.invoiceNumber} · {invoice.supplierName} · {invoice.status} · payable {money(payable, invoice.currencyCode)}</summary><div className="mt-3 space-y-3"><p className="text-sm">Merchandise variance {money(invoice.varianceCents, invoice.currencyCode)} · document {invoice.documentReference}</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Receipt</th><th>Billed / matched</th><th>Unit cost / expected</th><th>Variance</th></tr></thead><tbody>{(invoice.lines || []).map((line: any) => <tr key={line.receiptId}><td>{line.supplierLotNumber}</td><td>{line.quantity} / {line.matchedQuantity}</td><td>{money(line.unitCostCents, invoice.currencyCode)} / {money(line.expectedUnitCostCents, invoice.currencyCode)}</td><td>{money(line.varianceCents, invoice.currencyCode)}</td></tr>)}</tbody></table></div>
      {!['settled', 'voided'].includes(invoice.status) ? <>
        {['captured', 'variance'].includes(invoice.status) ? <form onSubmit={submit} className="flex flex-wrap gap-2"><input type="hidden" name="action" value="approve_invoice" /><input type="hidden" name="invoiceId" value={invoice.id} /><input name="reason" required placeholder="Approval and variance resolution reason" className={field} /><button disabled={pending} className={field}>Approve invoice</button></form> : null}
        <form onSubmit={submit} className="flex flex-wrap gap-2"><input type="hidden" name="invoiceId" value={invoice.id} /><select name="action" className={field}><option value="open_claim">Open supplier claim</option><option value="record_debit">Record supplier debit</option></select><input name="reference" required placeholder="Claim / debit number" className={field} /><input name="amountCents" required type="number" min="1" step="1" placeholder="Amount in minor units" className={field} /><input name="reason" required placeholder="Reason" className={field} /><input name="evidence" required placeholder="Supporting document reference" className={field} /><button disabled={pending} className={field}>Record supplier exception</button></form>
        {invoice.status === 'approved' ? <form onSubmit={submit} className="flex flex-wrap gap-2"><input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="action" value="settle_invoice" /><input name="amountCents" required type="number" min="0" step="1" defaultValue={payable} aria-label="External payment amount in minor units" className={field} /><input name="reference" required placeholder="External payment reference" className={field} /><input name="evidence" required placeholder="Payment evidence document" className={field} /><input name="paidAt" required type="date" aria-label="External payment date" className={field} /><button disabled={pending} className={field}>Record external settlement</button></form> : null}
        {['captured', 'variance'].includes(invoice.status) ? <form onSubmit={submit} className="flex flex-wrap gap-2"><input type="hidden" name="action" value="void_invoice" /><input type="hidden" name="invoiceId" value={invoice.id} /><input name="reason" required placeholder="Void reason" className={field} /><button disabled={pending} className={field}>Void unapproved invoice</button></form> : null}
      </> : null}
      {invoiceCredits.map(credit => <div key={credit.id} className="rounded border p-2"><p className="text-sm">{credit.kind} · {credit.status} · {credit.reference} · {money(credit.amountCents, invoice.currencyCode)} · {credit.reason}</p>{credit.status === 'open' ? <form onSubmit={submit} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="action" value="resolve_claim" /><input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="creditId" value={credit.id} /><select name="outcome" className={field}><option value="credit">Supplier credit received</option><option value="rejected">Supplier rejected claim</option></select><input name="amountCents" type="number" min="0" step="1" defaultValue={credit.claimedAmountCents} aria-label="Accepted supplier credit amount" className={field} /><input name="reference" required placeholder="Supplier response / credit number" className={field} /><input name="reason" required placeholder="Resolution reason" className={field} /><input name="evidence" required placeholder="Supplier response document" className={field} /><button disabled={pending} className={field}>Resolve claim</button></form> : null}</div>)}
      {(invoice.events || []).map((event: any, index: number) => <p key={index} className="text-xs text-muted-foreground">{event.at} · {event.action} · {event.actorId} · {event.input?.reason || event.input?.reference || ''}</p>)}
    </div></details>; })}
    <div className="flex flex-wrap items-center gap-3"><label className="grid gap-1 text-xs">Unmatched receipt cutoff (UTC)<input type="datetime-local" required value={asOf} onChange={event => setAsOf(event.target.value)} className={field} /></label><button type="button" disabled={!asOf || Boolean(loadError)} onClick={exportGrni} className={field}>Download receipt / GRNI CSV</button><p className="text-xs text-muted-foreground">Receipt recognition uses captured invoice quantities and excludes invoices voided by the cutoff.</p></div>
  </section>;
}
