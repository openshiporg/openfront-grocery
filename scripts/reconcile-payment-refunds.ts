import { keystoneContext } from '../features/keystone/context';
import { reconcilePaymentRefunds } from '../features/keystone/mutations/reconcilePaymentRefunds';
import { refundOperatorContext } from './refundOperator';

// One reconciliation pass as the explicitly configured operator for the expected Store.
async function main() {
  const context = await refundOperatorContext();
  const result = await reconcilePaymentRefunds(null, { limit: Number(process.env.REFUND_RECONCILE_LIMIT || 20) }, context);
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Refund reconciliation failed'); process.exitCode = 1; }).finally(() => keystoneContext.prisma.$disconnect());
