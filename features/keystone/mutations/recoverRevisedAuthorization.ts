import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { publicError } from '../lib/publicError';
import { getPaymentStatus } from '../utils/paymentProviderAdapter';
import { getConfiguredPaymentAdapterSelector } from '../../integrations/payment';
import { adjustmentFingerprint } from './authorizeOrderAdjustment';

/**
 * Operator recovery for a revised authorization whose creation response was
 * lost (so no intent ID was recorded). The operator supplies the provider
 * reference; it is attached only if the provider's own record matches the
 * durable binding written before the request: same Store, order, settlement,
 * frozen-sale fingerprint, amount and currency. Nothing is created or charged.
 * Intents without that binding (created before it existed, or by providers with
 * no verifiable metadata) are refused for evidence-led review, never linked by guess.
 */
export async function recoverRevisedAuthorization(_root: unknown, args: { orderId: string; providerPaymentId: string; reason: string }, context: Context) {
  await requireFreshCapability(context, 'canManagePayments');
  const store = await requireSessionStore(context);
  const providerPaymentId = String(args.providerPaymentId || '').trim();
  const reason = String(args.reason || '').trim();
  if (!/^[A-Za-z0-9_-]{3,255}$/.test(providerPaymentId)) throw publicError('Enter the provider payment reference exactly as the provider shows it.');
  if (reason.length < 3 || reason.length > 500) throw publicError('Record why this authorization is being recovered (3–500 characters).');

  const prisma = context.prisma as any;
  const settlement = await prisma.orderSettlement.findUnique({ where: { idempotencyKey: `order-actuals:${args.orderId}` } });
  const evidence = settlement?.providerEvidence || {};
  if (!settlement || settlement.orderId !== args.orderId) throw publicError('This order has no revised sale to recover.');
  const order = await prisma.order.findUnique({ where: { id: args.orderId }, select: { id: true, storeId: true } });
  if (!order || order.storeId !== store.id) throw publicError('This order has no revised sale to recover.');
  if (evidence.reauthorization?.paymentIntentId) return { recovered: false, alreadyRecorded: true, paymentIntentId: evidence.reauthorization.paymentIntentId };
  const request = evidence.reauthorizationRequest;
  if (!request || request.settlementId !== settlement.id || request.orderId !== order.id || request.storeId !== store.id) {
    throw publicError('This revised authorization has no recorded request binding. Reconcile it with the provider’s records before acting.', 'NEEDS_PROVIDER_EVIDENCE');
  }
  const payment = await prisma.payment.findUnique({ where: { id: evidence.originalPaymentId }, include: { paymentProvider: true } });
  if (!payment || payment.orderId !== order.id || payment.storeId !== store.id || !payment.paymentProvider) throw publicError('The original payment for this order is unavailable.');
  if (getConfiguredPaymentAdapterSelector(payment.paymentProvider, 'createPaymentFunction') !== 'stripe') {
    throw publicError('This payment provider has no verifiable recovery record. Reconcile with the provider before acting.', 'NEEDS_PROVIDER_EVIDENCE');
  }
  const fingerprint = adjustmentFingerprint(settlement, payment);
  if (fingerprint !== request.fingerprint) throw publicError('The revised sale changed after the authorization was requested.');
  if (providerPaymentId === payment.providerPaymentId) throw publicError('That is the original payment, not the revised authorization.');
  const other = await prisma.payment.findUnique({ where: { providerPaymentId } });
  if (other && other.orderId !== order.id) throw publicError('That provider reference belongs to another order.');

  const remote = await getPaymentStatus({ provider: payment.paymentProvider, paymentId: providerPaymentId });
  const intent = remote?.data || {};
  const metadata = intent.metadata || {};
  const matches = intent.id === providerPaymentId
    && metadata.kind === 'revised_authorization' && metadata.orderId === order.id && metadata.storeId === store.id
    && metadata.settlementId === settlement.id && metadata.fingerprint === fingerprint
    && Number(remote.authorizedAmountCents ?? intent.amount) === request.amountCents
    && String(remote.currency || '').toLowerCase() === String(request.currency).toLowerCase()
    && intent.capture_method === 'manual';
  if (!matches) throw publicError('The provider record does not match this order’s revised authorization request.');

  return context.transaction(async (tc) => {
    const tx = tc.prisma as any;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', order.id);
    const current = await tx.orderSettlement.findUnique({ where: { id: settlement.id } });
    if (current?.providerEvidence?.reauthorization?.paymentIntentId) return { recovered: false, alreadyRecorded: true, paymentIntentId: current.providerEvidence.reauthorization.paymentIntentId };
    await tx.orderSettlement.update({ where: { id: settlement.id }, data: { providerEvidence: { ...current.providerEvidence,
      authorizationCreationLease: null,
      reauthorization: { paymentIntentId: providerPaymentId, clientSecret: typeof intent.client_secret === 'string' ? intent.client_secret : '', fingerprint,
        recovered: { by: context.session!.itemId, at: new Date().toISOString(), reason, providerStatus: String(remote.status || '') } },
    } } });
    return { recovered: true, alreadyRecorded: false, paymentIntentId: providerPaymentId };
  });
}
