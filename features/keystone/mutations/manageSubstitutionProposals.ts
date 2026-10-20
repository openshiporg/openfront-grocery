import { createHash, randomUUID } from 'node:crypto';
import { MATERIAL_INFORMATION_FIELDS, latestInformationVersionIds, materialInformationSnapshot } from '../lib/materialInformation';
import type { Context } from '.keystone/types';

import { requireFreshCapability } from '../access';
import { convertMeasureMilli, measureMilli, measuredSubtotalCents } from '../lib/fulfillmentActuals';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { publicError } from '../lib/publicError';
import { requireSessionStore } from '../lib/storeScope';
import { verifyGuestOrderToken } from '../utils/guestOrderToken';
import { withSerializableRetry } from '../utils/serializableTransaction';

/**
 * A replacement offered to the customer before the line is resolved. Proposals live in
 * Order.metadata.substitutionProposals keyed by line item, so signed-in and guest receipts
 * (which read order metadata) both see them. The customer's online decision is the consent
 * evidence that resolveOrderLineFulfillment accepts for the approved product and quantity.
 */
export type SubstitutionProposal = {
  id: string;
  lineItemId: string;
  originalTitle: string;
  productId: string;
  productTitle: string;
  productSku: string;
  quantityMilli: number;
  unitOfMeasure: string;
  unitPriceCents: number;
  estimatedSubtotalCents: number;
  /** Tax treatment and grocery information the customer was offered (absent on older offers). */
  taxRateBasisPoints?: number;
  materialInformation?: ReturnType<typeof materialInformationSnapshot>;
  /** Fingerprint of the exact offer (product, converted quantity, unit, reason, price, tax, information). */
  offerFingerprint?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  proposedAt: string;
  proposedById: string;
  idempotencyKey: string;
  decidedAt?: string;
  decidedBy?: string;
  channel?: 'online';
  previous?: Array<Omit<SubstitutionProposal, 'previous'>>;
};

const NO_SUBSTITUTION = ['none', 'remove', 'no_substitutions', 'refund'];

export function substitutionProposals(metadata: any): Record<string, SubstitutionProposal> {
  const value = metadata?.substitutionProposals;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

type ProposeArgs = { orderId: string; lineItemId: string; productId: string; quantity: string; unitOfMeasure: string; reason: string; idempotencyKey: string };

export async function proposeOrderLineSubstitution(_root: unknown, args: ProposeArgs, context: Context) {
  await requireFreshCapability(context, 'canManageOrders');
  const store = await requireSessionStore(context);
  const orderId = args.orderId?.trim(), lineItemId = args.lineItemId?.trim(), productId = args.productId?.trim();
  const reason = args.reason?.trim() || '', idempotencyKey = args.idempotencyKey?.trim() || '';
  if (!orderId || !lineItemId || !productId) throw publicError('Choose the order line and a replacement product');
  if (!reason || reason.length > 500) throw publicError('Tell the customer why a replacement is needed (up to 500 characters)');
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw publicError('A valid request identity is required');
  const enteredMilli = measureMilli(String(args.quantity || '').trim());

  return withSerializableRetry(() => context.transaction(async (tx: any) => {
    await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const order = await tx.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, displayId: true, storeId: true, status: true, substitutionPreference: true, metadata: true } });
    if (!order || order.storeId !== store.id) throw publicError('Order not found in active store');
    if (order.status !== 'picking' || (order.metadata as any)?.finalSale) throw publicError('Replacements can only be proposed while picking, before the sale is finalized');
    const sudo = tx.sudo();
    const line = await sudo.query.OrderLineItem.findOne({ where: { id: lineItemId }, query: 'id title metadata order { id } product { id } fulfillment { id }' });
    if (!line || line.order?.id !== order.id) throw publicError('Line does not belong to this order');
    const proposals = substitutionProposals(order.metadata);
    const existing = proposals[lineItemId];
    const product = await sudo.query.Product.findOne({ where: { id: productId }, query: `id title sku status priceCents taxRateBasisPoints pricingMethod unitOfMeasure ${MATERIAL_INFORMATION_FIELDS} store { id }` });
    if (!product || product.store?.id !== store.id) throw publicError('Replacement product is not available');
    const quantityMilli = convertMeasureMilli(enteredMilli, String(args.unitOfMeasure || product.unitOfMeasure).trim(), product.unitOfMeasure);
    if (existing?.idempotencyKey === idempotencyKey) {
      // The same key returns the original offer only for exactly the same request.
      if (existing.productId !== productId || Number(existing.quantityMilli) !== quantityMilli || existing.unitOfMeasure !== product.unitOfMeasure || existing.reason !== reason) {
        throw publicError('This request was already used for a different replacement');
      }
      return { proposalId: existing.id, status: existing.status, reused: true };
    }
    if (line.fulfillment?.id) throw publicError('This line is already resolved');
    if (order.substitutionPreference === 'refund' || NO_SUBSTITUTION.includes(line.metadata?.substitutionPreference)) throw publicError('Customer preferences prohibit substitutions');
    if (existing?.status === 'pending') throw publicError('A replacement is already waiting for the customer’s answer');
    if (existing?.status === 'approved') throw publicError('The customer already approved a replacement; resolve this line with it');
    if (product.status !== 'published') throw publicError('Replacement product is not available');
    if (product.id === line.product?.id) throw publicError('Select a different replacement product');
    if (quantityMilli <= 0) throw publicError('Enter the replacement quantity');
    if (product.pricingMethod === 'unit' && quantityMilli % 1000 !== 0) throw publicError('Unit products require whole quantities');
    const unitPriceCents = Number(product.priceCents);
    const settings = await tx.prisma.storeSettings.findUnique({ where: { storeId: store.id }, select: { taxRateBps: true } });
    const taxRateBasisPoints = Number(product.taxRateBasisPoints ?? settings?.taxRateBps ?? 0);
    const informationVersions = await latestInformationVersionIds(tx.prisma, [product.id]);
    const materialInformation = materialInformationSnapshot(product, informationVersions.get(product.id) || null);
    const { previous: earlier = [], ...prior } = existing || ({} as Partial<SubstitutionProposal>);
    const proposal: SubstitutionProposal = {
      id: randomUUID(), lineItemId, originalTitle: line.title, productId: product.id, productTitle: product.title, productSku: product.sku || '',
      quantityMilli, unitOfMeasure: product.unitOfMeasure, unitPriceCents, estimatedSubtotalCents: measuredSubtotalCents(unitPriceCents, quantityMilli),
      taxRateBasisPoints, materialInformation,
      offerFingerprint: createHash('sha256').update(JSON.stringify([store.id, order.id, lineItemId, product.id, quantityMilli, product.unitOfMeasure, reason, unitPriceCents, taxRateBasisPoints, materialInformation.fingerprint])).digest('hex'),
      reason, status: 'pending', proposedAt: new Date().toISOString(), proposedById: String(context.session?.itemId || ''), idempotencyKey,
      ...(existing ? { previous: [...earlier, prior as Omit<SubstitutionProposal, 'previous'>].slice(-10) } : {}),
    };
    await tx.prisma.order.update({ where: { id: order.id }, data: { metadata: { ...(order.metadata as any), substitutionProposals: { ...proposals, [lineItemId]: proposal } } } });
    // A required service message: queued for the customer; delivery is tracked in Communications.
    await enqueueGroceryOutboxEvent(tx.prisma, {
      storeId: store.id, eventKey: `order:${order.id}:substitution:${proposal.id}:proposed:v1`, eventType: 'order.substitution.proposed',
      aggregateType: 'Order', aggregateId: order.id, occurredAt: proposal.proposedAt,
      payload: { orderId: order.id, lineItemId, proposalId: proposal.id, originalTitle: line.title, productTitle: product.title, quantityMilli, unitOfMeasure: product.unitOfMeasure, estimatedSubtotalCents: proposal.estimatedSubtotalCents },
    });
    return { proposalId: proposal.id, status: proposal.status, reused: false };
  }, { isolationLevel: 'ReadCommitted' as any }));
}

