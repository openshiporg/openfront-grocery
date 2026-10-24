'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Check, Minus, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import type { ShoppingList } from '../../types';
import { addItemToList, addShoppingListToCart, createShoppingList, deleteShoppingList, removeListItem, toggleListItem, updateListItemQuantity } from '../../lib/data/lists';
import { useMarketBasket } from '../market/MarketBasket';
import { UrbanBadge, UrbanButton, UrbanButtonLink, UrbanEmptyState, UrbanTextInput } from '../urban/UrbanPrimitives';

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
  async function replace(action: Promise<ShoppingList>, confirmation: string) {
    const updated = await action;
    setLists((current) => current.map((list) => list.id === updated.id ? updated : list));
    setMessage(confirmation);
  }
  // Kept across an uncertain "add list to basket" so retrying never adds twice.
  const batchKey = useRef<{ listId: string; key: string } | null>(null);
  const checkedCount = selectedList ? selectedList.items.filter((item) => item.checked).length : 0;
  return <div className="space-y-6" aria-busy={disabled}>
    {message ? <p role="status" className="rounded-[var(--sf-radius-md)] bg-[var(--sf-sage-light)] px-4 py-3 text-sm font-medium text-[var(--sf-sage)]">{message}</p> : null}{error ? <p role="alert" className="sf-note">{error}</p> : null}
    <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
      <div className="space-y-4 lg:sticky lg:top-[calc(var(--sf-header-offset)+1rem)]">
        <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); run(async () => {
          const created = await createShoppingList(name.trim());
          // The store reuses an existing list with the same name: select it, never duplicate it.
          const reused = lists.some((list) => list.id === created.id);
          setLists((current) => reused ? current.map((list) => list.id === created.id ? created : list) : [created, ...current]);
          setName(''); select(created.id); setMessage(reused ? `You already have a list called ${created.name}; it’s selected.` : `Created ${created.name}.`);
        }); }}><label className="sf-label min-w-0 flex-1">New list<UrbanTextInput required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekly staples, taco night…" disabled={disabled} /></label><button type="submit" aria-label="Create list" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--sf-ink)] text-[var(--sf-paper)] transition-colors hover:bg-[var(--sf-header-2)] disabled:bg-[var(--sf-paper-3)] disabled:text-[var(--sf-ink-faint)]" disabled={disabled || !name.trim()}><Plus className="h-5 w-5" aria-hidden="true" /></button></form>
        <nav aria-label="Shopping lists" className="min-w-0">
          <div className="sf-scroll-row sf-bleed-row gap-2 sm:mx-0 sm:px-0 lg:grid lg:gap-1.5">{lists.map((list) => {
            const current = selectedList?.id === list.id;
            const done = list.items.filter((item) => item.checked).length;
            return <button key={list.id} type="button" disabled={disabled} aria-current={current ? 'page' : undefined} onClick={() => select(list.id)} className={`min-w-[10rem] rounded-[var(--sf-radius-md)] px-4 py-3 text-left transition-colors lg:w-full ${current ? 'bg-[var(--sf-ink)] text-[var(--sf-paper)]' : 'bg-[var(--sf-paper-2)] hover:bg-[var(--sf-paper-3)]'}`}>
              <span className="block truncate text-sm font-semibold">{list.name}</span>
              <span className={`mt-0.5 block text-xs ${current ? 'text-[var(--sf-header-ink-muted)]' : 'text-[var(--sf-ink-faint)]'}`}>{list.items.length} {list.items.length === 1 ? 'item' : 'items'}{list.isDefault ? ' · default' : ''}</span>
              <span aria-hidden="true" className={`mt-2 block h-1 overflow-hidden rounded-full ${current ? 'bg-[var(--sf-header-2)]' : 'bg-[var(--sf-rule)]'}`}><span className="block h-full rounded-full bg-[var(--sf-tag-deep)]" style={{ width: `${list.items.length ? (done / list.items.length) * 100 : 0}%` }} /></span>
            </button>;
          })}</div>
          {!lists.length ? <p className="px-1 py-3 text-sm text-[var(--sf-ink-muted)]">Your saved lists will appear here.</p> : null}
        </nav>
      </div>
      {selectedList ? <section aria-labelledby="selected-list-title" className="sf-notepad min-w-0 px-5 pb-5 pt-10 sm:px-8 sm:pb-8 sm:pt-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="selected-list-title" className="sf-title text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)]">{selectedList.name}</h2>
            <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">{checkedCount} of {selectedList.items.length} checked off</p>
          </div>
          <UrbanButton type="button" disabled={disabled || !selectedList.items.length} onClick={() => run(async () => {
            if (batchKey.current?.listId !== selectedList.id) batchKey.current = { listId: selectedList.id, key: `list:${crypto.randomUUID()}` };
            const key = batchKey.current.key;
            await basket.runExclusive(async () => {
              const result = await addShoppingListToCart(selectedList.id, key).catch((cause) => {
                throw new Error(`${cause instanceof Error && cause.message ? cause.message : 'We couldn’t confirm the result.'} Try again — items won’t be added twice.`);
              });
              batchKey.current = null;
              if (!result.success && !result.addedCount) throw new Error(result.message || 'No items could be added.');
              setMessage(`${result.addedCount} ${result.addedCount === 1 ? 'item' : 'items'} added to your basket.${result.skippedCount ? ` ${result.skippedCount} skipped: ${result.skippedItems.join(', ')}.` : ''} Review your basket for current quantities and prices.`);
            });
          })}><ShoppingBasket className="h-4 w-4 shrink-0" aria-hidden="true" />Add list to basket</UrbanButton>
        </div>
        <p className="mt-3 text-xs leading-6 text-[var(--sf-ink-faint)]">Only unchecked, available catalog items are added. Checked items stay on your list. <Link href="/cart" className="font-semibold text-[var(--sf-ink-muted)] underline">View basket</Link></p>

        <form className="mt-5 flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); run(async () => { await replace(addItemToList(selectedList.id, { name: itemName.trim(), quantity: 1 }), `Item saved to ${selectedList.name}.`); setItemName(''); }); }}><label className="sf-label min-w-0 flex-1">Add by exact product name<UrbanTextInput value={itemName} required maxLength={200} disabled={disabled} onChange={(event) => setItemName(event.target.value)} placeholder="Match a product in the catalog" /></label><UrbanButton type="submit" variant="ghost" className="h-12" disabled={disabled || !itemName.trim()}>Add</UrbanButton></form>
        <p className="mt-2 text-xs leading-6 text-[var(--sf-ink-faint)]">Or <Link href="/products" className="font-semibold text-[var(--sf-ink-muted)] underline">browse products</Link> and use “Save to a shopping list” on a product page.</p>

        <ul className="mt-5 border-t border-[var(--sf-rule)]">{selectedList.items.map((item) => <li key={item.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-[var(--sf-rule)] py-3 sm:grid-cols-[2.75rem_minmax(0,1fr)_7.5rem_auto]">
          <button type="button" role="checkbox" aria-checked={item.checked} aria-label={`Mark ${item.name} as ${item.checked ? 'not checked' : 'checked'}`} disabled={disabled} onClick={() => run(() => replace(toggleListItem(selectedList.id, item.id), `${item.name} ${item.checked ? 'unchecked' : 'checked'}.`))} className={`grid h-11 w-11 place-items-center rounded-full border-2 transition-colors ${item.checked ? 'border-[var(--sf-sage)] bg-[var(--sf-sage)] text-[var(--sf-card)]' : 'border-[var(--sf-rule-strong)] hover:border-[var(--sf-sage)]'}`}>{item.checked ? <Check className="h-5 w-5" aria-hidden="true" /> : null}</button>
          <div className="min-w-0">
            <p className={`text-[0.9375rem] font-medium ${item.checked ? 'text-[var(--sf-ink-faint)] line-through decoration-[var(--sf-ink-faint)]' : ''}`}>{item.productHandle ? <Link href={`/products/${item.productHandle}`} className="hover:underline">{item.name}</Link> : item.name}</p>
            {item.notes ? <p className="mt-0.5 text-xs leading-5 text-[var(--sf-ink-muted)]">{item.notes}</p> : null}
            {!item.productId ? <UrbanBadge tone="muted" className="mt-1">Product needs matching</UrbanBadge> : null}
          </div>
          <div className="sf-stepper sf-stepper-sm col-start-2 w-[7.5rem] sm:col-start-auto" role="group" aria-label={`${item.name} quantity`}><button type="button" disabled={disabled || item.quantity <= 1} aria-label={`Decrease ${item.name} quantity`} onClick={() => run(() => replace(updateListItemQuantity(selectedList.id, item.id, item.quantity - 1, item.quantity), `${item.name} quantity updated.`))}><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button><span>{item.quantity}{item.unit && item.unit !== 'each' ? ` ${item.unit}` : ''}</span><button type="button" disabled={disabled} aria-label={`Increase ${item.name} quantity`} onClick={() => run(() => replace(updateListItemQuantity(selectedList.id, item.id, item.quantity + 1, item.quantity), `${item.name} quantity updated.`))}><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button></div>
          <button type="button" disabled={disabled} aria-label={`Remove ${item.name} from ${selectedList.name}`} onClick={() => run(() => replace(removeListItem(selectedList.id, item.id), `${item.name} removed.`))} className="col-start-2 inline-flex min-h-9 w-fit items-center gap-1.5 rounded-full px-2 text-[0.8125rem] font-semibold text-[var(--sf-ink-muted)] hover:text-[var(--sf-danger)] sm:col-start-auto"><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sm:sr-only">Remove</span></button>
        </li>)}</ul>
        {!selectedList.items.length ? <div className="py-10 text-center"><p className="text-lg font-bold">A fresh list, ready to fill</p><p className="mt-1 text-sm text-[var(--sf-ink-muted)]">Save products from the catalog or add an exact product name above.</p><UrbanButtonLink href="/products" variant="dark" className="mt-4">Browse groceries</UrbanButtonLink></div> : null}
        <div className="mt-6">{confirmDelete ? <div className="sf-note" role="alert"><p className="font-semibold text-[var(--sf-ink)]">Delete “{selectedList.name}” and its saved items?</p><div className="mt-3 flex flex-wrap gap-3"><UrbanButton type="button" variant="dark" disabled={disabled} onClick={() => run(async () => { if (!await deleteShoppingList(selectedList.id)) throw new Error('The list could not be deleted.'); const remaining = lists.filter((list) => list.id !== selectedList.id); setLists(remaining); select(remaining[0]?.id); setMessage(`Deleted ${selectedList.name}.`); })}>Delete this list</UrbanButton><UrbanButton type="button" variant="ghost" disabled={disabled} onClick={() => setConfirmDelete(false)}>Keep list</UrbanButton></div></div> : <button type="button" disabled={disabled} onClick={() => setConfirmDelete(true)} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--sf-ink-muted)] hover:text-[var(--sf-danger)]"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete list</button>}</div>
      </section> : <UrbanEmptyState title={selectedId ? 'This list is not available' : 'Save your next grocery shop'} actionHref={selectedId ? '/lists' : '/products'} actionLabel={selectedId ? 'View your lists' : 'Browse groceries'}>{selectedId ? 'Choose another list or create a new one.' : 'Create a list, then add your regular groceries.'}</UrbanEmptyState>}
    </div>
  </div>;
}
