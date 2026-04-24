import type { Metadata } from 'next';
import Link from 'next/link';
import { getSubscriptions } from "@/features/storefront/lib/data/subscriptions";
import { getProductsByIds } from "@/features/storefront/lib/data/products";
import SubscriptionCard from "@/features/storefront/modules/subscriptions/components/subscription-card";
import type { GrocerySubscription, GroceryProduct } from "@/features/storefront/types";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "My Subscriptions | Openfront Grocery",
    description: "Manage your grocery subscriptions and auto-replenishment orders.",
  };
}

export async function SubscriptionsPage() {
  const subscriptions: GrocerySubscription[] = await getSubscriptions();
  
  // Get product details for all subscriptions
  const productIds = subscriptions.map(s => s.product);
  const { products } = await getProductsByIds(productIds);
  
  // Map products to subscriptions
  const subscriptionsWithProducts = subscriptions.map(sub => ({
    ...sub,
    productDetails: products.find((p: GroceryProduct) => p.id === sub.product),
  }));

  const activeSubscriptions = subscriptionsWithProducts.filter(s => s.isActive && !s.pausedUntil);
  const pausedSubscriptions = subscriptionsWithProducts.filter(s => s.pausedUntil);
  const cancelledSubscriptions = subscriptionsWithProducts.filter(s => !s.isActive);

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-600 mb-6">
        <Link href="/" className="hover:text-gray-900">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Subscriptions</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Subscriptions</h1>
          <p className="text-gray-600">
            Manage your recurring orders and save 10% on every delivery
          </p>
        </div>
        <Link
          href="/subscriptions/new"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors"
        >
          <span className="text-xl">+</span>
          New Subscription
        </Link>
      </div>

      {/* Savings Banner */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="text-5xl">💰</div>
          <div>
            <h2 className="text-xl font-bold text-green-900">Subscribe & Save 10%</h2>
            <p className="text-green-700">
              Set it and forget it! Your favorite products delivered automatically at a discounted price.
            </p>
          </div>
        </div>
      </div>

      {subscriptions.length === 0 ? (
        /* Empty State */
        <div className="bg-white border rounded-xl p-12 text-center">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">🔄</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">No Subscriptions Yet</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Start a subscription to get your favorite groceries delivered regularly and save 10% on every order.
          </p>
          <Link
            href="/subscriptions/new"
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <span className="text-xl">+</span>
            Create Your First Subscription
          </Link>
        </div>
      ) : (
        <>
          {/* Active Subscriptions */}
          {activeSubscriptions.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                Active Subscriptions ({activeSubscriptions.length})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSubscriptions.map((subscription) => (
                  <SubscriptionCard key={subscription.id} subscription={subscription} />
                ))}
              </div>
            </section>
          )}

          {/* Paused Subscriptions */}
          {pausedSubscriptions.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                Paused Subscriptions ({pausedSubscriptions.length})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pausedSubscriptions.map((subscription) => (
                  <SubscriptionCard key={subscription.id} subscription={subscription} />
                ))}
              </div>
            </section>
          )}

          {/* Cancelled Subscriptions */}
          {cancelledSubscriptions.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-3 h-3 bg-gray-400 rounded-full"></span>
                Cancelled Subscriptions ({cancelledSubscriptions.length})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-60">
                {cancelledSubscriptions.map((subscription) => (
                  <SubscriptionCard key={subscription.id} subscription={subscription} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Info Cards */}
      <div className="mt-12 bg-white border rounded-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          How Subscriptions Work
        </h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📦</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Choose Products</h3>
            <p className="text-gray-600 text-sm">
              Select items you buy regularly
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📅</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Set Frequency</h3>
            <p className="text-gray-600 text-sm">
              Weekly, bi-weekly, or monthly
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💰</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Save 10%</h3>
            <p className="text-gray-600 text-sm">
              Automatic discount on every delivery
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✨</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Stay Flexible</h3>
            <p className="text-gray-600 text-sm">
              Skip, pause, or cancel anytime
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
