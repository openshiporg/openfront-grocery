'use client';

import Link from 'next/link';
import type { GroceryProduct } from '@/features/storefront/types';

interface ProductCardProps {
  product: GroceryProduct;
  countryCode: string;
}

export default function ProductCard({ product, countryCode }: ProductCardProps) {
  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    // TODO: Implement add to cart functionality
    console.log('Add to cart:', product.id);
  };

  return (
    <Link
      href={`/${countryCode}/products/${product.handle}`}
      className="group border border-border rounded-lg p-4 hover:shadow-md transition-all duration-200"
    >
      <div className="aspect-square bg-muted rounded-md mb-3 flex items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <span className="text-4xl">📦</span>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="font-medium text-sm text-foreground line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>

        <div className="flex items-baseline gap-1">
          <span className="font-semibold text-foreground">
            ${product.price.toFixed(2)}
          </span>
          {product.unit && (
            <span className="text-xs text-muted-foreground">/ {product.unit}</span>
          )}
        </div>

        {product.unitPrice && product.unitPrice !== product.price && (
          <p className="text-xs text-muted-foreground">
            ${product.unitPrice.toFixed(2)} / unit
          </p>
        )}

        {product.isPerishable && (
          <span className="inline-block text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            Perishable
          </span>
        )}

        {!product.inStock ? (
          <span className="text-xs text-destructive">Out of stock</span>
        ) : product.stockQuantity < 10 ? (
          <span className="text-xs text-amber-600">Low stock</span>
        ) : null}
      </div>

      <button
        onClick={handleAddToCart}
        disabled={!product.inStock}
        className="mt-3 w-full py-2 px-4 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {product.inStock ? 'Add to Cart' : 'Out of Stock'}
      </button>
    </Link>
  );
}
