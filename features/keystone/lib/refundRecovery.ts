import { unlinkedLineRefundReservedCents } from './refundAllocations';
import type { RefundStatus } from './refundState';
import type { Prisma } from '@prisma/client';

export function normalizeProviderRefund(response: any, expected: { amountCents: number; currencyCode: string; providerPaymentId: string; providerRefundId?: string | null }) {
  const resource = response?.data || response;
  const id = response?.id || resource?.id;
  const amount = response?.amount ?? resource?.amount;
  const currency = response?.currency ?? resource?.currency;
  const payment = response?.paymentId || resource?.payment_intent || resource?.paymentId;
  const paymentId = typeof payment === 'string' ? payment : payment?.id;
  if (!id || (expected.providerRefundId && expected.providerRefundId !== id)) throw new Error('Provider refund identity does not match');
  if (!Number.isSafeInteger(amount) || amount !== expected.amountCents) throw new Error('Provider refund amount does not match');
  if (typeof currency !== 'string' || currency.toLowerCase() !== expected.currencyCode.toLowerCase()) throw new Error('Provider refund currency does not match');
  if (paymentId !== expected.providerPaymentId) throw new Error('Provider refund payment does not match');
  const rawStatus = String(response?.status ?? resource?.status ?? '').toLowerCase();
  const status: RefundStatus = rawStatus === 'succeeded' || rawStatus === 'paid' ? 'succeeded'
    : rawStatus === 'failed' ? 'failed' : rawStatus === 'canceled' || rawStatus === 'cancelled' ? 'canceled' : 'processing';
  return { id: String(id), status, rawStatus, resource };
}

/** Caller holds Payment FOR UPDATE; the current request is counted exactly once. */
export async function assertRefundBudget(tx: any, paymentId: string, paymentCents: number, amountCents: number, refundId?: string, providerRefundKey?: string) {
  const reserved = await tx.paymentRefund.aggregate({ where: { paymentId, status: { in: ['processing', 'succeeded'] }, ...(refundId ? { id: { not: refundId } } : {}) }, _sum: { amountCents: true } });
  const lineReservedCents = await unlinkedLineRefundReservedCents(tx, paymentId, providerRefundKey);
  if (!Number.isSafeInteger(paymentCents) || !Number.isSafeInteger(amountCents) || amountCents < 1 || Number(reserved._sum.amountCents || 0) + lineReservedCents + amountCents > paymentCents) {
    throw new Error('Cumulative refund amount cannot exceed the settled payment');
  }
}

export function assertRefundCreationWindow(requestedAt: Date | string, providerRefundId?: string | null, now = Date.now()) {
  // A lost provider ID must not lead to a new charge reversal after its
  // idempotency retention window. Escalate for evidence-based reconciliation.
  if (!providerRefundId && now - new Date(requestedAt).getTime() >= 23 * 60 * 60 * 1000) throw new Error('Unknown refund outcome requires provider evidence; automatic creation replay window expired');
}

export function refundProviderData(previous: unknown, resource: unknown) {
  return JSON.parse(JSON.stringify({ ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}), providerResponse: resource })) as Prisma.InputJsonObject;
}
