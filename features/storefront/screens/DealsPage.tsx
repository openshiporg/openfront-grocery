import type { Metadata } from 'next';
import Link from 'next/link';

import { getDeals } from "@/features/storefront/lib/data/deals"
import ProductGrid from "@/features/storefront/modules/products/components/product-grid"
import type { GroceryDeal } from "@/features/storefront/types"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Weekly Deals & Coupons | Openfront Grocery",
    description: "Save big on your favorite groceries with our weekly deals, coupons, and special offers.",
  }
}

export async function DealsPage() {
  const deals: GroceryDeal[] = await getDeals()

  // Mock data for demonstration - replace with actual API calls
  const weeklyDeals = deals.filter(d => d.type === 'weekly')
  const coupons = deals.filter(d => d.type === 'coupon')

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-600 mb-6">
        <Link href="/" className="hover:text-gray-900">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Deals</span>
      </nav>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl p-8 mb-8 text-gray-900">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold mb-3">Weekly Deals & Savings</h1>
          <p className="text-lg mb-4">
            Save up to 40% on your favorite products. New deals added every week!
          </p>
          <div className="flex gap-4 text-sm">
            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-lg font-semibold">
              🎯 100+ Items on Sale
            </div>
            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-lg font-semibold">
              ⏰ Limited Time Only
            </div>
          </div>
        </div>
      </div>

      {/* Digital Coupons */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Digital Coupons</h2>
            <p className="text-gray-600 mt-1">Clip coupons and save at checkout</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* Coupon Cards */}
          <div className="border-2 border-dashed border-green-500 rounded-lg p-6 bg-white hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-4xl font-bold text-green-600 mb-1">$5 OFF</div>
                <p className="text-gray-700 font-medium">Orders over $50</p>
              </div>
              <button className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
                Clip
              </button>
            </div>
            <p className="text-sm text-gray-600 border-t pt-3">
              Valid until: Dec 31, 2025
            </p>
          </div>

          <div className="border-2 border-dashed border-blue-500 rounded-lg p-6 bg-white hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-4xl font-bold text-blue-600 mb-1">20% OFF</div>
                <p className="text-gray-700 font-medium">Organic Produce</p>
              </div>
              <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
                Clip
              </button>
            </div>
            <p className="text-sm text-gray-600 border-t pt-3">
              Valid until: Dec 25, 2025
            </p>
          </div>

          <div className="border-2 border-dashed border-purple-500 rounded-lg p-6 bg-white hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-4xl font-bold text-purple-600 mb-1">$3 OFF</div>
                <p className="text-gray-700 font-medium">Fresh Bakery Items</p>
              </div>
              <button className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
                Clip
              </button>
            </div>
            <p className="text-sm text-gray-600 border-t pt-3">
              Valid until: Dec 20, 2025
            </p>
          </div>

          <div className="border-2 border-dashed border-orange-500 rounded-lg p-6 bg-white hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-4xl font-bold text-orange-600 mb-1">15% OFF</div>
                <p className="text-gray-700 font-medium">Frozen Foods</p>
              </div>
              <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
                Clip
              </button>
            </div>
            <p className="text-sm text-gray-600 border-t pt-3">
              Valid until: Dec 28, 2025
            </p>
          </div>

          <div className="border-2 border-dashed border-red-500 rounded-lg p-6 bg-white hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-4xl font-bold text-red-600 mb-1">$10 OFF</div>
                <p className="text-gray-700 font-medium">First Time Orders</p>
              </div>
              <button className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
                Clip
              </button>
            </div>
            <p className="text-sm text-gray-600 border-t pt-3">
              Valid until: Dec 31, 2025
            </p>
          </div>

          <div className="border-2 border-dashed border-teal-500 rounded-lg p-6 bg-white hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-4xl font-bold text-teal-600 mb-1">25% OFF</div>
                <p className="text-gray-700 font-medium">Premium Meats</p>
              </div>
              <button className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
                Clip
              </button>
            </div>
            <p className="text-sm text-gray-600 border-t pt-3">
              Valid until: Dec 24, 2025
            </p>
          </div>
        </div>
      </section>

      {/* Flash Deals */}
      <section className="mb-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-4xl">⚡</span>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Flash Deals - Today Only!</h2>
                <p className="text-gray-600">Hurry! These deals end at midnight</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-red-600">12:45:32</div>
              <p className="text-sm text-gray-600">Time Remaining</p>
            </div>
          </div>
        </div>

        {/* Flash deal products would go here */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white border rounded-lg p-4 hover:shadow-lg transition-shadow">
              <div className="aspect-square bg-gray-100 rounded mb-3" />
              <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
                40% OFF
              </div>
              <h3 className="font-semibold text-sm mb-2">Product Name</h3>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">$4.99</span>
                <span className="text-sm text-gray-500 line-through">$8.99</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly Specials by Department */}
      <section>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Weekly Specials</h2>
          <p className="text-gray-600 mt-1">Great prices across all departments</p>
        </div>

        {/* Department tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold whitespace-nowrap">
            All Deals
          </button>
          <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold whitespace-nowrap">
            Produce
          </button>
          <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold whitespace-nowrap">
            Meat & Seafood
          </button>
          <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold whitespace-nowrap">
            Dairy
          </button>
          <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold whitespace-nowrap">
            Bakery
          </button>
          <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold whitespace-nowrap">
            Frozen
          </button>
        </div>

        {/* Deal products grid */}
        {deals.length > 0 && (
          <ProductGrid products={deals.filter(d => d.product).map(d => d.product!)} />
        )}
      </section>

      {/* Savings Tips */}
      <section className="mt-12 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Maximize Your Savings</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              <span className="text-3xl">📋</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Clip Digital Coupons</h3>
            <p className="text-gray-600 text-sm">
              Browse and clip coupons before shopping. They'll automatically apply at checkout!
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              <span className="text-3xl">🔔</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Enable Deal Alerts</h3>
            <p className="text-gray-600 text-sm">
              Get notified when your favorite products go on sale
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              <span className="text-3xl">💰</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Stack Your Savings</h3>
            <p className="text-gray-600 text-sm">
              Combine coupons with weekly deals for maximum savings
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
