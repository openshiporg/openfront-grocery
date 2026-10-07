import {
  assertProviderCredentials,
  getConfiguredPaymentAdapterSelector,
  getLocalPaymentProviderAdapter,
  projectRemoteProviderCredentials,
  type PaymentProviderOperation,
  type PaymentProviderRecord,
  type PaymentWebhookResult,
} from '../../integrations/payment';

const MAX_REMOTE_RESPONSE_BYTES = 1_048_576;
const SAFE_WEBHOOK_HEADERS = new Set([
  'stripe-signature', 'paypal-transmission-id', 'paypal-transmission-time',
  'paypal-cert-url', 'paypal-auth-algo', 'paypal-transmission-sig',
  'x-grocery-test-signature',
]);
const FORBIDDEN_HEADERS = /^(cookie|set-cookie|authorization|proxy-authorization|host|content-length|connection|x-forwarded-|forwarded$)/i;

function providerMetadata(provider: PaymentProviderRecord) {
  return provider.metadata && typeof provider.metadata === 'object' && !Array.isArray(provider.metadata)
    ? provider.metadata as Record<string, unknown> : {};
}

function safeProviderCredentials(provider: PaymentProviderRecord) {
  return projectRemoteProviderCredentials(provider);
}

function safeWebhookHeaders(provider: PaymentProviderRecord, headers: Record<string, string>) {
  const configured = providerMetadata(provider).remoteWebhookHeaders;
  const allowed = new Set(SAFE_WEBHOOK_HEADERS);
  if (Array.isArray(configured)) {
    for (const candidate of configured.slice(0, 20)) {
      if (typeof candidate !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(candidate)) continue;
      const name = candidate.toLowerCase();
      if (!FORBIDDEN_HEADERS.test(name)) allowed.add(name);
    }
  }
  return Object.fromEntries(Object.entries(headers || {}).filter(([key, value]) => {
    const name = key.toLowerCase();
    return allowed.has(name) && !FORBIDDEN_HEADERS.test(name) && typeof value === 'string' && value.length <= 8192;
  }));
}

/**
 * Explicitly bounded server-to-adapter contract. It never forwards Store
 * cookies, customer contact/address data, complete carts/orders, or arbitrary
 * headers. External adapters receive authoritative minor-unit amounts.
 */
export function paymentAdapterPayload(provider: PaymentProviderRecord, operation: PaymentProviderOperation, args: any) {
  const input: Record<string, unknown> = {};
  for (const key of ['currency', 'idempotencyKey', 'paymentId', 'refundId', 'captureMethod', 'rawBody']) {
    const value = args?.[key];
    if (typeof value === 'string' && value.length <= (key === 'rawBody' ? 1_000_000 : 500)) input[key] = value;
  }
  let amountCents = args?.amountCents;
  if (amountCents === undefined && Number.isSafeInteger(args?.amount)) amountCents = args.amount;
  if (Number.isSafeInteger(amountCents) && amountCents >= 0) input.amountCents = amountCents;
  if (args?.cart && typeof args.cart === 'object') {
    input.cart = Object.fromEntries(['id'].filter((key) => typeof args.cart[key] === 'string').map((key) => [key, args.cart[key]]));
  }
  if (args?.order && typeof args.order === 'object') {
    input.order = Object.fromEntries(['id', 'displayId', 'currencyCode'].filter((key) => args.order[key] !== undefined).map((key) => [key, args.order[key]]));
  }
  if (operation === 'handleWebhookFunction') input.headers = safeWebhookHeaders(provider, args?.headers || {});
  return {
    provider: { id: provider.id, code: provider.code, credentials: safeProviderCredentials(provider) },
    operation,
    args: input,
  };
}

async function readBoundedJson(response: Response) {
  const body = response.body as ReadableStream<Uint8Array> | null;
  if (!body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_RESPONSE_BYTES) throw new Error('Payment adapter response exceeds the size limit');
    return JSON.parse(text);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REMOTE_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Payment adapter response exceeds the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const payload = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(payload));
}

