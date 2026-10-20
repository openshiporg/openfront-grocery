'use client';
import { useState, useTransition, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, ShieldAlert } from 'lucide-react';
import { inventoryCountTask, inventorySafetyTask } from '../actions/inventoryControls';
import { PlatformCard, PlatformDisclosure, PlatformFeedback, PlatformField, PlatformSubsection } from '@/features/platform/components/PlatformForm';
import { PlatformStatusBadge } from '@/features/platform/components/PlatformStatus';
import { platformButton, platformInput, platformSelect } from '@/features/platform/components/platformStyles';

const field = platformInput;
export function InventorySafetyControls({ lots, recalls, counts, loadError, orderNumbers = {} }: { lots: Array<{ id: string; lotNumber: string }>; recalls: any[]; counts: any[]; loadError?: string; orderNumbers?: Record<string, number> }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [affected, setAffected] = useState<any[]>([]);
  const router = useRouter();
  const requestKeys = useRef(new Map<string, string>());
  function submit(event: FormEvent<HTMLFormElement>, kind: 'safety' | 'count') {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const action = String(data.get('action'));
    const fingerprint = JSON.stringify([kind, [...data.entries()]]);
    const idempotencyKey = requestKeys.current.get(fingerprint) || crypto.randomUUID();
    requestKeys.current.set(fingerprint, idempotencyKey);
    const base = { action, reason: String(data.get('reason') || ''), idempotencyKey };
    startTransition(async () => {
      try {
      const result = kind === 'count' ? await inventoryCountTask({ ...base, inventoryLotId: String(data.get('lotId') || '') || undefined, countId: String(data.get('countId') || '') || undefined, ...(data.has('quantity') ? { quantity: Number(data.get('quantity')) } : {}) }) : await inventorySafetyTask({ ...base, inventoryLotIds: data.get('lotId') ? [String(data.get('lotId'))] : undefined, productId: String(data.get('productId') || '') || undefined, recallId: String(data.get('recallId') || '') || undefined, evidence: action === 'notice' ? { orderId: String(data.get('orderId')), channel: String(data.get('channel')), outcome: String(data.get('outcome')), reference: String(data.get('reference')) } : action === 'disposition' ? { lotId: String(data.get('dispositionLotId')), disposition: String(data.get('disposition')), quantity: Number(data.get('quantity')), stockQuantity: Number(data.get('stockQuantity')), replacesIdempotencyKey: String(data.get('replacesIdempotencyKey') || '') || undefined, custody: String(data.get('custody')) } : { inspection: String(data.get('inspection') || '') } });
      setMessage(result.ok ? `Recorded ${action}.` : result.error);
      if (result.ok) { requestKeys.current.delete(fingerprint); if ('affectedOrders' in (result.data || {})) setAffected(result.data.affectedOrders || []); router.refresh(); }
      } catch { setMessage('Action could not be confirmed. Retry with the same inputs to recover the recorded result.'); }
    });
  }
  const reason = <PlatformField label="Reason and evidence"><input name="reason" required placeholder="What was observed and by whom" className={field} /></PlatformField>;
  const lotSelect = <PlatformField label="Lot"><select name="lotId" required disabled={pending || lots.length === 0} className={platformSelect}><option value="">Select lot</option>{lots.map(lot => <option key={lot.id} value={lot.id}>{lot.lotNumber}</option>)}</select></PlatformField>;
  const openCounts = counts.filter(count => count.status !== 'approved');
  const openRecalls = recalls.filter(recall => recall.status === 'open');
  return <PlatformDisclosure
    icon={ShieldAlert}
    title="Safety, recalls & stock counts"
    description="Hold or quarantine lots immediately, run recalls to closure, and approve independent count observations."
    badge={openRecalls.length || openCounts.length ? <PlatformStatusBadge status="open" label={`${openRecalls.length} recalls · ${openCounts.length} counts open`} /> : undefined}
    defaultOpen={Boolean(openRecalls.length || openCounts.length || loadError)}
  >
    <div className="space-y-6" aria-busy={pending}>
      <p className="text-xs text-muted-foreground">Quantities use the product&apos;s stock unit with up to three decimal places.</p>
      {lots.length === 0 ? <PlatformFeedback tone="info">No lots are available on this page; lot-based safety and count actions are disabled.</PlatformFeedback> : null}
      {loadError ? <PlatformFeedback tone="error">{loadError}</PlatformFeedback> : null}
      {message ? <PlatformFeedback tone={/^Recorded/.test(message) ? 'success' : 'error'}>{message}</PlatformFeedback> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PlatformCard>
          <PlatformSubsection title="Lot safety action" description="Holds take effect on allocated stock immediately. Release requires inspection evidence.">
            <form onSubmit={event => submit(event, 'safety')} className="grid gap-3 sm:grid-cols-2">
              {lotSelect}
              <PlatformField label="Action"><select name="action" className={platformSelect}><option value="hold">Hold lot</option><option value="quarantine">Quarantine lot</option><option value="release">Release after inspection</option><option value="recall">Open recall</option></select></PlatformField>
              <div className="sm:col-span-2">{reason}</div>
              <PlatformField label="Release inspection evidence" className="sm:col-span-2"><input name="inspection" placeholder="Required when releasing a lot" className={field} /></PlatformField>
              <button disabled={pending || lots.length === 0} className={platformButton('primary', 'md', 'sm:col-span-2 sm:justify-self-start')}>Apply safety action</button>
            </form>
          </PlatformSubsection>
        </PlatformCard>
        <PlatformCard>
          <PlatformSubsection title="Record a count observation" description="A second operator must recount or approve before the observation changes stock.">
            <form onSubmit={event => submit(event, 'count')} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="action" value="observe" />
              {lotSelect}
              <PlatformField label="Observed remaining"><input name="quantity" required type="number" min="0" step="0.001" placeholder="0.000" className={`${field} tabular-nums`} /></PlatformField>
              <div className="sm:col-span-2">{reason}</div>
              <button disabled={pending || lots.length === 0} className={platformButton('secondary', 'md', 'sm:col-span-2 sm:justify-self-start')}><ClipboardCheck aria-hidden="true" />Record observation</button>
            </form>
          </PlatformSubsection>
        </PlatformCard>
      </div>

      {affected.length ? <PlatformFeedback tone="warning" title="Affected orders">
        <ul className="mt-1 space-y-0.5">{affected.map(order => <li key={order.orderId}><a className="font-medium underline underline-offset-2" href={`/dashboard/platform/orders?order=${encodeURIComponent(order.orderId)}&filter=all`}>{orderNumbers[order.orderId] ? `#${orderNumbers[order.orderId]}` : order.orderId}</a> · {order.status} · {order.email || order.customerId || 'Guest'}</li>)}</ul>
      </PlatformFeedback> : null}

      {openCounts.length ? <PlatformSubsection title="Counts awaiting review" description="Recount or approve as an operator independent of the observer.">
        <div className="divide-y rounded-lg border bg-background">
          {openCounts.map(count => <div key={count.id} className="grid gap-3 p-3.5 lg:grid-cols-[minmax(0,14rem)_1fr_1fr] lg:items-end">
            <div className="min-w-0">
              <p className="font-mono text-sm font-medium">{count.inventoryLot?.lotNumber}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><PlatformStatusBadge status={count.status} /><span className="tabular-nums">expected {count.expectedQuantity} · observed {count.observedQuantity}{count.recountQuantity != null ? ` · recount ${count.recountQuantity}` : ''}</span></div>
            </div>
            <form onSubmit={event => submit(event, 'count')} className="flex flex-wrap items-end gap-2"><input type="hidden" name="countId" value={count.id} /><input type="hidden" name="action" value="recount" /><PlatformField label="Recount" className="w-28"><input name="quantity" required type="number" min="0" step="0.001" className={`${field} tabular-nums`} /></PlatformField><PlatformField label="Reason" className="min-w-40 flex-1"><input name="reason" required className={field} /></PlatformField><button disabled={pending || count.status !== 'observed'} className={platformButton('secondary', 'md')}>Record recount</button></form>
            <form onSubmit={event => submit(event, 'count')} className="flex flex-wrap items-end gap-2"><input type="hidden" name="countId" value={count.id} /><input type="hidden" name="action" value="approve" /><PlatformField label="Approval reason" className="min-w-40 flex-1"><input name="reason" required className={field} /></PlatformField><button disabled={pending} className={platformButton('primary', 'md')}>Approve independently</button></form>
          </div>)}
        </div>
      </PlatformSubsection> : null}

      {recalls.length ? <PlatformSubsection title="Recalls" description="Record customer notices and lot dispositions, then close once reconciled.">
        <div className="space-y-2">
          {recalls.map(recall => <details key={recall.id} open={recall.status === 'open'} className="group/recall overflow-hidden rounded-lg border bg-background">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3.5 py-3 hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
              <PlatformStatusBadge status={recall.status === 'open' ? 'recalled' : recall.status} label={`${recall.status} recall`} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{recall.reason}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{(recall.affectedOrders || []).length} affected orders</span>
            </summary>
            <div className="space-y-4 border-t bg-muted/20 p-3.5">
              <p className="text-sm"><span className="text-muted-foreground">Scope:</span> {(recall.scope?.lots || []).map((lot: any) => `${lot.supplierLotNumber}: ${lot.quantity}`).join(', ') || 'No lots recorded'}</p>
              {(recall.events || []).length ? <ol className="space-y-1 border-l pl-3 text-xs text-muted-foreground">{(recall.events || []).map((event: any, index: number) => <li key={index} className="[overflow-wrap:anywhere]"><span className="font-medium text-foreground">{event.action}</span> · {event.at} · {event.reason} · ref {event.idempotencyKey}{event.evidence ? ` · ${JSON.stringify(event.evidence)}` : ''}</li>)}</ol> : null}
              {recall.status === 'open' ? <div className="space-y-3">
                <form onSubmit={event => submit(event, 'safety')} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2 lg:grid-cols-3">
                  <p className="text-xs font-semibold sm:col-span-full">Customer notice outcome</p>
                  <input type="hidden" name="action" value="notice" /><input type="hidden" name="recallId" value={recall.id} />
                  <PlatformField label="Order"><select required name="orderId" className={platformSelect}>{(recall.affectedOrders || []).map((order: any) => <option key={order.orderId} value={order.orderId}>{order.orderId} · {order.email || 'Guest'}</option>)}</select></PlatformField>
                  <PlatformField label="Channel"><select name="channel" className={platformSelect}><option>phone</option><option>email</option><option>sms</option><option>in_person</option></select></PlatformField>
                  <PlatformField label="Outcome"><select name="outcome" className={platformSelect}><option>delivered</option><option>failed</option><option>unreachable</option></select></PlatformField>
                  <PlatformField label="Communication reference"><input name="reference" required className={field} /></PlatformField>
                  <PlatformField label="Reason" className="lg:col-span-2"><input name="reason" required className={field} /></PlatformField>
                  <button disabled={pending} className={platformButton('secondary', 'md', 'sm:justify-self-start')}>Record notice outcome</button>
                </form>
                <form onSubmit={event => submit(event, 'safety')} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <p className="text-xs font-semibold sm:col-span-full">Lot disposition</p>
                  <input type="hidden" name="action" value="disposition" /><input type="hidden" name="recallId" value={recall.id} />
                  <PlatformField label="Lot"><select name="dispositionLotId" className={platformSelect}>{(recall.scope?.lots || []).map((lot: any) => <option key={lot.id} value={lot.id}>{lot.supplierLotNumber}</option>)}</select></PlatformField>
                  <PlatformField label="Disposition"><select name="disposition" className={platformSelect}><option>recovered</option><option>disposed</option><option>released</option><option>unaccounted</option></select></PlatformField>
                  <PlatformField label="Quantity"><input name="quantity" type="number" required min="0.001" step="0.001" className={`${field} tabular-nums`} /></PlatformField>
                  <PlatformField label="Stock change" hint="Recovered adds to quarantined stock; disposed or released removes it. Zero records externally held goods."><input name="stockQuantity" type="number" required min="0" step="0.001" defaultValue="0" aria-label="Quantity added to or removed from recorded stock" className={`${field} tabular-nums`} /></PlatformField>
                  <PlatformField label="Custody / disposition reference" className="sm:col-span-2"><input name="custody" required className={field} /></PlatformField>
                  <PlatformField label="Corrects prior reference (optional)" className="sm:col-span-2"><input name="replacesIdempotencyKey" className={field} /></PlatformField>
                  <PlatformField label="Reason" className="sm:col-span-2 lg:col-span-3"><input name="reason" required className={field} /></PlatformField>
                  <button disabled={pending} className={platformButton('secondary', 'md', 'self-end')}>Record disposition</button>
                </form>
                <form onSubmit={event => submit(event, 'safety')} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed bg-background p-3">
                  <input type="hidden" name="action" value="close" /><input type="hidden" name="recallId" value={recall.id} />
                  <PlatformField label="Closure reason" className="min-w-56 flex-1"><input name="reason" required className={field} /></PlatformField>
                  <button disabled={pending} className={platformButton('primary', 'md')}>Close reconciled recall</button>
                </form>
              </div> : null}
            </div>
          </details>)}
        </div>
      </PlatformSubsection> : null}
    </div>
  </PlatformDisclosure>;
}
