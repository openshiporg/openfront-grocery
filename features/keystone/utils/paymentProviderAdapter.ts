export async function executeAdapterFunction({ provider, functionName, args }: { provider: any; functionName: string; args: any }) {
  const functionPath = provider?.[functionName];

  if (!functionPath) {
    throw new Error(`Provider ${provider?.code || 'unknown'} is missing ${functionName}`);
  }

  if (functionPath.startsWith('http')) {
    const response = await fetch(functionPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, ...args }),
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.statusText}`);
    }

    return response.json();
  }

  const adapter = await import(`../../integrations/payment/${functionPath}.ts`);
  const fn = adapter[functionName];

  if (!fn) {
    throw new Error(`Function ${functionName} not found in adapter ${functionPath}`);
  }

  return fn({ provider, ...args });
}

export async function createPayment({ provider, cart, order, amount, currency }: { provider: any; cart?: any; order?: any; amount: number; currency: string }) {
  return executeAdapterFunction({
    provider,
    functionName: 'createPaymentFunction',
    args: { cart, order, amount, currency },
  });
}

export async function capturePayment({ provider, paymentId, amount }: { provider: any; paymentId: string; amount?: number }) {
  return executeAdapterFunction({
    provider,
    functionName: 'capturePaymentFunction',
    args: { paymentId, amount },
  });
}

export async function refundPayment({ provider, paymentId, amount }: { provider: any; paymentId: string; amount?: number }) {
  return executeAdapterFunction({
    provider,
    functionName: 'refundPaymentFunction',
    args: { paymentId, amount },
  });
}

export async function getPaymentStatus({ provider, paymentId }: { provider: any; paymentId: string }) {
  return executeAdapterFunction({
    provider,
    functionName: 'getPaymentStatusFunction',
    args: { paymentId },
  });
}
