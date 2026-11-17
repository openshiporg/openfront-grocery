const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const load = (file, deps) => {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports, (id) => deps[id] ?? require(id));
  return mod.exports;
};
const m = load('features/keystone/lib/refundAllocations.ts', {
  './publicError': { publicError: (message) => new Error(message) },
  './inventoryMovements': { quantityMilli: (q) => Math.round(Number(q) * 1000) },
});

const finalSale = { status: 'finalized', settlementId: 's1', lines: [{ id: 'l1', subtotalCents: 1000, discountCents: 0, taxCents: 0 }],
  actuals: [{ lineItemId: 'l1', productId: 'p1', quantityMilli: 2000 }] };
const settlement = { snapshot: { actuals: [{ lineItemId: 'l1', allocations: [{ lotId: 'lot1', productId: 'p1', quantity: 2 }] }] } };

test('the customer receipt alone cannot allocate a physical return', () => {
  assert.throws(() => m.allocateFinalSaleRefund(finalSale, [{ lineItemId: 'l1', quantityMilli: 1000, disposition: 'return_to_stock', conditionNote: 'sealed', returnedLots: [{ lotId: 'lot1', quantityMilli: 1000 }] }], []), /exceeds its original actual allocation/);
});
test('lots from the settlement snapshot let a return to stock allocate', () => {
  const sale = m.withSettlementLots(finalSale, settlement);
  assert.deepEqual(sale.actuals[0].allocations, settlement.snapshot.actuals[0].allocations);
  const [row] = m.allocateFinalSaleRefund(sale, [{ lineItemId: 'l1', quantityMilli: 1000, disposition: 'return_to_stock', conditionNote: 'sealed', returnedLots: [{ lotId: 'lot1', quantityMilli: 1000 }] }], []);
  assert.equal(row.totalCents, 500);
  assert.throws(() => m.allocateFinalSaleRefund(sale, [{ lineItemId: 'l1', quantityMilli: 1000, disposition: 'waste', conditionNote: 'x', returnedLots: [{ lotId: 'lot2', quantityMilli: 1000 }] }], []), /exceeds its original actual allocation/);
});
