'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, ShoppingBasket, X } from 'lucide-react';
import type { GroceryCartItem } from '../../types';
import { formatMoney } from '../../lib/marketFormatting';
import { useMarketBasket } from './MarketBasket';

function DrawerLine({ item, disabled, onChange }: { item: GroceryCartItem; disabled: boolean; onChange: (delta: number) => void }) {
  const image = item.product.imageUrl || item.product.thumbnailUrl;
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-3 py-4">
      <Link prefetch={false} href={`/products/${item.product.handle}`} className="block aspect-square overflow-hidden rounded-[var(--sf-radius-sm)] bg-[var(--sf-paper-3)]">
        {image ? <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
      </Link>
      <div className="min-w-0">
        <Link prefetch={false} href={`/products/${item.product.handle}`} className="line-clamp-2 text-sm font-semibold leading-5 hover:underline">{item.product.name}</Link>
        <p className="mt-0.5 text-xs text-[var(--sf-ink-faint)]">{formatMoney(item.product.price)} / {item.product.unit?.replace(/^unit_/, '').replace(/_/g, ' ') || 'each'}</p>
        {!item.product.inStock ? <p role="alert" className="mt-1 text-xs font-semibold text-[var(--sf-danger)]">Unavailable in this quantity — review in your basket.</p> : null}
        <div className="sf-stepper sf-stepper-sm mt-2 w-[7.5rem]">
          <button type="button" disabled={disabled} onClick={() => onChange(-1)} aria-label={item.quantity === 1 ? `Remove ${item.product.name}` : `Remove one ${item.product.name}`}><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
          <span aria-label={`${item.quantity} in basket`}>{item.quantity}</span>
          <button type="button" disabled={disabled || item.quantity >= item.product.stockQuantity} onClick={() => onChange(1)} aria-label={`Add one ${item.product.name}`}><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
      </div>
      <p className="text-sm font-bold tabular-nums">{formatMoney(item.subtotal)}</p>
    </li>
  );
}

/** Quick basket review from any shopping page. Quantities and totals are always the server-confirmed basket. */
export function BasketDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { cart, loaded, busy, change, loadError, mergeError, reload, retryMerge, keepAccountBasket } = useMarketBasket();
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  async function update(productId: string, delta: number) {
    setError('');
    try { await change(productId, delta); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Your basket could not be updated. Try again.'); }
  }

  const items = cart?.items || [];
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const needsReview = items.some((item) => !item.product.inStock);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="basket-drawer-title"
      onClose={() => { setError(''); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      className="sf-sheet"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--sf-rule)] px-5 py-4">
        <div>
          <h2 id="basket-drawer-title" className="text-xl font-bold">Your basket</h2>
          <p className="text-xs text-[var(--sf-ink-faint)]" aria-live="polite">{loaded ? `${count} ${count === 1 ? 'item' : 'items'}` : loadError ? 'Basket unavailable' : 'Loading your basket…'}</p>
        </div>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close basket" className="-mr-2 grid h-11 w-11 place-items-center rounded-full hover:bg-[var(--sf-paper-2)]"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-5" aria-busy={busy}>
        {mergeError ? (
          <div role="alert" className="mt-4 rounded-[var(--sf-radius-md)] bg-[var(--sf-danger-bg)] px-4 py-3 text-sm text-[var(--sf-danger)]">
            <p className="font-semibold">Items from your earlier basket haven’t been added to your account yet.</p>
            <p className="mt-1">{mergeError}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={retryMerge} className="inline-flex min-h-10 items-center rounded-full bg-[var(--sf-ink)] px-4 text-sm font-semibold text-[var(--sf-paper)]">Try again</button>
              <button type="button" onClick={keepAccountBasket} className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ring-1 ring-inset ring-[var(--sf-rule-strong)]">Keep my account basket only</button>
            </div>
          </div>
        ) : null}
        {!loaded && loadError ? (
          <div role="alert" className="flex flex-col items-center py-16 text-center">
            <p className="text-lg font-bold">We couldn’t load your basket</p>
            <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">Your items are safe. Check your connection and try again.</p>
            <button type="button" onClick={reload} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--sf-ink)] px-5 text-sm font-semibold text-[var(--sf-paper)]">Try again</button>
          </div>
        ) : !loaded ? (
          <div className="space-y-3 py-5" aria-hidden="true">{[0, 1, 2].map((key) => <div key={key} className="sf-skeleton h-16" />)}</div>
        ) : !items.length ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--sf-paper-2)] text-[var(--sf-sage)]"><ShoppingBasket className="h-6 w-6" aria-hidden="true" /></span>
            <p className="text-lg font-bold">Nothing in your basket yet</p>
            <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">Add groceries from any aisle and they’ll appear here.</p>
            <Link prefetch={false} href="/products" onClick={() => dialog.current?.close()} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--sf-ink)] px-5 text-sm font-semibold text-[var(--sf-paper)]">Start shopping</Link>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--sf-rule)]">
            {items.map((item) => <DrawerLine key={item.id} item={item} disabled={busy} onChange={(delta) => void update(item.product.id, delta)} />)}
          </ul>
        )}
      </div>

      {loaded && items.length ? (
        <div className="space-y-3 border-t border-[var(--sf-rule)] bg-[var(--sf-card)] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
          {error ? <p role="alert" className="text-sm text-[var(--sf-danger)]">{error}</p> : null}
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-[var(--sf-ink-muted)]"><dt>Groceries</dt><dd className="tabular-nums">{formatMoney(cart?.subtotal)}</dd></div>
            <div className="flex justify-between text-[var(--sf-ink-muted)]"><dt>Estimated tax</dt><dd className="tabular-nums">{formatMoney(cart?.tax)}</dd></div>
            <div className="flex justify-between pt-1 text-base font-bold"><dt>Estimated total</dt><dd className="tabular-nums">{formatMoney(cart?.total)}</dd></div>
          </dl>
          <p className="text-xs leading-5 text-[var(--sf-ink-faint)]">Delivery or pickup fees and coupons are confirmed at checkout. Weighed items are finalized when picked.</p>
          <div className="grid grid-cols-2 gap-2">
            <Link prefetch={false} href="/cart" onClick={() => dialog.current?.close()} className="inline-flex min-h-12 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset ring-[var(--sf-rule-strong)] hover:ring-[var(--sf-ink)]">Review basket</Link>
            {needsReview || busy ? (
              <span aria-disabled="true" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--sf-paper-3)] px-3 text-center text-sm font-semibold text-[var(--sf-ink-faint)]">{busy ? 'Updating…' : 'Resolve items first'}</span>
            ) : (
              <Link prefetch={false} href="/checkout" onClick={() => dialog.current?.close()} className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--sf-accent)] text-sm font-semibold text-[var(--sf-accent-ink)] hover:bg-[var(--sf-accent-hover)]">Checkout</Link>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
