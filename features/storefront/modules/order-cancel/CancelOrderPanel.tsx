'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UrbanButton } from '../urban/UrbanPrimitives';
import { cancelMyOrder } from './actions';

/** Shown until the store starts shopping the order. Cancelling releases the card hold; nothing is charged. */
export function CancelOrderPanel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function cancel() {
    setBusy(true); setError('');
    try {
      const result = await cancelMyOrder(orderId);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    } catch { setError('The order could not be cancelled. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  return <section className="sf-panel space-y-3 p-5 sm:p-6" aria-labelledby="cancel-order-title">
    <h2 id="cancel-order-title" className="text-lg font-bold">Change of plans?</h2>
    <p className="sf-copy">You can cancel until the shop starts picking your groceries. Your card hold is released and you are not charged.</p>
    {confirming ? <div className="flex flex-wrap gap-2">
      <UrbanButton type="button" variant="dark" disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Yes, cancel this order'}</UrbanButton>
      <UrbanButton type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Keep my order</UrbanButton>
    </div> : <UrbanButton type="button" variant="ghost" onClick={() => setConfirming(true)}>Cancel order</UrbanButton>}
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
  </section>;
}
