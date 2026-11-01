'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Leaf, Minus, Plus } from 'lucide-react';
import type { GroceryProduct } from '../../types';
import { useMarketBasket } from '../market/MarketBasket';
import { formatMoney, formatUnit, UrbanProductArtwork } from './UrbanPrimitives';

/** Rigel quick-add tile: soft grey card, photo, name, price per unit and a one-tap add. */
export default function UrbanProductCard({ product, eager = false }: { product: GroceryProduct; featured?: boolean; eager?: boolean }) {
  const { cart, busy, change } = useMarketBasket();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const quantity = cart?.items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const hasSavings = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
  const measured = Boolean(product.pricingMethod && ['weight', 'volume'].includes(product.pricingMethod));
  const unit = formatUnit(product.unit) || 'each';
  const note = product.variantLabel || (measured ? `Per ${unit === 'lb' ? 'Pound' : unit}` : '');
  async function update(delta: number) {
    setError(''); setMessage('');
    try { await change(product.id, delta); setMessage(`${product.name}: cart updated.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your cart. Try again.'); }
  }
  return <article className="rg-tile group min-w-0 transition-shadow duration-[var(--sf-dur-fast)] hover:shadow-[var(--sf-shadow-2)]">
    <Link prefetch={false} href={`/products/${product.handle}`} tabIndex={-1} aria-hidden="true" className="relative block aspect-[1/0.92] overflow-hidden rounded-t-[var(--sf-radius-lg)]">
      <UrbanProductArtwork product={product} eager={eager} className="mix-blend-multiply transition-transform duration-[var(--sf-dur-slow)] ease-[var(--sf-ease-out)] group-hover:scale-[1.03]" />
      <span className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
        {hasSavings ? <span className="rounded-full bg-[var(--sf-tag)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--sf-tag-ink)]">Save {formatMoney(product.compareAtPrice! - product.price)}</span> : null}
        {product.organicCertified ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sf-card)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--sf-accent-hover)]"><Leaf className="h-3 w-3" aria-hidden="true" />Organic</span> : null}
      </span>
    </Link>
    <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-1.5 sm:px-3 sm:pb-3">
      <Link prefetch={false} href={`/products/${product.handle}`} className="after:absolute after:inset-0 after:rounded-[var(--sf-radius-lg)] after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--sf-focus)] focus-visible:after:[outline-style:solid]">
        <h3 className="line-clamp-2 text-[0.9375rem] font-normal leading-5 tracking-normal text-[var(--sf-ink)] lg:text-[0.875rem]">
          {product.name}{note ? <span className="text-[var(--sf-ink-muted)]"> ({note})</span> : null}
        </h3>
      </Link>
      {!product.inStock ? <p className="mt-0.5 text-[0.75rem] font-medium text-[var(--sf-ink-muted)]">Out of stock</p> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-1 gap-y-1.5 pt-2">
        <p className="min-w-0 leading-tight">
          <span className="text-[1rem] font-semibold tabular-nums text-[var(--sf-accent-hover)] lg:text-[var(--sf-ink)]">{formatMoney(product.price)}</span>
          <span className="hidden text-[0.8125rem] text-[var(--sf-ink-muted)] sm:inline"> /{unit === 'each' ? 'ea' : unit}</span>
          {hasSavings ? <span className="sf-was hidden text-[0.75rem] sm:block"><span className="sr-only">Was </span>{formatMoney(product.compareAtPrice)}</span> : null}
        </p>
        {quantity > 0 ? (
          <div className="relative z-10 ml-auto flex h-9 shrink-0 items-center rounded-full bg-[var(--sf-accent)] text-[var(--sf-accent-ink)]" role="group" aria-label={`${product.name} in cart`}>
            <button type="button" aria-label={quantity === 1 ? `Remove ${product.name} from cart` : `Remove one ${product.name} from cart`} disabled={busy} onClick={() => void update(-1)} className="grid h-9 w-8 place-items-center rounded-full hover:bg-[var(--sf-accent-hover)] disabled:opacity-60"><Minus className="h-4 w-4" aria-hidden="true" /></button>
            <span className="min-w-4 text-center text-sm font-semibold tabular-nums" aria-label={`${quantity} in cart`}>{quantity}</span>
            <button type="button" aria-label={`Add one ${product.name} to cart`} disabled={busy || !product.inStock || quantity >= product.stockQuantity} onClick={() => void update(1)} className="grid h-9 w-8 place-items-center rounded-full hover:bg-[var(--sf-accent-hover)] disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        ) : product.inStock ? (
          <button
            type="button"
            disabled={busy}
            aria-label={`Add ${product.name} to cart`}
            onClick={() => void update(1)}
            className="relative z-10 -m-1 grid h-11 w-11 shrink-0 place-items-center rounded-full disabled:opacity-60"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--sf-accent)] text-[var(--sf-accent-ink)] transition-[background-color,color,transform,border-color] duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] active:scale-90 lg:h-8 lg:w-8 lg:border lg:border-[var(--sf-rule-strong)] lg:bg-[var(--sf-card)] lg:text-[var(--sf-ink-muted)] lg:group-hover:border-[var(--sf-accent)] lg:group-hover:bg-[var(--sf-accent)] lg:group-hover:text-[var(--sf-accent-ink)]">
              <Plus className="h-5 w-5 lg:h-4 lg:w-4" strokeWidth={2.25} aria-hidden="true" />
            </span>
          </button>
        ) : null}
      </div>
      <p role="status" className="sr-only">{message}</p>
      {error ? <p role="alert" className="relative z-10 mt-1.5 text-xs leading-5 text-[var(--sf-danger)]">{error}</p> : null}
    </div>
  </article>;
}
