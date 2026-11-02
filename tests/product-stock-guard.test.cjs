// Guest checkout decrements Product stock through trusted sudo code. The Product
// image field resolves an untouched input to { id: undefined, ... }, which must
// not count as a catalog identity change. Node's built-in runner; no DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../features/keystone/models/Product.ts'), 'utf8');
const start = source.indexOf('export function isUnchangedResolvedValue');
const end = source.indexOf('export async function resolveProductCatalogIdentity');
const out = ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(out, { module: mod, exports: mod.exports, Date });
const { isUnchangedResolvedValue } = mod.exports;

test('untouched image columns are not a change', () => {
  assert.equal(isUnchangedResolvedValue(undefined), true);
  assert.equal(isUnchangedResolvedValue({ id: undefined, filesize: undefined, width: undefined, height: undefined, extension: undefined }), true);
});

test('real values are changes', () => {
  assert.equal(isUnchangedResolvedValue(null), false);
  assert.equal(isUnchangedResolvedValue('SKU-1'), false);
  assert.equal(isUnchangedResolvedValue({ id: 'abc', extension: 'jpg' }), false);
  assert.equal(isUnchangedResolvedValue({ id: null }), false);
  assert.equal(isUnchangedResolvedValue(new Date()), false);
  assert.equal(isUnchangedResolvedValue([]), false);
});
