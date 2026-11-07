import { GraphQLError } from 'graphql';

export type TransitionMap = Readonly<Record<string, readonly string[]>>;

/** One table for Order.status. Pickup orders go packed -> delivered (handoff); routed orders use the delivery states. */
export const ORDER_TRANSITIONS: TransitionMap = {
  pending: ['picking', 'cancelled'],
  picking: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'delivery_failed', 'delivery_refused', 'returned'],
  delivery_failed: ['out_for_delivery', 'returned'],
  delivery_refused: ['out_for_delivery', 'returned'],
  returned: ['packed', 'cancelled'],
  delivered: [],
  cancelled: [],
};

/** Staff triage: closed can be reopened to in_progress but never goes back to new. */
export const CONTACT_MESSAGE_TRANSITIONS: TransitionMap = {
  new: ['in_progress', 'replied', 'closed'],
  in_progress: ['replied', 'closed'],
  replied: ['in_progress', 'closed'],
  closed: ['in_progress'],
};

export function canTransition(map: TransitionMap, from: string, to: string) {
  return from === to || Boolean(map[from]?.includes(to));
}

export function assertTransition(map: TransitionMap, label: string, from: string, to: string) {
  if (!canTransition(map, from, to)) {
    throw new GraphQLError(`${label} cannot move from ${from} to ${to}`, { extensions: { code: 'TRANSITION_REFUSED' } });
  }
}

/** The stage a reader should see: ready_for_pickup is packed + pickup + readyForPickup, made explicit. */
export function fulfillmentStage(order: { status?: string | null; metadata?: any }) {
  const meta = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  if (order.status === 'packed' && meta.fulfillmentMethod === 'pickup' && meta.readyForPickup === true) return 'ready_for_pickup';
  return order.status || '';
}
