'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Leaf, Package, Plus, Snowflake, Zap } from 'lucide-react';

import { addToCart } from '@/features/storefront/lib/data/cart';
import type { GroceryProduct } from '@/features/storefront/types';
import { formatMoney, formatUnit, productImage, UrbanBadge } from './UrbanPrimitives';

interface UrbanProductCardProps {
  product: GroceryProduct;
  featured?: boolean;
}

export default function UrbanProductCard({ product, featured = false }: UrbanProductCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const unit = formatUnit(product.unit);
  const image = productImage(product);
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
      await addToCart(product.id, 1);
      setAddedCount((count) => count + 1);
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { increment: 1 } }));
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <Link href={`/products/${product.handle}`} className={`group flex h-full flex-col border border-[#5a4136] bg-[#1e2020] transition hover:border-[#ffb693] ${featured ? 'md:grid md:grid-cols-[0.9fr_1.1fr]' : ''}`}>
      <div className={`relative overflow-hidden bg-[#282a2b] ${featured ? 'min-h-[300px] md:h-full' : 'aspect-square'}`}>
        {image ? (
          <img src={image} alt={product.name} className="h-full w-full object-cover opacity-75 mix-blend-luminosity transition duration-500 group-hover:scale-[1.04] group-hover:opacity-100 group-hover:mix-blend-normal" />
        ) : (
          <div className="flex h-full items-center justify-center"><Package className="h-12 w-12 text-[#ffb693]/45" /></div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-2">
          {product.organicCertified ? <UrbanBadge><Leaf className="h-3 w-3" /> Organic</UrbanBadge> : null}
          {product.isPerishable ? <UrbanBadge tone="blue"><Snowflake className="h-3 w-3" /> Cold</UrbanBadge> : null}
        </div>
        {savings ? <UrbanBadge tone="danger" className="absolute right-2 top-2">-{savings}%</UrbanBadge> : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-market-label text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#e2bfb0]">{product.department?.name || 'Urban supply'}</p>
            <h3 className={`mt-2 line-clamp-2 font-market-label font-black uppercase leading-[1.02] tracking-[-0.02em] text-[#e2e2e2] ${featured ? 'text-3xl' : 'min-h-[2.5rem] text-xl'}`}>{product.name}</h3>
          </div>
          {product.inStock ? <UrbanBadge tone="muted">Live</UrbanBadge> : <UrbanBadge tone="danger">Out</UrbanBadge>}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-[#5a4136] pt-4">
          <div>
            <div className="font-market-label text-3xl font-black tracking-[-0.04em] text-[#ffb693]">{formatMoney(product.price)}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#e2bfb0]">/ {unit}</div>
            {hasSavings ? <div className="mt-1 text-xs text-[#e2bfb0] line-through">{formatMoney(product.compareAtPrice)}</div> : null}
          </div>
          {product.stockQuantity > 0 && product.stockQuantity < 10 ? <UrbanBadge tone="orange"><Zap className="h-3 w-3" /> {product.stockQuantity} left</UrbanBadge> : null}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!product.inStock || isAdding}
          className={`mt-5 inline-flex w-full items-center justify-center gap-2 border-2 px-4 py-3 font-market-label text-xs font-black uppercase tracking-[0.16em] transition ${
            !product.inStock || isAdding
              ? 'cursor-not-allowed border-[#333535] bg-[#333535] text-[#e2bfb0]'
              : addedCount > 0
                ? 'border-[#b6c6ed] bg-[#b6c6ed] text-[#20304f] hover:bg-transparent hover:text-[#b6c6ed]'
                : 'border-[#ffb693] bg-[#ffb693] text-[#561f00] hover:bg-transparent hover:text-[#ffb693]'
          }`}
        >
          {addedCount > 0 ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {!product.inStock ? 'Unavailable' : isAdding ? 'Adding' : addedCount > 0 ? `Added ${addedCount}` : 'Add to cart'}
        </button>
      </div>
    </Link>
  );
}
