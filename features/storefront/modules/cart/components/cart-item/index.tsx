'use client';

import type { GroceryCartItem } from '@/features/storefront/types';
import { useState } from 'react';

interface CartItemProps {
  item: GroceryCartItem;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onUpdateSubstitution: (itemId: string, preference: 'allow' | 'contact' | 'remove') => void;
}

export default function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
  onUpdateSubstitution,
}: CartItemProps) {
  const [showSubstitution, setShowSubstitution] = useState(false);

  return (
    <div className="flex gap-4 p-4 border border-border rounded-lg">
      {/* Product Image */}
      <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
        {item.product.imageUrl ? (
          <img
            src={item.product.imageUrl}
            alt={item.product.name}
            className="w-full h-full object-cover rounded-md"
          />
        ) : (
          <span className="text-2xl">📦</span>
        )}
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground truncate">{item.product.name}</h3>
        <p className="text-sm text-muted-foreground">
          ${item.product.price.toFixed(2)}
          {item.product.unit && ` / ${item.product.unit}`}
        </p>

        {/* Quantity Controls */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center border border-border rounded-md">
            <button
              onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
              className="px-3 py-1 hover:bg-accent text-sm"
              aria-label="Decrease quantity"
            >
              -
            </button>
            <span className="px-3 py-1 border-x border-border text-sm min-w-[40px] text-center">
              {item.quantity}
            </span>
            <button
              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              className="px-3 py-1 hover:bg-accent text-sm"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            onClick={() => onRemove(item.id)}
            className="text-sm text-destructive hover:underline"
          >
            Remove
          </button>
        </div>

        {/* Substitution Preference */}
        <div className="mt-3">
          <button
            onClick={() => setShowSubstitution(!showSubstitution)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <span>If unavailable: {item.substitutionPreference === 'allow' ? 'Substitute' : item.substitutionPreference === 'contact' ? 'Contact me' : 'Remove'}</span>
            <svg
              className={`w-3 h-3 transition-transform ${showSubstitution ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showSubstitution && (
            <div className="mt-2 space-y-1">
              {(['allow', 'contact', 'remove'] as const).map((pref) => (
                <label key={pref} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name={`substitution-${item.id}`}
                    checked={item.substitutionPreference === pref}
                    onChange={() => onUpdateSubstitution(item.id, pref)}
                    className="w-3 h-3"
                  />
                  {pref === 'allow' && 'Substitute with similar item'}
                  {pref === 'contact' && 'Contact me for approval'}
                  {pref === 'remove' && 'Remove from order'}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subtotal */}
      <div className="text-right flex-shrink-0">
        <span className="font-medium">${item.subtotal.toFixed(2)}</span>
      </div>
    </div>
  );
}
