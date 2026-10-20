import { createHash, randomUUID } from 'node:crypto';
import { assertIdempotentCaptureProvider } from '../../integrations/payment';
import { createPayment } from '../utils/paymentProviderAdapter';
import { verifyGuestOrderToken } from '../utils/guestOrderToken';
import { withSerializableRetry } from '../utils/serializableTransaction';

/** Bind consent and the provider key to frozen goods, amount, currency and original payment. */
import { isPaymentProviderInstalled } from '../../integrations/payment/stripeEnabled';

export function adjustmentFingerprint(settlement: any, payment: any) {
  return createHash('sha256').update(JSON.stringify([settlement.id, settlement.actualsHash, settlement.totalCents,
    settlement.snapshot?.currency, payment.id, payment.providerPaymentId, payment.paymentProviderId])).digest('hex');
}

const defaults = { createPayment, verifyGuestOrderToken, now: () => Date.now(), token: randomUUID };
export function makeAuthorizeOrderAdjustment(overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides };
  return async function authorizeOrderAdjustment(_root: unknown, { orderId, sessionId, token }: { orderId: string; sessionId?: string; token?: string }, context: any) {
    function assertOwner(order: any) {
      const owns = context.session?.itemId ? order?.userId === context.session.itemId
        : !order?.userId && sessionId && token && order?.metadata?.guestSessionId === sessionId
          && deps.verifyGuestOrderToken(orderId, sessionId, token, Math.floor(deps.now() / 1000), order.createdAt);
      if (!owns || !order?.store?.isActive) throw new Error('Order not found');
    }
    const claim = await withSerializableRetry<any>(() => context.transaction(async (tc: any) => {
      const tx = tc.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { store: true } });
      assertOwner(order);
      const settlement = await tx.orderSettlement.findUnique({ where: { idempotencyKey: `order-actuals:${orderId}` } });
      const evidence = settlement?.providerEvidence || {};
      if (!settlement || settlement.orderId !== orderId || evidence.abandonment || settlement.status === 'abandoned'
        || !['requires_customer_authorization', 'processing'].includes(settlement.status) || order.status !== 'picking') throw new Error('Order does not require a revised authorization');
      if (!Number.isSafeInteger(settlement.totalCents) || settlement.totalCents <= 0
        || settlement.snapshot?.totalCents !== settlement.totalCents || !settlement.actualsHash
        || !/^[a-z]{3}$/.test(settlement.snapshot?.currency || '')
        || settlement.snapshot.currency !== String(order.currencyCode).toLowerCase()) throw new Error('Invalid revised authorization amount or currency');
      if (!evidence.originalPaymentId) throw new Error('Original payment identity is missing');
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id"=$1 FOR UPDATE', evidence.originalPaymentId);
      const payment = await tx.payment.findUnique({ where: { id: evidence.originalPaymentId }, include: { paymentProvider: true } });
      if (!payment || payment.orderId !== orderId || payment.storeId !== order.storeId || !payment.paymentProvider || !isPaymentProviderInstalled(payment.paymentProvider)) throw new Error('Original payment provider is unavailable');
      assertIdempotentCaptureProvider(payment.paymentProvider);
      if (['processing', 'unknown'].includes(payment.providerData?.authorizationVoid?.status)) throw new Error('Original authorization void requires reconciliation');
      const fingerprint = adjustmentFingerprint(settlement, payment);
      if (evidence.customerApproval && evidence.customerApproval.fingerprint !== fingerprint) throw new Error('Customer approval no longer matches the frozen sale');
      if (evidence.reauthorization?.paymentIntentId) {
        if (evidence.reauthorization.fingerprint !== fingerprint || !evidence.reauthorization.clientSecret) throw new Error('Revised authorization evidence does not match the frozen sale');
        return { settlement, payment, fingerprint, ready: evidence.reauthorization };
      }
      if (settlement.status !== 'requires_customer_authorization') throw new Error('Finalization is already processing');
      const initiatedAt = evidence.authorizationInitiatedAt || new Date(deps.now()).toISOString();
      const elapsed = deps.now() - new Date(initiatedAt).getTime();
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 23 * 3600000) throw new Error('Revised authorization requires operator recovery; automatic provider-key reuse is expired');
      // A timed-out initiation stays recorded: abandonment must first recover the intent identity.
      const lease = { token: deps.token(), expiresAt: new Date(deps.now() + 120000).toISOString() };
      // The request binding is durable before any provider I/O, so a lost response
      // can later be matched exactly (recoverRevisedAuthorization) — never guessed.
      await tx.orderSettlement.update({ where: { id: settlement.id }, data: { providerEvidence: { ...evidence,
        authorizationInitiatedAt: initiatedAt, authorizationCreationLease: lease,
        customerApproval: { userId: context.session?.itemId || null, at: initiatedAt, totalCents: settlement.totalCents, actualsHash: settlement.actualsHash, fingerprint },
        reauthorizationRequest: evidence.reauthorizationRequest || { requestKey: `${settlement.idempotencyKey}:revised-authorization`, storeId: order.storeId, orderId, settlementId: settlement.id,
          fingerprint, amountCents: settlement.totalCents, currency: settlement.snapshot.currency, requestedAt: initiatedAt },
      } } });
      return { settlement, payment, fingerprint, ready: null };
    }));
    if (claim.ready) return { clientSecret: claim.ready.clientSecret, paymentIntentId: claim.ready.paymentIntentId, totalCents: claim.settlement.totalCents };
    const created = await deps.createPayment({ provider: claim.payment.paymentProvider, amount: claim.settlement.totalCents,
      currency: claim.settlement.snapshot.currency, captureMethod: 'manual', idempotencyKey: `${claim.settlement.idempotencyKey}:revised-authorization`,
      order: { id: orderId, revisedAuthorization: { storeId: claim.payment.storeId, settlementId: claim.settlement.id, fingerprint: claim.fingerprint } } });
    if (!created.paymentIntentId || !created.clientSecret || created.paymentIntentId === claim.payment.providerPaymentId) throw new Error('Provider did not return a distinct revised authorization');
    const ready = await withSerializableRetry<{ clientSecret: string; paymentIntentId: string }>(() => context.transaction(async (tc: any) => {
      const tx = tc.prisma;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', orderId);
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { store: true } });
      assertOwner(order);
      const current = await tx.orderSettlement.findUnique({ where: { id: claim.settlement.id } });
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id"=$1 FOR UPDATE', claim.payment.id);
      const currentPayment = await tx.payment.findUnique({ where: { id: claim.payment.id }, include: { paymentProvider: true } });
      if (!current || order.status !== 'picking' || current.orderId !== orderId || current.status !== 'requires_customer_authorization'
        || current.providerEvidence?.abandonment || current.providerEvidence?.originalPaymentId !== claim.payment.id
        || order.storeId !== claim.payment.storeId || String(order.currencyCode).toLowerCase() !== current.snapshot?.currency
        || !currentPayment || currentPayment.orderId !== orderId || currentPayment.storeId !== order.storeId
        || !currentPayment.paymentProvider || !isPaymentProviderInstalled(currentPayment.paymentProvider) || ['processing', 'unknown'].includes(currentPayment.providerData?.authorizationVoid?.status)
        || adjustmentFingerprint(current, currentPayment) !== claim.fingerprint
        || current.providerEvidence?.customerApproval?.fingerprint !== claim.fingerprint) throw new Error('Order or approval changed during authorization; provider intent needs reconciliation');
      const existing = current.providerEvidence?.reauthorization;
      if (existing && (existing.paymentIntentId !== created.paymentIntentId || existing.fingerprint !== claim.fingerprint)) throw new Error('Provider retry returned conflicting authorization evidence');
      const priorPayment = await tx.payment.findUnique({ where: { providerPaymentId: created.paymentIntentId } });
      if (priorPayment && (priorPayment.orderId !== orderId || priorPayment.storeId !== order.storeId || priorPayment.paymentProviderId !== claim.payment.paymentProviderId)) throw new Error('Revised authorization belongs to another order');
      const reauthorization = existing || { paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret, fingerprint: claim.fingerprint };
      await tx.orderSettlement.update({ where: { id: current.id }, data: { providerEvidence: { ...current.providerEvidence, authorizationCreationLease: null, reauthorization } } });
      return reauthorization;
    }));
    return { clientSecret: ready.clientSecret, paymentIntentId: ready.paymentIntentId, totalCents: claim.settlement.totalCents };
  };
}

export const authorizeOrderAdjustment = makeAuthorizeOrderAdjustment();
