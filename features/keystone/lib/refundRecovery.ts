import { unlinkedLineRefundReservedCents } from './refundAllocations';
import type { RefundStatus } from './refundState';
import type { Prisma } from '@prisma/client';
import { publicError } from './publicError';

export function normalizeProviderRefund(response: any, expected: { amountCents: number; currencyCode: string; providerPaymentId: string; providerRefundId?: string | null }) {
  const resource = response?.data || response;
  const id = response?.id || resource?.id;
  const amount = response?.amount ?? resource?.amount;
  const currency = response?.currency ?? resource?.currency;
  const payment = response?.paymentId || resource?.payment_intent || resource?.paymentId;
  const paymentId = typeof payment === 'string' ? payment : payment?.id;
  if (!id || (expected.providerRefundId && expected.providerRefundId !== id)) throw publicError('Provider refund identity does not match', 'REFUND_REFUSED');
  if (!Number.isSafeInteger(amount) || amount !== expected.amountCents) throw publicError('Provider refund amount does not match', 'REFUND_REFUSED');
  if (typeof currency !== 'string' || currency.toLowerCase() !== expected.currencyCode.toLowerCase()) throw publicError('Provider refund currency does not match', 'REFUND_REFUSED');
  if (paymentId !== expected.providerPaymentId) throw publicError('Provider refund payment does not match', 'REFUND_REFUSED');
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
    throw publicError('Cumulative refund amount cannot exceed the settled payment', 'REFUND_REFUSED');
  }
}

export function assertRefundCreationWindow(requestedAt: Date | string, providerRefundId?: string | null, now = Date.now()) {
  // A lost provider ID must not lead to a new charge reversal after its
  // idempotency retention window. Escalate for evidence-based reconciliation.
  if (!providerRefundId && now - new Date(requestedAt).getTime() >= 23 * 60 * 60 * 1000) throw publicError('Unknown refund outcome requires provider evidence; automatic creation replay window expired', 'REFUND_REFUSED');
}

export function refundProviderData(previous: unknown, resource: unknown) {
  return JSON.parse(JSON.stringify({ ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}), providerResponse: resource })) as Prisma.InputJsonObject;
}
