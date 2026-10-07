import { createHash } from 'node:crypto';

// Keep the original final-sale key ordering: default UTF-16 sort, not locale sort.
// JSONB may reorder object keys, so hashing stored snapshots must normalize again.
function canonical(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}

export function finalSaleSnapshotHash(snapshot: any): string {
  return createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');
}
