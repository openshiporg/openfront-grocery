'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { reorderFromOrder } from '../../lib/data/orders';
import { useMarketBasket } from '../market/MarketBasket';
import { UrbanButton } from '../urban/UrbanPrimitives';

type ReorderResult = { success: boolean; added: number; skipped: string[]; replayed?: boolean; error?: string; uncertain?: boolean };

export function ReorderButton({ orderId }: { orderId: string }) {
  const { busy, runExclusive } = useMarketBasket();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ReorderResult | null>(null);
  // One key per deliberate reorder; kept after an uncertain failure so "Try again"
  // asks the store for the same request's result instead of adding items twice.
  const requestKey = useRef<string | null>(null);
  return <div className="space-y-2">
    <UrbanButton variant="ghost" size="sm" disabled={pending || busy || Boolean(result?.added)} onClick={() => start(async () => {
      requestKey.current ||= `reorder:${crypto.randomUUID()}`;
      try {
        await runExclusive(async () => { setResult(await reorderFromOrder(orderId, requestKey.current!)); });
        requestKey.current = null;
      } catch (cause) {
        setResult({ success: false, added: 0, skipped: [], uncertain: true, error: cause instanceof Error && cause.message ? `${cause.message} Try again — items won’t be added twice.` : 'We couldn’t confirm the reorder. Try again — items won’t be added twice.' });
      }
    })}>{pending ? 'Adding to basket…' : result?.added ? 'Added to basket' : result?.uncertain ? 'Try again' : 'Shop this order again'}</UrbanButton>
    {result ? <div role="status" className="max-w-sm text-left text-sm leading-6 text-[var(--sf-ink-muted)]">
      {result.added > 0 ? <p>{result.added} product{result.added === 1 ? '' : 's'} added at current prices. <Link href="/cart" className="font-semibold underline underline-offset-4">Review basket</Link></p> : null}
      {result.error ? <p>{result.error}</p> : null}
      {result.skipped.length ? <p>Not added: {result.skipped.join(', ')}. Choose alternatives in the shop.</p> : null}
    </div> : null}
  </div>;
}
