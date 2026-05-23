'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, ShoppingCart, Trash2 } from 'lucide-react';

import type { ShoppingList } from '@/features/storefront/types';
import { addItemToList, addShoppingListToCart, createShoppingList, deleteShoppingList, removeListItem, toggleListItem, updateListItemQuantity } from '@/features/storefront/lib/data/lists';
import { UrbanBadge, UrbanButton, UrbanEmptyState, UrbanPanel, UrbanTextInput } from '@/features/storefront/modules/urban/UrbanPrimitives';

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
      <UrbanPanel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_420px] lg:items-end">
          <div>
            <h2 className="font-market-label text-3xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">My shopping lists</h2>
            <p className="mt-2 text-sm text-[#e2bfb0]">Build reusable grocery runs and send entire lists back into cart.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <UrbanTextInput value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="New list name" />
            <UrbanButton type="button" onClick={handleCreateList} disabled={isPending || !newListName.trim()}><Plus className="h-4 w-4" /> Create</UrbanButton>
          </div>
        </div>
      </UrbanPanel>

      {(message || error) ? <div className={`border px-4 py-3 text-sm ${error ? 'border-[#ffb4ab] bg-[#331718] text-[#ffb4ab]' : 'border-[#b6c6ed] bg-[#182033] text-[#b6c6ed]'}`}>{error || message}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <UrbanPanel className="h-max p-4">
          <h3 className="font-market-label text-xl font-black uppercase tracking-[-0.02em] text-[#ffb693]">List stack</h3>
          <div className="mt-4 space-y-2">
            {lists.map((list) => {
              const completion = list.itemCount ? Math.round(((list.checkedCount || 0) / list.itemCount) * 100) : 0;
              const active = list.id === selectedList?.id;
              return (
                <button key={list.id} type="button" onClick={() => setSelectedListId(list.id)} className={`w-full border p-4 text-left transition ${active ? 'border-[#ffb693] bg-[#282a2b]' : 'border-[#5a4136] bg-[#1e2020] hover:border-[#ffb693]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-market-label text-lg font-black uppercase text-[#e2e2e2]">{list.name}</p>
                      <p className="text-xs text-[#e2bfb0]">{list.itemCount || list.items.length} items · {list.checkedCount || 0} checked</p>
                    </div>
                    {list.isDefault ? <UrbanBadge tone="muted">Default</UrbanBadge> : null}
                  </div>
                  <div className="mt-3 h-2 bg-[#333535]"><div className="h-full bg-[#ff6b00]" style={{ width: `${completion}%` }} /></div>
                </button>
              );
            })}
            {lists.length === 0 ? <p className="text-sm text-[#e2bfb0]">Create your first list to start planning repeat shops.</p> : null}
          </div>
        </UrbanPanel>

        {selectedList ? (
          <UrbanPanel className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#5a4136] pb-4">
              <div>
                <h2 className="font-market-label text-4xl font-black uppercase tracking-[-0.05em] text-[#e2e2e2]">{selectedList.name}</h2>
                <p className="mt-1 text-sm text-[#e2bfb0]">Updated {new Date(selectedList.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <UrbanButton type="button" onClick={handleAddListToCart} disabled={isPending}><ShoppingCart className="h-4 w-4" /> Add all</UrbanButton>
                <UrbanButton type="button" variant="ghost" onClick={handleDeleteList} disabled={isPending}><Trash2 className="h-4 w-4" /> Delete</UrbanButton>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <UrbanTextInput value={quickAddItem} onChange={(event) => setQuickAddItem(event.target.value)} placeholder="Add item, e.g. oat milk" />
              <UrbanButton type="button" onClick={handleQuickAdd} disabled={isPending || !quickAddItem.trim()}>Add item</UrbanButton>
            </div>

            <div className="mt-5 space-y-2">
              {selectedList.items.map((item) => (
                <div key={item.id} className="grid gap-3 border border-[#5a4136] bg-[#282a2b] p-3 sm:grid-cols-[auto_1fr_140px_auto] sm:items-center">
                  <button type="button" onClick={() => handleToggleItem(item.id)} className={`flex h-8 w-8 items-center justify-center border ${item.checked ? 'border-[#b6c6ed] bg-[#b6c6ed] text-[#20304f]' : 'border-[#5a4136] text-[#e2bfb0]'}`}>{item.checked ? <Check className="h-4 w-4" /> : null}</button>
                  <div>
                    <p className={`font-market-label text-lg font-black uppercase ${item.checked ? 'text-[#e2bfb0] line-through' : 'text-[#e2e2e2]'}`}>{item.name}</p>
                    {item.notes ? <p className="text-xs text-[#e2bfb0]">{item.notes}</p> : null}
                  </div>
                  <div className="grid grid-cols-3 border border-[#5a4136]">
                    <button type="button" onClick={() => handleQuantityChange(item.id, Math.max(1, item.quantity - 1))} className="text-[#ffb693]">-</button>
                    <span className="border-x border-[#5a4136] py-2 text-center text-sm text-[#e2e2e2]">{item.quantity}</span>
                    <button type="button" onClick={() => handleQuantityChange(item.id, item.quantity + 1)} className="text-[#ffb693]">+</button>
                  </div>
                  <button type="button" onClick={() => handleRemoveItem(item.id)} className="font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#ffb4ab]">Remove</button>
                </div>
              ))}
              {selectedList.items.length === 0 ? <UrbanEmptyState title="List is empty">Add staples above to start this run.</UrbanEmptyState> : null}
            </div>
          </UrbanPanel>
        ) : (
          <UrbanEmptyState title="No active list">Create a list to start staging recurring grocery runs.</UrbanEmptyState>
        )}
      </div>
    </div>
  );
}
