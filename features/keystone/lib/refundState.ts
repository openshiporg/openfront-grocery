export type RefundStatus = 'processing' | 'failed' | 'canceled' | 'succeeded';

export type RefundEventOrder = {
  createdAtMs: number;
  version: number;
  eventId: string;
};

export function isRefundStatus(value: string): value is RefundStatus {
  return value === 'processing' || value === 'failed' || value === 'canceled' || value === 'succeeded';
}

export function compareRefundEventOrder(left: RefundEventOrder, right: RefundEventOrder) {
  if (left.createdAtMs !== right.createdAtMs) return left.createdAtMs - right.createdAtMs;
  if (left.version !== right.version) return left.version - right.version;
  return left.eventId.localeCompare(right.eventId);
}

/**
 * Refund evidence is monotonic: processing cannot regress a terminal state and
 * succeeded is terminal. Failed/canceled may only be replaced by a newer
 * provider event, which permits an explicitly ordered valid recovery.
 */
export function shouldApplyRefundTransition(
  currentStatus: RefundStatus,
  incomingStatus: RefundStatus,
  currentOrder: RefundEventOrder | null,
  incomingOrder: RefundEventOrder,
) {
  if (currentStatus === 'succeeded') return false;
  if (currentStatus !== 'processing' && incomingStatus === 'processing') return false;
  if (!currentOrder) return true;
  return compareRefundEventOrder(incomingOrder, currentOrder) > 0;
}
