'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Leaf, Minus, Plus } from 'lucide-react';
import type { GroceryProduct } from '../../types';
import { useMarketBasket } from '../market/MarketBasket';
import { formatMoney, perUnitLabel, UrbanPrice, UrbanProductArtwork } from './UrbanPrimitives';

export default function UrbanProductCard({ product, eager = false }: { product: GroceryProduct; featured?: boolean; eager?: boolean }) {
  const { cart, busy, change } = useMarketBasket();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const quantity = cart?.items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const hasSavings = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
  const measured = Boolean(product.pricingMethod && ['weight', 'volume'].includes(product.pricingMethod));
  async function update(delta: number) {
    setError(''); setMessage('');
    try { await change(product.id, delta); setMessage(`${product.name}: basket updated.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your basket. Try again.'); }
  }
  return <article className="group relative flex h-full min-w-0 flex-col">
    <div className="relative aspect-square overflow-hidden rounded-[var(--sf-radius-lg)] bg-[var(--sf-paper-3)]">
      <Link prefetch={false} href={`/products/${product.handle}`} tabIndex={-1} aria-hidden="true" className="block h-full">
        <div className="h-full transition-transform duration-[var(--sf-dur-slow)] ease-[var(--sf-ease-out)] group-hover:scale-[1.035]"><UrbanProductArtwork product={product} eager={eager} /></div>
      </Link>
      <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
        {hasSavings ? <span className="rounded-full bg-[var(--sf-tag)] px-2.5 py-1 text-[0.6875rem] font-bold text-[var(--sf-tag-ink)]">Save {formatMoney(product.compareAtPrice! - product.price)}</span> : null}
        {product.organicCertified ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sf-card)]/95 px-2.5 py-1 text-[0.6875rem] font-bold text-[var(--sf-sage)] shadow-[var(--sf-shadow-1)]"><Leaf className="h-3 w-3" aria-hidden="true" />Organic</span> : null}
      </div>
      {product.inStock || quantity > 0 ? (
        quantity > 0 ? (
          <div className="sf-stepper sf-stepper-accent absolute inset-x-2.5 bottom-2.5 z-10 shadow-[var(--sf-shadow-2)]">
            <button type="button" aria-label={quantity === 1 ? `Remove ${product.name} from basket` : `Remove one ${product.name} from basket`} disabled={busy} onClick={() => void update(-1)}><Minus className="h-4 w-4" aria-hidden="true" /></button>
            <span aria-label={`${quantity} in basket`}>{quantity}</span>
            <button type="button" aria-label={`Add one ${product.name} to basket`} disabled={busy || !product.inStock || quantity >= product.stockQuantity} onClick={() => void update(1)}><Plus className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            aria-label={`Add ${product.name} to basket`}
            onClick={() => void update(1)}
            className="absolute bottom-2.5 right-2.5 z-10 inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-[var(--sf-card)] px-3 text-sm font-bold text-[var(--sf-ink)] shadow-[var(--sf-shadow-2)] transition-[background-color,color,transform] duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] hover:bg-[var(--sf-accent)] hover:text-[var(--sf-accent-ink)] active:scale-95 disabled:opacity-60"
          >
            <Plus className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" /><span className="pr-0.5">Add</span>
          </button>
        )
      ) : (
        <span className="absolute inset-x-2.5 bottom-2.5 rounded-full bg-[var(--sf-card)]/95 px-3 py-2 text-center text-xs font-semibold text-[var(--sf-ink-muted)] shadow-[var(--sf-shadow-1)]">Out of stock</span>
      )}
    </div>
    <div className="flex flex-1 flex-col px-0.5 pt-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={hasSavings ? 'sf-price-tag' : ''}><UrbanPrice value={product.price} className="text-[1.375rem]" /></span>
        {hasSavings ? <span className="sf-was"><span className="sr-only">Was </span>{formatMoney(product.compareAtPrice)}</span> : null}
      </div>
      <p className="mt-1 text-xs text-[var(--sf-ink-faint)]">{measured ? `${perUnitLabel(product.unit)} · estimated` : perUnitLabel(product.unit)}</p>
      <Link prefetch={false} href={`/products/${product.handle}`} className="mt-1.5 after:absolute after:inset-0 after:rounded-[var(--sf-radius-lg)] after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-[var(--sf-focus)] focus-visible:after:[outline-style:solid]">
        <h3 className="line-clamp-2 font-[family-name:var(--sf-font-body)] text-[0.9375rem] font-semibold leading-snug tracking-normal text-[var(--sf-ink)] group-hover:underline group-hover:decoration-[var(--sf-rule-strong)] group-hover:underline-offset-4">{product.name}</h3>
      </Link>
      {product.variantLabel ? <p className="mt-0.5 text-xs text-[var(--sf-ink-muted)]">{product.variantLabel}</p> : null}
      <p className="mt-0.5 text-xs text-[var(--sf-ink-faint)]">{product.department?.name || 'Groceries'}</p>
      <p role="status" className="sr-only">{message}</p>
      {error ? <p role="alert" className="relative z-10 mt-2 text-xs leading-5 text-[var(--sf-danger)]">{error}</p> : null}
    </div>
  </article>;
}
