'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Package, Trash2 } from 'lucide-react';

import { removeFromCart, updateCartItem, updateSubstitutionPreference } from '@/features/storefront/lib/data/cart';
import type { GroceryCart, GroceryCartItem, GroceryUser } from '@/features/storefront/types';
import {
  UrbanButton,
  UrbanButtonLink,
  UrbanEmptyState,
  UrbanProductArtwork,
  UrbanSelect,
  formatMoney,
  formatUnit,
} from './UrbanPrimitives';

type PersistedCartMutation = () => Promise<GroceryCart | null>;

function CartLine({
  item,
  disabled,
  commit,
}: {
  item: GroceryCartItem;
  disabled: boolean;
  commit: (mutation: PersistedCartMutation) => Promise<void>;
}) {
  const updateQuantity = (next: number) => {
    const quantity = Math.max(1, next);
    void commit(() => updateCartItem(item.id, quantity));
  };
  const requiresRemediation = !item.product.inStock;

  return (
    <div className="grid gap-4 border-b border-[var(--sf-rule)] py-5 sm:grid-cols-[100px_minmax(0,1fr)_auto]">
      <Link href={`/products/${item.product.handle}`} className="block overflow-hidden border border-[var(--sf-rule)] bg-[var(--sf-paper-3)]">
        {item.product ? <UrbanProductArtwork product={item.product} className="aspect-square" /> : <div className="flex aspect-square items-center justify-center"><Package className="h-8 w-8 text-[var(--sf-sage)]" /></div>}
      </Link>
      <div className="min-w-0">
        <Link href={`/products/${item.product.handle}`} className="font-[family-name:var(--sf-font-display)] text-xl font-semibold text-[var(--sf-ink)] hover:text-[var(--sf-accent)]">
          {item.product.name}
        </Link>
        <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">{formatUnit(item.product.unit)} · {formatMoney(item.product.price)} each</p>
        {requiresRemediation ? (
          <p className="mt-3 border border-[var(--sf-danger-bg)] bg-[var(--sf-danger-bg)] px-3 py-2 text-sm text-[var(--sf-danger)]" role="alert">
            {item.product.stockQuantity > 0
              ? `Only ${item.product.stockQuantity} ${item.product.stockQuantity === 1 ? 'unit is' : 'units are'} available. Reduce the quantity or remove this item.`
              : 'No unexpired inventory is available. Remove this item before checkout.'}
          </p>
        ) : null}
        <div className="mt-4 grid max-w-md gap-3 sm:grid-cols-[140px_1fr]">
          <div className="grid grid-cols-3 border border-[var(--sf-rule-strong)]">
            <button type="button" aria-label={`Decrease ${item.product.name} quantity`} onClick={() => updateQuantity(item.quantity - 1)} disabled={disabled} className="px-2 py-2 text-lg font-medium text-[var(--sf-accent)] hover:bg-[var(--sf-paper-2)] focus-visible:outline-2 focus-visible:outline-[var(--sf-focus)] disabled:cursor-wait disabled:opacity-50">−</button>
            <span className="border-x border-[var(--sf-rule)] px-2 py-2 text-center text-sm font-medium" aria-live="polite">{item.quantity}</span>
            <button type="button" aria-label={`Increase ${item.product.name} quantity`} onClick={() => updateQuantity(item.quantity + 1)} disabled={disabled || item.quantity >= item.product.stockQuantity} className="px-2 py-2 text-lg font-medium text-[var(--sf-accent)] hover:bg-[var(--sf-paper-2)] focus-visible:outline-2 focus-visible:outline-[var(--sf-focus)] disabled:cursor-not-allowed disabled:opacity-50">+</button>
          </div>
          <UrbanSelect
            value={item.substitutionPreference || 'allow'}
            disabled={disabled}
            onChange={(event) => void commit(() => updateSubstitutionPreference(item.id, event.target.value as 'allow' | 'contact' | 'remove'))}
          >
            <option value="allow">Best substitute</option>
            <option value="contact">Contact me</option>
            <option value="remove">Remove if unavailable</option>
          </UrbanSelect>
        </div>
      </div>
      <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-end">
        <p className="font-[family-name:var(--sf-font-display)] text-xl font-semibold">{formatMoney(item.subtotal)}</p>
        <button type="button" onClick={() => void commit(() => removeFromCart(item.id))} disabled={disabled} className="inline-flex items-center gap-2 border border-[var(--sf-danger-bg)] bg-[var(--sf-danger-bg)] px-3 py-2 text-sm font-medium text-[var(--sf-danger)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--sf-focus)] disabled:cursor-wait disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> Remove
        </button>
      </div>
    </div>
  );
}

