import { pathToFileURL } from 'node:url';

/** Explicit Store-scoped operator; imports with DB side effects run only as the executable. */
async function main() {
  const operatorId = process.env.GROCERY_SUBSCRIPTION_OPERATOR_ID;
  if (!operatorId) throw new Error('GROCERY_SUBSCRIPTION_OPERATOR_ID must name the recurring-order worker operator');
  const { keystoneContext } = await import('../features/keystone/context');
  const { processDueGrocerySubscriptions } = await import('../features/keystone/mutations/manageGrocerySubscriptions');
  const prisma: any = keystoneContext.prisma;
  const operator = await prisma.user.findUnique({ where: { id: operatorId }, include: { store: true, role: true } });
  if (!operator?.store?.isActive || !operator?.role?.canManageOrders) throw new Error('Recurring worker operator must currently manage orders in an active store');
  const context = keystoneContext.withSession({ itemId: operator.id, listKey: 'User', data: { name: operator.name, role: operator.role, store: { id: operator.store.id, code: operator.store.code, name: operator.store.name } } } as any);
  let stopped = false;
  process.once('SIGINT', () => { stopped = true; });
  process.once('SIGTERM', () => { stopped = true; });
  try {
    do {
      const result = await processDueGrocerySubscriptions(null, { limit: Number(process.env.GROCERY_SUBSCRIPTION_BATCH_SIZE || 25) }, context);
      console.log(JSON.stringify({ worker: 'grocery-subscriptions', at: new Date().toISOString(), ...result }));
      if (process.argv.includes('--once')) break;
      for (let elapsed = 0; elapsed < 60000 && !stopped; elapsed += 1000) await new Promise(resolve => setTimeout(resolve, 1000));
    } while (!stopped);
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error instanceof Error ? error.message : 'Recurring worker failed'); process.exitCode = 1; });
