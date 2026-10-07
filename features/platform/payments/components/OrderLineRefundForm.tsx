'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { allocateFinalSaleRefund, type RefundLineInput } from '@/features/keystone/lib/refundAllocations';
import { loadOrderRefundLines, refundOrderLinesTask } from '../refundActions';
const field = 'min-h-10 rounded border bg-background px-3 text-sm';
export function OrderLineRefundForm({ orderId, paymentId }: { orderId: string; paymentId: string }) {
  const [pending, startTransition] = useTransition(), [data, setData] = useState<any>(null), [message, setMessage] = useState(''), [review, setReview] = useState<any>(null);
  const keys = useRef(new Map<string, string>());
  const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data?.currencyCode || 'USD' }).format(cents / 100);
  function load() { startTransition(async () => { const result = await loadOrderRefundLines(orderId); if (result.ok) setData(result.data); else setMessage(result.error); }); }
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const lines: RefundLineInput[] = data.lines.map((line: any) => ({ lineItemId: line.lineItemId, quantityMilli: Math.round(Number(form.get(`quantity:${line.lineItemId}`)) * 1000), disposition: String(form.get(`disposition:${line.lineItemId}`)), conditionNote: String(form.get(`condition:${line.lineItemId}`) || ''), returnedLots: (line.allocations || []).map((lot: any) => ({ lotId: lot.lotId, quantityMilli: Math.round(Number(form.get(`lot:${line.lineItemId}:${lot.lotId}`)) * 1000) })).filter((lot: any) => lot.quantityMilli > 0) })).filter((line: RefundLineInput) => line.quantityMilli > 0);
      const reason = String(form.get('reason') || '').trim();
      const allocations = allocateFinalSaleRefund(data.finalSale, lines, data.requests || []);
      const fingerprint = JSON.stringify({ orderId, paymentId, reason, lines });
      const idempotencyKey = keys.current.get(fingerprint) || crypto.randomUUID(); keys.current.set(fingerprint, idempotencyKey);
      setReview({ orderId, paymentId, reason, lines, idempotencyKey, allocations }); setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Refund quantities could not be allocated'); }
  }
  function run(input: { orderId: string; paymentId: string; reason: string; lines: RefundLineInput[]; idempotencyKey: string }) {
    startTransition(async () => {
      try { const result = await refundOrderLinesTask(input); setMessage(result.ok ? result.data.message : result.error); if (result.ok) { setReview(null); const latest = await loadOrderRefundLines(orderId); if (latest.ok) setData(latest.data); } }
      catch { setMessage('The line refund could not be confirmed. Retry this same request to recover its recorded outcome.'); }
    });
  }
  const pendingRequests = [...new Set<string>((data?.requests || []).filter((row: any) => row.status !== 'succeeded').map((row: any) => row.requestKey))];
  return <section className="space-y-3 rounded border p-3" aria-busy={pending}><h3 className="font-semibold">Refund finalized goods</h3><p className="text-xs text-muted-foreground">Refund physical quantities with their final discount and tax allocation. Delivery fees and amount-only goodwill use the separate payment refund action.</p>{!data ? <button disabled={pending} onClick={load} className={field}>Load final receipt lines</button> : <>
    {data.message ? <p className="text-sm">{data.message}</p> : null}
    <form onSubmit={preview} className="space-y-3">{data.lines.map((line: any) => { const remaining = Math.max(0, line.quantityMilli - line.reservedQuantityMilli) / 1000; return <div key={line.lineItemId} className="space-y-2 rounded border p-3"><p className="text-sm font-medium">{line.productTitle} · {remaining} {line.unitOfMeasure} available to refund</p><div className="flex flex-wrap gap-2"><input name={`quantity:${line.lineItemId}`} type="number" min="0" max={remaining} step="0.001" defaultValue="0" aria-label={`Refund quantity for ${line.productTitle}`} className={field} /><select name={`disposition:${line.lineItemId}`} className={field}><option value="refund_only">Refund; goods not returned</option><option value="return_to_stock">Inspected return to stock</option><option value="quarantine">Returned to quarantine</option><option value="waste">Reported / received waste</option></select><input name={`condition:${line.lineItemId}`} placeholder="Condition / custody evidence for returned goods" className={field} /></div><details><summary className="text-xs">Returned physical lots (required for stock, quarantine or waste)</summary>{(line.allocations || []).map((lot: any) => <label key={lot.lotId} className="mt-2 flex items-center gap-2 text-xs">Lot {lot.lotId} · supplied {lot.quantity}<input name={`lot:${line.lineItemId}:${lot.lotId}`} type="number" min="0" max={lot.quantity} step="0.001" defaultValue="0" className={field} /></label>)}</details></div>; })}<input name="reason" required minLength={3} maxLength={500} placeholder="Refund reason" className={field} /><button disabled={pending || !data.lines.length} className={field}>Review line refund</button></form>
    {pendingRequests.map(key => { const rows = data.requests.filter((row: any) => row.requestKey === key); return <div key={key} className="rounded border p-3"><p className="text-sm">{money(rows.reduce((sum: number, row: any) => sum + row.totalCents, 0))} · {rows[0].status} · {rows[0].failureMessage || 'Quantities remain reserved'}</p><button disabled={pending} className={field} onClick={() => run({ orderId, paymentId: rows[0].paymentId, idempotencyKey: key, reason: rows[0].reason, lines: rows.map((row: any) => ({ lineItemId: row.lineItemId, quantityMilli: row.quantityMilli, disposition: row.disposition, conditionNote: row.conditionNote || '', returnedLots: row.returnedLots || [] })) })}>Reconcile / retry this refund</button></div>; })}
  </>}{review ? <div className="space-y-2 rounded border p-3"><p className="font-semibold">Refund {money(review.allocations.reduce((sum: number, line: any) => sum + line.totalCents, 0))}</p>{review.allocations.map((line: any) => <p key={line.lineItemId} className="text-sm">{line.productTitle} × {line.quantityMilli / 1000} · net goods {money(line.netGoodsCents)} · tax {money(line.taxCents)} · discount reversed {money(line.discountCents)} · {line.disposition}</p>)}<p className="text-xs">Returned goods custody is recorded when this request is accepted. Provider processing may complete later.</p><button disabled={pending} onClick={() => run(review)} className={field}>Confirm this line refund</button></div> : null}{message ? <p role="status" className="text-sm">{message}</p> : null}</section>;
}