async function invokeRemoteAdapter(provider: PaymentProviderRecord, operation: PaymentProviderOperation, endpoint: string, args: any) {
  try {
    const body = JSON.stringify(paymentAdapterPayload(provider, operation, args));
    if (new TextEncoder().encode(body).byteLength > MAX_REMOTE_RESPONSE_BYTES) throw new Error('Payment adapter request exceeds the size limit');
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
    if (!response.ok) throw new Error('Remote payment adapter rejected request');
    return await readBoundedJson(response);
  } catch {
    throw new Error(`External payment adapter ${operation} failed; reconcile the original attempt before retrying`);
  }
}

export async function executeAdapterFunction({
  provider,
  functionName,
  args,
}: {
  provider: PaymentProviderRecord;
  functionName: PaymentProviderOperation;
  args: any;
}) {
  if (!provider?.isInstalled) throw new Error(`Payment provider ${provider?.code || 'unknown'} is not installed`);
  const selector = getConfiguredPaymentAdapterSelector(provider, functionName);
  if (selector.startsWith('https://')) {
    assertProviderCredentials(provider, functionName);
    return invokeRemoteAdapter(provider, functionName, selector, args);
  }

  const adapter = getLocalPaymentProviderAdapter(selector);
  const fn = adapter[functionName] as ((input: any) => Promise<any>) | undefined;
  if (typeof fn !== 'function') throw new Error(`Payment adapter operation ${functionName} is unavailable`);
  return fn(args);
}

export async function createPayment({ provider, cart, order, amount, currency, idempotencyKey, captureMethod }: { provider: PaymentProviderRecord; cart?: any; order?: any; amount: number; currency: string; idempotencyKey?: string; captureMethod?: 'automatic' | 'manual' }) {
  return executeAdapterFunction({ provider, functionName: 'createPaymentFunction', args: { cart, order, amount, amountCents: amount, currency, idempotencyKey, captureMethod } });
}

export async function capturePayment({ provider, paymentId, amount, amountCents, idempotencyKey }: { provider: PaymentProviderRecord; paymentId: string; amount?: number; amountCents?: number; idempotencyKey: string }) {
  return executeAdapterFunction({ provider, functionName: 'capturePaymentFunction', args: { paymentId, amount, amountCents, idempotencyKey } });
}

export async function refundPayment({ provider, paymentId, amount, idempotencyKey }: { provider: PaymentProviderRecord; paymentId: string; amount?: number; idempotencyKey?: string }) {
  return executeAdapterFunction({ provider, functionName: 'refundPaymentFunction', args: { paymentId, amount, amountCents: amount, idempotencyKey } });
}

export async function getPaymentStatus({ provider, paymentId }: { provider: PaymentProviderRecord; paymentId: string }) {
  return executeAdapterFunction({ provider, functionName: 'getPaymentStatusFunction', args: { paymentId } });
}

export async function getRefundStatus({ provider, refundId }: { provider: PaymentProviderRecord; refundId: string }) {
  return executeAdapterFunction({ provider, functionName: 'getRefundStatusFunction', args: { refundId } });
}

export async function cancelPayment({ provider, paymentId, idempotencyKey }: { provider: PaymentProviderRecord; paymentId: string; idempotencyKey?: string }) {
  return executeAdapterFunction({ provider, functionName: 'cancelPaymentFunction', args: { paymentId, idempotencyKey } });
}

export async function generatePaymentLink({ provider, paymentId }: { provider: PaymentProviderRecord; paymentId: string }) {
  return executeAdapterFunction({ provider, functionName: 'generatePaymentLinkFunction', args: { paymentId } });
}

export async function verifyPaymentWebhook({ provider, rawBody, headers }: { provider: PaymentProviderRecord; rawBody: string; headers: Record<string, string> }): Promise<PaymentWebhookResult> {
  const verified = await executeAdapterFunction({ provider, functionName: 'handleWebhookFunction', args: { rawBody, headers } });
  if (!verified || verified.isValid !== true || typeof verified.eventId !== 'string' || !verified.eventId || typeof verified.type !== 'string' || !verified.type
    || typeof verified.event?.id !== 'string' || verified.event.id !== verified.eventId
    || typeof verified.event?.type !== 'string' || verified.event.type !== verified.type) {
    throw new Error('Payment webhook adapter did not return a valid verified event');
  }
  return verified;
}
