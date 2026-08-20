'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { receivePurchaseOrderTask } from '@/features/platform/lib/taskActions';

type ReceiveItem = { id: string; productTitle?: string; productSku?: string; quantity: number; quantityReceived?: number };

export function ReceivePurchaseOrderForm({ order }: { order: { id: string; items: ReceiveItem[] } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lotNumber, setLotNumber] = useState(`LOT-${order.id.slice(-6)}`);
  const [expirationDate, setExpirationDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [minimumExpirationDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [location, setLocation] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(order.items.map((item) => [item.id, Math.max(0, item.quantity - (item.quantityReceived || 0))])));

  function submit(event: FormEvent) {
    event.preventDefault(); setMessage(null); setFailed(false);
    startTransition(async () => {
      try {
        const receipts = order.items.map((item) => ({ poItemId: item.id, targetQuantityReceived: (item.quantityReceived || 0) + Math.max(0, Number(quantities[item.id] || 0)), lotNumber, expirationDate, location: location || undefined }));
        const result = await receivePurchaseOrderTask(order.id, receipts);
        setMessage(result?.receivePurchaseOrder?.message || 'Receipt recorded.');
        router.refresh();
      } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Receipt failed.'); }
    });
  }

  return <form onSubmit={submit} aria-busy={pending} className="rounded-lg border bg-background p-4">
    <div><h3 className="text-sm font-semibold">Receive inventory</h3><p className="mt-1 text-xs text-muted-foreground">Enter cumulative receipt targets. A future expiry is required and receipt creates real lot/stock evidence.</p></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs font-medium text-muted-foreground">Lot number<input required maxLength={120} className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Expiration<input required type="date" min={minimumExpirationDate} className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Location<input maxLength={120} placeholder="Optional shelf or cooler" className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={location} onChange={(event) => setLocation(event.target.value)} /></label></div>
    <div className="mt-4 overflow-x-auto rounded-lg border"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Product</th><th className="px-3 py-2 text-right font-medium">Ordered</th><th className="px-3 py-2 text-right font-medium">Already received</th><th className="px-3 py-2 text-right font-medium">Receive now</th></tr></thead><tbody className="divide-y">{order.items.map((item) => { const remaining = item.quantity - (item.quantityReceived || 0); return <tr key={item.id}><td className="px-3 py-2"><p className="font-medium">{item.productTitle || `Item …${item.id.slice(-6)}`}</p><p className="font-mono text-xs text-muted-foreground">{item.productSku || '—'}</p></td><td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td><td className="px-3 py-2 text-right tabular-nums">{item.quantityReceived || 0}</td><td className="px-3 py-2 text-right"><input aria-label={`Receive ${item.productTitle || item.id}`} type="number" min="0" max={remaining} className="h-9 w-24 rounded-md border bg-background px-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={quantities[item.id] || 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} /></td></tr>; })}</tbody></table></div>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button type="submit" disabled={pending || !lotNumber || !expirationDate || !Object.values(quantities).some((quantity) => quantity > 0)} className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50">{pending ? 'Recording receipt…' : 'Record receipt'}</button>{message ? <p role={failed ? 'alert' : 'status'} className={`text-sm ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p> : null}</div>
  </form>;
}
