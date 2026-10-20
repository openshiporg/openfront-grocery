import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { keystoneContext } from '../features/keystone/context';
import { runRefundReconciliationOnce } from '../features/keystone/mutations/reconcilePaymentRefunds';
import { refundOperatorContext } from './refundOperator';

const intervalMs = Math.max(1_000, Number(process.env.REFUND_RECONCILIATION_INTERVAL_MS || 10_000));
const workerId = process.env.REFUND_RECONCILIATION_WORKER_ID?.trim() || `refund-worker:${os.hostname()}:${process.pid}`;
let stopping = false;

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.REFUND_RECONCILIATION_WORKER_ID?.trim()) throw new Error('REFUND_RECONCILIATION_WORKER_ID is required in production');
  while (!stopping) {
    // The configured operator is re-validated every pass; revoked access stops the worker.
    const context = await refundOperatorContext();
    const result = await runRefundReconciliationOnce(context, { limit: 20, owner: workerId });
    if (result.scanned === 0) await sleep(intervalMs);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { stopping = true; });

// The worker uses the application's single Prisma pool and releases it when it stops.
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Refund worker stopped'); process.exitCode = 1; }).finally(() => keystoneContext.prisma.$disconnect());
