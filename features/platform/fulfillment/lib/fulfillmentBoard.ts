export const fulfillmentLaneIds = ['pending', 'picking', 'packed'] as const;

export type FulfillmentLaneId = (typeof fulfillmentLaneIds)[number];
export type FulfillmentTransitionTarget = FulfillmentLaneId | 'ready_for_pickup';

export interface FulfillmentLineItem {
  id: string;
  quantity: number;
  title: string;
  sku?: string | null;
}

export interface FulfillmentOrder {
  id: string;
  displayId: number;
  email: string;
  status: string;
  deliveryTimeWindow?: string | null;
  substitutionPreference?: string | null;
  metadata?: Record<string, unknown> | null;
  lineItems: FulfillmentLineItem[];
}

export interface FulfillmentSubstitution {
  id: string;
  orderItem: string;
  originalProduct: string;
  substitutedProduct: string;
  reason?: string | null;
  customerApproved?: boolean;
  approvedAt?: string | null;
}

export function fulfillmentMethod(order: FulfillmentOrder): 'pickup' | 'delivery' {
  return order.metadata?.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';
}

export function isPickupReady(order: FulfillmentOrder) {
  return Boolean(order.metadata?.readyForPickup);
}

export function nextFulfillmentTransition(order: FulfillmentOrder): FulfillmentTransitionTarget | null {
  if (order.status === 'pending') return 'picking';
  if (order.status === 'picking') return 'packed';
  if (order.status === 'packed' && fulfillmentMethod(order) === 'pickup' && !isPickupReady(order)) {
    return 'ready_for_pickup';
  }
  return null;
}

export function transitionLabel(target: FulfillmentTransitionTarget | null) {
  if (target === 'picking') return 'Start picking';
  if (target === 'packed') return 'Mark packed';
  if (target === 'ready_for_pickup') return 'Mark ready for pickup';
  return null;
}

export function validDropTransition(
  order: FulfillmentOrder,
  destination: FulfillmentLaneId,
): FulfillmentTransitionTarget | null {
  const target = nextFulfillmentTransition(order);
  return target === destination ? target : null;
}

export function applyFulfillmentTransition(
  order: FulfillmentOrder,
  target: FulfillmentTransitionTarget,
): FulfillmentOrder {
  if (target === 'ready_for_pickup') {
    return {
      ...order,
      metadata: { ...(order.metadata || {}), readyForPickup: true },
    };
  }
  return { ...order, status: target };
}

export function formatSubstitutionPreference(value?: string | null) {
  if (value === 'best_match') return 'Best match';
  if (value === 'call_me') return 'Contact customer';
  if (value === 'refund') return 'Remove / refund';
  return 'No preference';
}

export function stageProgress(lane: FulfillmentLaneId) {
  if (lane === 'pending') return 1 / 3;
  if (lane === 'picking') return 2 / 3;
  return 1;
}
