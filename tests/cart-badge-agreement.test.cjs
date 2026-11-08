// The cart page, checkout and the header/tab-bar badge must never disagree.
// The badge reads the cart in the browser (localStorage guest id); the pages
// are server-rendered from the cart cookie, which framed pages (Oathkeeper
// Browser) and Safari never send. Once the basket has loaded, the pages adopt
// its cart. Node's built-in runner; no DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const out = ts.transpileModule(read('features/storefront/modules/urban/cartReconcile.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(out, { module: mod, exports: mod.exports, require: () => ({}) });
const { reconcileWithBasket, basketCount } = mod.exports;

const cart = (id, quantities) => ({ id, items: quantities.map((quantity, i) => ({ id: `${id}-${i}`, quantity })), subtotal: 0, tax: 0, deliveryFee: 0, total: 0, itemCount: quantities.length });

test('server saw no cookie, badge shows 2: page shows the same 2 items', () => {
  const basket = cart('c1', [1, 1]);
  const shown = reconcileWithBasket(null, { loaded: true, cart: basket });
  assert.equal(basketCount(shown), basketCount(basket));
  assert.equal(basketCount(shown), 2);
});

test('server cart is gone for the badge: page is empty too', () => {
  assert.equal(reconcileWithBasket(cart('old', [3]), { loaded: true, cart: null }), null);
});

test('before the basket loads the server render stands', () => {
  const server = cart('c1', [2]);
  assert.equal(reconcileWithBasket(server, { loaded: false, cart: null }), server);
});

test('cart and checkout pages both reconcile with the shared basket', () => {
  for (const file of ['features/storefront/modules/urban/UrbanCart.tsx', 'features/storefront/modules/urban/UrbanCheckout.tsx']) {
    const source = read(file);
    assert.match(source, /useMarketBasket\(\)/, `${file} reads the shared basket`);
    assert.match(source, /reconcileWithBasket\(previous, (basket|\{ loaded: basketLoaded, cart: basketCart \})\)/, `${file} adopts the basket cart`);
  }
});

test('badge and pages count items the same way', () => {
  const basketSource = read('features/storefront/modules/market/MarketBasket.tsx');
  const tabBar = read('features/storefront/modules/urban/UrbanTabBar.tsx');
  for (const source of [basketSource, tabBar]) assert.match(source, /items\.reduce\(\(sum, item\) => sum \+ item\.quantity, 0\)/);
});

test('the guest cart cookie is usable in a framed HTTPS page', () => {
  assert.match(read('features/storefront/lib/data/cart.ts'), /SameSite=None; Secure; Partitioned/);
  assert.match(read('features/storefront/lib/data/guest-orders.ts'), /partitioned,/);
});
