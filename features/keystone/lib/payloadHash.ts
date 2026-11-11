import { createHash } from 'node:crypto';

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)])
    );
  }
  return value;
}

export function canonicalPayload(payload: Record<string, unknown>) {
  return JSON.stringify(canonicalValue(payload));
}

export function payloadHash(payload: Record<string, unknown>) {
  return createHash('sha256').update(canonicalPayload(payload)).digest('hex');
}
