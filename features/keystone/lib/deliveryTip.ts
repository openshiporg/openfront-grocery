import { publicError } from './publicError';

/** Delivery tips are optional, whole cents, and capped well above any realistic tip. */
export const MAX_DELIVERY_TIP_CENTS = 20_000;

export function normalizeDeliveryTipCents(value: unknown, fulfillmentMethod: 'delivery' | 'pickup') {
  if (value === undefined || value === null || value === 0) return 0;
  const tip = Number(value);
  if (!Number.isSafeInteger(tip) || tip < 0 || tip > MAX_DELIVERY_TIP_CENTS) throw publicError('Choose a tip between $0 and $200.', 'CHECKOUT_DETAILS');
  if (tip > 0 && fulfillmentMethod !== 'delivery') throw publicError('Tips are for delivery orders.', 'CHECKOUT_DETAILS');
  return tip;
}
