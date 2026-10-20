import { publicError } from './publicError';
import { createHash } from 'node:crypto';

function pointsInteger(value: unknown) { const valueNumber = Number(value); if (!Number.isSafeInteger(valueNumber) || Math.abs(valueNumber) > 2147483647) throw new Error('Loyalty points must fit an integer journal amount'); return valueNumber; }
export async function lockLoyaltyAccount(tx: any, storeId: string, userId: string) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-loyalty-account'), hashtext($1))", `${storeId}:${userId}`);
}
export async function loyaltyBalance(tx: any, storeId: string, userId: string) {
  const aggregate = await tx.loyaltyTransaction.aggregate({ where: { storeId, userId }, _sum: { points: true } });
  return pointsInteger(aggregate._sum.points || 0);
}
export async function appendLoyaltyEntry(tx: any, input: { storeId: string; userId: string; programId?: string; orderId?: string; idempotencyKey: string; points: number; type: string; sourceId: string; sourceType: string; actorId?: string; description: string; metadata?: any }) {
  const existing = await tx.loyaltyTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    for (const key of ['storeId', 'userId', 'orderId', 'points', 'sourceId', 'sourceType'] as const) if ((existing[key] ?? null) !== (input[key] ?? null)) throw new Error('Loyalty journal replay conflicts with original evidence');
    return existing;
  }
  const balanceBefore = await loyaltyBalance(tx, input.storeId, input.userId);
  const balanceAfter = pointsInteger(balanceBefore + pointsInteger(input.points));
  return tx.loyaltyTransaction.create({ data: { ...input, balanceBefore, balanceAfter, transactionDate: new Date() } });
}

/** Called in the final charge/refund transaction after authorization and order locking. */
export async function reconcileOrderLoyalty(tx: any, input: { storeId: string; orderId: string; actorId?: string; sourceId: string; reason: string; netGoodsCents: number; settled: boolean }) {
  if (!input.settled) return null;
  if (!Number.isSafeInteger(input.netGoodsCents) || input.netGoodsCents < 0) throw new Error('Loyalty requires final non-negative net goods cents');
  const order = await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true, storeId: true, userId: true } });
  if (!order || order.storeId !== input.storeId) throw new Error('Loyalty order is outside the active store');
  if (!order.userId) return null;
  await lockLoyaltyAccount(tx, input.storeId, order.userId);
  const original = await tx.loyaltyTransaction.findFirst({ where: { storeId: input.storeId, orderId: order.id, sourceType: 'final_order_goods' }, orderBy: { createdAt: 'asc' } });
  const program = original?.programId ? await tx.loyaltyProgram.findUnique({ where: { id: original.programId } }) : await tx.loyaltyProgram.findFirst({ where: { storeId: input.storeId, isActive: true }, orderBy: { id: 'asc' } });
  if (!program && !original) return null;
  const policy = original?.metadata?.earnPolicy || { earnPointsPer100Cents: Number(program.earnPointsPer100Cents), refundDebtPolicy: program.refundDebtPolicy };
  const targetPoints = pointsInteger(Number(BigInt(input.netGoodsCents) * BigInt(policy.earnPointsPer100Cents) / BigInt(100)));
  const prior = await tx.loyaltyTransaction.aggregate({ where: { storeId: input.storeId, userId: order.userId, orderId: order.id, sourceType: 'final_order_goods' }, _sum: { points: true } });
  const delta = targetPoints - Number(prior._sum.points || 0);
  const idempotencyKey = `order-loyalty:${input.orderId}:${input.sourceId}`;
  const replay = await tx.loyaltyTransaction.findUnique({ where: { idempotencyKey } });
  if (replay) {
    if (replay.metadata?.netGoodsCents !== input.netGoodsCents || replay.storeId !== input.storeId) throw new Error('Final goods loyalty replay differs from original settlement');
    return replay;
  }
  if (delta < 0 && policy.refundDebtPolicy !== 'offset_future_earnings') throw new Error('A configured refund debt policy is required to reverse spent points');
  return appendLoyaltyEntry(tx, { storeId: input.storeId, userId: order.userId, programId: original?.programId || program?.id, orderId: order.id, sourceId: input.sourceId, sourceType: 'final_order_goods', idempotencyKey, actorId: input.actorId, description: input.reason, type: delta < 0 ? 'refund_deducted' : 'earned_purchase', points: delta, metadata: { netGoodsCents: input.netGoodsCents, targetPoints, earnPolicy: policy, debtPolicy: 'Refund debt offsets future earnings; redemption requires positive available balance.' } });
}

export async function validateLoyaltyCoupon(tx: any, couponId: string, userId: string | null | undefined, storeId: string) {
  const redemption = await tx.loyaltyRedemption.findFirst({ where: { couponId } });
  if (!redemption) return null;
  if (!userId || redemption.storeId !== storeId || redemption.userId !== userId || redemption.status !== 'issued') throw publicError('This reward coupon belongs to another account or is no longer available. Remove it to continue.', 'COUPON_INVALID');
  return redemption;
}
export async function markLoyaltyRedemptionUsed(tx: any, couponId: string, orderId: string, storeId: string) {
  const redemption = await tx.loyaltyRedemption.findFirst({ where: { couponId } });
  if (!redemption) return null;
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { storeId: true, userId: true } });
  if (!order || order.storeId !== storeId || redemption.storeId !== storeId || redemption.userId !== order.userId) throw new Error('Loyalty redemption and order ownership differ');
  if (redemption.status === 'used' && redemption.orderId === orderId) return redemption;
  if (redemption.status !== 'issued') throw new Error('Loyalty redemption has already been consumed');
  return tx.loyaltyRedemption.update({ where: { id: redemption.id }, data: { status: 'used', orderId, usedAt: new Date(), events: [...(redemption.events || []), { action: 'used', orderId, at: new Date().toISOString() }] } });
}
export async function restoreLoyaltyRedemptionForOrder(tx: any, input: { storeId: string; orderId: string; sourceId: string; reason: string }) {
  const redemptions = await tx.loyaltyRedemption.findMany({ where: { storeId: input.storeId, orderId: input.orderId, status: 'used' } });
  for (const redemption of redemptions) {
    await lockLoyaltyAccount(tx, input.storeId, redemption.userId);
    await appendLoyaltyEntry(tx, { storeId: input.storeId, userId: redemption.userId, programId: redemption.programId, orderId: input.orderId, sourceId: input.sourceId, sourceType: 'redemption_reversal', idempotencyKey: `loyalty-reversal:${redemption.id}`, description: input.reason, points: redemption.points, type: 'adjusted', metadata: { redemptionId: redemption.id } });
    await tx.loyaltyRedemption.update({ where: { id: redemption.id }, data: { status: 'reversed', events: [...(redemption.events || []), { action: 'reversed', sourceId: input.sourceId, at: new Date().toISOString(), reason: input.reason }] } });
    await tx.coupon.update({ where: { id: redemption.couponId }, data: { isActive: false } });
  }
}
export const loyaltyCouponCode = (key: string) => `REWARD-${createHash('sha256').update(key).digest('hex').slice(0, 24).toUpperCase()}`;
