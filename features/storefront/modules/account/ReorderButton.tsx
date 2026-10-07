'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { reorderFromOrder } from '../../lib/data/orders';
import { useMarketBasket } from '../market/MarketBasket';
import { UrbanButton } from '../urban/UrbanPrimitives';

export function ReorderButton({ orderId }: { orderId: string }) {
  const { busy, runExclusive } = useMarketBasket();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof reorderFromOrder>> | null>(null);
  return <div className="space-y-2">
    <UrbanButton variant="ghost" disabled={pending || busy || Boolean(result?.added)} onClick={() => start(async () => {
      try { await runExclusive(async () => { setResult(await reorderFromOrder(orderId)); }); }
      catch { setResult({ success: false, added: 0, skipped: [], error: 'Unable to reorder. Please try again.' }); }
    })}>{pending ? 'Adding to basket…' : result?.added ? 'Added to basket' : 'Shop this order again'}</UrbanButton>
    {result ? <div role="status" className="max-w-sm text-sm leading-6 text-[var(--sf-ink-muted)]">
      {result.added > 0 ? <p>{result.added} product{result.added === 1 ? '' : 's'} added at current prices. <Link href="/cart" className="font-semibold underline underline-offset-4">Review basket</Link></p> : null}
      {result.error ? <p>{result.error}</p> : null}
      {result.skipped.length ? <p>Not added: {result.skipped.join(', ')}. Choose alternatives in the shop.</p> : null}
    </div> : null}
  </div>;
}
