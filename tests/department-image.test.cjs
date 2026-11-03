// Department aisle photos: the uploaded S3 image wins over the Image URL text, and dashboard
// uploads may be up to 10 MB while JSON GraphQL bodies stay at 1 MB. Node's built-in runner; no DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative, mocks = {}) {
  const filename = path.resolve(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: (name) => (name in mocks ? mocks[name] : require(name)) }, { filename });
  return module.exports;
}

const { withDepartmentImage } = load('features/storefront/lib/data/departmentImage.ts');
const base = { id: 'd1', name: 'Frozen', handle: 'frozen', isActive: true };

test('department image: an uploaded photo wins over the Image URL text', () => {
  const result = withDepartmentImage({ ...base, imageUrl: '/images/frozen-aisle.jpg', image: { url: 'https://bucket.example/abc.png?X-Amz-Signature=1' } });
  assert.equal(result.imageUrl, 'https://bucket.example/abc.png?X-Amz-Signature=1');
  assert.equal('image' in result, false, 'the raw image field is not passed to the UI');
});

test('department image: falls back to the Image URL text, then to none', () => {
  assert.equal(withDepartmentImage({ ...base, imageUrl: '/images/frozen-aisle.jpg', image: null }).imageUrl, '/images/frozen-aisle.jpg');
  assert.equal(withDepartmentImage({ ...base, imageUrl: '/images/frozen-aisle.jpg', image: { url: '  ' } }).imageUrl, '/images/frozen-aisle.jpg');
  assert.equal(withDepartmentImage({ ...base, imageUrl: '', image: null }).imageUrl, undefined);
  assert.equal(withDepartmentImage({ ...base }).imageUrl, undefined);
});

test('department model: optional image field on the shared my_images S3 storage', () => {
  const source = fs.readFileSync(path.join(root, 'features/keystone/models/Department.ts'), 'utf8');
  assert.match(source, /image: image\(\{\s*storage: "my_images"/);
  const prisma = fs.readFileSync(path.join(root, 'schema.prisma'), 'utf8');
  const model = prisma.slice(prisma.indexOf('model Department {'), prisma.indexOf('}', prisma.indexOf('model Department {')));
  for (const column of ['image_id', 'image_filesize', 'image_width', 'image_height', 'image_extension']) assert.match(model, new RegExp(`\\b${column}\\s+\\S+\\?`), `${column} is nullable`);
});

test('upload limit: 10 MB for multipart uploads, 1 MB for JSON', () => {
  const security = load('features/keystone/lib/graphqlSecurity.ts', { './clientIp': { normalizeClientIp: (v) => v }, '../security/internalIdentity': { verifiedInternalIdentity: () => null } });
  assert.equal(security.MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
  assert.equal(security.requestBodyLimit('application/json'), 1024 * 1024);
  assert.ok(security.requestBodyLimit('multipart/form-data; boundary=x') > 10 * 1024 * 1024);
  assert.match(fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8'), /bodySizeLimit: '10mb'/);
});

const plain = (value) => JSON.parse(JSON.stringify(value));
const { resolveProductImage, uploadedImageKey } = load('features/keystone/lib/productImage.ts');
const images = (url) => ({ images: (storage) => ({ getUrl: async (id, ext) => { assert.equal(storage, 'my_images'); if (url instanceof Error) throw url; return `${url}/${id}.${ext}?X-Amz-Signature=1`; } }) });

test('product image: an uploaded photo resolves to a fresh signed URL and wins over Image URL', async () => {
  const row = { image_id: 'abc_123', image_extension: 'png', imageUrl: '/images/old.jpg', thumbnailUrl: '/images/old-thumb.jpg' };
  assert.deepEqual(plain(await resolveProductImage(images('https://bucket.example'), row)), { imageUrl: 'https://bucket.example/abc_123.png?X-Amz-Signature=1', thumbnailUrl: 'https://bucket.example/abc_123.png?X-Amz-Signature=1' });
});

test('product image: falls back to the text URLs when there is no upload or the bucket fails', async () => {
  assert.deepEqual(plain(await resolveProductImage(images('https://b'), { imageUrl: '/images/a.jpg', thumbnailUrl: null })), { imageUrl: '/images/a.jpg', thumbnailUrl: '/images/a.jpg' });
  assert.deepEqual(plain(await resolveProductImage(images(new Error('NoSuchBucket')), { image_id: 'x', image_extension: 'jpg', imageUrl: '/images/a.jpg', thumbnailUrl: '/images/t.jpg' })), { imageUrl: '/images/a.jpg', thumbnailUrl: '/images/t.jpg' });
  assert.deepEqual(plain(await resolveProductImage(images('https://b'), {})), { imageUrl: null, thumbnailUrl: null });
  assert.equal(uploadedImageKey({ image_id: '../x', image_extension: 'png' }), null);
  assert.equal(uploadedImageKey({ image_id: 'x', image_extension: 'svg' }), null);
});
