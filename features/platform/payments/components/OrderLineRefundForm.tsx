'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { allocateFinalSaleRefund, type RefundLineInput } from '@/features/keystone/lib/refundAllocations';
import { ChevronDown, ReceiptText } from 'lucide-react';
import { loadOrderRefundLines, refundOrderLinesTask } from '../refundActions';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { PlatformStatusBadge } from '@/features/platform/components/PlatformStatus';
import { platformButton, platformInput, platformSelect } from '@/features/platform/components/platformStyles';
const field = platformInput;
type Feedback = { tone: 'success' | 'info' | 'warning' | 'error'; text: string } | null;
/** The review is the exact request: editing any input discards it, so Confirm always submits what was reviewed. */
export function OrderLineRefundForm({ orderId, paymentId }: { orderId: string; paymentId: string }) {
  const [pending, startTransition] = useTransition(), [data, setData] = useState<any>(null), [message, setMessage] = useState<Feedback>(null), [review, setReview] = useState<any>(null);
  const keys = useRef(new Map<string, string>());
  const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: data?.currencyCode || 'USD' }).format(cents / 100);
  function load() { startTransition(async () => { const result = await loadOrderRefundLines(orderId); if (result.ok) setData(result.data); else setMessage({ tone: 'error', text: result.error }); }); }
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const lines: RefundLineInput[] = data.lines.map((line: any) => ({ lineItemId: line.lineItemId, quantityMilli: Math.round(Number(form.get(`quantity:${line.lineItemId}`)) * 1000), disposition: String(form.get(`disposition:${line.lineItemId}`)), conditionNote: String(form.get(`condition:${line.lineItemId}`) || ''), returnedLots: (line.allocations || []).map((lot: any) => ({ lotId: lot.lotId, quantityMilli: Math.round(Number(form.get(`lot:${line.lineItemId}:${lot.lotId}`)) * 1000) })).filter((lot: any) => lot.quantityMilli > 0) })).filter((line: RefundLineInput) => line.quantityMilli > 0);
      const reason = String(form.get('reason') || '').trim();
      const allocations = allocateFinalSaleRefund(data.finalSale, lines, data.requests || []);
      const fingerprint = JSON.stringify({ orderId, paymentId, reason, lines });
      const idempotencyKey = keys.current.get(fingerprint) || crypto.randomUUID(); keys.current.set(fingerprint, idempotencyKey);
      setReview({ orderId, paymentId, reason, lines, idempotencyKey, allocations }); setMessage(null);
    } catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Refund quantities could not be allocated' }); }
  }
  function run(input: { orderId: string; paymentId: string; reason: string; lines: RefundLineInput[]; idempotencyKey: string }) {
    startTransition(async () => {
      try {
        const result = await refundOrderLinesTask(input);
        if (!result.ok) { setMessage({ tone: 'error', text: result.error }); return; }
        setMessage({ tone: result.data.status === 'succeeded' ? 'success' : 'info', text: result.data.message || 'Line refund submitted.' });
        setReview(null); const latest = await loadOrderRefundLines(orderId); if (latest.ok) setData(latest.data);
      }
      catch { setMessage({ tone: 'warning', text: 'We couldn’t confirm the line refund. Confirm the same review again, or use “Check this refund” below; it won’t refund twice.' }); }
    });
  }
  const pendingRequests = [...new Set<string>((data?.requests || []).filter((row: any) => row.status !== 'succeeded').map((row: any) => row.requestKey))];
  return <section className="overflow-hidden rounded-lg border bg-background text-sm shadow-xs" aria-busy={pending}>
    <div className="flex items-start gap-2.5 border-b px-4 py-3">
      <ReceiptText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div><h3 className="font-medium">Refund finalized goods</h3><p className="mt-0.5 text-xs text-muted-foreground">Physical quantities with their final discount and tax allocation. Delivery fees and goodwill amounts use the payment refund action.</p></div>
    </div>
    <div className="space-y-3 p-4">
    {!data ? <button disabled={pending} onClick={load} className={platformButton('secondary', 'sm', 'w-full')}>{pending ? 'Loading receipt…' : 'Load final receipt lines'}</button> : <>
    {data.message ? <PlatformFeedback tone="info">{data.message}</PlatformFeedback> : null}
    <form onSubmit={preview} onChange={() => setReview(null)} className="space-y-3">{data.lines.map((line: any) => { const remaining = Math.max(0, line.quantityMilli - line.reservedQuantityMilli) / 1000; return <div key={line.lineItemId} className="space-y-2.5 rounded-md border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2"><p className="font-medium">{line.productTitle}</p><span className="shrink-0 text-xs text-muted-foreground tabular-nums">{remaining} {line.unitOfMeasure} refundable</span></div>
      <div className="grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
        <PlatformField label="Quantity"><input name={`quantity:${line.lineItemId}`} type="number" min="0" max={remaining} step="0.001" defaultValue="0" aria-label={`Refund quantity for ${line.productTitle}`} className={`${field} tabular-nums`} /></PlatformField>
        <PlatformField label="Goods disposition"><select name={`disposition:${line.lineItemId}`} className={platformSelect}><option value="refund_only">Refund; goods not returned</option><option value="return_to_stock">Inspected return to stock</option><option value="quarantine">Returned to quarantine</option><option value="waste">Reported / received waste</option></select></PlatformField>
      </div>
      <PlatformField label="Condition / custody evidence"><input name={`condition:${line.lineItemId}`} placeholder="Required for returned goods" className={field} /></PlatformField>
      {(line.allocations || []).length ? <details className="group/lots rounded-md border bg-background"><summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">Returned physical lots<span className="font-normal text-muted-foreground">(stock, quarantine or waste)</span><ChevronDown className="ml-auto size-3.5 transition-transform group-open/lots:rotate-180" aria-hidden="true" /></summary><div className="space-y-2 border-t p-2.5">{(line.allocations || []).map((lot: any) => <label key={lot.lotId} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate"><span className="font-mono">{lot.lotId.slice(-8)}</span> · supplied {lot.quantity}</span><input name={`lot:${line.lineItemId}:${lot.lotId}`} type="number" min="0" max={lot.quantity} step="0.001" defaultValue="0" className={`${field} w-24 tabular-nums`} /></label>)}</div></details> : null}
    </div>; })}
      <PlatformField label="Refund reason"><input name="reason" required minLength={3} maxLength={500} placeholder="Missing, damaged, or returned goods" className={field} /></PlatformField>
      <button disabled={pending || !data.lines.length} className={platformButton('secondary', 'md', 'w-full')}>Review line refund</button></form>
    {pendingRequests.map(key => { const rows = data.requests.filter((row: any) => row.requestKey === key); return <div key={key} className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold tabular-nums">{money(rows.reduce((sum: number, row: any) => sum + row.totalCents, 0))}</span><PlatformStatusBadge status={rows[0].status} /></div><p className="text-xs text-muted-foreground">{rows[0].failureMessage || 'Quantities remain reserved'}</p><button disabled={pending} className={platformButton('secondary', 'sm')} onClick={() => run({ orderId, paymentId: rows[0].paymentId, idempotencyKey: key, reason: rows[0].reason, lines: rows.map((row: any) => ({ lineItemId: row.lineItemId, quantityMilli: row.quantityMilli, disposition: row.disposition, conditionNote: row.conditionNote || '', returnedLots: row.returnedLots || [] })) })}>Check this refund</button></div>; })}
  </>}{review ? <div className="space-y-2.5 rounded-md border bg-muted/30 p-3"><p className="flex items-baseline justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">Refund total</span><span className="text-base font-semibold tabular-nums">{money(review.allocations.reduce((sum: number, line: any) => sum + line.totalCents, 0))}</span></p><ul className="divide-y rounded-md border bg-background text-xs">{review.allocations.map((line: any) => <li key={line.lineItemId} className="px-2.5 py-2"><p className="font-medium">{line.productTitle} × {line.quantityMilli / 1000}</p><p className="text-muted-foreground tabular-nums">net goods {money(line.netGoodsCents)} · tax {money(line.taxCents)} · discount reversed {money(line.discountCents)} · <span className="capitalize">{String(line.disposition).replaceAll('_', ' ')}</span></p></li>)}</ul><p className="text-xs"><span className="text-muted-foreground">Reason:</span> {review.reason}</p><p className="text-xs text-muted-foreground">Returned goods are recorded when this refund is accepted. The payment provider may take longer to complete it.</p><button disabled={pending} onClick={() => run(review)} className={platformButton('primary', 'md', 'w-full')}>Confirm this line refund</button></div> : null}{message ? <PlatformFeedback tone={message.tone}>{message.text}</PlatformFeedback> : null}
    </div>
  </section>;
}
