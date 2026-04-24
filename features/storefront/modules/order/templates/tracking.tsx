'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Clock, Package, Truck, Home } from 'lucide-react';
import type { GroceryOrder } from '@/features/storefront/types';
import { addToCart } from '@/features/storefront/lib/data/cart';
import { useState } from 'react';

interface OrderTrackingTemplateProps {
  order: GroceryOrder;
}

const statusSteps = [
  { status: 'pending', label: 'Order Placed', icon: Check },
  { status: 'confirmed', label: 'Confirmed', icon: Clock },
  { status: 'picking', label: 'Picking Items', icon: Package },
  { status: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
  { status: 'delivered', label: 'Delivered', icon: Home },
] as const;

export default function OrderTrackingTemplate({ order }: OrderTrackingTemplateProps) {
  const router = useRouter();
  const [isReordering, setIsReordering] = useState(false);

  const currentStepIndex = statusSteps.findIndex(step => step.status === order.status);

  const getDeliveryCountdown = () => {
    if (!order.deliverySlot) return null;

    const deliveryDate = new Date(order.deliverySlot.date);
    const [hours, minutes] = order.deliverySlot.endTime.split(':');
    deliveryDate.setHours(parseInt(hours), parseInt(minutes), 0);

    const now = new Date();
    const diff = deliveryDate.getTime() - now.getTime();

    if (diff < 0) return 'Delivery window has passed';

    const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
    const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hoursLeft > 24) {
      const daysLeft = Math.floor(hoursLeft / 24);
      return `${daysLeft} day${daysLeft > 1 ? 's' : ''} remaining`;
    }

    return `${hoursLeft}h ${minutesLeft}m remaining`;
  };

  const handleReorder = async () => {
    setIsReordering(true);
    try {
      for (const item of order.items) {
        if (item.product?.id) {
          await addToCart(item.product.id, item.quantity);
        }
      }
      router.push('/cart');
    } catch (error) {
      console.error('Error reordering:', error);
      alert('Failed to add items to cart. Please try again.');
    } finally {
      setIsReordering(false);
    }
  };

  const formatAddress = () => {
    if (!order.shippingAddress) return 'No address provided';
    const { address1, city, province, postalCode } = order.shippingAddress;
    return `${address1}, ${city}, ${province} ${postalCode}`;
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Order Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-foreground">
            Order #{order.orderNumber}
          </h1>
          <button
            onClick={handleReorder}
            disabled={isReordering}
            className="px-4 py-2 border border-border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReordering ? 'Adding to cart...' : 'Reorder'}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Placed on {new Date(order.createdAt).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Order Status Timeline */}
      <div className="bg-white border border-border rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-6">Order Status</h2>

        <div className="relative">
          <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-border" />
          <div
            className="absolute left-6 top-6 w-0.5 bg-green-600 transition-all duration-500"
            style={{ height: `${(currentStepIndex / (statusSteps.length - 1)) * 100}%` }}
          />

          <div className="space-y-8 relative">
            {statusSteps.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;

              return (
                <div key={step.status} className="flex items-start gap-4">
                  <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 transition-colors ${
                    isCompleted
                      ? 'bg-green-600 border-green-600'
                      : 'bg-white border-border'
                  }`}>
                    <Icon className={`w-5 h-5 ${isCompleted ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 pt-2">
                    <h3 className={`font-medium ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {step.label}
                    </h3>
                    {isCurrent && order.status !== 'delivered' && (
                      <p className="text-sm text-green-600 mt-1">
                        {step.status === 'pending' && 'We received your order'}
                        {step.status === 'confirmed' && 'Your order is confirmed and will be picked soon'}
                        {step.status === 'picking' && 'Your personal shopper is selecting your items'}
                        {step.status === 'out_for_delivery' && 'Your order is on the way!'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Order Items */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Order Items</h2>
            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-4 pb-4 border-b border-border last:border-0">
                  <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover rounded-md"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.product?.handle ? (
                      <Link
                        href={`/products/${item.product.handle}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{item.title}</span>
                    )}
                    <p className="text-sm text-muted-foreground">
                      ${(item.unit_price / 100).toFixed(2)} x {item.quantity}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">${((item.unit_price * item.quantity) / 100).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Delivery Info & Summary */}
        <div className="space-y-6">
          {/* Delivery Window */}
          {order.status !== 'delivered' && order.deliverySlot && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h3 className="font-semibold text-green-900 mb-2">Delivery Window</h3>
              <p className="text-lg font-medium text-green-900">
                {new Date(order.deliverySlot.date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <p className="text-green-700">
                {order.deliverySlot.startTime} - {order.deliverySlot.endTime}
              </p>
              <p className="text-sm text-green-600 mt-2">
                {getDeliveryCountdown()}
              </p>
            </div>
          )}

          {/* Delivery Address */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-3">Delivery Address</h3>
            <p className="text-sm text-foreground">{formatAddress()}</p>
            {order.deliveryInstructions && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Delivery Instructions
                </p>
                <p className="text-sm text-foreground">{order.deliveryInstructions}</p>
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-4">Order Summary</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium">${(order.subtotal / 100).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery Fee</dt>
                <dd className="font-medium">
                  {order.shipping_total === 0 ? (
                    <span className="text-green-600">FREE</span>
                  ) : (
                    `$${(order.shipping_total / 100).toFixed(2)}`
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="font-medium">${(order.tax_total / 100).toFixed(2)}</dd>
              </div>
              <div className="pt-3 border-t border-border flex justify-between font-semibold text-base">
                <dt>Total</dt>
                <dd>${(order.total / 100).toFixed(2)}</dd>
              </div>
            </dl>
          </div>

          {/* Help Section */}
          <div className="bg-muted/30 border border-border rounded-lg p-6">
            <h3 className="font-semibold mb-3">Need Help?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Contact our customer support for any questions about your order.
            </p>
            <Link
              href="/contact"
              className="text-sm text-primary hover:underline"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>

      {/* Back to Shopping */}
      <div className="mt-8 text-center">
        <Link
          href="/products"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
