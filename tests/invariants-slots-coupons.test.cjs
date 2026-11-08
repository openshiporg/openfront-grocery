// Round-2 invariants: slot windows, coupon bounds, owner hooks and the DB backstops.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, slice) {
  let source = read(file);
  if (slice) source = source.slice(source.indexOf(slice[0]), source.indexOf(slice[1])) + `\nmodule.exports.${slice[2]} = ${slice[2]};`;
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, Date, Number, String });
  return mod.exports;
}

test('a slot window is two HH:MM times that end after they start', () => {
  const { slotWindowError } = load('features/keystone/lib/slotWindow.ts');
  assert.equal(slotWindowError('08:00', '10:00'), null);
  assert.match(slotWindowError('10:00', '08:00'), /must end after it starts/);
  assert.match(slotWindowError('10:00', '10:00'), /must end after it starts/);
  assert.match(slotWindowError('9am', '10:00'), /Start time/);
  assert.match(slotWindowError('09:00', '24:00'), /End time/);
});

test('coupons refuse over-100% percentages and windows that end before they start', () => {
  const { validateCouponInput } = load('features/keystone/models/Coupon.ts', ['function isStringList', 'export const Coupon', 'validateCouponInput']);
  const run = (data, item = null) => { const errors = []; validateCouponInput({ productCategories: [], excludedProducts: [], ...data }, item, (m) => errors.push(m)); return errors; };
  assert.deepEqual(run({ code: 'SPRING10', discountType: 'percentage', discountValue: 10 }), []);
  assert.match(run({ code: 'HALFOFF', discountType: 'percentage', discountValue: 150 }).join(), /more than 100%/);
  assert.deepEqual(run({ code: 'FIVEOFF', discountType: 'fixed', discountValue: 150 }), []);
  assert.match(run({ validTo: '2026-01-01T00:00:00Z' }, { discountType: 'fixed', validFrom: '2026-02-01T00:00:00Z', currentUses: 0 }).join(), /must end after it starts/);
  assert.deepEqual(run({ validTo: '2026-03-01T00:00:00Z' }, { discountType: 'fixed', validFrom: '2026-02-01T00:00:00Z', currentUses: 0 }), []);
});

test('customer-owned records connect the session user on create only', () => {
  for (const model of ['Address', 'BackInStockAlert', 'FavoriteProduct', 'NotificationPreference', 'PriceAlert', 'SubstitutionPreference']) {
    const source = read(`features/keystone/models/${model}.ts`);
    const hook = source.slice(source.indexOf('resolveInput'), source.indexOf('connect: { id: context.session.itemId }'));
    assert.match(hook, /operation !== 'create'\) return resolvedData/, `${model} must not relink its owner on update`);
  }
});

test('the migration backs each invariant with a constraint', () => {
  const sql = read('migrations/20261108150000_invariants_stock_slots_coupons/migration.sql');
  for (const name of ['Product_stockQuantity_nonnegative', 'InventoryLot_quantity_bounds', 'DeliverySlot_bookings_within_capacity', 'DeliverySlot_window_order',
    'PickupSlot_orders_within_capacity', 'PickupSlot_window_order', 'Coupon_uses_within_max', 'Coupon_value_bounds', 'Coupon_valid_window', 'Order_money_nonnegative',
    'PaymentRefund_amount_positive', 'FavoriteProduct_user_product_key', 'BackInStockAlert_active_user_product_key', 'UserCoupon_open_clip_key',
    'NotificationPreference_user_key', 'SubstitutionPreference_user_key', 'DeliverySlot_store_window_key', 'PickupSlot_store_window_key']) {
    assert.ok(sql.includes(`"${name}"`), name);
  }
  assert.ok(!/LoyaltyTransaction_running_balance/.test(sql), 'loyalty debt from refund clawback stays legal');
  assert.match(read('features/keystone/lib/rollingFulfillment.ts'), /deliverySlot\.createMany\(\{\s*skipDuplicates: true/);
});

test('money and capacity refusals reach staff as coded messages, not "Unexpected error"', () => {
  for (const file of ['mutations/managePaymentRefund.ts', 'mutations/cancelOrder.ts', 'mutations/voidGroceryPaymentAuthorization.ts', 'mutations/manageStoreCapacity.ts', 'lib/refundRecovery.ts']) {
    const source = read(`features/keystone/${file}`);
    // Only the provider-failure rethrow (raw provider text) may stay masked.
    const plain = (source.match(/throw new Error\(/g) || []).length - (source.match(/throw new Error\(message\)/g) || []).length;
    assert.equal(plain, 0, `${file} has ${plain} plain Error refusals`);
  }
});
