'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PackageCheck } from 'lucide-react';
import { receivePurchaseOrderTask, type PurchaseReceiptLine } from '@/features/platform/lib/taskActions';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput, platformSelect } from '@/features/platform/components/platformStyles';

type ReceiveItem = { id: string; productTitle?: string; productSku?: string; quantity: number; quantityReceived?: number };
type LineEntry = { quantity: string; lotNumber: string; expirationDate: string; conditionStatus: string; inspectionNote: string; location: string };

const blankLine: LineEntry = { quantity: '', lotNumber: '', expirationDate: '', conditionStatus: 'accepted', inspectionNote: '', location: '' };

/**
 * Each line records what physically arrived for that product: its own
 * supplier batch, expiry, condition and inspection. Batch and expiry start
 * blank; they are read off the delivery, never filled in for the operator.
 */
export function ReceivePurchaseOrderForm({ order, awaitingConfirmation = false }: { order: { id: string; items: ReceiveItem[] }; awaitingConfirmation?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [minimumExpirationDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [deliveryReference, setDeliveryReference] = useState('');
  const [entries, setEntries] = useState<Record<string, LineEntry>>({});
  // Keys for the exact submitted receipt, reused when it is resubmitted unchanged after an uncertain response.
  const receiptKeys = useRef(new Map<string, string>());

  const entryFor = (itemId: string) => entries[itemId] || blankLine;
  const update = (itemId: string, patch: Partial<LineEntry>) => setEntries((current) => ({ ...current, [itemId]: { ...(current[itemId] || blankLine), ...patch } }));
  const receiving = order.items.filter((item) => Number(entryFor(item.id).quantity) > 0);

  function submit(event: FormEvent) {
    event.preventDefault(); setMessage(null); setFailed(false);
    const receipts: PurchaseReceiptLine[] = receiving.map((item) => {
      const entry = entryFor(item.id);
      const line = { poItemId: item.id, targetQuantityReceived: (item.quantityReceived || 0) + Number(entry.quantity), lotNumber: entry.lotNumber.trim(), expirationDate: entry.expirationDate,
        location: entry.location.trim() || undefined, conditionStatus: entry.conditionStatus, inspectionNote: entry.inspectionNote.trim(), deliveryReference: deliveryReference.trim() };
      const fingerprint = JSON.stringify(line);
      const receiptKey = receiptKeys.current.get(fingerprint) || `platform-receipt:${crypto.randomUUID()}`;
      receiptKeys.current.set(fingerprint, receiptKey);
      return { ...line, receiptKey };
    });
    const summary = receiving.map((item) => `${item.productTitle || 'item'} × ${Number(entryFor(item.id).quantity)}`).join(', ');
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof receivePurchaseOrderTask>>;
      try { result = await receivePurchaseOrderTask(order.id, receipts); }
      catch {
        setFailed(true);
        setMessage('We couldn’t confirm whether this receipt was recorded. Submit it again unchanged; it won’t be counted twice.');
        return;
      }
      if (!result.ok) { setFailed(true); setMessage(result.error); return; }
      // Confirmed: clear "Receive now" so a second press can't record the same delivery again.
      receiptKeys.current.clear();
      setEntries({}); setDeliveryReference('');
      setMessage(`Receipt recorded: ${summary}.`);
      router.refresh();
    });
  }

  return <form onSubmit={submit} aria-busy={pending} className="space-y-4 rounded-lg border bg-background p-4 shadow-xs">
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><PackageCheck className="size-4" aria-hidden="true" /></span>
      <div><h3 className="text-sm font-semibold">Receive inventory</h3><p className="mt-0.5 text-xs text-muted-foreground">Enter what arrived on this delivery. Each product line needs its supplier batch number and a future expiry date from the packaging.</p></div>
    </div>
    {awaitingConfirmation ? <PlatformFeedback tone="info">The supplier hasn&apos;t confirmed this order. Receiving records only what physically arrived; it does not mark the order confirmed.</PlatformFeedback> : null}
    <PlatformField label="Delivery reference" hint="Supplier delivery note or invoice number, shared by every line on this delivery." className="sm:max-w-sm">
      <input className={platformInput} maxLength={200} value={deliveryReference} onChange={(event) => setDeliveryReference(event.target.value)} disabled={pending} />
    </PlatformField>
    <ul className="divide-y rounded-lg border">
      {order.items.map((item) => {
        const remaining = Math.max(0, item.quantity - (item.quantityReceived || 0));
        const entry = entryFor(item.id);
        const active = Number(entry.quantity) > 0;
        const name = item.productTitle || `Item …${item.id.slice(-6)}`;
        return (
          <li key={item.id} className="space-y-3 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground"><span className="font-mono">{item.productSku || 'No SKU'}</span> · {item.quantityReceived || 0} of {item.quantity} received</p>
              </div>
              <PlatformField label="Receive now" className="w-32">
                <input aria-label={`Receive now: ${name}`} type="number" step="0.001" min="0" max={remaining} placeholder="0" className={`${platformInput} text-right tabular-nums`} value={entry.quantity} disabled={pending || remaining === 0}
                  onChange={(event) => update(item.id, { quantity: event.target.value })} />
              </PlatformField>
            </div>
            {active ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <PlatformField label="Supplier batch number"><input required maxLength={120} className={`${platformInput} font-mono`} value={entry.lotNumber} onChange={(event) => update(item.id, { lotNumber: event.target.value })} disabled={pending} /></PlatformField>
                <PlatformField label="Expiry date"><input required type="date" min={minimumExpirationDate} className={platformInput} value={entry.expirationDate} onChange={(event) => update(item.id, { expirationDate: event.target.value })} disabled={pending} /></PlatformField>
                <PlatformField label="Location"><input maxLength={120} placeholder="Shelf or cooler (optional)" className={platformInput} value={entry.location} onChange={(event) => update(item.id, { location: event.target.value })} disabled={pending} /></PlatformField>
                <PlatformField label="Condition"><select className={platformSelect} value={entry.conditionStatus} onChange={(event) => update(item.id, { conditionStatus: event.target.value })} disabled={pending}><option value="accepted">Accepted</option><option value="inspection_pending">Hold for inspection</option><option value="rejected">Rejected</option></select></PlatformField>
                <PlatformField label={entry.conditionStatus !== 'accepted' ? 'Inspection note (required)' : 'Inspection note'} className="sm:col-span-2"><input required={entry.conditionStatus !== 'accepted'} maxLength={500} className={platformInput} value={entry.inspectionNote} onChange={(event) => update(item.id, { inspectionNote: event.target.value })} disabled={pending} /></PlatformField>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
    <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={pending || receiving.length === 0} className={platformButton('primary', 'md')}>{pending ? 'Recording receipt…' : 'Record receipt'}</button></div>
    {message ? <PlatformFeedback tone={failed ? 'error' : 'success'}>{message}</PlatformFeedback> : null}
  </form>;
}
