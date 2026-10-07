import { randomUUID } from 'node:crypto';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { checkoutRequestFingerprint } from '../lib/checkoutIdentity';
import { groceryOutboxPayloadHash } from '../lib/groceryOutbox';
import { getPaymentStatus } from '../utils/paymentProviderAdapter';
import { ensureCheckoutAttempt } from './submitGroceryOrder';
import { STRIPE_PROVIDER_CODE } from '../../integrations/payment';

type RecoveryInput = { paymentSessionId: string; providerPaymentId: string; reason: string };
const defaults = { requireFreshCapability, requireSessionStore, getPaymentStatus, ensureCheckoutAttempt, now: Date.now, token: randomUUID };
type RecoveryPorts = typeof defaults;
const reviewMessage = 'Payment remains held. The provider reference could not be safely attached; review its original metadata and checkout evidence.';

/** Attach a retrieved identity only; this operation never creates, charges or refunds a payment. */
export async function recoverPaymentCreationWithDependencies(_root: unknown, input: RecoveryInput, context: any, ports: RecoveryPorts = defaults) {
  const args = { paymentSessionId: input.paymentSessionId.trim(), providerPaymentId: input.providerPaymentId.trim(), reason: input.reason.trim() };
  if (!args.paymentSessionId || args.paymentSessionId.length > 180 || !/^pi_[A-Za-z0-9_]{1,180}$/.test(args.providerPaymentId)
    || args.reason.length < 3 || args.reason.length > 470) throw new Error('A checkout session, provider payment reference and recovery reason are required');
  const authorize = async (tc: any) => {
    await ports.requireFreshCapability(tc, 'canManagePayments');
    await ports.requireFreshCapability(tc, 'canManageOrders');
    return ports.requireSessionStore(tc);
  };
  const store = await authorize(context);
  const token = ports.token();
  const result = (status: string, message: string, reused = false) => ({ status, paymentSessionId: args.paymentSessionId, message, reused });

  // Resolve the customer first, then follow the same lock order as checkout and erasure.
  async function locked(tc: any) {
    const tx = tc.prisma;
    const identity = await tx.paymentSession.findUnique({ where: { id: args.paymentSessionId }, include: { cart: true } });
    if (!identity?.cart || identity.cart.storeId !== store.id) throw new Error('Checkout session not found in active Store');
    const ownerId = identity.cart.customerId;
    if (ownerId) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', ownerId);
      const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { id: true, storeId: true, privacyErasedAt: true } });
      if (!owner || owner.privacyErasedAt || owner.storeId !== store.id) throw new Error('Checkout customer is no longer active');
    }
    await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id"=$1 FOR UPDATE', identity.cart.id);
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentSession" WHERE "id"=$1 FOR UPDATE', args.paymentSessionId);
    const session = await tx.paymentSession.findUnique({ where: { id: args.paymentSessionId }, include: { cart: true, paymentProvider: true } });
    if (!session?.cart || session.cart.id !== identity.cart.id || session.cart.storeId !== store.id || session.cart.customerId !== ownerId) throw new Error('Checkout ownership changed during recovery');
    if (session.data?.noCharge || session.paymentProvider?.code !== STRIPE_PROVIDER_CODE || !session.paymentProvider?.isInstalled) throw new Error('Checkout provider is unavailable for reference recovery');
    return session;
  }
  const claim: any = await context.transaction(async (tc: any) => {
    if ((await authorize(tc)).id !== store.id) throw new Error('Active Store changed during recovery');
    const session = await locked(tc);
    const data = session.data || {};
    if (data.paymentIntentId && data.paymentIntentId !== args.providerPaymentId) throw new Error('Checkout already has a different payment identity');
    if (data.compensationStatus) throw new Error('Checkout compensation already owns this payment');
    if (data.status === 'completed') return { response: result('completed', 'Checkout is already completed.', true) };
    if (data.creationRecovery?.status === 'recovered' && data.paymentIntentId === args.providerPaymentId) return { response: result('recovered', 'Verified payment is already available to checkout reconciliation.', true) };
    if (data.creationClaimToken && Number(data.claimedAt) + 30_000 > ports.now()) return { response: result('processing', 'Payment creation or recovery is in progress; retry shortly.', true) };
    const draft = data.recoveryRequest;
    const validDraft = data.creationBindingVersion === 1 && draft && draft.paymentSessionId === session.id && draft.cartId === session.cart.id
      && (draft.checkoutOwnerId || null) === (session.cart.customerId || null)
      && (session.cart.customerId || draft.sessionId === session.cart.sessionId)
      && data.checkoutFingerprint && data.cartFingerprint && checkoutRequestFingerprint(draft) === data.checkoutFingerprint
      && Number.isSafeInteger(session.amountCents) && session.amountCents > 0 && data.amountInCents === session.amountCents
      && String(data.currency).toLowerCase() === 'usd';
    const evidence = { actorId: context.session.itemId, reason: args.reason, requestedAt: new Date(ports.now()).toISOString() };
    if (!validDraft) {
      await tc.prisma.paymentSession.update({ where: { id: session.id }, data: { data: { ...data, creationRecovery: { ...evidence, status: 'manual_review', cause: 'missing_original_binding' } } } });
      return { response: result('manual_review', reviewMessage) };
    }
    await tc.prisma.paymentSession.update({ where: { id: session.id }, data: { data: { ...data, status: 'unknown', creationClaimToken: token, claimedAt: ports.now(),
      creationRecovery: { ...evidence, status: 'retrieving', token } } } });
    return { session, draft, evidence };
  });
  if (claim.response) return claim.response;

  let state: any;
  let failure: string | null = null;
  try { state = await ports.getPaymentStatus({ provider: claim.session.paymentProvider, paymentId: args.providerPaymentId }); }
  catch { failure = 'provider_unavailable'; }
  if (!failure) {
    const metadata = state?.data?.metadata;
    if (state?.data?.id !== args.providerPaymentId || metadata?.paymentSessionId !== claim.session.id
      || metadata?.checkoutFingerprint !== claim.session.data.checkoutFingerprint || metadata?.cartFingerprint !== claim.session.data.cartFingerprint
      || metadata?.cartId !== claim.session.cart.id || state?.amountCents !== claim.session.amountCents
      || String(state?.currency).toLowerCase() !== 'usd' || !state?.data?.client_secret
      || !['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'authorized', 'succeeded', 'captured'].includes(state?.status)) failure = 'provider_binding_mismatch';
  }
  return context.transaction(async (tc: any) => {
    if ((await authorize(tc)).id !== store.id) throw new Error('Active Store changed during recovery');
    const current = await locked(tc);
    const data = current.data || {};
    if (data.creationClaimToken !== token || data.creationRecovery?.token !== token || data.status === 'completed' || data.compensationStatus
      || (current.cart.customerId || null) !== (claim.session.cart.customerId || null)
      || (!current.cart.customerId && current.cart.sessionId !== claim.session.cart.sessionId)
      || current.paymentProvider.id !== claim.session.paymentProvider.id || data.creationBindingVersion !== 1
      || data.checkoutFingerprint !== claim.session.data.checkoutFingerprint || data.cartFingerprint !== claim.session.data.cartFingerprint
      || current.amountCents !== claim.session.amountCents || groceryOutboxPayloadHash(data.recoveryRequest) !== groceryOutboxPayloadHash(claim.draft)
      || (data.paymentIntentId && data.paymentIntentId !== args.providerPaymentId)) throw new Error('Checkout recovery claim changed; retry after the active operation completes');
    if (failure) {
      await tc.prisma.paymentSession.update({ where: { id: current.id }, data: { data: { ...data, creationClaimToken: null,
        creationRecovery: { ...data.creationRecovery, status: failure === 'provider_unavailable' ? 'unknown' : 'manual_review', cause: failure } } } });
      return result(failure === 'provider_unavailable' ? 'unknown' : 'manual_review', failure === 'provider_unavailable' ? 'Provider lookup could not be confirmed. No payment was attached; retry this reference.' : reviewMessage);
    }
    const existingAttempt = await tc.prisma.checkoutAttempt.findFirst({ where: { paymentSessionId: current.id } });
    if (existingAttempt && (existingAttempt.providerPaymentId !== args.providerPaymentId || existingAttempt.status !== 'pending')) throw new Error('Checkout reconciliation already owns this request');
    const draft = { ...claim.draft, paymentSessionId: current.id, paymentIntentId: args.providerPaymentId };
    // Reuse this transaction so the immutable attempt and recovered identity commit together.
    const attempt = await ports.ensureCheckoutAttempt({ ...tc, transaction: async (operation: any) => operation(tc) } as any, draft,
      { ...current.cart, store: { id: store.id } }, current, args.providerPaymentId);
    if (attempt.status !== 'pending') throw new Error('Checkout reconciliation already owns this request');
    await tc.prisma.paymentSession.update({ where: { id: current.id }, data: { isInitiated: true, data: { ...data, status: 'ready', creationClaimToken: null,
      paymentIntentId: args.providerPaymentId, clientSecret: state.data.client_secret, error: null,
      creationRecovery: { ...data.creationRecovery, status: 'recovered', completedAt: new Date(ports.now()).toISOString(), providerStatus: state.status } } } });
    return result('recovered', 'Verified payment is available to checkout reconciliation. The customer can resume any required payment confirmation.');
  });
}

export default function recoverGroceryPaymentCreation(root: unknown, args: RecoveryInput, context: any) {
  return recoverPaymentCreationWithDependencies(root, args, context);
}
