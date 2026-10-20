export type CheckoutPaymentSnapshot = {
  noCharge?: {version:number;amountCents:number;reason:string};
  customerRequest?: unknown;
  cartId: string;
  /** Fingerprint of the confirmed basket contents this estimate was prepared for. */
  basketFingerprint: string;
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

/** Contents that change what is being bought: lines, products, quantities and substitution choices. */
export function basketFingerprint(cart: { items: Array<{ id: string; quantity: number; substitutionPreference?: string | null; product?: { id?: string } | null }> } | null | undefined) {
  if (!cart) return '';
  return cart.items
    .map((item) => `${item.id}:${item.product?.id || ''}:${item.quantity}:${item.substitutionPreference || ''}`)
    .sort()
    .join('|');
}

export function createCheckoutPaymentSnapshot(input: {
  cartId: string;
  basketFingerprint: string;
  windowId: string;
  fulfillmentMethod: 'delivery' | 'pickup';
  couponCode?: string;
  customerRequest?: unknown;
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
  const noCharge=data.noCharge as CheckoutPaymentSnapshot['noCharge'];
  if (!id || (!clientSecret && !(noCharge?.version===1 && noCharge.amountCents===0)) || !paymentIntentId) {
    throw new Error('Payment session did not return the Stripe payment identity');
  }
  return {
    noCharge,
    customerRequest:input.customerRequest,
    cartId: input.cartId,
    basketFingerprint: input.basketFingerprint,
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
    basketFingerprint: string;
    windowId: string;
    fulfillmentMethod: 'delivery' | 'pickup';
    couponCode?: string;
  },
) {
  return Boolean(
    snapshot &&
    snapshot.cartId === expected.cartId &&
    snapshot.basketFingerprint === expected.basketFingerprint &&
    snapshot.windowId === expected.windowId &&
    snapshot.fulfillmentMethod === expected.fulfillmentMethod &&
    snapshot.couponCode === expected.couponCode,
  );
}
