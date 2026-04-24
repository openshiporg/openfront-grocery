'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GrocerySubscription } from '@/features/storefront/types';
import { 
  skipNextDelivery, 
  pauseSubscription, 
  resumeSubscription, 
  cancelSubscription 
} from '@/features/storefront/lib/data/subscriptions';

interface SubscriptionCardProps {
  subscription: GrocerySubscription;
}

export default function SubscriptionCard({ subscription: initialSubscription }: SubscriptionCardProps) {
  const [subscription, setSubscription] = useState(initialSubscription);
  const [isLoading, setIsLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const formatFrequency = (freq: string) => {
    switch (freq) {
      case 'weekly': return 'Every week';
      case 'biweekly': return 'Every 2 weeks';
      case 'monthly': return 'Every month';
      default: return freq;
    }
  };

  const getStatusBadge = () => {
    if (!subscription.isActive) {
      return <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded">Cancelled</span>;
    }
    if (subscription.pausedUntil) {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">Paused</span>;
    }
    return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">Active</span>;
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      const updated = await skipNextDelivery(subscription.id);
      if (updated) {
        setSubscription(prev => ({ ...prev, ...updated }));
      }
    } catch (error) {
      console.error('Error skipping delivery:', error);
    } finally {
      setIsLoading(false);
      setShowActions(false);
    }
  };

  const handlePause = async () => {
    setIsLoading(true);
    try {
      const pauseUntil = new Date();
      pauseUntil.setDate(pauseUntil.getDate() + 30);
      const updated = await pauseSubscription(subscription.id, pauseUntil);
      if (updated) {
        setSubscription(prev => ({ ...prev, ...updated }));
      }
    } catch (error) {
      console.error('Error pausing subscription:', error);
    } finally {
      setIsLoading(false);
      setShowActions(false);
    }
  };

  const handleResume = async () => {
    setIsLoading(true);
    try {
      const updated = await resumeSubscription(subscription.id);
      if (updated) {
        setSubscription(prev => ({ ...prev, ...updated }));
      }
    } catch (error) {
      console.error('Error resuming subscription:', error);
    } finally {
      setIsLoading(false);
      setShowActions(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this subscription?')) return;
    
    setIsLoading(true);
    try {
      const updated = await cancelSubscription(subscription.id);
      if (updated) {
        setSubscription(prev => ({ ...prev, ...updated }));
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
    } finally {
      setIsLoading(false);
      setShowActions(false);
    }
  };

  const product = subscription.productDetails;

  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow relative">
      {/* Status Badge */}
      <div className="absolute top-4 right-4">
        {getStatusBadge()}
      </div>

      {/* Product Info */}
      <div className="flex gap-4 mb-4">
        <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center">
          {product?.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <span className="text-3xl">📦</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-lg mb-1 truncate">
            {product?.name || `Product ${subscription.product.slice(-6)}`}
          </h3>
          <p className="text-gray-600 text-sm">
            Qty: {subscription.quantity} • {formatFrequency(subscription.frequency)}
          </p>
          {subscription.discount > 0 && (
            <p className="text-green-600 text-sm font-semibold mt-1">
              💰 {subscription.discount}% off each delivery
            </p>
          )}
        </div>
      </div>

      {/* Next Delivery */}
      {subscription.isActive && !subscription.pausedUntil && subscription.nextDeliveryDate && (
        <div className="bg-blue-50 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Next delivery:</span>{' '}
            {new Date(subscription.nextDeliveryDate).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      )}

      {/* Paused Until */}
      {subscription.pausedUntil && (
        <div className="bg-yellow-50 rounded-lg p-3 mb-4">
          <p className="text-sm text-yellow-800">
            <span className="font-semibold">Paused until:</span>{' '}
            {new Date(subscription.pausedUntil).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t">
        {subscription.isActive && !subscription.pausedUntil && (
          <>
            <button
              onClick={handleSkip}
              disabled={isLoading}
              className="flex-1 text-center px-3 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Skip Next
            </button>
            <button
              onClick={() => setShowActions(!showActions)}
              className="px-3 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-semibold transition-colors"
            >
              •••
            </button>
          </>
        )}
        
        {subscription.pausedUntil && (
          <button
            onClick={handleResume}
            disabled={isLoading}
            className="flex-1 text-center bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Resuming...' : 'Resume'}
          </button>
        )}

        {!subscription.isActive && (
          <Link
            href="/subscriptions/new"
            className="flex-1 text-center bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Resubscribe
          </Link>
        )}
      </div>

      {/* Dropdown Actions */}
      {showActions && (
        <div className="absolute right-4 top-20 bg-white border rounded-lg shadow-lg py-2 z-10 min-w-[150px]">
          <Link
            href={`/subscriptions/${subscription.id}/edit`}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Edit Subscription
          </Link>
          <button
            onClick={handlePause}
            disabled={isLoading}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Pause for 30 days
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Cancel Subscription
          </button>
        </div>
      )}

      {/* Click outside to close */}
      {showActions && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowActions(false)}
        />
      )}
    </div>
  );
}
