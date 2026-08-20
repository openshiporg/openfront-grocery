export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded';

export type PaymentEventStatus = Extract<PaymentStatus, 'processing' | 'succeeded' | 'failed' | 'cancelled'>;

export type PaymentEventOrder = {
  createdAtMs: number;
  version: number;
  eventId: string;
};

const SAME_INSTANT_PRIORITY: Record<PaymentEventStatus, number> = {
  processing: 1,
  failed: 2,
  cancelled: 2,
  succeeded: 3,
};

function compareProviderPosition(left: PaymentEventOrder, right: PaymentEventOrder) {
  if (left.createdAtMs !== right.createdAtMs) return left.createdAtMs - right.createdAtMs;
  if (left.version !== right.version) return left.version - right.version;
  return 0;
}

/**
 * Provider payment events may arrive out of order. Local refund states and a
 * succeeded charge cannot be regressed by normal PaymentIntent/charge events.
 * Newer retries may recover processing/failed/cancelled states to succeeded.
 */
export function shouldApplyPaymentTransition(
  currentStatus: PaymentStatus,
  incomingStatus: PaymentEventStatus,
  currentOrder: PaymentEventOrder | null,
  incomingOrder: PaymentEventOrder,
) {
  if (currentStatus === 'refunded' || currentStatus === 'partially_refunded') return false;
  if (currentStatus === 'succeeded') return incomingStatus === 'succeeded' && Boolean(
    !currentOrder || compareProviderPosition(incomingOrder, currentOrder) > 0,
  );
  if (!currentOrder) return true;

  const position = compareProviderPosition(incomingOrder, currentOrder);
  if (position !== 0) return position > 0;

  const currentProviderStatus = currentStatus === 'pending' ? 'processing' : currentStatus;
  const priorityDelta = SAME_INSTANT_PRIORITY[incomingStatus] - SAME_INSTANT_PRIORITY[currentProviderStatus];
  if (priorityDelta !== 0) return priorityDelta > 0;
  return incomingOrder.eventId.localeCompare(currentOrder.eventId) > 0;
}

export function paymentEventOrderFromProviderData(providerData: unknown): PaymentEventOrder | null {
  const evidence = (providerData as { paymentWebhook?: Record<string, unknown> } | null)?.paymentWebhook;
  if (!evidence || typeof evidence.eventId !== 'string') return null;
  const createdAtMs = Number(evidence.createdAtMs || 0);
  const version = Number(evidence.version || 0);
  if (!Number.isFinite(createdAtMs) || createdAtMs < 0 || !Number.isInteger(version) || version < 0) return null;
  return { createdAtMs, version, eventId: evidence.eventId };
}
