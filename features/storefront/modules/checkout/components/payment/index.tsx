'use client';

import { useState, useEffect } from 'react';
import type { GroceryPaymentProviderOption } from '@/features/storefront/lib/data/payment';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { initiatePaymentSession } from '@/features/storefront/lib/data/checkout';

// Initialize Stripe outside of component to avoid re-creating on every render
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_KEY || ''
);

interface PaymentFormProps {
  cartId: string;
  paymentProviderCode: string;
  paymentProviderName?: string;
  amount: number;
  onPaymentSuccess: (payment: { paymentIntentId: string; paymentSessionId: string }) => void;
  onPaymentError: (error: string) => void;
  disabled?: boolean;
  buttonText?: string;
}

function PaymentForm({
  cartId,
  paymentProviderCode,
  paymentProviderName,
  amount,
  onPaymentSuccess,
  onPaymentError,
  disabled = false,
  buttonText = 'Pay Now',
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setCardError(null);

    try {
      // Create payment session through canonical GraphQL mutation path
      const paymentIntent = await initiatePaymentSession(cartId, paymentProviderCode);

      if (!paymentIntent) {
        throw new Error('Failed to create payment intent');
      }

      // Confirm payment with Stripe
      const cardElement = elements.getElement(CardElement);

      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const clientSecret = paymentIntent?.data?.clientSecret;

      if (!clientSecret) {
        throw new Error('Payment session did not return a client secret');
      }

      const { error, paymentIntent: confirmedIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
          },
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (confirmedIntent?.status === 'succeeded') {
        onPaymentSuccess({
          paymentIntentId: confirmedIntent.id,
          paymentSessionId: paymentIntent.id,
        });
      } else {
        throw new Error('Payment was not successful');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed';
      setCardError(message);
      onPaymentError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        fontFamily: 'Inter, system-ui, sans-serif',
        '::placeholder': {
          color: '#9ca3af',
        },
      },
      invalid: {
        color: '#ef4444',
        iconColor: '#ef4444',
      },
    },
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Card Details
        </label>
        <div className="p-3 border border-border rounded-md bg-background">
          <CardElement
            options={cardElementOptions}
            onChange={(event) => {
              setCardComplete(event.complete);
              if (event.error) {
                setCardError(event.error.message);
              } else {
                setCardError(null);
              }
            }}
          />
        </div>
        {cardError && (
          <p className="mt-2 text-sm text-red-600">{cardError}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={!stripe || isProcessing || !cardComplete || disabled}
        className={`w-full py-3 px-6 rounded-md font-medium transition-colors ${
          !stripe || isProcessing || !cardComplete || disabled
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        ) : (
          `${buttonText} - $${(amount / 100).toFixed(2)}`
        )}
      </button>

      <p className="mt-3 text-xs text-muted-foreground text-center">
        {paymentProviderName || 'Stripe'} is handling secure card collection for this order.
      </p>
    </form>
  );
}

interface StripePaymentProps extends Omit<PaymentFormProps, 'amount'> {
  amount: number; // Amount in cents
}

export default function StripePayment(props: StripePaymentProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="animate-pulse">
        <div className="h-12 bg-muted rounded-md mb-4"></div>
        <div className="h-12 bg-muted rounded-md"></div>
      </div>
    );
  }

  const selectedIsManual = props.paymentProviderCode === 'pp_manual_default' || props.paymentProviderCode.includes('manual');

  if (selectedIsManual || !process.env.NEXT_PUBLIC_STRIPE_KEY) {
    return (
      <div className="space-y-4 p-4 border border-amber-200 bg-amber-50 rounded-md">
        <p className="text-sm text-amber-800">
          {selectedIsManual
            ? 'Manual demo provider selected. This follows the configured Grocery payment provider path without live card collection.'
            : 'Stripe is not configured. Falling back to a manual demo checkout so you can complete storefront testing.'}
        </p>
        <button
          type="button"
          disabled={props.disabled}
          onClick={() =>
            props.onPaymentSuccess({
              paymentIntentId: `manual_${Date.now()}`,
              paymentSessionId: 'manual_session',
            })
          }
          className={`w-full py-3 px-6 rounded-md font-medium transition-colors ${
            props.disabled
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {props.buttonText || 'Place order'} - ${(props.amount / 100).toFixed(2)}
        </button>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm {...props} />
    </Elements>
  );
}
