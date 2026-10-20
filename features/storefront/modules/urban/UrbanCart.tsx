'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Minus, Package, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { removeFromCart, updateCartItem, updateSubstitutionPreference } from '@/features/storefront/lib/data/cart';
import type { GroceryCart, GroceryCartItem, GroceryUser } from '@/features/storefront/types';
import {
  UrbanButton,
  UrbanButtonLink,
  UrbanEmptyState,
  UrbanProductArtwork,
  formatMoney,
  formatUnit,
} from './UrbanPrimitives';

type PersistedCartMutation = () => Promise<GroceryCart | null>;

const substitutionChoices = [
  ['allow', 'Best substitute'],
  ['contact', 'Contact me'],
  ['remove', 'Skip it'],
] as const;

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
  const preference = item.substitutionPreference || 'allow';

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
      <Link href={`/products/${item.product.handle}`} className="row-span-2 block aspect-square self-start overflow-hidden rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-3)] sm:row-span-1">
        {item.product ? <UrbanProductArtwork product={item.product} className="aspect-square" /> : <div className="flex aspect-square items-center justify-center"><Package className="h-8 w-8 text-[var(--sf-sage)]" /></div>}
      </Link>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/products/${item.product.handle}`} className="text-base font-semibold leading-snug text-[var(--sf-ink)] hover:underline hover:underline-offset-4">
              {item.product.name}
            </Link>
            <p className="mt-0.5 text-sm text-[var(--sf-ink-faint)]">{formatMoney(item.product.price)} / {formatUnit(item.product.unit)}</p>
          </div>
          <p className="shrink-0 font-[family-name:var(--sf-font-display)] text-lg font-bold tabular-nums sm:hidden">{formatMoney(item.subtotal)}</p>
        </div>
        {requiresRemediation ? (
          <p className="mt-3 rounded-[var(--sf-radius-sm)] bg-[var(--sf-danger-bg)] px-3 py-2 text-sm font-medium text-[var(--sf-danger)]" role="alert">
            {item.product.stockQuantity > 0
              ? `Only ${item.product.stockQuantity} ${item.product.stockQuantity === 1 ? 'unit is' : 'units are'} available. Reduce the quantity or remove this item.`
              : 'This item is currently unavailable. Remove it before checkout.'}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="sf-stepper sf-stepper-sm w-[7.5rem]" role="group" aria-label={`${item.product.name} quantity`}>
            <button type="button" aria-label={`Decrease ${item.product.name} quantity`} onClick={() => updateQuantity(item.quantity - 1)} disabled={disabled || item.quantity <= 1}><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
            <span aria-live="polite">{item.quantity}</span>
            <button type="button" aria-label={`Increase ${item.product.name} quantity`} onClick={() => updateQuantity(item.quantity + 1)} disabled={disabled || item.quantity >= item.product.stockQuantity}><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
          <button type="button" aria-label={`Remove ${item.product.name} from basket`} onClick={() => void commit(() => removeFromCart(item.id))} disabled={disabled} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-[0.8125rem] font-semibold text-[var(--sf-ink-muted)] transition-colors hover:text-[var(--sf-danger)] disabled:opacity-50">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
          </button>
        </div>
      </div>
      <fieldset disabled={disabled} className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
        <legend className="mb-1.5 text-xs font-medium text-[var(--sf-ink-faint)]">If it’s unavailable</legend>
        <div className="sf-segmented w-full sm:w-auto">
          {substitutionChoices.map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name={`substitution-${item.id}`}
                value={value}
                checked={preference === value}
                onChange={() => void commit(() => updateSubstitutionPreference(item.id, value))}
                aria-label={`${label} for ${item.product.name}`}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="col-start-3 row-start-1 hidden text-right font-[family-name:var(--sf-font-display)] text-xl font-bold tabular-nums sm:block">{formatMoney(item.subtotal)}</p>
    </li>
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

  // Basket changes confirmed elsewhere (the drawer, a product page in another
  // component, or moving a guest basket into the account) replace this view.
  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<GroceryCart | null>).detail;
      if (next && !mutationInFlight.current) setCurrentCart((previous) => (!previous || previous.id === next.id ? next : previous));
    };
    window.addEventListener('cartUpdated', receive);
    return () => window.removeEventListener('cartUpdated', receive);
  }, []);

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
    return <UrbanEmptyState title="Your basket is empty" actionHref="/products" actionLabel="Start shopping">Add items from produce, pantry, dairy, and household aisles.</UrbanEmptyState>;
  }

  const requiresRemediation = currentCart.items.some((item) => !item.product.inStock);
  const count = currentCart.items.reduce((sum, item) => sum + item.quantity, 0);
  const checkoutAction = isMutating ? (
    <UrbanButton type="button" size="lg" className="w-full" disabled>Updating basket…</UrbanButton>
  ) : requiresRemediation ? (
    <UrbanButton type="button" size="lg" className="w-full" disabled>Resolve unavailable items</UrbanButton>
  ) : (
    <UrbanButtonLink href="/checkout" size="lg" className="w-full">Continue to checkout <ArrowRight className="h-4 w-4" aria-hidden="true" /></UrbanButtonLink>
  );

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12" aria-busy={isMutating}>
      <section aria-label="Basket items" className="min-w-0">
        <p className="flex items-start gap-2.5 rounded-[var(--sf-radius-md)] bg-[var(--sf-juniper-soft)] px-4 py-3 text-sm leading-6 text-[var(--sf-ink-muted)]"><RefreshCw className="mt-1 h-4 w-4 shrink-0 text-[var(--sf-sage)]" aria-hidden="true" />Choose what the picker should do for each item if it’s out when your order is packed.</p>
        <ul className="divide-y divide-[var(--sf-rule)]">
          {currentCart.items.map((item) => <CartLine key={item.id} item={item} disabled={isMutating} commit={commit} />)}
        </ul>
      </section>
      <aside className="lg:sticky lg:top-[calc(var(--sf-header-offset)+1rem)]">
        <div className="sf-receipt pb-8">
          <h2 className="font-[family-name:var(--sf-font-display)] text-xl font-bold tracking-[-0.02em]">Basket estimate</h2>
          <p className="text-xs text-[var(--sf-ink-faint)]">{count} {count === 1 ? 'item' : 'items'}</p>
          <hr className="sf-receipt-rule" />
          <dl className="space-y-1.5">
            <div className="sf-receipt-row text-[var(--sf-ink-muted)]"><dt>Groceries</dt><dd>{formatMoney(currentCart.subtotal)}</dd></div>
            <div className="sf-receipt-row text-[var(--sf-ink-muted)]"><dt>Estimated tax</dt><dd>{formatMoney(currentCart.tax)}</dd></div>
            <div className="sf-receipt-row text-[var(--sf-ink-muted)]"><dt>Delivery / pickup</dt><dd>at checkout</dd></div>
          </dl>
          <hr className="sf-receipt-rule" />
          <div className="sf-receipt-row text-base font-bold"><span>Estimated total</span><span>{formatMoney(currentCart.total)}</span></div>
          <p className="mt-3 font-[family-name:var(--sf-font-body)] text-xs leading-5 text-[var(--sf-ink-faint)]">Fees and coupons are confirmed at checkout. Weighed items and substitutions may change the final total after picking.</p>
          <div className="mt-5 font-[family-name:var(--sf-font-body)]">{checkoutAction}</div>
          <p className="mt-3 min-h-5 text-center font-[family-name:var(--sf-font-body)] text-sm text-[var(--sf-danger)]" aria-live="polite">
            {mutationError || (requiresRemediation ? 'Reduce or remove unavailable items before checkout.' : null)}
          </p>
          {!user ? <Link href="/account/sign-in?from=%2Fcart" className="block text-center font-[family-name:var(--sf-font-body)] text-sm font-semibold underline underline-offset-4">Sign in to keep your orders together</Link> : null}
        </div>
      </aside>
      <div className="sf-action-bar lg:hidden">
        <div className="flex items-center gap-3 rounded-full bg-[var(--sf-ink)] p-1.5 pl-5 text-[var(--sf-paper)] shadow-[var(--sf-shadow-3)]">
          <div className="min-w-0 flex-1"><p className="text-[0.6875rem] text-[var(--sf-header-ink-muted)]">Estimated total</p><p className="font-[family-name:var(--sf-font-display)] text-lg font-bold leading-tight tabular-nums">{formatMoney(currentCart.total)}</p></div>
          {isMutating || requiresRemediation ? <span className="inline-flex min-h-11 items-center rounded-full bg-[var(--sf-header-2)] px-4 text-sm font-semibold text-[var(--sf-header-ink-muted)]">{isMutating ? 'Updating…' : 'Resolve items'}</span> : <Link href="/checkout" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--sf-accent)] px-5 text-sm font-semibold text-[var(--sf-accent-ink)]">Checkout <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
        </div>
      </div>
    </div>
  );
}