type RespondArgs = { orderId: string; lineItemId: string; proposalId: string; decision: string; sessionId?: string | null; token?: string | null };

export async function respondToOrderLineSubstitution(_root: unknown, args: RespondArgs, context: any) {
  const decision = args.decision === 'approve' ? 'approved' : args.decision === 'reject' ? 'rejected' : null;
  if (!decision) throw publicError('Choose approve or decline');
  const orderId = args.orderId?.trim(), lineItemId = args.lineItemId?.trim(), proposalId = args.proposalId?.trim();
  if (!orderId || !lineItemId || !proposalId) throw publicError('Replacement not found');
  return withSerializableRetry(() => context.transaction(async (tx: any) => {
    await tx.prisma.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const order = await tx.prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
    // Same ownership proof as revised-payment approval: the signed-in owner, or the guest
    // checkout session plus its signed order token.
    const owns = context.session?.itemId ? order?.userId === context.session.itemId
      : !order?.userId && args.sessionId && args.token && order?.metadata?.guestSessionId === args.sessionId
        && verifyGuestOrderToken(orderId, args.sessionId, args.token, Math.floor(Date.now() / 1000), order.createdAt);
    if (!owns || !order?.store?.isActive) throw publicError('Order not found', 'NOT_FOUND');
    const proposals = substitutionProposals(order.metadata);
    const proposal = proposals[lineItemId];
    if (!proposal || proposal.id !== proposalId) throw publicError('This replacement is no longer offered. Refresh your order.');
    if (proposal.status !== 'pending') {
      if (proposal.status === decision) return { proposalId, status: proposal.status, reused: true };
      throw publicError('You already answered this replacement. Contact the store to change it.');
    }
    if (order.status !== 'picking' || order.metadata?.finalSale) throw publicError('The store has finished picking this order. Contact the store about this item.');
    const fulfillment = await tx.prisma.orderLineFulfillment.findFirst({ where: { lineItemId }, select: { id: true } });
    if (fulfillment) throw publicError('The store has already resolved this item. Refresh your order.');
    const decided: SubstitutionProposal = { ...proposal, status: decision, decidedAt: new Date().toISOString(), decidedBy: context.session?.itemId ? `customer:${context.session.itemId}` : 'guest-order-link', channel: 'online' };
    await tx.prisma.order.update({ where: { id: order.id }, data: { metadata: { ...order.metadata, substitutionProposals: { ...proposals, [lineItemId]: decided } } } });
    return { proposalId, status: decision, reused: false };
  }, { isolationLevel: 'ReadCommitted' as any }));
}
