'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Leaf, Snowflake, ShoppingBasket } from 'lucide-react';
import type { GroceryProduct } from '@/features/storefront/types';
import { addToCart } from '@/features/storefront/lib/data/cart';

interface ProductCardProps {
  product: GroceryProduct;
}

export default function ProductCardGrocery({ product }: ProductCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [addedCount, setAddedCount] = useState(0);

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!product.inStock || isAdding) return;

    setIsAdding(true);
    try {
      await addToCart(product.id, 1);
      setAddedCount((count) => count + 1);
    } catch (error) {
      console.error('Error adding to cart:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const badge = product.department?.name || (product.isPerishable ? 'Fresh' : 'Pantry');

  return (
    <Link
      href={`/products/${product.handle}`}
      className="group relative overflow-hidden rounded-[1.5rem] border border-emerald-950/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(247,250,244,0.97))] p-4 shadow-[0_24px_45px_-38px_rgba(18,56,34,0.55)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_55px_-34px_rgba(18,56,34,0.7)]"
    >
      <div className="absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-900 shadow-sm">
          {badge}
        </span>
        {!product.inStock ? (
          <span className="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-800">
            Out
          </span>
        ) : addedCount > 0 ? (
          <span className="rounded-full bg-emerald-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
            Added {addedCount}
          </span>
        ) : null}
      </div>

      <div className="relative overflow-hidden rounded-[1.2rem] bg-[linear-gradient(180deg,rgba(240,247,238,1),rgba(251,248,241,1))] aspect-[1/1]">
        <div className="absolute inset-x-6 bottom-3 h-6 rounded-full bg-emerald-950/8 blur-xl" />
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-6xl">🛒</div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-1">
          <h3 className="line-clamp-2 min-h-[3rem] text-base font-semibold text-zinc-950">
            {product.name}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            {product.unit && <span>{product.unit}</span>}
            {product.organicCertified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-900">
                <Leaf className="h-3 w-3" /> Organic
              </span>
            )}
            {product.isPerishable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 font-medium text-sky-900">
                <Snowflake className="h-3 w-3" /> Fresh chain
              </span>
            )}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold tracking-tight text-zinc-950">
              ${product.price.toFixed(2)}
            </div>
            {product.unitPrice && product.unitPrice !== product.price && (
              <div className="text-xs text-zinc-500">
                ${product.unitPrice.toFixed(2)} / {product.unit || 'ea'}
              </div>
            )}
          </div>
          {product.stockQuantity > 0 && product.stockQuantity < 10 ? (
            <div className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900">
              Only {product.stockQuantity} left
            </div>
          ) : (
            <div className="text-xs font-medium text-zinc-500">
              {product.inStock ? 'Ready for pickup or delivery' : 'Restocking soon'}
            </div>
          )}
        </div>

        <button
          onClick={handleQuickAdd}
          disabled={!product.inStock || isAdding}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition-colors ${
            !product.inStock || isAdding
              ? 'cursor-not-allowed bg-zinc-200 text-zinc-500'
              : 'bg-emerald-700 text-white hover:bg-emerald-800'
          }`}
        >
          <ShoppingBasket className="h-4 w-4" />
          {!product.inStock ? 'Unavailable right now' : isAdding ? 'Adding to cart…' : addedCount > 0 ? 'Add another' : 'Add to cart'}
        </button>
      </div>
    </Link>
  );
}
