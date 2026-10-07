'use client';
import { useState, useTransition, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { inventoryCountTask, inventorySafetyTask } from '../actions/inventoryControls';

const field = 'h-10 rounded-md border bg-background px-3 text-sm';
export function InventorySafetyControls({ lots, recalls, counts, loadError }: { lots: Array<{ id: string; lotNumber: string }>; recalls: any[]; counts: any[]; loadError?: string }) {
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
  const reason = <input name="reason" required placeholder="Reason and evidence" className={field} />;
  const lotSelect = <select name="lotId" required disabled={pending || lots.length === 0} className={field}><option value="">Select lot</option>{lots.map(lot => <option key={lot.id} value={lot.id}>{lot.lotNumber}</option>)}</select>;
  return <section className="space-y-4 rounded-lg border p-4" aria-busy={pending}>
    <div><h2 className="font-semibold">Safety, recalls and stock counts</h2><p className="text-sm text-muted-foreground">Hold allocated stock immediately. Quantities use the product&apos;s stock unit with up to three decimal places.</p></div>
    {lots.length === 0 ? <p className="text-sm text-muted-foreground">No lots are available on this page; lot-based safety and count actions are disabled.</p> : null}
    {loadError ? <p role="alert">{loadError}</p> : null}
    <form onSubmit={event => submit(event, 'safety')} className="grid gap-3 md:grid-cols-3">{lotSelect}<select name="action" className={field}><option value="hold">Hold lot</option><option value="quarantine">Quarantine lot</option><option value="release">Release after inspection</option><option value="recall">Open recall</option></select>{reason}<input name="inspection" placeholder="Release inspection evidence" className={field} /><button disabled={pending || lots.length === 0} className={field}>Apply safety action</button></form>
    <form onSubmit={event => submit(event, 'count')} className="grid gap-3 md:grid-cols-4"><input type="hidden" name="action" value="observe" />{lotSelect}<input name="quantity" required type="number" min="0" step="0.001" placeholder="Observed remaining quantity" className={field} />{reason}<button disabled={pending || lots.length === 0} className={field}>Record observation</button></form>
    {message ? <p role="status">{message}</p> : null}
    {affected.length ? <div><h3 className="font-medium">Affected orders</h3>{affected.map(order => <p key={order.orderId} className="text-sm"><a className="underline" href={`/dashboard/platform/orders?q=${order.orderId}`}>{order.orderId}</a> · {order.status} · {order.email || order.customerId || 'Guest'}</p>)}</div> : null}
    {counts.filter(count => count.status !== 'approved').map(count => <div key={count.id} className="space-y-2 border-t pt-3"><p className="text-sm">{count.inventoryLot?.lotNumber} · {count.status} · expected {count.expectedQuantity}, observed {count.observedQuantity}{count.recountQuantity != null ? `, recount ${count.recountQuantity}` : ''}</p><form onSubmit={event => submit(event, 'count')} className="flex flex-wrap gap-2"><input type="hidden" name="countId" value={count.id} /><input type="hidden" name="action" value="recount" /><input name="quantity" required type="number" min="0" step="0.001" placeholder="Recount quantity" className={field} />{reason}<button disabled={pending || count.status !== 'observed'} className={field}>Record recount</button></form><form onSubmit={event => submit(event, 'count')} className="flex flex-wrap gap-2"><input type="hidden" name="countId" value={count.id} /><input type="hidden" name="action" value="approve" />{reason}<button disabled={pending} className={field}>Approve as independent operator</button></form></div>)}
    {recalls.map(recall => <details key={recall.id} className="rounded border p-3"><summary>{recall.status} recall · {recall.reason} · {(recall.affectedOrders || []).length} affected orders</summary><div className="mt-3 space-y-3"><p className="text-sm">Scope: {(recall.scope?.lots || []).map((lot: any) => `${lot.supplierLotNumber}: ${lot.quantity}`).join(', ')}</p>{(recall.events || []).map((event: any, index: number) => <p key={index} className="text-xs">{event.at} · {event.action} · {event.reason} · reference {event.idempotencyKey}{event.evidence ? ` · ${JSON.stringify(event.evidence)}` : ''}</p>)}{recall.status === 'open' ? <>
      <form onSubmit={event => submit(event, 'safety')} className="flex flex-wrap gap-2"><input type="hidden" name="action" value="notice" /><input type="hidden" name="recallId" value={recall.id} /><select required name="orderId" className={field}>{(recall.affectedOrders || []).map((order: any) => <option key={order.orderId} value={order.orderId}>{order.orderId} · {order.email || 'Guest'}</option>)}</select><select name="channel" className={field}><option>phone</option><option>email</option><option>sms</option><option>in_person</option></select><select name="outcome" className={field}><option>delivered</option><option>failed</option><option>unreachable</option></select><input name="reference" required placeholder="Communication reference" className={field} />{reason}<button disabled={pending} className={field}>Record notice outcome</button></form>
      <form onSubmit={event => submit(event, 'safety')} className="flex flex-wrap gap-2"><input type="hidden" name="action" value="disposition" /><input type="hidden" name="recallId" value={recall.id} /><select name="dispositionLotId" className={field}>{(recall.scope?.lots || []).map((lot: any) => <option key={lot.id} value={lot.id}>{lot.supplierLotNumber}</option>)}</select><select name="disposition" className={field}><option>recovered</option><option>disposed</option><option>released</option><option>unaccounted</option></select><input name="quantity" type="number" required min="0.001" step="0.001" placeholder="Quantity" className={field} /><input name="stockQuantity" type="number" required min="0" step="0.001" defaultValue="0" aria-label="Quantity added to or removed from recorded stock" title="Recovered adds to quarantined stock; disposed or released to supplier removes stock. Zero records externally held goods." className={field} /><input name="replacesIdempotencyKey" placeholder="Correct prior disposition reference (optional)" className={field} /><input name="custody" required placeholder="Custody / disposition reference" className={field} />{reason}<button disabled={pending} className={field}>Record disposition</button></form>
      <form onSubmit={event => submit(event, 'safety')} className="flex flex-wrap gap-2"><input type="hidden" name="action" value="close" /><input type="hidden" name="recallId" value={recall.id} />{reason}<button disabled={pending} className={field}>Close reconciled recall</button></form>
    </> : null}</div></details>)}
  </section>;
}
