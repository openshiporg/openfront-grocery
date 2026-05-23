'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { GroceryProduct, ShoppingList } from '@/features/storefront/types';
import { addToCart } from '@/features/storefront/lib/data/cart';
import { addItemToList, createShoppingList } from '@/features/storefront/lib/data/lists';
import { createSubscription } from '@/features/storefront/lib/data/subscriptions';
import { UrbanButton, UrbanPanel, UrbanSelect, UrbanTextInput } from '@/features/storefront/modules/urban/UrbanPrimitives';

interface ProductActionsProps {
  product: GroceryProduct;
  lists: ShoppingList[];
  isSignedIn: boolean;
}

export default function ProductActions({ product, lists: initialLists, isSignedIn }: ProductActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [selectedListId, setSelectedListId] = useState(initialLists[0]?.id || '');
  const [newListName, setNewListName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    await addToCart(product.id, quantity);
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { increment: quantity } }));
    setMessage(`Added ${quantity} × ${product.name} to cart.`);
  });

  const handleAddToList = () => run(async () => {
    if (!isSignedIn) throw new Error('Sign in to save products to a shopping list.');
    let listId = selectedListId;
    if (!listId) {
      const created = await createShoppingList(newListName.trim() || 'Urban Express staples');
      if (!created) throw new Error('Could not create a list.');
      listId = created.id;
      setSelectedListId(created.id);
    }
    const updated = await addItemToList(listId, { name: product.name, quantity, unit: product.unit || 'each', notes: product.isPerishable ? 'Fresh item — picker check required' : '' });
    if (!updated) throw new Error('Could not add product to list.');
    setMessage(`Saved ${product.name} to ${updated.name}.`);
  });

  const handleSubscribe = () => run(async () => {
    if (!isSignedIn) throw new Error('Sign in to create a recurring grocery subscription.');
    const subscription = await createSubscription({ productId: product.id, quantity, frequency });
    if (!subscription) throw new Error('Could not create subscription.');
    setMessage(`Subscription created for ${quantity} × ${product.name}.`);
  });

  return (
    <div className="mt-6 space-y-4">
      {(message || error) && (
        <div className={`border px-4 py-3 text-sm ${error ? 'border-[#ffb4ab] bg-[#331718] text-[#ffb4ab]' : 'border-[#b6c6ed] bg-[#182033] text-[#b6c6ed]'}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="grid grid-cols-3 border border-[#5a4136] bg-[#282a2b]">
          <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="py-3 font-market-label text-2xl font-black text-[#ffb693] hover:bg-[#333535]" aria-label="Decrease quantity">-</button>
          <span className="border-x border-[#5a4136] py-3 text-center font-market-label text-2xl font-black text-[#e2e2e2]">{quantity}</span>
          <button type="button" onClick={() => setQuantity(quantity + 1)} className="py-3 font-market-label text-2xl font-black text-[#ffb693] hover:bg-[#333535]" aria-label="Increase quantity">+</button>
        </div>
        <UrbanButton type="button" onClick={handleAddToCart} disabled={!product.inStock || isPending} className="w-full">
          {isPending ? 'Working…' : 'Add to basket'}
        </UrbanButton>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <UrbanPanel className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-market-label text-xl font-black uppercase text-[#e2e2e2]">Save to list</h3>
              <p className="mt-1 text-sm text-[#e2bfb0]">Keep the item in a repeat grocery run.</p>
            </div>
            {!isSignedIn ? <Link href="/dashboard/signin?from=/products" className="font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#ffb693]">Sign in</Link> : null}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            {initialLists.length > 0 ? (
              <UrbanSelect value={selectedListId} onChange={(event) => setSelectedListId(event.target.value)}>
                {initialLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
              </UrbanSelect>
            ) : (
              <UrbanTextInput value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="New list name" />
            )}
            <UrbanButton type="button" variant="ghost" onClick={handleAddToList} disabled={isPending || !isSignedIn}>Save</UrbanButton>
          </div>
        </UrbanPanel>

        <UrbanPanel className="p-4">
          <h3 className="font-market-label text-xl font-black uppercase text-[#e2e2e2]">Auto replenish</h3>
          <p className="mt-1 text-sm text-[#e2bfb0]">Turn staples into scheduled inventory.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <UrbanSelect value={frequency} onChange={(event) => setFrequency(event.target.value as 'weekly' | 'biweekly' | 'monthly')}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </UrbanSelect>
            <UrbanButton type="button" variant="ghost" onClick={handleSubscribe} disabled={isPending || !isSignedIn}>Start</UrbanButton>
          </div>
          {!isSignedIn ? <p className="mt-2 text-xs text-[#b6c6ed]">Sign in to create recurring grocery deliveries.</p> : null}
        </UrbanPanel>
      </div>
    </div>
  );
}