export default function UrbanCart({ cart, user }: { cart: GroceryCart | null; user?: GroceryUser | null }) {
  const [currentCart, setCurrentCart] = useState(cart);
  const [isMutating, setIsMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationInFlight = useRef(false);

  useEffect(() => {
    if (!mutationInFlight.current) setCurrentCart(cart);
  }, [cart]);

  const commit = async (mutation: PersistedCartMutation) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setIsMutating(true);
    setMutationError(null);

    try {
      const confirmedCart = await mutation();
      if (!confirmedCart) {
        setMutationError('Your basket was not updated. Please try again.');
        return;
      }
      // Quantity, line money, subtotal, tax, and total are replaced together
      // from the persisted Keystone mutation response. No optimistic partial
      // projection is exposed to checkout.
      setCurrentCart(confirmedCart);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Your basket was not updated. Please try again.');
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  };

  if (!currentCart || currentCart.items.length === 0) {
    return <UrbanEmptyState title="Your basket is empty" actionHref="/products" actionLabel="Browse catalog">Add items from produce, pantry, dairy, and household aisles.</UrbanEmptyState>;
  }

  const requiresRemediation = currentCart.items.some((item) => !item.product.inStock);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy={isMutating}>
      <div>
        {currentCart.items.map((item) => <CartLine key={item.id} item={item} disabled={isMutating} commit={commit} />)}
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="border border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] p-5">
          <h2 className="font-[family-name:var(--sf-font-display)] text-xl font-semibold text-[var(--sf-ink)]">Order summary</h2>
          <dl className="mt-4 space-y-2 border-y border-[var(--sf-rule)] py-4 text-sm">
            <div className="flex justify-between text-[var(--sf-ink-muted)]"><dt>Subtotal</dt><dd>{formatMoney(currentCart.subtotal)}</dd></div>
            <div className="flex justify-between text-[var(--sf-ink-muted)]"><dt>Tax</dt><dd>{formatMoney(currentCart.tax)}</dd></div>
            <div className="flex justify-between text-[var(--sf-ink-muted)]"><dt>Delivery fee</dt><dd>{formatMoney(currentCart.deliveryFee)}</dd></div>
            <div className="flex justify-between pt-2 font-[family-name:var(--sf-font-display)] text-lg font-semibold text-[var(--sf-ink)]"><dt>Total</dt><dd>{formatMoney(currentCart.total)}</dd></div>
          </dl>
          {isMutating ? (
            <UrbanButton type="button" className="mt-4 w-full" disabled>Updating basket…</UrbanButton>
          ) : requiresRemediation ? (
            <UrbanButton type="button" className="mt-4 w-full" disabled>Resolve unavailable items</UrbanButton>
          ) : (
            <UrbanButtonLink href="/checkout" className="mt-4 w-full">Continue to checkout</UrbanButtonLink>
          )}
          <p className="mt-3 min-h-5 text-center text-sm text-[var(--sf-danger)]" aria-live="polite">
            {mutationError || (requiresRemediation ? 'Reduce or remove unavailable items before checkout.' : null)}
          </p>
          {!user ? <Link href="/dashboard/signin?from=/cart" className="mt-1 block text-center text-sm font-medium text-[var(--sf-accent)]">Sign in for saved slots</Link> : null}
        </div>
      </aside>
    </div>
  );
}
