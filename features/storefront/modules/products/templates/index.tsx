'use client';

import { useState } from 'react';
import type { GroceryProduct } from '@/features/storefront/types';
import Link from 'next/link';
import { addToCart } from '@/features/storefront/lib/data/cart';

interface ProductTemplateProps {
  product: GroceryProduct;
  countryCode?: string;
}

export default function ProductTemplate({ product, countryCode }: ProductTemplateProps) {
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'nutrition'>('details');

  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      await addToCart(product.id, quantity);
      alert('Added to cart!');
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('Failed to add to cart');
    } finally {
      setIsAdding(false);
    }
  };
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-[1440px] mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-600 mb-6 flex items-center">
          <Link href="/" className="hover:text-green-600">Home</Link>
          {product.department && (
            <>
              <span className="mx-2">/</span>
              <Link
                href={`/departments/${product.department.handle}`}
                className="hover:text-green-600"
              >
                {product.department.name}
              </Link>
            </>
          )}
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{product.name}</span>
        </nav>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Product Image */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="aspect-square bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-9xl">🛒</span>
              )}
            </div>
          </div>

          {/* Product Info */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="mb-4">
              {product.isPerishable && (
                <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full mr-2">
                  Fresh
                </span>
              )}
              {product.department && (
                <span className="inline-block bg-gray-100 text-gray-800 text-xs font-semibold px-3 py-1 rounded-full">
                  {product.department.name}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>

            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-4xl font-bold text-green-600">${product.price.toFixed(2)}</span>
              {product.unit && (
                <span className="text-xl text-gray-500">/ {product.unit}</span>
              )}
            </div>

            {product.unitPrice && product.unitPrice !== product.price && (
              <p className="text-sm text-gray-600 mb-4">
                Unit price: ${product.unitPrice.toFixed(2)} per {product.unit || 'ea'}
              </p>
            )}

            <div className="mb-6">
              {product.inStock ? (
                <div className="flex items-center text-green-600 mb-2">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-semibold">In Stock</span>
                </div>
              ) : (
                <div className="flex items-center text-red-600 mb-2">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="font-semibold">Out of Stock</span>
                </div>
              )}
              {product.stockQuantity > 0 && product.stockQuantity < 10 && (
                <p className="text-sm text-amber-600">Only {product.stockQuantity} left in stock</p>
              )}
            </div>

            {product.description && (
              <div className="mb-6 pb-6 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 mb-2">About this item</h2>
                <p className="text-gray-600">{product.description}</p>
              </div>
            )}

            {product.isPerishable && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="font-semibold text-blue-900 mb-1">Perishable Item</p>
                    <p className="text-sm text-blue-800">Please refrigerate or freeze upon delivery to maintain freshness.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quantity Selector & Add to Cart */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Quantity</label>
              <div className="flex items-center gap-4">
                <div className="flex items-center border-2 border-gray-300 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-5 py-3 bg-gray-100 hover:bg-gray-200 font-bold text-lg"
                  >
                    -
                  </button>
                  <span className="px-6 py-3 font-semibold text-lg">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="px-5 py-3 bg-gray-100 hover:bg-gray-200 font-bold text-lg"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={handleAddToCart}
                  disabled={!product.inStock || isAdding}
                  className="flex-1 py-3.5 px-6 bg-green-600 text-white text-lg font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isAdding ? 'Adding...' : 'Add to Cart'}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex gap-4 mb-6 border-b border-gray-200">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`pb-2 px-1 font-semibold text-sm ${
                    activeTab === 'details'
                      ? 'border-b-2 border-green-600 text-green-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Product Details
                </button>
                <button
                  onClick={() => setActiveTab('nutrition')}
                  className={`pb-2 px-1 font-semibold text-sm ${
                    activeTab === 'nutrition'
                      ? 'border-b-2 border-green-600 text-green-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Nutrition & Allergens
                </button>
              </div>

              {activeTab === 'details' && (
                <dl className="space-y-3 text-sm">
                  <div className="flex">
                    <dt className="w-32 text-gray-600 font-medium">SKU:</dt>
                    <dd className="text-gray-900">{product.sku}</dd>
                  </div>
                  {product.barcode && (
                    <div className="flex">
                      <dt className="w-32 text-gray-600 font-medium">Barcode:</dt>
                      <dd className="text-gray-900">{product.barcode}</dd>
                    </div>
                  )}
                  {product.supplier && (
                    <div className="flex">
                      <dt className="w-32 text-gray-600 font-medium">Supplier:</dt>
                      <dd className="text-gray-900">{product.supplier.name}</dd>
                    </div>
                  )}
                  <div className="flex">
                    <dt className="w-32 text-gray-600 font-medium">Unit of Measure:</dt>
                    <dd className="text-gray-900">{product.unit || 'Each'}</dd>
                  </div>
                </dl>
              )}

              {activeTab === 'nutrition' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Nutrition Facts</h3>
                    <p className="text-sm text-gray-600 mb-4">Serving Size: 1 {product.unit || 'unit'}</p>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between border-b border-gray-200 pb-2">
                        <span className="text-gray-600">Calories</span>
                        <span className="font-semibold">Varies by item</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-4">
                        For detailed nutrition information, please check the product packaging or contact the manufacturer.
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Allergen Information
                    </h3>
                    <p className="text-sm text-amber-800">
                      Please check product packaging for specific allergen information. Common allergens may include: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, and soybeans.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
