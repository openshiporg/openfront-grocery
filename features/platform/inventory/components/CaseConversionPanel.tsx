'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { PackageOpen } from 'lucide-react';
import { convertInventoryCasesTask } from '../actions/conversionActions';
import { PlatformDisclosure, PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput, platformSelect } from '@/features/platform/components/platformStyles';
export function CaseConversionPanel({ lots }: { lots: any[] }) {
  const [pending, startTransition] = useTransition(), [review, setReview] = useState<any>(null), [message, setMessage] = useState('');
  const keys = useRef(new Map<string, string>());
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const values = { sourceInventoryLotId: String(form.get('sourceInventoryLotId')), quantityCases: Number(form.get('quantityCases')), reason: String(form.get('reason')).trim(), conditionNote: String(form.get('conditionNote')).trim(), destinationLocation: String(form.get('destinationLocation') || '').trim() };
    const fingerprint = JSON.stringify(values), idempotencyKey = keys.current.get(fingerprint) || crypto.randomUUID(); keys.current.set(fingerprint, idempotencyKey);
    const input = { ...values, idempotencyKey, mode: 'dry_run' };
    startTransition(async () => { try { const result = await convertInventoryCasesTask(input); if (!result.ok) { setReview(null); setMessage(result.error); } else { setReview({ input, ...result.data }); setMessage(result.data.committed ? `Conversion ${result.data.conversionId} was already recorded.` : 'Review the source cases and individual lots before opening the cases.'); } } catch { setMessage('Conversion review is unavailable. Retry this same request.'); } });
  }
  function commit() {
    startTransition(async () => { try { const result = await convertInventoryCasesTask({ ...review.input, mode: 'commit', expectedReviewHash: review.reviewHash }); if (!result.ok) setMessage(result.error); else { setReview({ input: review.input, ...result.data }); setMessage(`Conversion ${result.data.conversionId} recorded. Descendant lots retain supplier batch, expiry and recall provenance.`); } } catch { setMessage('Conversion outcome could not be confirmed. Retry this exact request before converting more cases.'); } });
  }
  const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: review.currencyCode }).format(cents / 100);
  return <PlatformDisclosure icon={PackageOpen} title="Open cases into individual units" description="Convert whole, unallocated cases into their configured each/unit base product with preserved batch, expiry and cost.">
    <div className="space-y-4" aria-busy={pending}>
      <p className="text-xs leading-relaxed text-muted-foreground">Both products must use each/unit pricing with an integer pack factor. Individual packaging must be inspected and suitable for sale.</p>
      <form onSubmit={preview} onChange={() => setReview(null)} className="grid gap-3 md:grid-cols-2">
        <PlatformField label="Case lot on this inventory page"><select name="sourceInventoryLotId" className={platformSelect} required disabled={pending}><option value="">Choose source lot</option>{lots.map(lot => <option value={lot.id} key={lot.id}>{lot.product?.title || lot.productId} · {lot.lotNumber} · {lot.quantityRemaining} remaining</option>)}</select></PlatformField>
        <PlatformField label="Whole cases"><input name="quantityCases" className={`${platformInput} tabular-nums`} type="number" min={1} step={1} required disabled={pending} /></PlatformField>
        <PlatformField label="Reason"><input name="reason" className={platformInput} required maxLength={500} disabled={pending} /></PlatformField>
        <PlatformField label="Destination location"><input name="destinationLocation" className={platformInput} maxLength={200} placeholder="Defaults to source lot location" disabled={pending} /></PlatformField>
        <PlatformField label="Condition and individual packaging inspection" className="md:col-span-2"><input name="conditionNote" className={platformInput} required maxLength={500} disabled={pending} /></PlatformField>
        <div className="md:col-span-2"><button className={platformButton('secondary', 'md')} disabled={pending || !lots.length}>Review case conversion</button></div>
      </form>
      {review ? <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-semibold">{review.source.productTitle}: {review.source.quantityCases} cases × {review.source.unitsPerCase} → {review.source.destinationProductTitle}</p>
        <p className="text-xs text-muted-foreground">Batch <span className="font-mono">{review.source.supplierLotNumber}</span> · expiry {review.source.expirationDate.slice(0, 10)} · total cost <span className="tabular-nums">{money(review.totalCostCents)}</span></p>
        <ul className="divide-y rounded-md border bg-background text-sm">{review.destinations.map((lot: any, index: number) => <li className="flex justify-between gap-3 px-3 py-2" key={lot.lotId || index}><span className="tabular-nums">{lot.quantity} each × {money(lot.costPerUnitCents)}</span>{lot.lotId ? <span className="font-mono text-xs text-muted-foreground">lot {lot.lotId}</span> : null}</li>)}</ul>
        <p className="text-xs text-muted-foreground">Cost is preserved exactly. Remainder cents may create two individual-unit lots.</p>
        {!review.committed ? <button className={platformButton('primary', 'md')} disabled={pending} onClick={commit}>Confirm inspected case conversion</button> : null}
      </div> : null}
      {message ? <PlatformFeedback tone={/recorded|Review the source/i.test(message) ? 'success' : 'info'}>{message}</PlatformFeedback> : null}
    </div>
  </PlatformDisclosure>;
}
