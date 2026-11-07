const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'features/keystone/lib/stateMachines.ts'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports, require);
const m = mod.exports;

test('order: terminal states are final, forward paths work, same-state is a replay', () => {
  for (const [a, b] of [['pending', 'picking'], ['picking', 'packed'], ['packed', 'delivered'], ['packed', 'out_for_delivery'], ['returned', 'packed'], ['delivered', 'delivered']]) assert.ok(m.canTransition(m.ORDER_TRANSITIONS, a, b), `${a}->${b}`);
  for (const [a, b] of [['delivered', 'packed'], ['cancelled', 'pending'], ['pending', 'delivered'], ['out_for_delivery', 'cancelled'], ['picking', 'pending']]) assert.ok(!m.canTransition(m.ORDER_TRANSITIONS, a, b), `${a}->${b}`);
  assert.throws(() => m.assertTransition(m.ORDER_TRANSITIONS, 'Order', 'cancelled', 'picking'), /cannot move from cancelled to picking/);
});
test('contact message: closed never returns to new', () => {
  assert.ok(!m.canTransition(m.CONTACT_MESSAGE_TRANSITIONS, 'closed', 'new'));
  assert.ok(m.canTransition(m.CONTACT_MESSAGE_TRANSITIONS, 'closed', 'in_progress'));
  assert.ok(m.canTransition(m.CONTACT_MESSAGE_TRANSITIONS, 'new', 'closed'));
});
test('ready_for_pickup is exposed as an explicit fulfillment stage', () => {
  assert.equal(m.fulfillmentStage({ status: 'packed', metadata: { fulfillmentMethod: 'pickup', readyForPickup: true } }), 'ready_for_pickup');
  assert.equal(m.fulfillmentStage({ status: 'packed', metadata: { fulfillmentMethod: 'delivery' } }), 'packed');
});
test('every Order.status writer is guarded', () => {
  const read = (f) => fs.readFileSync(path.join(root, 'features/keystone', f), 'utf8');
  for (const f of ['mutations/cancelOrder.ts', 'mutations/customerCheckIn.ts', 'mutations/manageOrderFulfillment.ts', 'mutations/manageDeliveryRoutes.ts', 'lib/deliveryStops.ts', 'lib/deliveryReschedule.ts', 'models/Order.ts']) assert.match(read(f), /ORDER_TRANSITIONS/, f);
  assert.match(read('models/ContactMessage.ts'), /CONTACT_MESSAGE_TRANSITIONS/);
});
