// Customer self-cancel eligibility and checkout driver tips. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { customerCancellationBlocker, customerOwnsOrder, CUSTOMER_CANCELLABLE_STATUSES } = require('../features/keystone/mutations/cancelMyGroceryOrder.ts');
const { normalizeDeliveryTipCents } = require('../features/keystone/lib/deliveryTip.ts');
const { priceActualSale } = require('../features/keystone/mutations/finalizeGroceryOrderActuals.ts');

test('customers may cancel only before shopping starts', () => {
  assert.deepEqual(CUSTOMER_CANCELLABLE_STATUSES, ['pending']);
});

test('an uncaptured card hold can be released by the customer; a capture cannot', () => {
  assert.equal(customerCancellationBlocker([{ status: 'authorized', amountCents: 4200 }]), null);
  assert.match(customerCancellationBlocker([{ status: 'succeeded', amountCents: 4200 }]), /already been charged/);
  assert.match(customerCancellationBlocker([{ status: 'partially_refunded', amountCents: 4200 }]), /already been charged/);
});

test('a hold whose release is in flight waits instead of double-voiding', () => {
  assert.match(customerCancellationBlocker([{ status: 'authorized', amountCents: 4200, providerData: { authorizationVoid: { status: 'processing' } } }]), /being released/);
});

test('only the signed-in owner may cancel; a guest needs the order link', () => {
  const order = { id: 'o1', userId: 'u1', metadata: {} };
  assert.equal(customerOwnsOrder(order, { itemId: 'u1' }, { orderId: 'o1' }), true);
  assert.equal(customerOwnsOrder(order, { itemId: 'u2' }, { orderId: 'o1' }), false);
  assert.equal(customerOwnsOrder(order, undefined, { orderId: 'o1', sessionId: 's', token: 't' }), false);
  assert.equal(customerOwnsOrder({ id: 'o2', userId: null, metadata: { guestSessionId: 's' } }, undefined, { orderId: 'o2', sessionId: 's', token: 'forged' }), false);
});

test('tips are optional whole cents, delivery only, capped at $200', () => {
  assert.equal(normalizeDeliveryTipCents(undefined, 'delivery'), 0);
  assert.equal(normalizeDeliveryTipCents(500, 'delivery'), 500);
  assert.equal(normalizeDeliveryTipCents(0, 'pickup'), 0);
  assert.throws(() => normalizeDeliveryTipCents(500, 'pickup'), /delivery orders/);
  assert.throws(() => normalizeDeliveryTipCents(20_001, 'delivery'), /between/);
  assert.throws(() => normalizeDeliveryTipCents(2.5, 'delivery'), /between/);
  assert.throws(() => normalizeDeliveryTipCents(-1, 'delivery'), /between/);
});

const line = (over = {}) => ({ lineItemId: 'l1', productId: 'p1', quantityMilli: 1000, unitPriceCents: 1000, subtotalCents: 1000, taxRateBasisPoints: 0, evidence: {}, ...over });

test('the final picked sale carries the checkout tip untaxed', () => {
  const sale = priceActualSale({ deliveryFeeCents: 499, metadata: { tipCents: 500 } }, [line()]);
  assert.equal(sale.tipCents, 500);
  assert.equal(sale.totalCents, 1000 + 499 + 500);
});

test('untipped sales are unchanged and carry no tip field', () => {
  const sale = priceActualSale({ deliveryFeeCents: 499, metadata: {} }, [line()]);
  assert.equal('tipCents' in sale, false);
  assert.equal(sale.totalCents, 1499);
});

test('nothing picked means no tip is charged', () => {
  const sale = priceActualSale({ deliveryFeeCents: 499, metadata: { tipCents: 500 } }, [line({ quantityMilli: 0, subtotalCents: 0 })]);
  assert.equal(sale.totalCents, 0);
});
