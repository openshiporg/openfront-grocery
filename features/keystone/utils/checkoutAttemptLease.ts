import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export const CHECKOUT_RECONCILIATION_LEASE_MS = 30_000;

type DbClient = Prisma.TransactionClient | { $queryRawUnsafe: Function };

export type CheckoutLease = {
  id: string;
  status: string;
  idempotencyKey: string;
  providerCode: string;
  providerPaymentId: string;
  amountCents: number;
  currencyCode: string;
  requestData: unknown;
  storeId: string;
  cartId: string;
  cartCustomerId: string | null;
  paymentSessionId: string;
  orderId: string | null;
  fencingToken: number;
  leaseToken: string;
};

type ClaimOptions = {
  expected?: { leaseToken: string; fencingToken: number };
  leaseMs?: number;
};

function boundedLeaseMs(value?: number) {
  if (value === undefined) return CHECKOUT_RECONCILIATION_LEASE_MS;
  if (!Number.isInteger(value) || value < 10 || value > 120_000) throw new Error('Invalid checkout reconciliation lease');
  return value;
}

function rowToLease(row: any): CheckoutLease {
  return {
    id: row.id,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    providerCode: row.providerCode,
    providerPaymentId: row.providerPaymentId,
    amountCents: Number(row.amountCents),
    currencyCode: row.currencyCode,
    requestData: row.requestData,
    storeId: row.storeId,
    cartId: row.cartId,
    cartCustomerId: row.cartCustomerId || null,
    paymentSessionId: row.paymentSessionId,
    orderId: row.orderId || null,
    fencingToken: Number(row.fencingToken),
    leaseToken: row.leaseToken,
  };
}

const RETURNING = `
  ca."id", ca."status", ca."idempotencyKey", ca."providerCode", ca."providerPaymentId",
  ca."amountCents", ca."currencyCode", ca."requestData", ca."store" AS "storeId",
  ca."cart" AS "cartId", c."customer" AS "cartCustomerId", ca."paymentSession" AS "paymentSessionId",
  ca."order" AS "orderId", ca."fencingToken", ca."leaseToken"
`;

/** Atomically claims one path. The incremented fencing token invalidates every stale worker. */
export async function claimCheckoutAttempt(
  db: DbClient,
  attemptId: string,
  action: 'finalize' | 'compensate',
  options: ClaimOptions = {},
): Promise<CheckoutLease | null> {
  const leaseToken = randomUUID();
  const leaseMs = boundedLeaseMs(options.leaseMs);
  const nextStatus = action === 'finalize' ? 'finalizing' : 'compensation_processing';
  let rows: any[];

  if (options.expected) {
    rows = await db.$queryRawUnsafe(
      `UPDATE "CheckoutAttempt" ca
       SET "status" = $3::"CheckoutAttemptStatusType",
           "leaseToken" = $2,
           "leaseExpiresAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
           "fencingToken" = ca."fencingToken" + 1,
           "attempts" = ca."attempts" + 1
       FROM "Cart" c
       WHERE ca."id" = $1 AND ca."cart" = c."id" AND ca."order" IS NULL
         AND ca."status" = 'finalizing'
         AND ca."leaseToken" = $5 AND ca."fencingToken" = $6
         AND ca."leaseExpiresAt" > NOW()
       RETURNING ${RETURNING}`,
      attemptId, leaseToken, nextStatus, leaseMs, options.expected.leaseToken, options.expected.fencingToken,
    );
  } else if (action === 'finalize') {
    rows = await db.$queryRawUnsafe(
      `UPDATE "CheckoutAttempt" ca
       SET "status" = $2::"CheckoutAttemptStatusType",
           "leaseToken" = $3,
           "leaseExpiresAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
           "fencingToken" = ca."fencingToken" + 1,
           "attempts" = ca."attempts" + 1
       FROM "Cart" c
       WHERE ca."id" = $1 AND ca."cart" = c."id" AND ca."order" IS NULL
         AND ca."status" IN ('pending', 'settled_pending_finalize', 'finalizing')
         AND (ca."leaseExpiresAt" IS NULL OR ca."leaseExpiresAt" <= NOW())
       RETURNING ${RETURNING}`,
      attemptId, nextStatus, leaseToken, leaseMs,
    );
  } else {
    rows = await db.$queryRawUnsafe(
      `UPDATE "CheckoutAttempt" ca
       SET "status" = $2::"CheckoutAttemptStatusType",
           "leaseToken" = $3,
           "leaseExpiresAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
           "fencingToken" = ca."fencingToken" + 1,
           "attempts" = ca."attempts" + 1
       FROM "Cart" c
       WHERE ca."id" = $1 AND ca."cart" = c."id" AND ca."order" IS NULL
         AND ca."status" IN ('compensation_required', 'compensation_processing')
         AND (ca."leaseExpiresAt" IS NULL OR ca."leaseExpiresAt" <= NOW())
       RETURNING ${RETURNING}`,
      attemptId, nextStatus, leaseToken, leaseMs,
    );
  }

  return rows[0] ? rowToLease(rows[0]) : null;
}

