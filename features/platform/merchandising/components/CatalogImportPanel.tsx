'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { runCatalogImportTask } from '../catalogImportActions';
const field = 'min-h-10 rounded border bg-background px-3 text-sm';
const header = 'sku,title,priceCents,unitOfMeasure,pricingMethod,departmentId,supplierId,taxRateBasisPoints';
export function CatalogImportPanel() {
  const [pending, startTransition] = useTransition(), [review, setReview] = useState<any>(null), [message, setMessage] = useState('');
  const keys = useRef(new Map<string, string>());
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const sourceSystem = String(form.get('sourceSystem') || '').trim(), sourceBatchId = String(form.get('sourceBatchId') || '').trim(), csv = String(form.get('csv') || '');
    const identity = JSON.stringify([sourceSystem, sourceBatchId]);
    const idempotencyKey = keys.current.get(identity) || crypto.randomUUID(); keys.current.set(identity, idempotencyKey);
    const input = { mode: 'dry_run', schemaVersion: 1, sourceSystem, sourceBatchId, csv, idempotencyKey };
    startTransition(async () => { try { const result = await runCatalogImportTask(input); if (!result.ok) { setMessage(result.error); setReview(null); } else { setReview({ input, ...result.data }); setMessage(result.data.committed ? `Source batch already committed: ${result.data.importId}` : 'Review every planned change before committing this batch.'); } } catch { setMessage('Review could not be loaded. Retry this source batch.'); } });
  }
  function commit() {
    const input = { ...review.input, mode: 'commit', expectedPayloadHash: review.payloadHash, expectedReviewHash: review.reviewHash };
    startTransition(async () => { try { const result = await runCatalogImportTask(input); if (!result.ok) setMessage(result.error); else { setReview({ input: review.input, ...result.data }); setMessage(result.data.committed ? `Catalog import ${result.data.importId} committed${result.data.reused ? ' (existing batch)' : ''}. New products remain drafts.` : 'Validation changed; resolve the listed issues and review again.'); } } catch { setMessage('Commit outcome is unknown. Retry this exact batch to recover its recorded outcome.'); } });
  }
  const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: review.currencyCode }).format(cents / 100);
  return <section className="space-y-3 rounded border p-4" aria-busy={pending}>
    <h2 className="text-lg font-semibold">Import catalog CSV</h2>
    <p className="text-sm text-muted-foreground">Schema version 1 · up to 500 rows per source batch. New SKUs become drafts for the existing publishing workflow. Existing products retain their publishing status; reviewed price changes take effect on commit. Physical units and stock are preserved.</p>
    <form onSubmit={preview} onChange={() => setReview(null)} className="space-y-3">
      <div className="flex flex-wrap gap-3"><label className="space-y-1 text-sm">Source system<input className={`${field} block`} name="sourceSystem" required maxLength={100} placeholder="Supplier catalog" disabled={pending} /></label><label className="space-y-1 text-sm">Source batch ID<input className={`${field} block`} name="sourceBatchId" required maxLength={150} placeholder="2026-09-05-part-001" disabled={pending} /></label></div>
      <p className="text-xs text-muted-foreground">Use a distinct batch ID for each chunk. Blank supplier or department clears that relationship on an existing product. Blank tax inherits Store tax; zero is exempt. SKUs are exact and case-sensitive.</p>
      <label className="block space-y-1 text-sm">CSV content<textarea className="min-h-40 w-full rounded border bg-background p-3 font-mono text-xs" name="csv" required maxLength={1_000_000} defaultValue={`${header}\nAPPLE-LB,Measured apples,299,lb,weight,,,`} disabled={pending} /></label>
      <button className={field} disabled={pending}>Validate and review import</button>
    </form>
    {review ? <div className="space-y-3"><p className="break-all text-xs text-muted-foreground">Payload SHA-256: {review.payloadHash}</p>{review.issues?.length ? <ul className="list-disc space-y-1 pl-5 text-sm" role="alert">{review.issues.map((issue: string) => <li key={issue}>{issue}</li>)}</ul> : null}<div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">SKU / action</th><th className="p-2">Title / unit</th><th className="p-2">Price</th><th className="p-2">Relationships / tax</th><th className="p-2">State</th></tr></thead><tbody>{review.plan?.map((row: any) => <tr key={row.rowNumber} className="border-t"><td className="p-2">{row.after.sku}<br />{row.action}</td><td className="p-2">{row.before && row.before.title !== row.after.title ? `${row.before.title} → ` : ''}{row.after.title}<br />{row.after.unitOfMeasure} / {row.after.pricingMethod}</td><td className="p-2">{row.before ? `${money(row.before.priceCents)} → ` : ''}{money(row.after.priceCents)}</td><td className="p-2">Department: {row.before?.departmentId || 'none'} → {row.departmentName || 'none'}<br />Supplier: {row.before?.supplierId || 'none'} → {row.supplierName || 'none'}<br />Tax: {row.before ? (row.before.taxRateBasisPoints ?? 'inherited') : 'new'} → {row.after.taxRateBasisPoints ?? 'inherited'} bps</td><td className="p-2">{row.after.status}</td></tr>)}</tbody></table></div>{review.valid && !review.committed ? <button className={field} disabled={pending} onClick={commit}>Commit these reviewed catalog changes</button> : null}</div> : null}
    {message ? <p className="text-sm" role="status">{message}</p> : null}
  </section>;
}
