'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import type { GroceryProduct, ShoppingList } from '@/features/storefront/types';
import { addToCart } from '@/features/storefront/lib/data/cart';
import { requestBackInStockAlert } from '@/features/storefront/lib/data/products';
import { addItemToList, createShoppingList } from '@/features/storefront/lib/data/lists';
import { UrbanButton, UrbanSelect, UrbanTextInput } from '@/features/storefront/modules/urban/UrbanPrimitives';

interface ProductActionsProps {
  product: GroceryProduct;
  lists: ShoppingList[];
  isSignedIn: boolean;
}

export default function ProductActions({ product, lists: initialLists, isSignedIn }: ProductActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedListId, setSelectedListId] = useState(initialLists[0]?.id || '');
  const [newListName, setNewListName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alertRequested, setAlertRequested] = useState(Boolean(product.backInStockRequested));
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>) => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      }
    });
  };

  const handleAddToCart = () => run(async () => {
    const cart = await addToCart(product.id, quantity);
    if (!cart) throw new Error('Could not add product to cart.');
    setMessage(`Added ${quantity} × ${product.name} to basket.`);
  });

  const handleRequestAlert = () => run(async () => {
    const result = await requestBackInStockAlert(product.id);
    setAlertRequested(result.requested);
    setMessage(result.message);
  });

  const handleAddToList = () => run(async () => {
    if (!isSignedIn) throw new Error('Sign in to save products to a shopping list.');
    let listId = selectedListId;
    if (!listId) {
      const created = await createShoppingList(newListName.trim() || 'Weekly staples');
      if (!created) throw new Error('Could not create a list.');
      listId = created.id;
      setSelectedListId(created.id);
    }
    const updated = await addItemToList(listId, { name: product.name, quantity, unit: product.unit || 'each', notes: product.isPerishable ? 'Fresh item — picker check required' : '' });
    if (!updated) throw new Error('Could not add product to list.');
    setMessage(`Saved ${product.name} to ${updated.name}.`);
  });

  return (
    <div className="mt-6 space-y-4">
      {(message || error) && (
        <div className={`border px-4 py-3 text-sm ${error ? 'border-[var(--sf-danger-bg)] bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'border-[var(--sf-info-bg)] bg-[var(--sf-info-bg)] text-[var(--sf-info)]'}`}>
          {error || message}
        </div>
      )}

      {product.inStock ? (
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <div className="grid grid-cols-3 border border-[var(--sf-rule-strong)]">
            <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="py-2.5 text-xl font-medium text-[var(--sf-accent)] hover:bg-[var(--sf-paper-2)]" aria-label="Decrease quantity">−</button>
            <span className="border-x border-[var(--sf-rule)] py-2.5 text-center text-lg font-medium">{quantity}</span>
            <button type="button" onClick={() => setQuantity(Math.min(product.stockQuantity, quantity + 1))} disabled={quantity >= product.stockQuantity} className="py-2.5 text-xl font-medium text-[var(--sf-accent)] hover:bg-[var(--sf-paper-2)] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Increase quantity">+</button>
          </div>
          <UrbanButton type="button" onClick={handleAddToCart} disabled={isPending} className="w-full">
            {isPending ? 'Working…' : 'Add to basket'}
          </UrbanButton>
        </div>
      ) : (
        <div className="border border-[var(--sf-rule-strong)] bg-[var(--sf-paper-2)] p-4">
          <p className="text-sm leading-6 text-[var(--sf-ink-muted)]">No unexpired inventory is available. This item cannot be added to your basket.</p>
          {isSignedIn ? (
            <UrbanButton type="button" variant="ghost" onClick={handleRequestAlert} disabled={isPending || alertRequested} className="mt-3 w-full">
              <Bell className="h-4 w-4" />
              {alertRequested ? 'Back-in-stock alert requested' : isPending ? 'Requesting…' : 'Request a back-in-stock alert'}
            </UrbanButton>
          ) : (
            <Link href={`/dashboard/signin?from=${encodeURIComponent(`/products/${product.handle}`)}`} className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-[var(--sf-rule-strong)] px-4 py-2.5 text-sm font-medium text-[var(--sf-accent)] hover:bg-[var(--sf-paper)]">
              <Bell className="h-4 w-4" /> Sign in for a back-in-stock alert
            </Link>
          )}
        </div>
      )}

      <div className="border-t border-[var(--sf-rule)] pt-5">
        <div>
          <h3 className="font-[family-name:var(--sf-font-display)] text-lg font-semibold text-[var(--sf-ink)]">Save to a list</h3>
          <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">Keep this in a reusable grocery run.</p>
          {!isSignedIn ? <Link href="/dashboard/signin?from=/products" className="mt-2 inline-block text-sm font-medium text-[var(--sf-accent)]">Sign in</Link> : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            {initialLists.length > 0 ? (
              <UrbanSelect value={selectedListId} onChange={(event) => setSelectedListId(event.target.value)}>
                {initialLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
              </UrbanSelect>
            ) : (
              <UrbanTextInput value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="New list name" />
            )}
            <UrbanButton type="button" variant="ghost" onClick={handleAddToList} disabled={isPending || !isSignedIn}>Save</UrbanButton>
          </div>
        </div>

      </div>
    </div>
  );
}