export async function assertFinalizationLease(db: DbClient, lease: CheckoutLease) {
  const rows = await db.$queryRawUnsafe<any[]>(
    `SELECT "status", "order", "leaseToken", "fencingToken"
     FROM "CheckoutAttempt" WHERE "id" = $1 FOR UPDATE`,
    lease.id,
  );
  const row = rows[0];
  if (!row || row.status !== 'finalizing' || row.order || row.leaseToken !== lease.leaseToken || Number(row.fencingToken) !== lease.fencingToken) {
    throw new Error('Checkout reconciliation lease was fenced before finalization');
  }
}

export async function refreshFinalizationSettlement(db: DbClient, lease: CheckoutLease, amountCents: number, currencyCode: string) {
  const rows = await db.$queryRawUnsafe<any[]>(
    `UPDATE "CheckoutAttempt"
     SET "amountCents" = $2, "currencyCode" = $3, "settledAt" = COALESCE("settledAt", NOW())
     WHERE "id" = $1 AND "status" = 'finalizing' AND "order" IS NULL
       AND "leaseToken" = $4 AND "fencingToken" = $5
     RETURNING "id"`,
    lease.id, amountCents, currencyCode, lease.leaseToken, lease.fencingToken,
  );
  if (!rows[0]) throw new Error('Checkout reconciliation lease was fenced before settlement refresh');
}

export async function finalizeCheckoutAttempt(db: DbClient, lease: CheckoutLease, orderId: string) {
  const rows = await db.$queryRawUnsafe<any[]>(
    `UPDATE "CheckoutAttempt"
     SET "status" = 'finalized', "finalizedAt" = NOW(), "order" = $2,
         "leaseToken" = NULL, "leaseExpiresAt" = NULL
     WHERE "id" = $1 AND "status" = 'finalizing' AND "order" IS NULL
       AND "leaseToken" = $3 AND "fencingToken" = $4
     RETURNING "id"`,
    lease.id, orderId, lease.leaseToken, lease.fencingToken,
  );
  if (!rows[0]) throw new Error('Checkout reconciliation lease was fenced at finalization');
}

export async function markCheckoutAttemptFailed(db: DbClient, lease: CheckoutLease, message: string) {
  const rows = await db.$queryRawUnsafe<any[]>(
    `UPDATE "CheckoutAttempt"
     SET "status" = 'failed', "lastError" = $2, "leaseToken" = NULL, "leaseExpiresAt" = NULL
     WHERE "id" = $1 AND "status" = 'finalizing' AND "order" IS NULL
       AND "leaseToken" = $3 AND "fencingToken" = $4
     RETURNING "id"`,
    lease.id, message, lease.leaseToken, lease.fencingToken,
  );
  return Boolean(rows[0]);
}

export async function releaseCheckoutAttemptLease(db: DbClient, lease: CheckoutLease, status: 'pending' | 'settled_pending_finalize' | 'compensation_required') {
  await db.$queryRawUnsafe(
    `UPDATE "CheckoutAttempt"
     SET "status" = $2::"CheckoutAttemptStatusType", "leaseToken" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = NOW()
     WHERE "id" = $1 AND "order" IS NULL AND "status" IN ('finalizing', 'compensation_processing')
       AND "leaseToken" = $3 AND "fencingToken" = $4`,
    lease.id, status, lease.leaseToken, lease.fencingToken,
  );
}

export async function completeCompensation(
  db: DbClient,
  lease: CheckoutLease,
  status: 'compensated' | 'compensation_required',
  message: string,
) {
  const rows = await db.$queryRawUnsafe<any[]>(
    `UPDATE "CheckoutAttempt"
     SET "status" = $2::"CheckoutAttemptStatusType",
         "compensationAt" = CASE WHEN $2 = 'compensated' THEN NOW() ELSE "compensationAt" END,
         "lastError" = $3, "leaseToken" = NULL, "leaseExpiresAt" = NULL
     WHERE "id" = $1 AND "status" = 'compensation_processing' AND "order" IS NULL
       AND "leaseToken" = $4 AND "fencingToken" = $5
     RETURNING "id"`,
    lease.id, status, message, lease.leaseToken, lease.fencingToken,
  );
  return Boolean(rows[0]);
}
