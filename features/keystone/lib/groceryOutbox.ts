import { createHash, randomUUID } from 'node:crypto';

export type GroceryOutboxEnvelope = {
  storeId: string;
  eventKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  schemaVersion?: number;
  occurredAt: string;
  payload: Record<string, unknown>;
};

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

export function canonicalGroceryOutboxPayload(payload: Record<string, unknown>) {
  return JSON.stringify(canonicalValue(payload));
}

export function groceryOutboxPayloadHash(payload: Record<string, unknown>) {
  return createHash('sha256').update(canonicalGroceryOutboxPayload(payload)).digest('hex');
}

export async function enqueueGroceryOutboxEvent(tx: any, envelope: GroceryOutboxEnvelope) {
  const payloadHash = groceryOutboxPayloadHash(envelope.payload);
  await tx.$queryRawUnsafe(
    "SELECT 1 AS \"locked\" FROM pg_advisory_xact_lock(hashtext('grocery-outbox'), hashtext($1))",
    envelope.eventKey
  );
  const existing = await tx.groceryOutboxEvent.findUnique({ where: { eventKey: envelope.eventKey } });
  if (existing) {
    const matches = existing.storeId === envelope.storeId
      && existing.eventType === envelope.eventType
      && existing.aggregateType === envelope.aggregateType
      && existing.aggregateId === envelope.aggregateId
      && existing.payloadHash === payloadHash;
    if (!matches) throw new Error('Outbox event key was reused with a different immutable snapshot');
    return { event: existing, created: false };
  }
  const event = await tx.groceryOutboxEvent.create({
    data: {
      storeId: envelope.storeId,
      eventKey: envelope.eventKey,
      eventType: envelope.eventType,
      aggregateType: envelope.aggregateType,
      aggregateId: envelope.aggregateId,
      schemaVersion: envelope.schemaVersion || 1,
      occurredAt: new Date(envelope.occurredAt),
      payload: envelope.payload,
      payloadHash,
      status: 'pending',
      attempts: 0,
    },
  });
  return { event, created: true };
}

export function newGroceryOutboxClaimToken(workerId: string) {
  return `${workerId}:${randomUUID()}`;
}
