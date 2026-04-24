import type { Metadata } from 'next';
import Link from 'next/link';

import { getUser } from '@/features/storefront/lib/data/user';
import { getOrdersByUser } from '@/features/storefront/lib/data/orders';
import { getShoppingLists } from '@/features/storefront/lib/data/lists';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'My Account | Openfront Grocery',
    description: 'Manage your account, view order history, and update your preferences.',
  };
}

export async function AccountPage() {
  const [user, recentOrders, savedLists] = await Promise.all([
    getUser(),
    getOrdersByUser(),
    getShoppingLists(),
  ]);

  if (!user) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-16 text-center">
        <span className="text-6xl block mb-4">👤</span>
        <h1 className="text-3xl font-bold text-foreground mb-4">Sign in to view your account</h1>
        <p className="text-muted-foreground mb-8">
          Your orders, lists, and grocery preferences will appear here once you sign in.
        </p>
        <Link
          href="/dashboard/signin?from=/account"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      <nav className="text-sm text-gray-600 mb-6">
        <Link href="/" className="hover:text-gray-900">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">My Account</span>
      </nav>

      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-8 mb-8 text-white">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold mb-2">Welcome back, {displayName}!</h1>
            <p className="text-green-50">{user.email}</p>
          </div>
          <div className="text-center bg-white/20 backdrop-blur px-6 py-4 rounded-lg">
            <div className="text-3xl font-bold">{recentOrders.length}</div>
            <div className="text-sm text-green-50">Orders on file</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link href="/lists" className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <span className="text-2xl">📝</span>
                <div>
                  <div className="font-semibold text-gray-900">Shopping Lists</div>
                  <div className="text-xs text-gray-600">{savedLists.length} saved lists</div>
                </div>
              </Link>
              <Link href="/deals" className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <span className="text-2xl">🎯</span>
                <div>
                  <div className="font-semibold text-gray-900">Weekly Deals</div>
                  <div className="text-xs text-gray-600">Browse live grocery offers</div>
                </div>
              </Link>
              <Link href={recentOrders[0] ? `/order/${recentOrders[0].id}` : '/account'} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <span className="text-2xl">📦</span>
                <div>
                  <div className="font-semibold text-gray-900">Order Tracking</div>
                  <div className="text-xs text-gray-600">View your recent grocery orders</div>
                </div>
              </Link>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Recent Orders</h2>
              <span className="text-sm text-gray-500">{recentOrders.length} total</span>
            </div>

            <div className="space-y-4">
              {recentOrders.map((order) => (
                <div key={order.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3 gap-4">
                    <div>
                      <div className="font-semibold text-gray-900">Order #{order.orderNumber}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(order.createdAt).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">${(order.total / 100).toFixed(2)}</div>
                      <div className="text-sm text-green-600 font-semibold capitalize">{order.status.replace(/_/g, ' ')}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t gap-4 flex-wrap">
                    <div className="text-sm text-gray-600">{order.items.length} items</div>
                    <div className="flex gap-2">
                      <Link href={`/order/${order.id}`} className="text-sm text-green-600 hover:text-green-700 font-semibold">
                        View Details
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {recentOrders.length === 0 && (
              <div className="text-center py-12">
                <span className="text-6xl block mb-4">📦</span>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No orders yet</h3>
                <p className="text-gray-600 mb-6">Start shopping to see your order history here</p>
                <Link
                  href="/products"
                  className="inline-block bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  Start Shopping
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">My Shopping Lists</h2>
          <Link href="/lists" className="text-green-600 hover:text-green-700 font-semibold text-sm">
            Manage Lists
          </Link>
        </div>

        {savedLists.length > 0 ? (
          <div className="grid md:grid-cols-3 gap-4">
            {savedLists.map((list) => (
              <div key={list.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">📋</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{list.name}</h3>
                    <p className="text-sm text-gray-600">{list.items.length} items</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">No saved lists yet.</p>
        )}
      </div>
    </div>
  );
}
