function operatorOnly(): never {
  throw new Error(
    'Manual and cash payments require an authenticated operator reconciliation workflow; they cannot settle public checkout or webhook requests.'
  );
}

export async function createPaymentFunction() {
  return operatorOnly();
}

export async function capturePaymentFunction() {
  return operatorOnly();
}

export async function refundPaymentFunction() {
  return operatorOnly();
}

export async function getPaymentStatusFunction() {
  return operatorOnly();
}

export async function generatePaymentLinkFunction() {
  return operatorOnly();
}

export async function handleWebhookFunction() {
  return operatorOnly();
}
