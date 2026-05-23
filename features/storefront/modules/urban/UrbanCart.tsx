'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Package, Trash2 } from 'lucide-react';

import { removeFromCart, updateCartItem, updateSubstitutionPreference } from '@/features/storefront/lib/data/cart';
import type { GroceryCart, GroceryCartItem, GroceryUser } from '@/features/storefront/types';
import { UrbanBadge, UrbanButton, UrbanButtonLink, UrbanEmptyState, UrbanPanel, UrbanSelect, formatMoney, formatUnit, productImage } from './UrbanPrimitives';

function CartLine({ item, onChanged }: { item: GroceryCartItem; onChanged: () => void }) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [isPending, startTransition] = useTransition();
  const image = productImage(item.product);

  const updateQuantity = (next: number) => {
    const safe = Math.max(1, next);
    setQuantity(safe);
    startTransition(async () => {
      await updateCartItem(item.id, safe);
      onChanged();
    });
  };

  return (
    <UrbanPanel className="grid gap-4 p-3 sm:grid-cols-[112px_1fr_auto]">
      <Link href={`/products/${item.product.handle}`} className="flex h-28 w-28 items-center justify-center bg-[#282a2b]">
        {image ? <img src={image} alt={item.product.name} className="h-full w-full object-cover opacity-80 mix-blend-luminosity" /> : <Package className="h-8 w-8 text-[#ffb693]/45" />}
      </Link>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start gap-2">
          <h3 className="font-market-label text-2xl font-black uppercase leading-none tracking-[-0.03em] text-[#e2e2e2]">{item.product.name}</h3>
          <UrbanBadge tone="muted">{formatUnit(item.product.unit)}</UrbanBadge>
        </div>
        <p className="mt-2 font-market-label text-2xl font-black text-[#ffb693]">{formatMoney(item.product.price)}</p>
        <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-[160px_1fr]">
          <div className="grid grid-cols-3 border border-[#5a4136] bg-[#282a2b]">
            <button onClick={() => updateQuantity(quantity - 1)} disabled={isPending} className="px-3 py-2 font-market-label text-lg font-black text-[#ffb693] hover:bg-[#333535]">-</button>
            <span className="border-x border-[#5a4136] px-4 py-2 text-center font-market-label text-lg font-black text-[#e2e2e2]">{quantity}</span>
            <button onClick={() => updateQuantity(quantity + 1)} disabled={isPending} className="px-3 py-2 font-market-label text-lg font-black text-[#ffb693] hover:bg-[#333535]">+</button>
          </div>
          <UrbanSelect defaultValue={item.substitutionPreference || 'allow'} onChange={(event) => startTransition(async () => { await updateSubstitutionPreference(item.id, event.target.value as any); onChanged(); })}>
            <option value="allow">Best substitute</option>
            <option value="contact">Contact me</option>
            <option value="remove">Remove if unavailable</option>
          </UrbanSelect>
        </div>
      </div>
      <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-end">
        <p className="font-market-label text-3xl font-black text-[#ffb693]">{formatMoney(item.subtotal)}</p>
        <button onClick={() => startTransition(async () => { await removeFromCart(item.id); onChanged(); })} disabled={isPending} className="inline-flex items-center gap-2 border border-[#5a4136] px-3 py-2 font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#e2bfb0] hover:border-[#ffb4ab] hover:text-[#ffb4ab]">
          <Trash2 className="h-4 w-4" /> Remove
        </button>
      </div>
    </UrbanPanel>
  );
}

export default function UrbanCart({ cart, user }: { cart: GroceryCart | null; user?: GroceryUser | null }) {
  const [, setVersion] = useState(0);
  const bump = () => setVersion((value) => value + 1);

  if (!cart || cart.items.length === 0) {
    return <UrbanEmptyState title="Basket is empty" actionHref="/products" actionLabel="Deploy essentials">Add live inventory to your Urban Express basket.</UrbanEmptyState>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        {cart.items.map((item) => <CartLine key={item.id} item={item} onChanged={bump} />)}
      </div>
      <UrbanPanel className="h-max p-5">
        <h2 className="font-market-label text-3xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">Order signal</h2>
        <div className="mt-5 space-y-3 border-y border-[#5a4136] py-5 text-sm text-[#e2bfb0]">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(cart.subtotal)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{formatMoney(cart.tax)}</span></div>
          <div className="flex justify-between"><span>Delivery fee</span><span>{formatMoney(cart.deliveryFee)}</span></div>
          <div className="flex justify-between font-market-label text-3xl font-black uppercase text-[#ffb693]"><span>Total</span><span>{formatMoney(cart.total)}</span></div>
        </div>
        <UrbanButtonLink href="/checkout" className="mt-5 w-full">Secure checkout</UrbanButtonLink>
        {!user ? <Link href="/dashboard/signin?from=/cart" className="mt-3 block text-center font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#b6c6ed]">Sign in for saved slots</Link> : null}
      </UrbanPanel>
    </div>
  );
}
