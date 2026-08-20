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

export async function createPaymentFunction({ cart, amount, currency, idempotencyKey }: { cart?: any; amount: number; currency: string; idempotencyKey?: string }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: {
      cartId: cart?.id || '',
      sessionId: cart?.sessionId || '',
    },
  }, idempotencyKey ? { idempotencyKey } : undefined);

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

export async function capturePaymentFunction({ paymentId, amount }: { paymentId: string; amount?: number }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.capture(paymentId, {
    amount_to_capture: amount,
  });

  return {
    status: paymentIntent.status,
    amount: (paymentIntent as any).amount_captured,
    data: paymentIntent,
  };
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey }: { paymentId: string; amount?: number; idempotencyKey?: string }) {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentId,
      amount,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  return {
    status: refund.status,
    amount: refund.amount,
    data: refund,
  };
}

export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    data: paymentIntent,
  };
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
