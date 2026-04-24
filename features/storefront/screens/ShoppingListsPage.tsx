import type { Metadata } from 'next';
import Link from 'next/link';

import { getShoppingLists } from "@/features/storefront/lib/data/lists"
import type { ShoppingList } from "@/features/storefront/types"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Shopping Lists | Openfront Grocery",
    description: "Create and manage your shopping lists for quick and easy grocery shopping.",
  }
}

export async function ShoppingListsPage() {
  const lists: ShoppingList[] = await getShoppingLists()

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-600 mb-6">
        <Link href="/" className="hover:text-gray-900">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Shopping Lists</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Shopping Lists</h1>
          <p className="text-gray-600">
            Organize your groceries and save time on your next shop
          </p>
        </div>
        <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors">
          <span className="text-xl">+</span>
          Create New List
        </button>
      </div>

      {/* Lists Grid */}
      {lists && lists.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {lists.map((list) => (
            <div key={list.id} className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{list.name}</h3>
                  <p className="text-sm text-gray-600">
                    {list.items.length} items • Updated {new Date(list.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>

              {/* List Preview */}
              <div className="space-y-2 mb-4">
                {list.items.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={item.checked} readOnly className="rounded" />
                    <span className={item.checked ? 'line-through text-gray-400' : ''}>
                      {item.name}
                    </span>
                  </div>
                ))}
                {list.items.length > 3 && (
                  <p className="text-sm text-gray-500">+ {list.items.length - 3} more items</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Link
                  href="/lists"
                  className="flex-1 text-center bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                >
                  View List
                </Link>
                <button className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg font-semibold transition-colors">
                  Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white border rounded-lg p-12 text-center">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">📝</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">No Shopping Lists Yet</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Create your first shopping list to organize your groceries and make shopping faster.
          </p>
          <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold inline-flex items-center gap-2 transition-colors">
            <span className="text-xl">+</span>
            Create Your First List
          </button>
        </div>
      )}

      {/* Quick Add Section */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-8 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Add Items</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Type item name and press Enter..."
            className="flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
            Add
          </button>
        </div>
        <p className="text-sm text-gray-600">
          Quickly add items to your active list or create a new one
        </p>
      </div>

      {/* Templates */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">List Templates</h2>
        <p className="text-gray-600 mb-6">Start with a pre-made template to save time</p>

        <div className="grid md:grid-cols-4 gap-4">
          <button className="bg-white border-2 border-dashed border-gray-300 hover:border-green-500 rounded-lg p-6 text-center transition-colors group">
            <span className="text-4xl block mb-3">🥗</span>
            <h3 className="font-semibold text-gray-900 group-hover:text-green-600">Healthy Eating</h3>
            <p className="text-xs text-gray-500 mt-1">Fresh produce & lean proteins</p>
          </button>

          <button className="bg-white border-2 border-dashed border-gray-300 hover:border-green-500 rounded-lg p-6 text-center transition-colors group">
            <span className="text-4xl block mb-3">🍝</span>
            <h3 className="font-semibold text-gray-900 group-hover:text-green-600">Weekly Meal Prep</h3>
            <p className="text-xs text-gray-500 mt-1">Everything for meal planning</p>
          </button>

          <button className="bg-white border-2 border-dashed border-gray-300 hover:border-green-500 rounded-lg p-6 text-center transition-colors group">
            <span className="text-4xl block mb-3">🎉</span>
            <h3 className="font-semibold text-gray-900 group-hover:text-green-600">Party Essentials</h3>
            <p className="text-xs text-gray-500 mt-1">Snacks, drinks & supplies</p>
          </button>

          <button className="bg-white border-2 border-dashed border-gray-300 hover:border-green-500 rounded-lg p-6 text-center transition-colors group">
            <span className="text-4xl block mb-3">☕</span>
            <h3 className="font-semibold text-gray-900 group-hover:text-green-600">Breakfast Staples</h3>
            <p className="text-xs text-gray-500 mt-1">Start your day right</p>
          </button>
        </div>
      </section>

      {/* Features Info */}
      <div className="mt-12 bg-white border rounded-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Shopping List Features
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Check Off Items</h3>
            <p className="text-gray-600 text-sm">
              Mark items as you shop and keep track of what's left
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🔄</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Recurring Lists</h3>
            <p className="text-gray-600 text-sm">
              Save time with lists that auto-populate weekly or monthly
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">👥</span>
            </div>
            <h3 className="font-semibold text-lg mb-2">Share Lists</h3>
            <p className="text-gray-600 text-sm">
              Collaborate with family members on shared shopping lists
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
