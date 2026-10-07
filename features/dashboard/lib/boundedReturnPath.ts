/** Relative same-origin navigation only; reject URL-parser normalization surprises. */
export function boundedReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value) || /%5c|%2f|%0[0-9a-f]|%1[0-9a-f]/i.test(value)) return null;
  const target = new URL(value, 'https://grocery.invalid');
  if (target.origin !== 'https://grocery.invalid' || target.pathname.includes('no-access') || target.pathname.startsWith('/dashboard/signin') || target.pathname.startsWith('/dashboard/init')) return null;
  return target.pathname + target.search + target.hash;
}
