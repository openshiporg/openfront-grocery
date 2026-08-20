'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, ShoppingCart, Trash2 } from 'lucide-react';

import type { ShoppingList } from '@/features/storefront/types';
import { addItemToList, addShoppingListToCart, createShoppingList, deleteShoppingList, removeListItem, toggleListItem, updateListItemQuantity } from '@/features/storefront/lib/data/lists';
import { UrbanBadge, UrbanButton, UrbanEmptyState, UrbanTextInput } from '@/features/storefront/modules/urban/UrbanPrimitives';

interface ListManagerProps {
  initialLists: ShoppingList[];
}

export default function ListManager({ initialLists }: ListManagerProps) {
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingList[]>(initialLists);
  const [selectedListId, setSelectedListId] = useState(initialLists[0]?.id || '');
  const [newListName, setNewListName] = useState('');
  const [quickAddItem, setQuickAddItem] = useState('');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedList = useMemo(() => lists.find((list) => list.id === selectedListId) || lists[0] || null, [lists, selectedListId]);
  const replaceList = (nextList: ShoppingList) => setLists((current) => current.map((list) => (list.id === nextList.id ? nextList : list)));

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    setError(null); setMessage(null);
    startTransition(async () => {
      const created = await createShoppingList(newListName.trim());
      if (!created) { setError('Could not create list.'); return; }
      setLists((current) => [created, ...current]);
      setSelectedListId(created.id);
      setNewListName('');
      setMessage(`Created ${created.name}.`);
      router.refresh();
    });
  };

  const handleQuickAdd = () => {
    if (!selectedList || !quickAddItem.trim()) return;
    setError(null); setMessage(null);
    startTransition(async () => {
      const updated = await addItemToList(selectedList.id, { name: quickAddItem.trim(), quantity: 1 });
      if (!updated) { setError('Could not add item to list.'); return; }
      replaceList(updated);
      setQuickAddItem('');
      setMessage(`Added item to ${updated.name}.`);
      router.refresh();
    });
  };

  const handleToggleItem = (itemId: string) => selectedList && startTransition(async () => { const updated = await toggleListItem(selectedList.id, itemId); if (updated) replaceList(updated); });
  const handleQuantityChange = (itemId: string, quantity: number) => selectedList && startTransition(async () => { const updated = await updateListItemQuantity(selectedList.id, itemId, quantity); if (updated) replaceList(updated); });
  const handleRemoveItem = (itemId: string) => selectedList && startTransition(async () => { const updated = await removeListItem(selectedList.id, itemId); if (updated) replaceList(updated); });
  const handleAddListToCart = () => selectedList && startTransition(async () => { const result = await addShoppingListToCart(selectedList.id); result.success ? setMessage(result.message) : setError(result.message || 'Could not add list to cart.'); router.refresh(); });
  const handleDeleteList = () => selectedList && startTransition(async () => { const deleted = await deleteShoppingList(selectedList.id); if (!deleted) { setError('Could not delete list.'); return; } const remaining = lists.filter((list) => list.id !== selectedList.id); setLists(remaining); setSelectedListId(remaining[0]?.id || ''); setMessage(`Deleted ${selectedList.name}.`); router.refresh(); });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <label htmlFor="new-list" className="block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">New list</label>
          <UrbanTextInput id="new-list" value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Weekly staples, party prep…" className="mt-2" />
        </div>
        <UrbanButton type="button" onClick={handleCreateList} disabled={isPending || !newListName.trim()}><Plus className="h-4 w-4" /> Create</UrbanButton>
      </div>

      {(message || error) ? (
        <div className={`border px-4 py-3 text-sm ${error ? 'border-[var(--sf-danger-bg)] bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'border-[var(--sf-info-bg)] bg-[var(--sf-info-bg)] text-[var(--sf-info)]'}`}>
          {error || message}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border border-[var(--sf-rule)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">Your lists</p>
          <div className="mt-3 space-y-2">
            {lists.map((list) => {
              const active = list.id === selectedList?.id;
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedListId(list.id)}
                  className={`w-full border p-3 text-left transition ${active ? 'border-[var(--sf-accent)] bg-[var(--sf-sage-light)]' : 'border-[var(--sf-rule)] bg-[var(--sf-paper)] hover:border-[var(--sf-accent)]'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-[var(--sf-ink)]">{list.name}</p>
                    {list.isDefault ? <UrbanBadge tone="muted">Default</UrbanBadge> : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--sf-ink-muted)]">{list.itemCount || list.items.length} items</p>
                </button>
              );
            })}
            {lists.length === 0 ? <p className="text-sm text-[var(--sf-ink-muted)]">Create your first list above.</p> : null}
          </div>
        </div>

        {selectedList ? (
          <div className="min-w-0 border border-[var(--sf-rule)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sf-rule)] pb-4">
              <div className="min-w-0">
                <h2 className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold text-[var(--sf-ink)]">{selectedList.name}</h2>
                <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">Updated {new Date(selectedList.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <UrbanButton type="button" onClick={handleAddListToCart} disabled={isPending}><ShoppingCart className="h-4 w-4" /> Add all</UrbanButton>
                <UrbanButton type="button" variant="ghost" onClick={handleDeleteList} disabled={isPending}><Trash2 className="h-4 w-4" /> Delete</UrbanButton>
              </div>
            </div>

            <div className="mt-4 flex min-w-0 gap-2">
              <UrbanTextInput value={quickAddItem} onChange={(event) => setQuickAddItem(event.target.value)} placeholder="Add item…" className="min-w-0 flex-1" />
              <UrbanButton type="button" onClick={handleQuickAdd} disabled={isPending || !quickAddItem.trim()} className="shrink-0">Add</UrbanButton>
            </div>

            <div className="mt-4 space-y-2">
              {selectedList.items.map((item) => (
                <div key={item.id} className="grid gap-2 border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-3 sm:grid-cols-[auto_minmax(0,1fr)_120px_auto] sm:items-center">
                  <button type="button" onClick={() => handleToggleItem(item.id)} className={`flex h-8 w-8 shrink-0 items-center justify-center border ${item.checked ? 'border-[var(--sf-info-bg)] bg-[var(--sf-info-bg)] text-[var(--sf-info)]' : 'border-[var(--sf-rule)] text-[var(--sf-ink-faint)]'}`}>
                    {item.checked ? <Check className="h-4 w-4" /> : null}
                  </button>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${item.checked ? 'text-[var(--sf-ink-faint)] line-through' : 'text-[var(--sf-ink)]'}`}>{item.name}</p>
                    {item.notes ? <p className="text-xs text-[var(--sf-ink-muted)]">{item.notes}</p> : null}
                  </div>
                  <div className="grid grid-cols-3 border border-[var(--sf-rule-strong)]">
                    <button type="button" onClick={() => handleQuantityChange(item.id, Math.max(1, item.quantity - 1))} className="text-[var(--sf-accent)]">−</button>
                    <span className="border-x border-[var(--sf-rule)] py-1 text-center text-sm">{item.quantity}</span>
                    <button type="button" onClick={() => handleQuantityChange(item.id, item.quantity + 1)} className="text-[var(--sf-accent)]">+</button>
                  </div>
                  <button type="button" onClick={() => handleRemoveItem(item.id)} className="text-sm text-[var(--sf-danger)]">Remove</button>
                </div>
              ))}
              {selectedList.items.length === 0 ? <UrbanEmptyState title="List is empty">Add items above to build this run.</UrbanEmptyState> : null}
            </div>
          </div>
        ) : (
          <UrbanEmptyState title="No active list">Create a list to get started.</UrbanEmptyState>
        )}
      </div>
    </div>
  );
}
