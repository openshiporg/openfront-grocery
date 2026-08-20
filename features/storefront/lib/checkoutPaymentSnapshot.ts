export type CheckoutPaymentSnapshot = {
  cartId: string;
  id: string;
  clientSecret: string;
  paymentIntentId: string;
  windowId: string;
  fulfillmentMethod: 'delivery' | 'pickup';
  couponCode?: string;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  discount: number;
  total: number;
};

function requiredMoney(value: unknown, label: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Payment session did not return an authoritative ${label}`);
  }
  return amount;
}

export function createCheckoutPaymentSnapshot(input: {
  cartId: string;
  windowId: string;
  fulfillmentMethod: 'delivery' | 'pickup';
  couponCode?: string;
  payment: {
    id?: string | null;
    amount?: number | string | null;
    data?: Record<string, unknown> | null;
  };
}): CheckoutPaymentSnapshot {
  const data = input.payment.data || {};
  const id = input.payment.id?.trim();
  const clientSecret = String(data.clientSecret || '').trim();
  const paymentIntentId = String(data.paymentIntentId || '').trim();
  if (!id || !clientSecret || !paymentIntentId) {
    throw new Error('Payment session did not return the Stripe payment identity');
  }
  return {
    cartId: input.cartId,
    id,
    clientSecret,
    paymentIntentId,
    windowId: input.windowId,
    fulfillmentMethod: input.fulfillmentMethod,
    couponCode: input.couponCode,
    subtotal: requiredMoney(data.subtotal, 'subtotal'),
    tax: requiredMoney(data.tax, 'tax'),
    deliveryFee: requiredMoney(data.deliveryFee, 'delivery fee'),
    discount: requiredMoney(data.discount, 'discount'),
    total: requiredMoney(data.total ?? input.payment.amount, 'total'),
  };
}

export function checkoutPaymentSnapshotMatches(
  snapshot: CheckoutPaymentSnapshot | null,
  expected: {
    cartId: string;
    windowId: string;
    fulfillmentMethod: 'delivery' | 'pickup';
    couponCode?: string;
  },
) {
  return Boolean(
    snapshot &&
    snapshot.cartId === expected.cartId &&
    snapshot.windowId === expected.windowId &&
    snapshot.fulfillmentMethod === expected.fulfillmentMethod &&
    snapshot.couponCode === expected.couponCode,
  );
}
