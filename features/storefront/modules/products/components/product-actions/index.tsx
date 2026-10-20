'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell, ChevronDown, Heart, ListPlus, Minus, Plus, ShoppingBasket } from 'lucide-react';
import type { GroceryProduct, ShoppingList } from '@/features/storefront/types';
import { useMarketBasket } from '@/features/storefront/modules/market/MarketBasket';
import { requestBackInStockAlert, requestPriceAlert } from '@/features/storefront/lib/data/products';
import { addItemToList, createShoppingList } from '@/features/storefront/lib/data/lists';
import { storefrontGraphQL, throwGraphQLErrors } from '@/features/storefront/lib/data/graphql';
import { UrbanButton, UrbanButtonLink, UrbanSelect, UrbanTextInput } from '@/features/storefront/modules/urban/UrbanPrimitives';

interface ProductActionsProps {
  product: GroceryProduct;
  lists: ShoppingList[];
  isSignedIn: boolean;
}

export default function ProductActions({ product, lists: initialLists, isSignedIn }: ProductActionsProps) {
  const { change, busy, cart } = useMarketBasket();
  const [lists, setLists] = useState(initialLists);
  const inBasket = cart?.items.find((item) => item.product.id === product.id)?.quantity || 0;
  const [quantity, setQuantity] = useState(1);
  const [selectedListId, setSelectedListId] = useState(initialLists[0]?.id || '');
  const [newListName, setNewListName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alertRequested, setAlertRequested] = useState(Boolean(product.backInStockRequested));
  const [emailDisabled, setEmailDisabled] = useState(false);
  const [targetPrice, setTargetPrice] = useState('');
  const [priceEmailDisabled, setPriceEmailDisabled] = useState(false);
  const [favoriteSaved, setFavoriteSaved] = useState(false);
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
    await change(product.id, quantity);
    setMessage(`Added ${quantity} × ${product.name} to basket.`);
  });

  const handleRequestAlert = (enableEmail = false) => run(async () => {
    const result = await requestBackInStockAlert(product.id, { enableEmail });
    setAlertRequested(result.requested);
    setEmailDisabled(result.emailDisabled);
    setMessage(result.message);
  });

  const handlePriceAlert = (enableEmail = false) => run(async () => {
    const result = await requestPriceAlert(product.id, targetPrice.trim(), { enableEmail });
    setPriceEmailDisabled(result.emailDisabled);
    setMessage(result.message);
  });

  const handleSaveFavorite = () => run(async () => {
    const result = await storefrontGraphQL<{ saveFavoriteProduct: { id: string; reused: boolean } | null }>('mutation SaveFavorite($productId:ID!){saveFavoriteProduct(productId:$productId){id reused}}', { productId: product.id });
    throwGraphQLErrors(result.errors);
    if (!result.data?.saveFavoriteProduct?.id) throw new Error('This product could not be saved to favorites.');
    setFavoriteSaved(true);
    setMessage(result.data.saveFavoriteProduct.reused ? `${product.name} is already in your favorites.` : `Saved ${product.name} to your favorites.`);
  });

  const handleAddToList = () => run(async () => {
    if (!isSignedIn) throw new Error('Sign in to save products to a shopping list.');
    let listId = selectedListId;
    if (!listId) {
      const created = await createShoppingList(newListName.trim() || 'Weekly staples');
      listId = created.id;
      setSelectedListId(created.id);
      setLists((current) => current.some((list) => list.id === created.id) ? current : [...current, created]);
    }
    // Saved by exact product identity; repeated saves add to the same line.
    const updated = await addItemToList(listId, { productId: product.id, quantity, mode: 'add' });
    setMessage(`Saved ${product.name} to ${updated.name}.`);
  });

  const maxAddable = Math.max(1, Math.floor(product.stockQuantity - inBasket));
  return (
    <div className="mt-6 space-y-4">
      {product.inStock ? (
        <div className="flex flex-wrap gap-3">
          <div className="sf-stepper sf-stepper-lg w-[9.5rem]" role="group" aria-label="Quantity to add">
            <button type="button" disabled={isPending || busy || quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease quantity"><Minus className="h-4 w-4" aria-hidden="true" /></button>
            <output aria-live="polite" aria-label={`Quantity ${quantity}`}>{quantity}</output>
            <button type="button" onClick={() => setQuantity(Math.min(maxAddable, quantity + 1))} disabled={isPending || busy || quantity >= product.stockQuantity - inBasket} aria-label="Increase quantity"><Plus className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <UrbanButton type="button" size="lg" onClick={handleAddToCart} disabled={isPending || busy || quantity > product.stockQuantity - inBasket} className="min-w-[12rem] flex-1">
            <ShoppingBasket className="h-5 w-5" aria-hidden="true" />
            {isPending ? 'Adding…' : `Add ${quantity > 1 ? `${quantity} ` : ''}to basket`}
          </UrbanButton>
        </div>
      ) : (
        <div id="stock-alert" className="scroll-mt-28 rounded-[var(--sf-radius-md)] border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-4">
          <p className="text-sm leading-6 text-[var(--sf-ink-muted)]">This product is out of stock and can’t be added to your basket right now.</p>
          {isSignedIn ? (
            emailDisabled && !alertRequested ? <div className="mt-3 space-y-2">
              <UrbanButton type="button" variant="ghost" onClick={() => handleRequestAlert(true)} disabled={isPending} className="w-full">
                <Bell className="h-4 w-4" aria-hidden="true" />
                {isPending ? 'Requesting…' : 'Turn on back-in-stock emails and alert me'}
              </UrbanButton>
              <p className="text-xs text-[var(--sf-ink-muted)]">This turns on only back-in-stock emails. <Link href="/account/profile" className="font-semibold underline underline-offset-4">Review all email preferences</Link>.</p>
            </div> : <UrbanButton type="button" variant="ghost" onClick={() => handleRequestAlert()} disabled={isPending || alertRequested} className="mt-3 w-full">
              <Bell className="h-4 w-4" aria-hidden="true" />
              {alertRequested ? 'Back-in-stock alert requested' : isPending ? 'Requesting…' : 'Email me when it’s back'}
            </UrbanButton>
          ) : (
            <UrbanButtonLink href={`/account/sign-in?from=${encodeURIComponent(`/products/${product.handle}#stock-alert`)}`} variant="ghost" className="mt-3 w-full">
              <Bell className="h-4 w-4" aria-hidden="true" /> Sign in for a back-in-stock alert
            </UrbanButtonLink>
          )}
        </div>
      )}

      {(message || error) && (
        <p role={error ? 'alert' : 'status'} className={`rounded-[var(--sf-radius-md)] px-4 py-3 text-sm font-medium ${error ? 'bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]'}`}>
          {error || message}
        </p>
      )}
      {isSignedIn ? (
        <div className="flex flex-wrap items-center gap-3">
          <UrbanButton type="button" variant="ghost" onClick={handleSaveFavorite} disabled={isPending || favoriteSaved} aria-pressed={favoriteSaved}>
            <Heart className={`h-4 w-4 ${favoriteSaved ? 'fill-current text-[var(--sf-accent)]' : ''}`} aria-hidden="true" />
            {favoriteSaved ? 'In your favorites' : 'Save to favorites'}
          </UrbanButton>
          {favoriteSaved ? <Link prefetch={false} href="/favorites" className="text-sm font-semibold underline underline-offset-4">View favorites</Link> : null}
          <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); handlePriceAlert(priceEmailDisabled); }}>
            <label className="sf-label min-w-[10rem] flex-1">Email me if the price drops to
              <input className="sf-field" inputMode="decimal" required placeholder="e.g. 2.99" value={targetPrice} onChange={(event) => { setTargetPrice(event.target.value); setPriceEmailDisabled(false); }} disabled={isPending} />
            </label>
            <UrbanButton type="submit" variant="ghost" disabled={isPending || !targetPrice.trim()}>{priceEmailDisabled ? 'Turn on price-drop emails and set alert' : 'Set price alert'}</UrbanButton>
          </form>
        </div>
      ) : (
        <p className="text-sm text-[var(--sf-ink-muted)]"><Link prefetch={false} href={`/account/sign-in?from=${encodeURIComponent(`/products/${product.handle}`)}`} className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">Sign in</Link> to save favorites.</p>
      )}
      {inBasket > 0 ? <p className="text-sm text-[var(--sf-ink-muted)]"><span className="font-semibold text-[var(--sf-ink)]">{inBasket} in your basket.</span> <Link prefetch={false} href="/cart" className="underline underline-offset-4">View basket</Link></p> : null}

      <details className="group rounded-[var(--sf-radius-md)] border border-[var(--sf-rule)] bg-[var(--sf-card)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2"><ListPlus className="h-4 w-4 text-[var(--sf-sage)]" aria-hidden="true" />Save to a shopping list</span>
          <ChevronDown className="h-4 w-4 transition-transform duration-[var(--sf-dur-fast)] group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-[var(--sf-rule)] p-4">
          {!isSignedIn ? (
            <p className="text-sm text-[var(--sf-ink-muted)]">Lists belong to your account. <Link prefetch={false} href={`/account/sign-in?from=${encodeURIComponent(`/products/${product.handle}`)}`} className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">Sign in</Link> to keep your usual groceries together.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                {lists.length > 0 ? (
                  <UrbanSelect aria-label="Shopping list" disabled={isPending} value={selectedListId} onChange={(event) => setSelectedListId(event.target.value)}>
                    <option value="">Create a new list</option>
                    {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                  </UrbanSelect>
                ) : (
                  <UrbanTextInput aria-label="New list name" disabled={isPending} value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="New list name, e.g. Weekly staples" />
                )}
                <UrbanButton type="button" variant="dark" onClick={handleAddToList} disabled={isPending}>Save {quantity > 1 ? `${quantity}` : ''}</UrbanButton>
              </div>
              {lists.length > 0 && !selectedListId ? <UrbanTextInput aria-label="New list name" className="mt-2" value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="New list name" disabled={isPending} /> : null}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
