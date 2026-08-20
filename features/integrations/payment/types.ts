export type PaymentProviderRecord = {
  id: string;
  code: string;
  isInstalled: boolean;
};

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
  }): Promise<any>;
  capturePaymentFunction(args: { paymentId: string; amount?: number }): Promise<any>;
  refundPaymentFunction(args: { paymentId: string; amount?: number; idempotencyKey?: string }): Promise<any>;
  getPaymentStatusFunction(args: { paymentId: string }): Promise<any>;
  generatePaymentLinkFunction(args: { paymentId: string }): Promise<string>;
  handleWebhookFunction(args: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<PaymentWebhookResult>;
}
