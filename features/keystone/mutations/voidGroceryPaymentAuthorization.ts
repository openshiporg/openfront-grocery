import { randomUUID } from 'node:crypto';
import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { cancelPayment, getPaymentStatus } from '../utils/paymentProviderAdapter';
import { refundPaymentForOrder } from './managePaymentRefund';
import { withSerializableRetry } from '../utils/serializableTransaction';
import { noChargeOrderPaymentState } from '../lib/checkoutIdentity';
import { groceryOutboxPayloadHash } from '../lib/groceryOutbox';

type VoidArgs = { paymentId: string; reason: string; idempotencyKey: string };
const LEASE_MS = 30_000;

import { isPaymentProviderInstalled } from '../../integrations/payment/stripeEnabled';

export async function voidGroceryPaymentAuthorization(_root: unknown, args: VoidArgs, context: Context) {
  await requireFreshCapability(context, 'canManagePayments');
  const store = await requireSessionStore(context);
  const reason = args.reason.trim();
  const key = args.idempotencyKey.trim();
  if (reason.length < 3 || reason.length > 470 || key.length < 12 || key.length > 180) throw new Error('A reason and stable authorization void key are required');
  const token = randomUUID();
  const claim = await withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any;
    const identity = await tx.payment.findUnique({ where: { id: args.paymentId }, select: { orderId: true, storeId: true } });
    if (!identity || identity.storeId !== store.id) throw new Error('Payment not found in active Store');
    if (identity.orderId) await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', identity.orderId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const payment = await tx.payment.findUnique({ where: { id: args.paymentId }, include: { paymentProvider: true } });
    if (!payment || payment.storeId !== store.id) throw new Error('Payment not found in active Store');
    const noCharge = noChargeOrderPaymentState(payment);
    if (payment.providerPaymentId?.startsWith('grocery_no_charge:') && !noCharge) throw new Error('Invalid server no-charge checkout evidence');
    if (noCharge && noCharge.currency !== store.currencyCode.toLowerCase()) throw new Error('Original no-charge currency does not match the active Store');
    const old = payment.providerData?.authorizationVoid;
    if (old && (old.key !== key || old.reason !== reason)) throw new Error('Authorization void key or reason conflicts with existing request');
    if (old?.status === 'completed' && (['cancelled', 'refunded'].includes(payment.status) || (noCharge && payment.status === 'succeeded'))) return { payment, noCharge, reused: true, execute: false };
    const settlement = identity.orderId ? await tx.orderSettlement.findFirst({ where: { orderId: identity.orderId, status: { in: ['processing', 'requires_customer_authorization'] } } }) : null;
    if (settlement?.status === 'processing') throw new Error('A final sale is processing; resolve it before voiding authorization');
    if (!['authorized', 'pending'].includes(payment.status) && !(settlement && ['succeeded', 'partially_refunded', 'refunded'].includes(payment.status))) throw new Error('Only an active authorization or unresolved revised sale can be voided');
    if (settlement?.providerEvidence?.authorizationInitiatedAt && !settlement.providerEvidence?.reauthorization?.paymentIntentId) throw new Error('Recover the revised authorization identity before abandoning this sale');
    if (settlement?.providerEvidence?.finalizationLease?.expiresAt && new Date(settlement.providerEvidence.finalizationLease.expiresAt).getTime() > Date.now()) throw new Error('Finalization is in flight');
    if (settlement?.providerEvidence?.authorizationCreationLease?.expiresAt && new Date(settlement.providerEvidence.authorizationCreationLease.expiresAt).getTime() > Date.now()) throw new Error('Revised authorization creation is in flight');
    if (old?.leaseExpiresAt && new Date(old.leaseExpiresAt).getTime() > Date.now()) return { payment, noCharge, reused: true, execute: false };
    if (!payment.providerPaymentId || !payment.paymentProvider || !isPaymentProviderInstalled(payment.paymentProvider)) throw new Error('Authorization provider is unavailable');
    await tx.payment.update({ where: { id: payment.id }, data: { providerData: { ...(payment.providerData || {}), authorizationVoid: { ...(old || {}), key, reason, status: 'processing', actorId: context.session!.itemId, requestedAt: old?.requestedAt || new Date().toISOString(), token, leaseExpiresAt: new Date(Date.now() + LEASE_MS).toISOString() } } } });
    if (settlement) await tx.orderSettlement.update({ where: { id: settlement.id }, data: { providerEvidence: { ...(settlement.providerEvidence || {}), abandonment: { token, key, reason, status: 'processing', leaseExpiresAt: new Date(Date.now() + LEASE_MS).toISOString() } } } });
    return { payment, noCharge, settlement, reused: Boolean(old), execute: true };
  }, { isolationLevel: 'ReadCommitted' as any }));
  if (!claim.execute) return { success: ['cancelled', 'refunded'].includes(claim.payment.status)
    || Boolean(claim.noCharge && claim.payment.status === 'succeeded' && claim.payment.providerData?.authorizationVoid?.status === 'completed'),
    paymentId: args.paymentId, status: claim.payment.status, reused: true };

  let result: any;
  try {
    const revisedId = claim.settlement?.providerEvidence?.reauthorization?.paymentIntentId;
    if (revisedId) {
      const revised = await getPaymentStatus({ provider: claim.payment.paymentProvider, paymentId: revisedId });
      const voided = ['canceled', 'cancelled'].includes(revised.status) ? revised : await cancelPayment({ provider: claim.payment.paymentProvider, paymentId: revisedId, idempotencyKey: `${key}:revised` });
      if (!['canceled', 'cancelled'].includes(voided.status) || Number(voided.capturedAmountCents ?? voided.amountCents ?? voided.amount) !== 0 || String(voided.currency || '').toLowerCase() !== store.currencyCode.toLowerCase()) throw new Error('Revised authorization void is not confirmed');
    }
    const current = claim.noCharge || await getPaymentStatus({ provider: claim.payment.paymentProvider, paymentId: claim.payment.providerPaymentId });
    if (claim.noCharge) {
      // There is no original provider authorization or capture to void/refund.
      // Preserve the proven zero-payment row for the cancellation proof.
      result = current;
    } else if (['succeeded', 'captured'].includes(current.status)) {
      if (String(current.currency || '').toLowerCase() !== store.currencyCode.toLowerCase() || Number(current.capturedAmountCents ?? current.amountCents ?? current.amount) !== claim.payment.amountCents) throw new Error('Original captured amount or currency does not match the local payment');
      const tx = context.prisma as any;
      const successful = await tx.paymentRefund.aggregate({ where: { paymentId: args.paymentId, status: 'succeeded' }, _sum: { amountCents: true } });
      const remaining = claim.payment.amountCents - Number(successful._sum.amountCents || 0);
      if (remaining > 0) {
        const refund = await refundPaymentForOrder(null, { paymentId: args.paymentId, amountCents: remaining, reason: `Abandoned revised sale: ${reason}`, idempotencyKey: `${key}:original-refund` }, context);
        if (refund.status !== 'succeeded') throw new Error('Original payment refund is unresolved');
      }
      result = { status: 'refunded', currency: store.currencyCode, capturedAmountCents: 0 };
    } else {
      result = ['canceled', 'cancelled'].includes(current.status) ? current : await cancelPayment({ provider: claim.payment.paymentProvider, paymentId: claim.payment.providerPaymentId, idempotencyKey: key });
      if (!['canceled', 'cancelled'].includes(result.status) || Number(result.capturedAmountCents ?? result.amountCents ?? result.amount) !== 0 || String(result.currency || '').toLowerCase() !== store.currencyCode.toLowerCase()) throw new Error('Provider did not confirm an uncaptured authorization void');
    }

  } catch (error) {
    await context.transaction(async (transactionContext) => {
      const tx = transactionContext.prisma as any;
      await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
      const current = await tx.payment.findUnique({ where: { id: args.paymentId } });
      if (current?.providerData?.authorizationVoid?.token !== token) return;
      await tx.payment.update({ where: { id: args.paymentId }, data: { providerData: { ...(current.providerData || {}), authorizationVoid: { ...current.providerData.authorizationVoid, status: 'unknown', leaseExpiresAt: null, lastError: error instanceof Error ? error.message : 'Authorization void outcome unknown' } } } });
    });
    throw error;
  }
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma as any;
    if (claim.payment.orderId) await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', claim.payment.orderId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "Payment" WHERE "id" = $1 FOR UPDATE', args.paymentId);
    const current = await tx.payment.findUnique({ where: { id: args.paymentId } });
    if (current?.providerData?.authorizationVoid?.token !== token) throw new Error('Authorization void completion was fenced; retry the same request');
    const unchangedNoCharge = Boolean(claim.noCharge && noChargeOrderPaymentState(current)
      && current.status === 'succeeded' && claim.payment.status === 'succeeded'
      && current.storeId === claim.payment.storeId && current.orderId === claim.payment.orderId
      && current.providerPaymentId === claim.payment.providerPaymentId
      && current.providerData.checkoutFingerprint === claim.payment.providerData.checkoutFingerprint
      && current.providerData.cartFingerprint === claim.payment.providerData.cartFingerprint
      && groceryOutboxPayloadHash(current.providerData.noCharge) === groceryOutboxPayloadHash(claim.payment.providerData.noCharge));
    if ((claim.noCharge && !unchangedNoCharge) || (!['authorized', 'pending', 'cancelled', 'refunded'].includes(current.status) && !unchangedNoCharge)) throw new Error('Financial state changed before authorization void completion');
    const status = unchangedNoCharge ? 'succeeded' : result.status === 'refunded' ? 'refunded' : 'cancelled';
    if (claim.settlement) {
      const settlement = await tx.orderSettlement.findUnique({ where: { id: claim.settlement.id } });
      if (settlement?.providerEvidence?.abandonment?.token !== token) throw new Error('Settlement abandonment was fenced');
      await tx.orderSettlement.update({ where: { id: settlement.id }, data: { status: 'abandoned', providerEvidence: { ...(settlement.providerEvidence || {}), abandonment: { ...settlement.providerEvidence.abandonment, status: 'completed', leaseExpiresAt: null, completedAt: new Date().toISOString() } } } });
    }
    await tx.payment.update({ where: { id: args.paymentId }, data: { status, providerData: { ...(current.providerData || {}), authorizationVoid: { ...current.providerData.authorizationVoid, status: 'completed', leaseExpiresAt: null, completedAt: new Date().toISOString(), providerStatus: unchangedNoCharge ? null : result.status, ...(unchangedNoCharge ? { noChargeVerified: true } : {}) } } } });
    return { success: true, paymentId: args.paymentId, status, reused: claim.reused };
  });
}
