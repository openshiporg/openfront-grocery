'use client';

import Link from 'next/link';
import { CheckCircle, Package, MapPin, Clock } from 'lucide-react';
import type { GroceryOrder } from '@/features/storefront/types';

interface OrderConfirmationTemplateProps {
  order: GroceryOrder;
}

export default function OrderConfirmationTemplate({ order }: OrderConfirmationTemplateProps) {
  const formatAddress = () => {
    if (!order.shippingAddress) return 'No address provided';
    const { address1, city, province, postalCode } = order.shippingAddress;
    return `${address1}, ${city}, ${province} ${postalCode}`;
  };

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      {/* Success Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Order Confirmed!
        </h1>
        <p className="text-lg text-muted-foreground mb-4">
          Thank you for your order. We'll send you a confirmation email shortly.
        </p>
        <p className="text-sm text-muted-foreground">
          Order Number: <span className="font-medium text-foreground">#{order.orderNumber}</span>
        </p>
      </div>

      {/* Order Details Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Delivery Information */}
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <h2 className="font-semibold">Delivery Address</h2>
          </div>
          <p className="text-sm text-foreground">{formatAddress()}</p>
        </div>

        {/* Delivery Window */}
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <h2 className="font-semibold">Delivery Window</h2>
          </div>
          {order.deliverySlot ? (
            <>
              <p className="font-medium text-foreground">
                {new Date(order.deliverySlot.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {order.deliverySlot.startTime} - {order.deliverySlot.endTime}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Delivery window pending</p>
          )}
        </div>
      </div>

      {/* Order Items */}
      <div className="bg-white border border-border rounded-lg p-6 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <h2 className="font-semibold">Your Items</h2>
        </div>

        <div className="space-y-4 mb-6">
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
                <p className="font-medium text-foreground">{item.title}</p>
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

        {/* Order Summary */}
        <div className="border-t border-border pt-4">
          <dl className="space-y-2 text-sm">
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
              <dd className="text-lg">${(order.total / 100).toFixed(2)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* What's Next */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-blue-900 mb-3">What happens next?</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>You'll receive an email confirmation with your order details</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Your personal shopper will start picking your items</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>We'll notify you when your order is out for delivery</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Track your order status anytime from your order page</span>
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href={`/order/${order.id}`}
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          Track Order
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center justify-center px-6 py-3 border border-border rounded-md font-medium hover:bg-accent transition-colors"
        >
          Continue Shopping
        </Link>
      </div>

      {/* Support */}
      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground">
          Need help with your order?{' '}
          <Link href="/contact" className="text-primary hover:underline">
            Contact Support
          </Link>
        </p>
      </div>
    </div>
  );
}
