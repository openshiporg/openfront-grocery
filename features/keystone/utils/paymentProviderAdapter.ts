import {
  getPaymentProviderAdapter,
  type PaymentProviderRecord,
} from '../../integrations/payment';

type AdapterFunctionName =
  | 'createPaymentFunction'
  | 'capturePaymentFunction'
  | 'refundPaymentFunction'
  | 'getPaymentStatusFunction'
  | 'generatePaymentLinkFunction';

export async function executeAdapterFunction({
  provider,
  functionName,
  args,
}: {
  provider: PaymentProviderRecord;
  functionName: AdapterFunctionName;
  args: any;
}) {
  if (!provider?.isInstalled) {
    throw new Error(`Payment provider ${provider?.code || 'unknown'} is not installed`);
  }

  const adapter = getPaymentProviderAdapter(provider.code);
  return adapter[functionName](args as never);
}

export async function createPayment({ provider, cart, order, amount, currency, idempotencyKey }: { provider: PaymentProviderRecord; cart?: any; order?: any; amount: number; currency: string; idempotencyKey?: string }) {
  return executeAdapterFunction({
    provider,
    functionName: 'createPaymentFunction',
    args: { cart, order, amount, currency, idempotencyKey },
  });
}

export async function capturePayment({ provider, paymentId, amount }: { provider: PaymentProviderRecord; paymentId: string; amount?: number }) {
  return executeAdapterFunction({
    provider,
    functionName: 'capturePaymentFunction',
    args: { paymentId, amount },
  });
}

export async function refundPayment({ provider, paymentId, amount, idempotencyKey }: { provider: PaymentProviderRecord; paymentId: string; amount?: number; idempotencyKey?: string }) {
  return executeAdapterFunction({
    provider,
    functionName: 'refundPaymentFunction',
    args: { paymentId, amount, idempotencyKey },
  });
}

export async function getPaymentStatus({ provider, paymentId }: { provider: PaymentProviderRecord; paymentId: string }) {
  return executeAdapterFunction({
    provider,
    functionName: 'getPaymentStatusFunction',
    args: { paymentId },
  });
}

export async function verifyPaymentWebhook({
  providerCode,
  rawBody,
  headers,
}: {
  providerCode: string;
  rawBody: string;
  headers: Record<string, string>;
}) {
  const adapter = getPaymentProviderAdapter(providerCode);
  return adapter.handleWebhookFunction({ rawBody, headers });
}
