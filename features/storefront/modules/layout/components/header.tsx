'use client'

import Link from 'next/link'
import { ShoppingCart, Search, User, Menu } from 'lucide-react'
import { useState, useEffect } from 'react'
import Logo from './logo'
import SearchBar from './search-bar'
import { retrieveCart } from '@/features/storefront/lib/data/cart'

export function StorefrontHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)

  useEffect(() => {
    // Fetch cart on mount
    async function loadCart() {
      const cart = await retrieveCart()
      setCartCount(cart?.itemCount || 0)
    }
    loadCart()

    // Listen for cart updates from other components
    const handleCartUpdate = (event: CustomEvent) => {
      setCartCount(event.detail?.itemCount || 0)
    }

    window.addEventListener('cartUpdated' as any, handleCartUpdate)
    return () => {
      window.removeEventListener('cartUpdated' as any, handleCartUpdate)
    }
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      {/* Top bar with delivery info */}
      <div className="bg-green-600 text-white text-sm py-2">
        <div className="max-w-[1440px] mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Delivering to: 94105</span>
            <button className="underline hover:no-underline">Change</button>
          </div>
          <div className="hidden md:block">
            Free delivery on orders over $35
          </div>
        </div>
      </div>

      {/* Main navigation */}
      <div className="max-w-[1440px] mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/storefront" className="flex items-center">
            <Logo />
          </Link>

          {/* Search bar - desktop */}
          <div className="hidden md:block flex-1 max-w-2xl mx-8">
            <SearchBar />
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-4">
            {/* Account */}
            <Link
              href="/dashboard"
              className="hidden md:flex items-center gap-2 text-gray-700 hover:text-green-600"
            >
              <User className="w-5 h-5" />
              <span className="text-sm">Account</span>
            </Link>

            {/* Cart */}
            <Link
              href="/storefront/cart"
              className="flex items-center gap-2 text-gray-700 hover:text-green-600 relative"
            >
              <ShoppingCart className="w-6 h-6" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>

            {/* Mobile menu button */}
            <button
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Categories navigation - desktop */}
        <nav className="hidden md:flex items-center gap-6 py-3 border-t border-gray-100">
          <Link href="/storefront/shop/produce" className="text-sm font-medium text-gray-700 hover:text-green-600">
            Produce
          </Link>
          <Link href="/storefront/shop/meat-seafood" className="text-sm font-medium text-gray-700 hover:text-green-600">
            Meat & Seafood
          </Link>
          <Link href="/storefront/shop/dairy-eggs" className="text-sm font-medium text-gray-700 hover:text-green-600">
            Dairy & Eggs
          </Link>
          <Link href="/storefront/shop/bakery" className="text-sm font-medium text-gray-700 hover:text-green-600">
            Bakery
          </Link>
          <Link href="/storefront/shop/frozen" className="text-sm font-medium text-gray-700 hover:text-green-600">
            Frozen
          </Link>
          <Link href="/storefront/shop/pantry" className="text-sm font-medium text-gray-700 hover:text-green-600">
            Pantry
          </Link>
          <Link href="/storefront/shop/beverages" className="text-sm font-medium text-gray-700 hover:text-green-600">
            Beverages
          </Link>
          <Link href="/storefront/deals" className="text-sm font-medium text-green-600 hover:text-green-700">
            Deals
          </Link>
        </nav>

        {/* Search bar - mobile */}
        <div className="md:hidden py-3">
          <SearchBar />
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <nav className="px-6 py-4 space-y-3">
            <Link href="/storefront/shop/produce" className="block text-gray-700 hover:text-green-600">
              Produce
            </Link>
            <Link href="/storefront/shop/meat-seafood" className="block text-gray-700 hover:text-green-600">
              Meat & Seafood
            </Link>
            <Link href="/storefront/shop/dairy-eggs" className="block text-gray-700 hover:text-green-600">
              Dairy & Eggs
            </Link>
            <Link href="/storefront/shop/bakery" className="block text-gray-700 hover:text-green-600">
              Bakery
            </Link>
            <Link href="/storefront/shop/frozen" className="block text-gray-700 hover:text-green-600">
              Frozen
            </Link>
            <Link href="/storefront/shop/pantry" className="block text-gray-700 hover:text-green-600">
              Pantry
            </Link>
            <Link href="/storefront/shop/beverages" className="block text-gray-700 hover:text-green-600">
              Beverages
            </Link>
            <Link href="/storefront/deals" className="block text-green-600 hover:text-green-700">
              Deals
            </Link>
            <hr className="my-3" />
            <Link href="/dashboard" className="block text-gray-700 hover:text-green-600">
              Account
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
