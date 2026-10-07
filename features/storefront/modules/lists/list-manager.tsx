'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Check, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import type { ShoppingList } from '../../types';
import { addItemToList, addShoppingListToCart, createShoppingList, deleteShoppingList, removeListItem, toggleListItem, updateListItemQuantity } from '../../lib/data/lists';
import { useMarketBasket } from '../market/MarketBasket';
import { UrbanBadge, UrbanButton, UrbanEmptyState, UrbanTextInput } from '../urban/UrbanPrimitives';

export default function ListManager({ initialLists }: { initialLists: ShoppingList[] }) {
  const router = useRouter(), params = useSearchParams();
  const basket = useMarketBasket();
  const [lists, setLists] = useState(initialLists);
  const selectedId = params?.get('list') || lists[0]?.id;
  const selectedList = lists.find((list) => list.id === selectedId);
  const [name, setName] = useState(''), [itemName, setItemName] = useState('');
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const disabled = pending || basket.busy;
  function select(id?: string) { setConfirmDelete(false); router.push(id ? `/lists?list=${encodeURIComponent(id)}` : '/lists', { scroll: false }); }
  function run(work: () => Promise<void>) {
    setMessage(''); setError('');
    startTransition(async () => { try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your list could not be updated. Please try again.'); } });
  }
  async function replace(action: Promise<ShoppingList | null>, confirmation: string) {
    const updated = await action;
    if (!updated) throw new Error('Your list could not be updated. Please try again.');
    setLists((current) => current.map((list) => list.id === updated.id ? updated : list));
    setMessage(confirmation);
  }
  return <div className="space-y-6" aria-busy={disabled}>
    <form className="sf-panel flex flex-col gap-3 bg-[var(--sf-paper-2)] p-4 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); run(async () => {
      const created = await createShoppingList(name.trim());
      if (!created) throw new Error('The list could not be created. Please try again.');
      setLists((current) => [created, ...current]); setName(''); select(created.id); setMessage(`Created ${created.name}.`);
    }); }}><label className="sf-label min-w-0 flex-1">Create a shopping list<UrbanTextInput required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekly staples, dinner party…" disabled={disabled} /></label><UrbanButton type="submit" disabled={disabled || !name.trim()}><Plus className="h-4 w-4" aria-hidden="true" />Create list</UrbanButton></form>
    {message ? <p role="status" className="sf-note">{message}</p> : null}{error ? <p role="alert" className="sf-note text-[var(--sf-danger)]">{error}</p> : null}
    <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Shopping lists" className="sf-panel min-w-0 p-3"><p className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--sf-ink-muted)]">Your lists</p><div className="sf-scroll-row lg:block">{lists.map((list) => <button key={list.id} type="button" disabled={disabled} aria-current={selectedList?.id === list.id ? 'page' : undefined} onClick={() => select(list.id)} className={`mb-2 min-h-14 min-w-36 rounded-md border px-3 py-3 text-left lg:w-full ${selectedList?.id === list.id ? 'border-[var(--sf-accent)] bg-[var(--sf-paper-2)]' : 'border-transparent'}`}><span className="block text-sm font-semibold">{list.name}</span><span className="mt-1 block text-xs text-[var(--sf-ink-muted)]">{list.items.length} items{list.isDefault ? ' · default' : ''}</span></button>)}</div>{!lists.length ? <p className="px-2 py-3 text-sm text-[var(--sf-ink-muted)]">Your saved lists will appear here.</p> : null}</nav>
      {selectedList ? <section className="sf-panel min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sf-rule)] pb-4"><div><h2 className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">{selectedList.name}</h2><p className="mt-1 text-xs text-[var(--sf-ink-muted)]">{selectedList.items.filter((item) => item.checked).length} of {selectedList.items.length} checked</p></div><UrbanButton type="button" disabled={disabled || !selectedList.items.length} onClick={() => run(async () => {
          await basket.runExclusive(async () => {
            const result = await addShoppingListToCart(selectedList.id);
            if (!result.success && !result.addedCount) throw new Error(result.message || 'No items could be added.');
            setMessage(`${result.addedCount} items added to your basket.${result.skippedCount ? ` ${result.skippedCount} skipped: ${result.skippedItems.join(', ')}.` : ''} Review your basket for current quantities and prices.`);
          });
        })}><ShoppingBasket className="h-4 w-4 shrink-0" aria-hidden="true" />Add list to basket</UrbanButton></div>
        <p className="mt-3 text-xs leading-6 text-[var(--sf-ink-muted)]">Only unchecked, available catalog items are added. Checked items stay on your list. <Link href="/cart" className="underline">View basket</Link></p>
        <form className="mt-4 flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); run(async () => { await replace(addItemToList(selectedList.id, { name: itemName.trim(), quantity: 1 }), `Item saved to ${selectedList.name}.`); setItemName(''); }); }}><label className="sf-label min-w-0 flex-1">Add by exact product name<UrbanTextInput value={itemName} required maxLength={200} disabled={disabled} onChange={(event) => setItemName(event.target.value)} placeholder="Match a product in the catalog" /></label><UrbanButton type="submit" variant="ghost" disabled={disabled || !itemName.trim()}>Add</UrbanButton></form>
        <p className="mt-2 text-xs leading-6 text-[var(--sf-ink-muted)]">Or <Link href="/products" className="underline">browse products</Link> and use “Save to a list” on a product page.</p>
        <div className="mt-5 divide-y divide-[var(--sf-rule)]">{selectedList.items.map((item) => <div key={item.id} className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-3 py-4 sm:grid-cols-[44px_minmax(0,1fr)_132px_auto] sm:items-center"><button type="button" role="checkbox" aria-checked={item.checked} aria-label={`Mark ${item.name} as ${item.checked ? 'not checked' : 'checked'}`} disabled={disabled} onClick={() => run(() => replace(toggleListItem(selectedList.id, item.id), `${item.name} ${item.checked ? 'unchecked' : 'checked'}.`))} className={`flex h-11 w-11 items-center justify-center rounded border ${item.checked ? 'border-[var(--sf-sage)] bg-[var(--sf-sage-light)] text-[var(--sf-sage)]' : 'border-[var(--sf-rule-strong)]'}`}>{item.checked ? <Check className="h-4 w-4" aria-hidden="true" /> : null}</button><div className="min-w-0"><p className={`text-sm font-medium ${item.checked ? 'line-through text-[var(--sf-ink-muted)]' : ''}`}>{item.productHandle ? <Link href={`/products/${item.productHandle}`}>{item.name}</Link> : item.name}</p>{item.notes ? <p className="mt-1 text-xs leading-5 text-[var(--sf-ink-muted)]">{item.notes}</p> : null}{!item.productId ? <UrbanBadge tone="muted" className="mt-1">Product needs matching</UrbanBadge> : null}</div><div className="col-start-2 grid w-33 grid-cols-3 rounded border border-[var(--sf-rule-strong)] sm:col-start-auto"><button type="button" className="h-11" disabled={disabled || item.quantity <= 1} aria-label={`Decrease ${item.name} quantity`} onClick={() => run(() => replace(updateListItemQuantity(selectedList.id, item.id, item.quantity - 1), `${item.name} quantity updated.`))}>−</button><span className="flex items-center justify-center border-x border-[var(--sf-rule)] text-sm tabular-nums">{item.quantity}</span><button type="button" className="h-11" disabled={disabled} aria-label={`Increase ${item.name} quantity`} onClick={() => run(() => replace(updateListItemQuantity(selectedList.id, item.id, item.quantity + 1), `${item.name} quantity updated.`))}>+</button></div><button type="button" disabled={disabled} aria-label={`Remove ${item.name} from ${selectedList.name}`} onClick={() => run(() => replace(removeListItem(selectedList.id, item.id), `${item.name} removed.`))} className="col-start-2 min-h-11 text-left text-sm text-[var(--sf-danger)] underline sm:col-start-auto">Remove</button></div>)}</div>
        {!selectedList.items.length ? <UrbanEmptyState title="A fresh list, ready to fill" actionHref="/products" actionLabel="Browse groceries">Save products from the catalog or add an exact product name above.</UrbanEmptyState> : null}
        <div className="mt-5 border-t border-[var(--sf-rule)] pt-4">{confirmDelete ? <div className="sf-note"><p>Delete “{selectedList.name}” and its saved items?</p><div className="mt-3 flex flex-wrap gap-3"><UrbanButton type="button" disabled={disabled} onClick={() => run(async () => { if (!await deleteShoppingList(selectedList.id)) throw new Error('The list could not be deleted.'); const remaining = lists.filter((list) => list.id !== selectedList.id); setLists(remaining); select(remaining[0]?.id); setMessage(`Deleted ${selectedList.name}.`); })}>Delete this list</UrbanButton><UrbanButton type="button" variant="ghost" disabled={disabled} onClick={() => setConfirmDelete(false)}>Keep list</UrbanButton></div></div> : <button type="button" disabled={disabled} onClick={() => setConfirmDelete(true)} className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--sf-danger)]"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete list</button>}</div>
      </section> : <UrbanEmptyState title={selectedId ? 'This list is not available' : 'Save your next grocery shop'} actionHref={selectedId ? '/lists' : '/products'} actionLabel={selectedId ? 'View your lists' : 'Browse groceries'}>{selectedId ? 'Choose another list or create a new one.' : 'Create a list above, then add your regular groceries.'}</UrbanEmptyState>}
    </div>
  </div>;
}
