// Grocery in-process order confirmation: claims only this order's event, sends once, marks it so the worker can't resend. Offline.
const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const Module = require('node:module');
const orig = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'nodemailer') return { createTransport: () => ({ sendMail: async () => { throw new Error('no network in tests'); } }) };
  return orig.call(this, request, ...rest);
};
const { deliverOrderConfirmationNow } = require('../features/keystone/lib/orderConfirmationDelivery.ts');

function fixture({ status = 'pending', send, claim, configured = true } = {}) {
  const events = new Map([['order.confirmed:o1', { id: 'ev1', eventKey: 'order.confirmed:o1', eventType: 'order.confirmed', aggregateType: 'Order', aggregateId: 'o1', schemaVersion: 1, payload: { orderId: 'o1' }, payloadHash: 'h', occurredAt: new Date(), status, attempts: 0, claimToken: '' }]]);
  events.set('order.confirmed:o2', { ...events.get('order.confirmed:o1'), id: 'ev2', eventKey: 'order.confirmed:o2', aggregateId: 'o2' });
  const calls = { sent: [], external: 0, updates: [] };
  const message = { id: 'm1', recipient: 'delivered@resend.dev', subject: 'Order #1', status: 'pending', providerEvidence: {} };
  const prisma = {
    groceryOutboxEvent: {
      findUnique: async ({ where }) => events.get(where.eventKey) || null,
      updateMany: async ({ where, data }) => {
        const row = [...events.values()].find((e) => e.id === where.id);
        if (!row || (where.status && row.status !== where.status) || (where.claimToken && row.claimToken !== where.claimToken)) return { count: 0 };
        const { attempts, ...rest } = data; Object.assign(row, rest); if (attempts) row.attempts += attempts.increment; return { count: 1 };
      },
    },
    order: { findUnique: async () => ({ id: 'o1', storeId: 's1', userId: null, email: 'delivered@resend.dev', displayId: 1, currencyCode: 'USD', metadata: { guestSessionId: 'sess1' }, lineItems: [{ title: 'Apples', quantity: 1, unitPriceCents: 100, productTitle: 'Apples' }] }) },
    notificationPreference: { findFirst: async () => null },
    customerMessage: { findUnique: async () => ({ ...message }) },
  };
  const context = { prisma };
  const deps = {
    configured: () => configured,
    claim: claim || (async () => ({ message, token: 't', send: true, unresolved: false })),
    update: async (_c, _d, data) => { calls.updates.push(data); if (data.status) message.status = data.status; return message; },
    send: send || (async (m) => { calls.sent.push(m); return { providerId: '<grocery-m1@x>', channel: 'email' }; }),
    external: async () => { calls.external += 1; return { configured: false }; },
  };
  return { events, calls, context, deps, message };
}

test('sends this order\'s confirmation once, marks the event delivered, leaves other events untouched', async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://grocery.test';
  const f = fixture();
  assert.equal((await deliverOrderConfirmationNow(f.context, 'o1', f.deps)).status, 'delivered');
  assert.equal(f.calls.sent.length, 1);
  assert.equal(f.calls.sent[0].to, 'delivered@resend.dev');
  assert.match(f.calls.sent[0].text, /order-access#/);
  assert.equal(f.events.get('order.confirmed:o1').status, 'delivered');
  assert.equal(f.events.get('order.confirmed:o2').status, 'pending');
});

test('replay or an event already claimed/delivered by the worker does not resend', async () => {
  for (const status of ['processing', 'delivered', 'unknown', 'failed']) {
    const f = fixture({ status });
    assert.equal((await deliverOrderConfirmationNow(f.context, 'o1', f.deps)).status, 'already_handled');
    assert.equal(f.calls.sent.length, 0);
  }
  const once = fixture();
  await deliverOrderConfirmationNow(once.context, 'o1', once.deps);
  await deliverOrderConfirmationNow(once.context, 'o1', once.deps);
  assert.equal(once.calls.sent.length, 1);
});

test('SMTP not configured: nothing claimed, event stays pending for the worker/button', async () => {
  const f = fixture({ configured: false });
  assert.equal((await deliverOrderConfirmationNow(f.context, 'o1', f.deps)).status, 'skipped_not_configured');
  assert.equal(f.events.get('order.confirmed:o1').status, 'pending');
  assert.equal(f.calls.sent.length, 0);
});

test('a definitive send failure marks the event failed for retry and never throws', async () => {
  const f = fixture({ send: async () => { throw Object.assign(new Error('rejected'), { definitive: true }); } });
  assert.equal((await deliverOrderConfirmationNow(f.context, 'o1', f.deps)).status, 'failed');
  assert.equal(f.events.get('order.confirmed:o1').status, 'failed');
  assert.equal(f.message.status, 'failed');
});

test('an ambiguous send failure is recorded unknown, not retried blindly', async () => {
  const f = fixture({ send: async () => { throw new Error('socket closed'); } });
  assert.equal((await deliverOrderConfirmationNow(f.context, 'o1', f.deps)).status, 'unknown');
  assert.equal(f.events.get('order.confirmed:o1').status, 'unknown');
  assert.equal(f.message.status, 'unknown');
});

test('an unresolved prior message is not resent', async () => {
  const f = fixture({ claim: async () => ({ message: { id: 'm1' }, token: '', send: false, unresolved: true }) });
  assert.equal((await deliverOrderConfirmationNow(f.context, 'o1', f.deps)).status, 'unknown');
  assert.equal(f.calls.sent.length, 0);
});

test('a missing event or a lookup error never throws', async () => {
  const f = fixture();
  assert.equal((await deliverOrderConfirmationNow(f.context, 'nope', f.deps)).status, 'no_event');
  const broken = { prisma: { groceryOutboxEvent: { findUnique: async () => { throw new Error('db down'); } } } };
  assert.equal((await deliverOrderConfirmationNow(broken, 'o1', f.deps)).status, 'failed');
});
