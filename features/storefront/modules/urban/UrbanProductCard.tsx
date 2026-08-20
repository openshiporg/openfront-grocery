'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Leaf, Plus, Snowflake } from 'lucide-react';

import { addToCart } from '@/features/storefront/lib/data/cart';
import type { GroceryProduct } from '@/features/storefront/types';
import { formatMoney, formatUnit, UrbanBadge, UrbanButton, UrbanProductArtwork } from './UrbanPrimitives';

interface UrbanProductCardProps {
  product: GroceryProduct;
  featured?: boolean;
}

export default function UrbanProductCard({ product, featured = false }: UrbanProductCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const unit = formatUnit(product.unit);
  const hasSavings = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price;
  const savings = useMemo(() => {
    if (!hasSavings || !product.compareAtPrice) return null;
    return Math.max(1, Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100));
  }, [hasSavings, product.compareAtPrice, product.price]);

  async function handleAdd(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!product.inStock || isAdding) return;
    setIsAdding(true);
    try {
      const cart = await addToCart(product.id, 1);
      if (!cart) throw new Error('Could not add item to cart');
      setAddedCount((count) => count + 1);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <article className={`group flex h-full flex-col border border-[var(--sf-rule)] bg-[var(--sf-paper)] transition hover:border-[var(--sf-rule-strong)] ${featured ? 'lg:grid lg:grid-cols-2' : ''}`}>
      <Link href={`/products/${product.handle}`} className={`relative block overflow-hidden bg-[var(--sf-paper-3)] ${featured ? 'min-h-[280px]' : 'aspect-[4/5]'}`}>
        <UrbanProductArtwork product={product} className="h-full w-full transition duration-[var(--sf-dur-normal)] group-hover:scale-[1.02]" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {product.organicCertified ? <UrbanBadge><Leaf className="h-3 w-3" /> Organic</UrbanBadge> : null}
          {product.isPerishable ? <UrbanBadge tone="blue"><Snowflake className="h-3 w-3" /> Chilled</UrbanBadge> : null}
        </div>
        {savings ? <UrbanBadge tone="orange" className="absolute right-2 top-2">−{savings}%</UrbanBadge> : null}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link href={`/products/${product.handle}`} className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--sf-ink-faint)]">{product.department?.name || 'Catalog'}</p>
          <h3 className={`mt-1 line-clamp-2 font-[family-name:var(--sf-font-display)] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--sf-ink)] ${featured ? 'text-2xl' : 'text-lg'}`}>
            {product.name}
          </h3>
        </Link>

        <div className="mt-4 flex items-end justify-between gap-2 border-t border-[var(--sf-rule)] pt-3">
          <div>
            <p className="font-[family-name:var(--sf-font-display)] text-xl font-semibold text-[var(--sf-ink)]">{formatMoney(product.price)}</p>
            <p className="text-xs text-[var(--sf-ink-muted)]">per {unit}</p>
            {hasSavings ? <p className="text-xs text-[var(--sf-ink-faint)] line-through">{formatMoney(product.compareAtPrice)}</p> : null}
          </div>
          {!product.inStock ? <UrbanBadge tone="danger">Out</UrbanBadge> : product.stockQuantity > 0 && product.stockQuantity < 10 ? <UrbanBadge tone="orange">{product.stockQuantity} left</UrbanBadge> : null}
        </div>

        {product.inStock ? (
          <UrbanButton
            type="button"
            onClick={handleAdd}
            disabled={isAdding}
            variant={addedCount > 0 ? 'ghost' : 'primary'}
            className="mt-3 w-full"
          >
            {addedCount > 0 ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isAdding ? 'Adding…' : addedCount > 0 ? `Added (${addedCount})` : 'Add to basket'}
          </UrbanButton>
        ) : (
          <Link href={`/products/${product.handle}`} className="mt-3 inline-flex w-full items-center justify-center border border-[var(--sf-rule-strong)] px-4 py-2.5 text-sm font-medium text-[var(--sf-accent)] hover:bg-[var(--sf-paper-2)]">
            View restock options
          </Link>
        )}
      </div>
    </article>
  );
}
