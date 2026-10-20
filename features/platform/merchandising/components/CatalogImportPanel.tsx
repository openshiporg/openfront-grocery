'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { FileUp } from 'lucide-react';
import { runCatalogImportTask } from '../catalogImportActions';
import { PlatformDisclosure, PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { PlatformStatusBadge } from '@/features/platform/components/PlatformStatus';
import { platformButton, platformInput, platformTable, platformTextarea } from '@/features/platform/components/platformStyles';
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
  return <PlatformDisclosure icon={FileUp} title="Import catalog CSV" description="Schema v1 · up to 500 rows per source batch. Validate, review every planned change, then commit.">
    <div className="space-y-4" aria-busy={pending}>
      <p className="text-xs leading-relaxed text-muted-foreground">New SKUs become drafts for the existing publishing workflow. Existing products keep their publishing status; reviewed price changes take effect on commit. Physical units and stock are preserved. Blank supplier or department clears that relationship; blank tax inherits Store tax and zero is exempt. SKUs are exact and case-sensitive.</p>
      <form onSubmit={preview} onChange={() => setReview(null)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <PlatformField label="Source system"><input className={platformInput} name="sourceSystem" required maxLength={100} placeholder="Supplier catalog" disabled={pending} /></PlatformField>
          <PlatformField label="Source batch ID" hint="Use a distinct batch ID for each chunk."><input className={`${platformInput} font-mono`} name="sourceBatchId" required maxLength={150} placeholder="2026-09-05-part-001" disabled={pending} /></PlatformField>
        </div>
        <PlatformField label="CSV content" hint={<>Header: <code className="font-mono">{header}</code></>}><textarea className={`${platformTextarea} min-h-40 font-mono text-xs`} name="csv" required maxLength={1_000_000} defaultValue={`${header}\nAPPLE-LB,Measured apples,299,lb,weight,,,`} disabled={pending} /></PlatformField>
        <button className={platformButton('secondary', 'md')} disabled={pending}>{pending ? 'Validating…' : 'Validate and review import'}</button>
      </form>
      {review ? <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{review.plan?.length || 0} planned changes</p><PlatformStatusBadge status={review.committed ? 'completed' : review.valid ? 'active' : 'failed'} label={review.committed ? 'Committed' : review.valid ? 'Valid' : 'Has issues'} /></div>
        <p className="font-mono text-[11px] break-all text-muted-foreground">SHA-256 {review.payloadHash}</p>
        {review.issues?.length ? <PlatformFeedback tone="error" title="Resolve before committing"><ul className="list-disc space-y-0.5 pl-4">{review.issues.map((issue: string) => <li key={issue}>{issue}</li>)}</ul></PlatformFeedback> : null}
        <div className={`${platformTable.wrap} max-h-96 overflow-y-auto`}><table className={`${platformTable.table} min-w-[48rem]`}><thead className={`${platformTable.head} sticky top-0`}><tr><th className={platformTable.th}>SKU / action</th><th className={platformTable.th}>Title / unit</th><th className={platformTable.thNumeric}>Price</th><th className={platformTable.th}>Relationships / tax</th><th className={platformTable.th}>State</th></tr></thead><tbody>{review.plan?.map((row: any) => <tr key={row.rowNumber} className={platformTable.row}><td className={platformTable.td}><p className="font-mono text-xs font-medium">{row.after.sku}</p><p className="text-xs text-muted-foreground capitalize">{row.action}</p></td><td className={platformTable.td}><p>{row.before && row.before.title !== row.after.title ? <span className="text-muted-foreground line-through">{row.before.title}</span> : null} {row.after.title}</p><p className="text-xs text-muted-foreground">{row.after.unitOfMeasure} / {row.after.pricingMethod}</p></td><td className={platformTable.tdNumeric}>{row.before ? <span className="block text-xs text-muted-foreground line-through">{money(row.before.priceCents)}</span> : null}{money(row.after.priceCents)}</td><td className={`${platformTable.td} text-xs text-muted-foreground`}>Department: {row.before?.departmentId || 'none'} → {row.departmentName || 'none'}<br />Supplier: {row.before?.supplierId || 'none'} → {row.supplierName || 'none'}<br />Tax: {row.before ? (row.before.taxRateBasisPoints ?? 'inherited') : 'new'} → {row.after.taxRateBasisPoints ?? 'inherited'} bps</td><td className={platformTable.td}><PlatformStatusBadge status={row.after.status} /></td></tr>)}</tbody></table></div>
        {review.valid && !review.committed ? <button className={platformButton('primary', 'md')} disabled={pending} onClick={commit}>Commit these reviewed catalog changes</button> : null}
      </div> : null}
      {message ? <PlatformFeedback tone={/committed|Review every/i.test(message) ? 'success' : /changed|could not|unknown/i.test(message) ? 'warning' : 'info'}>{message}</PlatformFeedback> : null}
    </div>
  </PlatformDisclosure>;
}
