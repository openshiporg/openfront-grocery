import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { getPaymentStatus } from '../utils/paymentProviderAdapter';
import {
  claimCheckoutAttempt,
  releaseCheckoutAttemptLease,
  type CheckoutLease,
} from '../utils/checkoutAttemptLease';
import { compensateFailedCheckout, commitGroceryOrder, type SubmitOrderData } from './submitGroceryOrder';

function isSettled(status: string) {
  return status === 'succeeded' || status === 'captured';
}

export async function reconcileCheckoutAttempts(_root: unknown, { limit = 20 }: { limit?: number }, context: Context) {
  await requireFreshCapability(context, 'canManageOrders');
  const store = await requireSessionStore(context);
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit))));
  const attempts = await context.prisma.checkoutAttempt.findMany({
    where: { storeId: store.id, status: { in: ['pending', 'settled_pending_finalize', 'finalizing', 'compensation_required', 'compensation_processing'] } },
    orderBy: { updatedAt: 'asc' },
    take: boundedLimit,
    select: {
      id: true,
      status: true,
      providerCode: true,
    },
  });
  const results = [] as Array<{ id: string; status: string; orderId?: string | null; action: string }>;

  for (const attempt of attempts) {
    const provider = await context.prisma.paymentProvider.findUnique({
      where: { code: attempt.providerCode },
      select: { id: true, code: true, isInstalled: true, metadata: true },
    });
    if (!provider?.isInstalled) continue;

    const action = attempt.status === 'compensation_required' || attempt.status === 'compensation_processing' ? 'compensate' : 'finalize';
    const lease = await context.transaction(async (transactionContext) => claimCheckoutAttempt(transactionContext.prisma, attempt.id, action));
    if (!lease) continue; // Another worker won the atomic claim, or a terminal CAS already won.

    if (action === 'compensate') {
      const compensation = await compensateFailedCheckout({
        context,
        attemptId: lease.id,
        provider: provider as any,
        cause: new Error('Checkout compensation recovery'),
        compensationLease: lease,
      });
      if (compensation.claimed) results.push({ id: lease.id, status: compensation.status, orderId: lease.orderId, action: 'compensation' });
      continue;
    }

    const paymentStatus = await getPaymentStatus({ provider: provider as any, paymentId: lease.providerPaymentId });
    if (!isSettled(String(paymentStatus?.status || ''))) {
      await context.transaction(async (transactionContext) => releaseCheckoutAttemptLease(
        transactionContext.prisma,
        lease,
        'pending',
      ));
      continue;
    }

    const amountCents = Number(paymentStatus?.amount || lease.amountCents);
    const currency = String(paymentStatus?.currency || lease.currencyCode).toLowerCase();
    if (!Number.isInteger(amountCents) || amountCents !== lease.amountCents || currency !== lease.currencyCode.toLowerCase()) {
      await context.transaction(async (transactionContext) => {
        const session = await transactionContext.prisma.paymentSession.findUnique({
          where: { id: lease.paymentSessionId },
          select: { data: true },
        });
        const { clientSecret: _discardedClientSecret, ...evidence } = (session?.data as Record<string, unknown> | null) || {};
        await transactionContext.prisma.paymentSession.update({
          where: { id: lease.paymentSessionId },
          data: {
            data: {
              ...evidence,
              compensationFullRefund: true,
              settlementMismatch: {
                expectedAmountCents: lease.amountCents,
                observedAmountCents: Number.isInteger(amountCents) ? amountCents : null,
                expectedCurrency: lease.currencyCode.toLowerCase(),
                observedCurrency: currency,
              },
            },
          },
        });
      });
      const compensation = await compensateFailedCheckout({
        context,
        attemptId: lease.id,
        provider: provider as any,
        cause: new Error('Provider settlement amount or currency did not match durable checkout attempt'),
        finalizationLease: lease,
        forceFullRefund: true,
      });
      if (compensation.claimed) results.push({ id: lease.id, status: compensation.status, orderId: lease.orderId, action: 'mismatch_compensation' });
      continue;
    }

    const request = lease.requestData as unknown as SubmitOrderData;
    try {
      const committed = await commitGroceryOrder(
        request,
        context,
        { providerCode: lease.providerCode, providerPaymentId: lease.providerPaymentId, status: String(paymentStatus.status), amountCents, currency },
        lease.id,
        lease.cartCustomerId,
        lease,
      );
      results.push({ id: lease.id, status: 'finalized', orderId: committed.orderId, action: 'finalize' });
    } catch (error) {
      const compensation = await compensateFailedCheckout({
        context,
        attemptId: lease.id,
        provider: provider as any,
        cause: error,
        finalizationLease: lease,
      });
      if (compensation.claimed) results.push({ id: lease.id, status: compensation.status, orderId: lease.orderId, action: 'compensation' });
    }
  }
  return { processed: results.length, results };
}
