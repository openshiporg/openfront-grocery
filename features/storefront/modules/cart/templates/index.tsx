'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GroceryCart, GroceryUser, DeliveryWindow } from '@/features/storefront/types';
import CartItem from '../components/cart-item';
import DeliveryScheduler from '../components/delivery-scheduler';

interface CartTemplateProps {
  cart: GroceryCart | null;
  user: GroceryUser | null;
}

export default function CartTemplate({ cart: initialCart, user }: CartTemplateProps) {
  const [cart, setCart] = useState(initialCart);
  const [selectedDeliveryWindow, setSelectedDeliveryWindow] = useState<DeliveryWindow | null>(null);
  const [globalSubstitution, setGlobalSubstitution] = useState<'allow' | 'contact' | 'remove'>('allow');

  // Calculate totals including delivery fee
  const deliveryFee = selectedDeliveryWindow?.fee || cart?.deliveryFee || 0;
  const subtotal = cart?.subtotal || 0;
  const tax = cart?.tax || 0;
  const total = subtotal + tax + deliveryFee;

  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    if (!cart) return;

    // Optimistic update
    setCart({
      ...cart,
      items: cart.items.map((item) =>
        item.id === itemId
          ? { ...item, quantity, subtotal: item.product.price * quantity }
          : item
      ),
      subtotal: cart.items.reduce((sum, item) =>
        item.id === itemId
          ? sum + item.product.price * quantity
          : sum + item.subtotal,
        0
      ),
    });

    // Call API to update cart
    const { updateCartItem } = await import('@/features/storefront/lib/data/cart');
    const updatedCart = await updateCartItem(itemId, quantity);
    if (updatedCart) {
      setCart(updatedCart);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!cart) return;

    // Optimistic update
    const newItems = cart.items.filter((item) => item.id !== itemId);
    setCart({
      ...cart,
      items: newItems,
      itemCount: newItems.length,
      subtotal: newItems.reduce((sum, item) => sum + item.subtotal, 0),
    });

    // Call API to remove from cart
    const { removeFromCart } = await import('@/features/storefront/lib/data/cart');
    const updatedCart = await removeFromCart(itemId);
    if (updatedCart) {
      setCart(updatedCart);
    }
  };

  const handleUpdateSubstitution = async (itemId: string, preference: 'allow' | 'contact' | 'remove') => {
    if (!cart) return;

    // Optimistic update
    setCart({
      ...cart,
      items: cart.items.map((item) =>
        item.id === itemId ? { ...item, substitutionPreference: preference } : item
      ),
    });

    // Call API to update substitution preference
    const { updateSubstitutionPreference } = await import('@/features/storefront/lib/data/cart');
    const updatedCart = await updateSubstitutionPreference(itemId, preference);
    if (updatedCart) {
      setCart(updatedCart);
    }
  };

  const applyGlobalSubstitution = async () => {
    if (!cart) return;

    // Update all items locally first
    const updatedItems = cart.items.map((item) => ({
      ...item,
      substitutionPreference: globalSubstitution,
    }));

    setCart({
      ...cart,
      items: updatedItems,
    });

    // Call API to update all items
    const { updateSubstitutionPreference } = await import('@/features/storefront/lib/data/cart');
    for (const item of cart.items) {
      await updateSubstitutionPreference(item.id, globalSubstitution);
    }
  };

  if (!cart || cart.items.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-16 text-center">
        <span className="text-6xl block mb-4">🛒</span>
        <h1 className="text-3xl font-bold text-foreground mb-4">Your Cart is Empty</h1>
        <p className="text-muted-foreground mb-8">
          Add some fresh groceries to get started!
        </p>
        <Link
          href="/products"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          Browse Departments
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-8">Your Cart</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Global Substitution Preference */}
          <div className="p-4 border border-border rounded-lg bg-muted/30">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-medium text-sm">Default substitution preference</h3>
                <p className="text-xs text-muted-foreground">Apply to all items</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={globalSubstitution}
                  onChange={(e) => setGlobalSubstitution(e.target.value as typeof globalSubstitution)}
                  className="text-sm border border-border rounded-md px-2 py-1 bg-background"
                >
                  <option value="allow">Substitute</option>
                  <option value="contact">Contact me</option>
                  <option value="remove">Remove item</option>
                </select>
                <button
                  onClick={applyGlobalSubstitution}
                  className="text-xs px-3 py-1 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
                >
                  Apply to all
                </button>
              </div>
            </div>
          </div>

          {/* Cart Items List */}
          <div className="space-y-4">
            {cart.items.map((item) => (
              <CartItem
                key={item.id}
                item={item}
                onUpdateQuantity={handleUpdateQuantity}
                onRemove={handleRemoveItem}
                onUpdateSubstitution={handleUpdateSubstitution}
              />
            ))}
          </div>

          {/* Delivery Scheduling */}
          <div className="p-4 border border-border rounded-lg">
            <DeliveryScheduler
              selectedWindow={selectedDeliveryWindow}
              onSelectWindow={setSelectedDeliveryWindow}
            />
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="border border-border rounded-lg p-6 sticky top-24">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Subtotal ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})
                </dt>
                <dd>${subtotal.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery Fee</dt>
                <dd>
                  {deliveryFee === 0 ? (
                    <span className="text-green-600">FREE</span>
                  ) : (
                    `$${deliveryFee.toFixed(2)}`
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Estimated Tax</dt>
                <dd>${tax.toFixed(2)}</dd>
              </div>
              <div className="pt-3 border-t border-border flex justify-between font-semibold">
                <dt>Total</dt>
                <dd>${total.toFixed(2)}</dd>
              </div>
            </dl>

            {!selectedDeliveryWindow && (
              <p className="mt-4 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                Please select a delivery window to proceed
              </p>
            )}

            <Link
              href={selectedDeliveryWindow ? '/checkout' : '#'}
              onClick={(e) => !selectedDeliveryWindow && e.preventDefault()}
              className={`mt-6 w-full inline-flex items-center justify-center px-6 py-3 rounded-md font-medium transition-colors ${
                selectedDeliveryWindow
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              Proceed to Checkout
            </Link>

            {/* Promo Code */}
            <div className="mt-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Promo code"
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background"
                />
                <button className="px-3 py-2 text-sm border border-border rounded-md hover:bg-accent">
                  Apply
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground text-center">
              Free delivery on orders over $35
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
