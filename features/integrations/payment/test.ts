import { createHmac, timingSafeEqual } from 'node:crypto';

const TEST_PROVIDER_SECRET_ENV = 'GROCERY_PAYMENT_TEST_SECRET';
const paymentStates = new Map<string, any>();
const refundStates = new Map<string, any>();

function secret() {
  const value = process.env[TEST_PROVIDER_SECRET_ENV];
  if (!value) throw new Error(`${TEST_PROVIDER_SECRET_ENV} is required for the local payment adapter`);
  return value;
}

function signature(rawBody: string) {
  return createHmac('sha256', secret()).update(rawBody).digest('hex');
}

export async function createPaymentFunction({ amount, currency, idempotencyKey, captureMethod = 'automatic' }: { amount: number; currency: string; idempotencyKey?: string; captureMethod?: 'automatic' | 'manual' }) {
  secret();
  const paymentIntentId = `test_pi_${Buffer.from(idempotencyKey || `${currency}:${amount}:${Date.now()}`).toString('base64url')}`;
  if (!paymentStates.has(paymentIntentId)) paymentStates.set(paymentIntentId, { status: captureMethod === 'manual' ? 'requires_capture' : 'succeeded', amount, amountCents: amount, currency: currency.toLowerCase(), authorizedAmountCents: amount, capturedAmountCents: captureMethod === 'manual' ? 0 : amount, capturableAmountCents: captureMethod === 'manual' ? amount : 0, captureMethod });
  return { clientSecret: `${paymentIntentId}_secret`, paymentIntentId, amount, currency: currency.toLowerCase() };
}

export async function capturePaymentFunction({ paymentId, amount, amountCents }: { paymentId: string; amount?: number; amountCents?: number; idempotencyKey: string }) {
  secret();
  const current = await getPaymentStatusFunction({ paymentId });
  const captured = amountCents ?? amount ?? current.authorizedAmountCents;
  if (!Number.isInteger(captured) || captured < 1 || captured > current.authorizedAmountCents) throw new Error('Capture exceeds authorized amount');
  if (current.status === 'canceled' || (current.status === 'succeeded' && current.capturedAmountCents !== captured)) throw new Error('Payment cannot be recaptured');
  const result = { ...current, status: 'succeeded', amount: captured, amountCents: captured, capturedAmountCents: captured, capturableAmountCents: 0, data: { id: paymentId, status: 'succeeded' } };
  paymentStates.set(paymentId, result);
  return result;
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey }: { paymentId: string; amount?: number; idempotencyKey?: string }) {
  secret();
  if (process.env.GROCERY_TEST_PROVIDER_TIMEOUT === 'true') await new Promise((resolve) => setTimeout(resolve, 250));
  if (!paymentId) throw new Error('Test payment id is required');
  const refundedAmount = amount ?? Number((await getPaymentStatusFunction({ paymentId })).amount || 0);
  const refundId = `test_re_${Buffer.from(idempotencyKey || paymentId).toString('base64url')}`;
  if (refundStates.has(refundId)) return refundStates.get(refundId);
  const payment = await getPaymentStatusFunction({ paymentId });
  const result = {
    status: 'succeeded',
    amount: refundedAmount,
    currency: payment.currency,
    paymentId,
    data: { id: refundId, payment_intent: paymentId, amount: refundedAmount, currency: payment.currency, fullRefund: amount === undefined, metadata: { groceryRefundKey: idempotencyKey } },
  };
  refundStates.set(refundId, result);
  return result;
}

export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  secret();
  if (paymentStates.has(paymentId)) return paymentStates.get(paymentId);
  let amount = 0;
  let currency = 'usd';
  if (paymentId.startsWith('test_pi_')) {
    try {
      const decoded = Buffer.from(paymentId.slice('test_pi_'.length), 'base64url').toString('utf8');
      const last = decoded.split(':').at(-1);
      if (last && /^\d+$/.test(last)) amount = Number(last);
    } catch { /* malformed local IDs remain amount-mismatched and fail closed */ }
  }
  return { status: 'succeeded', amount, amountCents: amount, currency, authorizedAmountCents: amount, capturedAmountCents: amount, capturableAmountCents: 0, captureMethod: 'automatic', data: { id: paymentId, status: 'succeeded', amount, currency } };
}

export async function getRefundStatusFunction({ refundId }: { refundId: string }) {
  secret();
  const refund = refundStates.get(refundId);
  if (!refund) throw new Error('Test refund not found');
  return refund;
}

export async function cancelPaymentFunction({ paymentId }: { paymentId: string; idempotencyKey?: string }) {
  secret();
  const current = await getPaymentStatusFunction({ paymentId });
  if (current.status === 'succeeded') throw new Error('Captured payment requires refund');
  const result = { ...current, status: 'canceled', capturableAmountCents: 0 };
  paymentStates.set(paymentId, result);
  return result;
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
