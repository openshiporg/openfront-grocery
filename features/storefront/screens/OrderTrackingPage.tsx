import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from "next/navigation"

import { getOrderById } from "@/features/storefront/lib/data/orders"
import type { GroceryOrder } from "@/features/storefront/types"

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { id } = params

  return {
    title: `Order #${id} | Openfront Grocery`,
    description: "Track your grocery order status and delivery details.",
  }
}

export async function OrderTrackingPage(props: Props) {
  const params = await props.params
  const { id } = params

  const order: GroceryOrder | null = await getOrderById(id)

  if (!order) {
    notFound()
  }

  const statusSteps = [
    { status: 'confirmed', label: 'Order Confirmed', icon: '✓', completed: true },
    { status: 'processing', label: 'Processing', icon: '📦', completed: order.status !== 'pending' },
    { status: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚', completed: order.status === 'delivered' || order.status === 'out_for_delivery' },
    { status: 'delivered', label: 'Delivered', icon: '🏠', completed: order.status === 'delivered' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-600 mb-6">
        <Link href="/" className="hover:text-gray-900">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/account" className="hover:text-gray-900">Account</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Order #{order.orderNumber}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Order #{order.orderNumber}
            </h1>
            <p className="text-gray-600">
              Placed on {new Date(order.createdAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
            </p>
          </div>
          <div className="text-right">
            <div className="inline-block px-4 py-2 rounded-full bg-green-100 text-green-800 font-semibold">
              {order.status === 'delivered' && 'Delivered'}
              {order.status === 'out_for_delivery' && 'Out for Delivery'}
              {order.status === 'processing' && 'Processing'}
              {order.status === 'pending' && 'Confirmed'}
            </div>
          </div>
        </div>

        {/* Delivery Info */}
        {order.deliverySlot && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📅</span>
              <div>
                <h3 className="font-semibold text-gray-900">Delivery Window</h3>
                <p className="text-gray-700">
                  {new Date(order.deliverySlot.startTime).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                  })}
                  {' '}
                  {new Date(order.deliverySlot.startTime).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                  {' - '}
                  {new Date(order.deliverySlot.endTime).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tracking Progress */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-xl font-bold mb-6">Order Status</h2>
        <div className="relative">
          {/* Progress Line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200" />

          {statusSteps.map((step, index) => (
            <div key={step.status} className="relative flex items-start mb-8 last:mb-0">
              <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full ${
                step.completed ? 'bg-green-500' : 'bg-gray-200'
              }`}>
                <span className="text-2xl">{step.icon}</span>
              </div>
              <div className="ml-6 flex-1">
                <h3 className={`font-semibold ${step.completed ? 'text-gray-900' : 'text-gray-400'}`}>
                  {step.label}
                </h3>
                {step.completed && (
                  <p className="text-sm text-gray-600 mt-1">
                    Completed
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery Address */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Delivery Address</h2>
        {order.shippingAddress && (
          <div className="text-gray-700">
            <p className="font-semibold">{order.shippingAddress.firstName} {order.shippingAddress.lastName}</p>
            <p>{order.shippingAddress.address1}</p>
            {order.shippingAddress.address2 && <p>{order.shippingAddress.address2}</p>}
            <p>{order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode}</p>
            {order.shippingAddress.phone && <p className="mt-2">Phone: {order.shippingAddress.phone}</p>}
          </div>
        )}
      </div>

      {/* Order Items */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-xl font-bold mb-4">Order Items</h2>
        <div className="space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 pb-4 border-b last:border-b-0">
              <div className="w-20 h-20 bg-gray-100 rounded flex-shrink-0">
                {item.thumbnail && (
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover rounded"
                  />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                {item.variant && (
                  <p className="text-sm text-gray-600">{item.variant.title}</p>
                )}
                <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">
                  ${((item.unit_price * item.quantity) / 100).toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="mt-6 pt-6 border-t space-y-2">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>${(order.subtotal / 100).toFixed(2)}</span>
          </div>
          {order.discount_total > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-${(order.discount_total / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Delivery Fee</span>
            <span>${(order.shipping_total / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Tax</span>
            <span>${(order.tax_total / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t">
            <span>Total</span>
            <span>${(order.total / 100).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-6 bg-gray-50 rounded-lg p-6 text-center">
        <h3 className="font-semibold text-gray-900 mb-2">Need Help?</h3>
        <p className="text-gray-600 mb-4">
          Contact our customer support team if you have any questions about your order.
        </p>
        <div className="flex justify-center gap-4">
          <a href="/help" className="text-green-600 hover:text-green-700 font-semibold">
            Contact Support
          </a>
          <span className="text-gray-400">|</span>
          <a href="/account" className="text-green-600 hover:text-green-700 font-semibold">
            View All Orders
          </a>
        </div>
      </div>
    </div>
  );
}
