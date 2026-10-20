import { keystoneContext } from '../features/keystone/context';

/**
 * The refund commands act as one explicitly configured person, never "the first
 * administrator found": REFUND_RECONCILIATION_USER_ID names the operator and
 * REFUND_RECONCILIATION_STORE_ID the Store they are expected to work in. Both
 * must match the operator's current, active, payment-capable membership.
 */
export async function refundOperatorContext() {
  const userId = process.env.REFUND_RECONCILIATION_USER_ID?.trim();
  const storeId = process.env.REFUND_RECONCILIATION_STORE_ID?.trim();
  if (!userId || !storeId) throw new Error('REFUND_RECONCILIATION_USER_ID and REFUND_RECONCILIATION_STORE_ID are required');
  const user = await keystoneContext.prisma.user.findUnique({ where: { id: userId }, include: { role: true, store: true } });
  if (!user || user.privacyErasedAt || !user.store?.isActive || user.store.id !== storeId || !user.role?.canManagePayments) {
    throw new Error('The configured refund operator must be an active payment manager of the expected Store');
  }
  return keystoneContext.withSession({ itemId: user.id, listKey: 'User', data: { name: user.name, role: user.role, store: { id: user.store.id, code: user.store.code, name: user.store.name } } } as any);
}
