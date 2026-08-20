import { PrismaClient } from '@prisma/client';
import { keystoneContext } from '../features/keystone/context';
import { reconcilePaymentRefunds } from '../features/keystone/mutations/reconcilePaymentRefunds';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: { canManagePayments: true }, store: { isActive: true } }, include: { role: true, store: true } });
  if (!admin?.role || !admin.store) throw new Error('Refund reconciler requires an active Store-scoped payment operator');
  const context = keystoneContext.withSession({ itemId: admin.id, listKey: 'User', data: { name: admin.name, role: admin.role, store: { id: admin.store.id, code: admin.store.code, name: admin.store.name } } } as any);
  const result = await reconcilePaymentRefunds(null, { limit: Number(process.env.REFUND_RECONCILE_LIMIT || 20) }, context);
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
