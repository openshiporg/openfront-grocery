import Stripe from 'stripe';

const getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error('Stripe secret key not configured');
  }

  return new Stripe(stripeKey, {
    apiVersion: '2025-08-27.basil',
  });
};

export function stripeCheckoutMetadata(cart?: any, order?: any): Record<string, string> {
  // A revised authorization carries its durable binding (Store, order, settlement,
  // frozen-sale fingerprint) so a lost response can be recovered and verified.
  const revised = order?.revisedAuthorization;
  if (revised) return { source: 'openfront-grocery', kind: 'revised_authorization', orderId: String(order.id || ''), storeId: String(revised.storeId || ''),
    settlementId: String(revised.settlementId || ''), fingerprint: String(revised.fingerprint || '') };
  return { source: 'openfront-grocery', cartId: String(cart?.id || ''), sessionId: String(cart?.sessionId || ''), ...(cart?.checkoutPaymentSessionId ? {
    paymentSessionId: String(cart.checkoutPaymentSessionId), checkoutFingerprint: String(cart.checkoutFingerprint || ''), cartFingerprint: String(cart.cartFingerprint || '') } : {}) };
}

export async function createPaymentFunction({ cart, order, amount, currency, idempotencyKey, captureMethod = 'automatic' }: { cart?: any; order?: any; amount: number; currency: string; idempotencyKey?: string; captureMethod?: 'automatic' | 'manual' }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    capture_method: captureMethod,
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: stripeCheckoutMetadata(cart, order),
  }, idempotencyKey ? { idempotencyKey } : undefined);

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

export async function capturePaymentFunction({ paymentId, amount, amountCents, idempotencyKey }: { paymentId: string; amount?: number; amountCents?: number; idempotencyKey: string }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    amount_to_capture: amountCents ?? amount,
  }, { idempotencyKey });

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount_received,
    amountCents: paymentIntent.amount_received,
    currency: paymentIntent.currency,
    data: paymentIntent,
  };
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey, timeoutMs }: { paymentId: string; amount?: number; idempotencyKey?: string; timeoutMs?: number }) {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentId,
      amount,
      metadata: idempotencyKey ? { groceryRefundKey: idempotencyKey } : undefined,
    },
    { ...(idempotencyKey ? { idempotencyKey } : {}), ...(timeoutMs ? { timeout: timeoutMs } : {}) },
  );

  return {
    status: refund.status,
    amount: refund.amount,
    currency: refund.currency,
    paymentId: typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id,
    data: refund,
  };
}

export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);

  return {
    status: paymentIntent.status,
    amount: paymentIntent.status === 'succeeded' ? paymentIntent.amount_received : paymentIntent.amount,
    amountCents: paymentIntent.status === 'succeeded' ? paymentIntent.amount_received : paymentIntent.amount,
    currency: paymentIntent.currency,
    authorizedAmountCents: paymentIntent.amount,
    capturedAmountCents: paymentIntent.amount_received,
    capturableAmountCents: paymentIntent.amount_capturable,
    captureMethod: paymentIntent.capture_method,
    data: paymentIntent,
  };
}

export async function getRefundStatusFunction({ refundId, timeoutMs }: { refundId: string; timeoutMs?: number }) {
  const refund = await getStripeClient().refunds.retrieve(refundId, {}, timeoutMs ? { timeout: timeoutMs } : undefined);
  return { id: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency,
    paymentId: typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id, data: refund };
}

export async function cancelPaymentFunction({ paymentId, idempotencyKey }: { paymentId: string; idempotencyKey?: string }) {
  const intent = await getStripeClient().paymentIntents.cancel(paymentId, {}, idempotencyKey ? { idempotencyKey } : undefined);
  return { status: intent.status, amount: intent.amount_received, amountCents: intent.amount_received, currency: intent.currency, data: intent };
}

export async function generatePaymentLinkFunction({ paymentId }: { paymentId: string }) {
  return `https://dashboard.stripe.com/payments/${paymentId}`;
}

export async function handleWebhookFunction({ rawBody, headers }: { rawBody: string; headers: Record<string, string> }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret is not configured');
  }

  const signature = headers['stripe-signature'];

  if (!signature || !rawBody) {
    throw new Error('Stripe webhook signature and raw body are required');
  }

  try {
    const stripeEvent = Stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    return {
      isValid: true as const,
      event: stripeEvent,
      eventId: stripeEvent.id,
      type: stripeEvent.type,
      resource: stripeEvent.data.object,
    };
  } catch (err: any) {
    throw new Error(`Webhook signature verification failed: ${err?.message || 'Unknown error'}`);
  }
}
