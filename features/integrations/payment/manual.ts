export async function createPaymentFunction({ amount }: { amount: number }) {
  return {
    clientSecret: `manual_secret_${Date.now()}`,
    paymentIntentId: `manual_${Date.now()}`,
    amount,
    provider: 'manual',
  };
}

export async function capturePaymentFunction({ paymentId, amount }: { paymentId: string; amount?: number }) {
  return {
    status: 'succeeded',
    amount,
    data: { id: paymentId, provider: 'manual' },
  };
}

export async function refundPaymentFunction({ paymentId, amount }: { paymentId: string; amount?: number }) {
  return {
    status: 'refunded',
    amount,
    data: { id: paymentId, provider: 'manual' },
  };
}

export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) {
  return {
    status: 'succeeded',
    amount: 0,
    data: { id: paymentId, provider: 'manual' },
  };
}

export async function generatePaymentLinkFunction({ paymentId }: { paymentId: string }) {
  return `manual://${paymentId}`;
}

export async function handleWebhookFunction({ event }: { event: any }) {
  return {
    isValid: true,
    type: event?.type || 'manual.event',
    resource: event,
  };
}
