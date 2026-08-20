import { createHmac, timingSafeEqual } from 'node:crypto';

const TEST_PROVIDER_SECRET_ENV = 'GROCERY_PAYMENT_TEST_SECRET';

function secret() {
  const value = process.env[TEST_PROVIDER_SECRET_ENV];
  if (!value) throw new Error(`${TEST_PROVIDER_SECRET_ENV} is required for the local payment adapter`);
  return value;
}

function signature(rawBody: string) {
  return createHmac('sha256', secret()).update(rawBody).digest('hex');
}

export async function createPaymentFunction({ amount, currency, idempotencyKey }: { amount: number; currency: string; idempotencyKey?: string }) {
  secret();
  const paymentIntentId = `test_pi_${Buffer.from(idempotencyKey || `${currency}:${amount}:${Date.now()}`).toString('base64url')}`;
  return { clientSecret: `${paymentIntentId}_secret`, paymentIntentId, amount, currency: currency.toLowerCase() };
}

export async function capturePaymentFunction({ paymentId, amount }: { paymentId: string; amount?: number }) {
  secret();
  return { status: 'succeeded', amount: amount ?? 0, data: { id: paymentId, status: 'succeeded' } };
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey }: { paymentId: string; amount?: number; idempotencyKey?: string }) {
  secret();
  if (process.env.GROCERY_TEST_PROVIDER_TIMEOUT === 'true') await new Promise((resolve) => setTimeout(resolve, 250));
  if (!paymentId) throw new Error('Test payment id is required');
  const refundedAmount = amount ?? Number((await getPaymentStatusFunction({ paymentId })).amount || 0);
  return {
    status: 'succeeded',
    amount: refundedAmount,
    data: { id: `test_re_${Buffer.from(idempotencyKey || paymentId).toString('base64url')}`, paymentId, amount: refundedAmount, fullRefund: amount === undefined, idempotencyKey },
  };
}

export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  secret();
  let amount = 0;
  let currency = 'usd';
  if (paymentId.startsWith('test_pi_')) {
    try {
      const decoded = Buffer.from(paymentId.slice('test_pi_'.length), 'base64url').toString('utf8');
      const last = decoded.split(':').at(-1);
      if (last && /^\d+$/.test(last)) amount = Number(last);
    } catch { /* malformed local IDs remain amount-mismatched and fail closed */ }
  }
  return { status: 'succeeded', amount, currency, data: { id: paymentId, status: 'succeeded', amount, currency } };
}

export async function generatePaymentLinkFunction({ paymentId }: { paymentId: string }) {
  secret();
  return `https://test-payments.local/payments/${encodeURIComponent(paymentId)}`;
}

export async function handleWebhookFunction({ rawBody, headers }: { rawBody: string; headers: Record<string, string> }) {
  const expected = signature(rawBody);
  const received = headers['x-grocery-test-signature'];
  if (!received || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    throw new Error('Test payment webhook signature verification failed');
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error('Test payment webhook body must be JSON');
  }
  if (!payload?.id || !payload?.type) throw new Error('Test payment webhook event id and type are required');
  return {
    isValid: true as const,
    event: payload,
    eventId: payload.id,
    type: payload.type,
    resource: payload.data?.object || payload.data || null,
  };
}

export function createTestPaymentWebhookSignature(rawBody: string) {
  return signature(rawBody);
}
