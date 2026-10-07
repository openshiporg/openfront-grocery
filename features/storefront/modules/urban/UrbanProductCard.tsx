'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Minus, Plus } from 'lucide-react';
import type { GroceryProduct } from '../../types';
import { useMarketBasket } from '../market/MarketBasket';
import { formatMoney, formatUnit, UrbanBadge, UrbanProductArtwork } from './UrbanPrimitives';

export default function UrbanProductCard({ product }: { product: GroceryProduct; featured?: boolean }) {
  const { cart, busy, change } = useMarketBasket();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const quantity = cart?.items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const hasSavings = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
  async function update(delta: number) {
    setError(''); setMessage('');
    try { await change(product.id, delta); setMessage(`${product.name}: basket updated.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your basket. Try again.'); }
  }
  return <article className="sf-card group flex h-full min-w-0 flex-col">
    <Link prefetch={false} href={`/products/${product.handle}`} className="relative block aspect-square overflow-hidden bg-[var(--sf-paper-3)]">
      <UrbanProductArtwork product={product} />
      {hasSavings ? <UrbanBadge tone="orange" className="absolute left-2 top-2">Special</UrbanBadge> : product.organicCertified ? <UrbanBadge className="absolute left-2 top-2">Organic</UrbanBadge> : null}
    </Link>
    <div className="flex flex-1 flex-col p-3 sm:p-4">
      <p className="text-xs text-[var(--sf-ink-muted)]">{product.department?.name || 'Groceries'}</p>
      <Link prefetch={false} href={`/products/${product.handle}`} className="mt-1 flex-1"><h3 className="min-h-10 text-sm font-semibold leading-5 sm:text-base">{product.name}</h3></Link>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2"><p className="text-lg font-semibold tabular-nums">{formatMoney(product.price)}</p>{hasSavings ? <del className="text-xs text-[var(--sf-ink-muted)]">{formatMoney(product.compareAtPrice)}</del> : null}</div>
      <p className="mt-0.5 text-xs text-[var(--sf-ink-muted)]">per {formatUnit(product.unit)}{product.pricingMethod && ['weight', 'volume'].includes(product.pricingMethod) ? ' · estimated' : ''}</p>
      {product.inStock || quantity > 0 ? <div className="mt-3">
        {quantity > 0 ? <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center rounded-md border border-[var(--sf-accent)] text-[var(--sf-accent)]">
          <button type="button" aria-label={`Remove one ${product.name} from basket`} disabled={busy} onClick={() => void update(-1)} className="flex h-11 items-center justify-center disabled:opacity-40"><Minus className="h-4 w-4" /></button>
          <span className="text-center text-sm font-semibold tabular-nums" aria-label={`${quantity} in basket`}>{quantity}</span>
          <button type="button" aria-label={`Add one ${product.name} to basket`} disabled={busy || !product.inStock || quantity >= product.stockQuantity} onClick={() => void update(1)} className="flex h-11 items-center justify-center disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div> : <button type="button" disabled={busy} aria-label={`Add ${product.name} to basket`} onClick={() => void update(1)} className="flex min-h-11 w-full items-center justify-center gap-1 rounded-md bg-[var(--sf-accent)] px-2 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4 shrink-0" aria-hidden="true" />Add <span className="hidden sm:inline">to basket</span></button>}
      </div> : <Link prefetch={false} href={`/products/${product.handle}`} className="mt-3 flex min-h-11 items-center justify-center rounded-md border border-[var(--sf-rule-strong)] px-2 py-2 text-center text-xs font-medium">Out of stock · details</Link>}
      <p role="status" className="sr-only">{message}</p>
      {error ? <p role="alert" className="mt-2 text-xs leading-5 text-[var(--sf-danger)]">{error}</p> : null}
    </div>
  </article>;
}
