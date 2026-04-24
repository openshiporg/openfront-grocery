'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { GroceryCart, GroceryUser, DeliveryWindow } from '@/features/storefront/types';
import DeliveryScheduler from '@/features/storefront/modules/cart/components/delivery-scheduler';
import StripePayment from '../components/payment';
import { submitOrder } from '@/features/storefront/lib/data/checkout';
import type { GroceryPaymentProviderOption } from '@/features/storefront/lib/data/payment';

interface CheckoutTemplateProps {
  cart: GroceryCart | null;
  user: GroceryUser | null;
  paymentProviders: GroceryPaymentProviderOption[];
}

export default function CheckoutTemplate({ cart, user, paymentProviders }: CheckoutTemplateProps) {
  const router = useRouter();
  const [selectedDeliveryWindow, setSelectedDeliveryWindow] = useState<DeliveryWindow | null>(null);
  const [substitutionPreference, setSubstitutionPreference] = useState<'allow' | 'contact' | 'remove'>('allow');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<'details' | 'payment'>('details');
  const [selectedPaymentProviderCode, setSelectedPaymentProviderCode] = useState(
    paymentProviders[0]?.code || 'pp_manual_default'
  );

  const selectedPaymentProvider =
    paymentProviders.find((provider) => provider.code === selectedPaymentProviderCode) || paymentProviders[0] || null;

  // Form state
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
  });

  if (!cart || cart.items.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-16 text-center">
        <span className="text-6xl block mb-4">🛒</span>
        <h1 className="text-3xl font-bold text-foreground mb-4">Your Cart is Empty</h1>
        <p className="text-muted-foreground mb-8">
          Add some groceries to checkout
        </p>
        <Link
          href="/products"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          Browse Departments
        </Link>
      </div>
    );
  }

  const deliveryFee = selectedDeliveryWindow?.fee || cart.deliveryFee;
  const total = cart.subtotal + cart.tax + deliveryFee;

  // Validate form before proceeding to payment
  const validateForm = (): boolean => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
      alert('Please fill in all contact information');
      return false;
    }
    if (!formData.street || !formData.city || !formData.state || !formData.zipCode) {
      alert('Please fill in delivery address');
      return false;
    }
    if (!selectedDeliveryWindow) {
      alert('Please select a delivery window');
      return false;
    }
    return true;
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setCurrentStep('payment');
    }
  };

  const handlePaymentSuccess = async ({
    paymentIntentId,
    paymentSessionId,
  }: {
    paymentIntentId: string;
    paymentSessionId: string;
  }) => {
    setIsProcessing(true);
    setPaymentError(null);

    try {
      // Map substitution preference to API format
      const substitutionMap = {
        allow: 'best_match',
        contact: 'call_me',
        remove: 'refund',
      } as const;

      // Submit order to API
      const order = await submitOrder({
        cartId: cart!.id,
        paymentSessionId,
        paymentIntentId,
        email: formData.email,
        deliveryAddress: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          address1: formData.street,
          city: formData.city,
          province: formData.state,
          postalCode: formData.zipCode,
          phone: formData.phone,
        },
        deliveryDate: selectedDeliveryWindow!.date,
        deliveryTimeWindow: `time_${selectedDeliveryWindow!.startTime.replace(':', '_')}_${selectedDeliveryWindow!.endTime.replace(':', '_')}`,
        substitutionPreference: substitutionMap[substitutionPreference],
        deliveryInstructions: specialInstructions || undefined,
      });

      if (order) {
        // Redirect to order confirmation page
        router.push(`/order/${order.id}`);
      } else {
        throw new Error('Failed to create order');
      }
    } catch (error) {
      console.error('Order submission failed:', error);
      setPaymentError('Failed to process your order. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentError = (error: string) => {
    setPaymentError(error);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      <form onSubmit={currentStep === 'details' ? handleProceedToPayment : (e) => e.preventDefault()}>
        <div className="grid lg:grid-cols-2 gap-12">
          {/* Checkout Form */}
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground">Checkout</h1>
              {currentStep === 'payment' && (
                <button
                  type="button"
                  onClick={() => setCurrentStep('details')}
                  className="text-sm text-primary hover:underline"
                >
                  Edit details
                </button>
              )}
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-4 text-sm">
              <span className={`flex items-center gap-2 ${currentStep === 'details' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep === 'details' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>1</span>
                Details
              </span>
              <span className="flex-1 h-px bg-border"></span>
              <span className={`flex items-center gap-2 ${currentStep === 'payment' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep === 'payment' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>2</span>
                Payment
              </span>
            </div>

            {currentStep === 'details' ? (
              <>
                {/* Contact Information */}
                <section>
                  <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="firstName" className="block text-sm font-medium mb-1">
                          First Name *
                        </label>
                        <input
                          id="firstName"
                          name="firstName"
                          type="text"
                          required
                          value={formData.firstName}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-sm font-medium mb-1">
                          Last Name *
                        </label>
                        <input
                          id="lastName"
                          name="lastName"
                          type="text"
                          required
                          value={formData.lastName}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-1">
                        Email *
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium mb-1">
                        Phone *
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="For delivery updates"
                      />
                    </div>
                  </div>
                </section>

            {/* Delivery Address */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Delivery Address</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="street" className="block text-sm font-medium mb-1">
                    Street Address *
                  </label>
                  <input
                    id="street"
                    name="street"
                    type="text"
                    required
                    value={formData.street}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="city" className="block text-sm font-medium mb-1">
                      City *
                    </label>
                    <input
                      id="city"
                      name="city"
                      type="text"
                      required
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="state" className="block text-sm font-medium mb-1">
                      State *
                    </label>
                    <input
                      id="state"
                      name="state"
                      type="text"
                      required
                      value={formData.state}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="zipCode" className="block text-sm font-medium mb-1">
                    ZIP Code *
                  </label>
                  <input
                    id="zipCode"
                    name="zipCode"
                    type="text"
                    required
                    value={formData.zipCode}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </section>

            {/* Delivery Window */}
            <section className="p-4 border border-border rounded-lg">
              <DeliveryScheduler
                selectedWindow={selectedDeliveryWindow}
                onSelectWindow={setSelectedDeliveryWindow}
              />
            </section>

            {/* Substitution Preferences */}
            <section>
              <h2 className="text-lg font-semibold mb-4">If an item is unavailable</h2>
              <div className="space-y-3">
                {(['allow', 'contact', 'remove'] as const).map((pref) => (
                  <label
                    key={pref}
                    className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${
                      substitutionPreference === pref
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <input
                      type="radio"
                      name="substitution"
                      value={pref}
                      checked={substitutionPreference === pref}
                      onChange={() => setSubstitutionPreference(pref)}
                      className="mr-3"
                    />
                    <span>
                      {pref === 'allow' && 'Substitute with similar item'}
                      {pref === 'contact' && 'Contact me for approval'}
                      {pref === 'remove' && 'Remove from order'}
                    </span>
                  </label>
                ))}
              </div>
            </section>

                {/* Special Instructions */}
                <section>
                  <h2 className="text-lg font-semibold mb-4">Special Instructions</h2>
                  <textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    rows={3}
                    placeholder="Gate code, leave at door, etc..."
                  />
                </section>
              </>
            ) : (
              /* Payment Step */
              <section className="space-y-6">
                <h2 className="text-lg font-semibold">Payment</h2>

                {/* Delivery summary */}
                <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-2">
                  <p>
                    <strong>Delivery to:</strong> {formData.street}, {formData.city}, {formData.state} {formData.zipCode}
                  </p>
                  <p>
                    <strong>Contact:</strong> {formData.email} | {formData.phone}
                  </p>
                  {selectedDeliveryWindow && (
                    <p>
                      <strong>Delivery:</strong> {selectedDeliveryWindow.date} between {selectedDeliveryWindow.startTime} - {selectedDeliveryWindow.endTime}
                    </p>
                  )}
                </div>

                {paymentError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800">{paymentError}</p>
                  </div>
                )}

                <section className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Payment method</p>
                    <p className="text-xs text-muted-foreground">Provider selection is powered by configured Grocery payment providers.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {paymentProviders.map((provider) => (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => setSelectedPaymentProviderCode(provider.code)}
                        className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                          selectedPaymentProviderCode === provider.code
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background hover:border-zinc-400'
                        }`}
                      >
                        <div className="text-sm font-medium">{provider.name}</div>
                        <div className={`text-xs ${selectedPaymentProviderCode === provider.code ? 'text-background/80' : 'text-muted-foreground'}`}>
                          {provider.code}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <StripePayment
                  cartId={cart.id}
                  paymentProviderCode={selectedPaymentProviderCode}
                  paymentProviderName={selectedPaymentProvider?.name}
                  amount={Math.round(total * 100)}
                  onPaymentSuccess={handlePaymentSuccess}
                  onPaymentError={handlePaymentError}
                  disabled={isProcessing}
                  buttonText="Place Order"
                />
              </section>
            )}
          </div>

          {/* Order Summary */}
          <div>
            <div className="border border-border rounded-lg p-6 sticky top-24">
              <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

              {/* Cart Items Preview */}
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {cart.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div className="flex-1">
                      <span className="text-foreground">{item.product.name}</span>
                      <span className="text-muted-foreground"> x {item.quantity}</span>
                    </div>
                    <span className="ml-2">${item.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <dl className="space-y-3 text-sm border-t border-border pt-4">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>${cart.subtotal.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery Fee</dt>
                  <dd>
                    {deliveryFee === 0 ? (
                      <span className="text-green-600">FREE</span>
                    ) : (
                      `$${deliveryFee.toFixed(2)}`
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Estimated Tax</dt>
                  <dd>${cart.tax.toFixed(2)}</dd>
                </div>
                <div className="pt-3 border-t border-border flex justify-between font-semibold text-base">
                  <dt>Total</dt>
                  <dd>${total.toFixed(2)}</dd>
                </div>
              </dl>

              {currentStep === 'details' && !selectedDeliveryWindow && (
                <p className="mt-4 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  Please select a delivery window above
                </p>
              )}

              {currentStep === 'details' && (
                <button
                  type="submit"
                  disabled={!selectedDeliveryWindow}
                  className={`mt-6 w-full py-3 px-6 rounded-md font-medium transition-colors ${
                    selectedDeliveryWindow
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  }`}
                >
                  Continue to Payment
                </button>
              )}

              <p className="mt-4 text-xs text-muted-foreground text-center">
                By placing your order, you agree to our{' '}
                <Link href="/terms" className="underline">Terms of Service</Link> and{' '}
                <Link href="/privacy" className="underline">Privacy Policy</Link>
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
