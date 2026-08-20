import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { keystoneContext } from '../features/keystone/context';
import { runRefundReconciliationOnce } from '../features/keystone/mutations/reconcilePaymentRefunds';

const prisma = new PrismaClient();
const intervalMs = Math.max(1_000, Number(process.env.REFUND_RECONCILIATION_INTERVAL_MS || 10_000));
const workerId = process.env.REFUND_RECONCILIATION_WORKER_ID?.trim() || `refund-worker:${os.hostname()}:${process.pid}`;
const userId = process.env.REFUND_RECONCILIATION_USER_ID?.trim();
let stopping = false;

async function main() {
  if (!userId) throw new Error('REFUND_RECONCILIATION_USER_ID is required for the automatic refund worker');
  if (process.env.NODE_ENV === 'production' && !process.env.REFUND_RECONCILIATION_WORKER_ID?.trim()) throw new Error('REFUND_RECONCILIATION_WORKER_ID is required in production');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, store: true } });
  if (!user?.role?.canManagePayments || !user.store?.isActive) throw new Error('Refund worker user must have a current active payment-management capability');
  const context = keystoneContext.withSession({ itemId: user.id, listKey: 'User', data: { role: user.role, store: { id: user.store.id } } } as any);
  while (!stopping) {
    const result = await runRefundReconciliationOnce(context, { limit: 20, owner: workerId });
    if (result.scanned === 0) await sleep(intervalMs);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { stopping = true; });

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
