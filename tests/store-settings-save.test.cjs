const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = {};
function load(file) {
  if (cache[file]) return cache[file].exports;
  const filename = path.join(root, file);
  const { outputText: output } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const module = { exports: {} }; cache[file] = module;
  const localRequire = (spec) => spec.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), spec.endsWith('.ts') ? spec : `${spec}.ts`))) : require(spec);
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire }, { filename });
  return module.exports;
}
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { sanitizeStoreLogoSvg } = load('features/keystone/utils/storeLogo.ts');
const { normalizeStoreLogoColor } = load('features/lib/store-logo.ts');
const { HUE_PRESETS, LOGO_ICONS } = load('features/platform/settings/lib/icon-registry.ts');
const custom = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#16a34a"/></svg>';

test('the old sanitizer path is the E-commerce sanitizer', () => {
  assert.match(read('features/lib/sanitize-store-logo.ts'), /from '\.\.\/keystone\/utils\/storeLogo'/);
  assert.equal(sanitizeStoreLogoSvg(custom), custom);
  assert.equal(sanitizeStoreLogoSvg('<svg onload="alert(1)"></svg>'), '');
});

test('every library logo survives the sanitizer; presets are E-commerce\'s', () => {
  assert.equal(LOGO_ICONS.length, 42);
  for (const icon of LOGO_ICONS) assert.equal(sanitizeStoreLogoSvg(icon.lightSvg), icon.lightSvg, icon.id);
  assert.equal(JSON.stringify(HUE_PRESETS.map((preset) => preset.value)), JSON.stringify([0, 30, 60, 120, 180, 270, 330]));
});

test('the hue is normalized to 0-359', () => {
  assert.equal(normalizeStoreLogoColor('390'), '30');
  assert.equal(normalizeStoreLogoColor('-30'), '330');
});

test('the logo form renders the E-commerce block; the action sanitizes, normalizes, mutates and revalidates', () => {
  const form = read('features/platform/settings/components/StoreLogoControl.tsx');
  assert.match(form, /\{\/\* Logo Icon Selector \*\/\}/);
  assert.match(form, /\{\/\* Logo Color Selector \*\/\}/);
  assert.match(form, /Edit SVG Code/);
  assert.match(form, /grid grid-cols-4 gap-2 p-2/);
  assert.doesNotMatch(form, /LogoPicker|store-logo-hue/);
  const action = read('features/platform/settings/actions.ts');
  assert.match(action, /const logoIcon = raw \? sanitizeStoreLogoSvg\(raw\) : null/);
  assert.match(action, /const logoColor = normalizeStoreLogoColor\(formData\.get\('logoColor'\)\)/);
  assert.match(action, /updateGroceryStoreLogo\(logoIcon: \$logoIcon, logoColor: \$logoColor\)/);
  assert.match(action, /revalidatePath\('\/', 'layout'\)/);
});

test('storefront render rule: an icon always shows, never an initial letter; a custom logoUrl still works', () => {
  const logo = read('features/storefront/modules/urban/UrbanStoreLogo.tsx');
  assert.match(logo, /hue-rotate\(\$\{normalizeStoreLogoColor\(logoColor\)\}deg\)/);
  assert.match(logo, /data-store-logo="url"/);
  assert.doesNotMatch(logo, /data-store-logo="initial"/);
  assert.match(logo, /__html: DEFAULT_STORE_LOGO_ICON/);
  for (const file of ['UrbanNav', 'UrbanFooter', 'UrbanMobileMenu']) assert.match(read(`features/storefront/modules/urban/${file}.tsx`), /UrbanStoreLogo/, file);
});
