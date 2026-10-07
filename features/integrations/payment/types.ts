export type PaymentProviderOperation =
  | 'createPaymentFunction'
  | 'capturePaymentFunction'
  | 'refundPaymentFunction'
  | 'getPaymentStatusFunction'
  | 'getRefundStatusFunction'
  | 'cancelPaymentFunction'
  | 'generatePaymentLinkFunction'
  | 'handleWebhookFunction';

export type PaymentProviderRecord = {
  id: string;
  code: string;
  isInstalled: boolean;
  publicCheckout?: boolean;
  supportsIdempotentCapture?: boolean;
  captureIdempotencyEvidence?: string;
  credentials?: unknown;
  metadata?: unknown;
  createPaymentFunction?: string;
  capturePaymentFunction?: string;
  refundPaymentFunction?: string;
  getPaymentStatusFunction?: string;
  getRefundStatusFunction?: string;
  cancelPaymentFunction?: string;
  generatePaymentLinkFunction?: string;
  handleWebhookFunction?: string;
};

/**
 * All adapters, including remote ones, return Grocery-canonical webhook data:
 * eventId/type plus a normalized resource carrying provider IDs, integer minor
 * units, ISO currency and status. Remote vendors must map to payment.* and
 * refund.* event types; their raw provider payload stays in private evidence.
 */
export type PaymentWebhookResult = {
  isValid: true;
  event: { id: string; type: string; data?: { object?: unknown } };
  eventId: string;
  type: string;
  resource: any;
};

export interface PaymentProviderAdapter {
  createPaymentFunction(args: {
    cart?: any;
    order?: any;
    amount: number;
    currency: string;
    idempotencyKey?: string;
    captureMethod?: 'automatic' | 'manual';
  }): Promise<any>;
  capturePaymentFunction(args: { paymentId: string; amount?: number; amountCents?: number; idempotencyKey: string }): Promise<any>;
  refundPaymentFunction(args: { paymentId: string; amount?: number; idempotencyKey?: string }): Promise<any>;
  getPaymentStatusFunction(args: { paymentId: string }): Promise<any>;
  getRefundStatusFunction(args: { refundId: string }): Promise<any>;
  cancelPaymentFunction(args: { paymentId: string; idempotencyKey?: string }): Promise<any>;
  generatePaymentLinkFunction(args: { paymentId: string }): Promise<string>;
  handleWebhookFunction(args: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<PaymentWebhookResult>;
}
