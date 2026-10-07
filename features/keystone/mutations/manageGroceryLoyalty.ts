import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { appendLoyaltyEntry, lockLoyaltyAccount, loyaltyBalance, loyaltyCouponCode } from '../lib/loyaltyAccounting';
import { withSerializableRetry } from '../utils/serializableTransaction';

export async function configureGroceryLoyalty(_root: unknown, args: { name: string; earnPointsPer100Cents: number; redeemPointsPer100Cents: number; minimumRedemptionPoints: number; isActive: boolean }, context: Context) {
  await requireFreshCapability(context, 'canManageUsers');
  const store = await requireSessionStore(context);
  if (!args.name?.trim() || !Number.isSafeInteger(args.earnPointsPer100Cents) || args.earnPointsPer100Cents < 0 || !Number.isSafeInteger(args.redeemPointsPer100Cents) || args.redeemPointsPer100Cents < 1 || !Number.isSafeInteger(args.minimumRedemptionPoints) || args.minimumRedemptionPoints < 1) throw new Error('Loyalty requires a name and valid integer earning/redemption rules');
  return context.transaction(async transactionContext => {
    const tx: any = transactionContext.prisma;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-loyalty-program'), hashtext($1))", store.id);
    const program = await tx.loyaltyProgram.findFirst({ where: { storeId: store.id }, orderBy: { id: 'asc' } });
    if (program) await tx.loyaltyProgram.updateMany({ where: { storeId: store.id, id: { not: program.id } }, data: { isActive: false } });
    const data = { ...args, name: args.name.trim(), pointsPerDollar: args.earnPointsPer100Cents, refundDebtPolicy: 'offset_future_earnings', redemptionRules: { pointsPerDollar: args.redeemPointsPer100Cents, minimumRedemption: args.minimumRedemptionPoints }, expirationRules: { enabled: false } };
    const result = program ? await tx.loyaltyProgram.update({ where: { id: program.id }, data }) : await tx.loyaltyProgram.create({ data: { ...data, storeId: store.id } });
    return { success: true, programId: result.id };
  });
}

export async function redeemGroceryLoyalty(_root: unknown, args: { points: number; idempotencyKey: string }, context: Context) {
  const store = await requireSessionStore(context);
  const userId = context.session!.itemId;
  if (!Number.isSafeInteger(args.points) || args.points <= 0 || args.idempotencyKey?.trim().length < 12) throw new Error('Positive integer points and redemption idempotency key required');
  return withSerializableRetry(() => context.transaction(async transactionContext => {
    const tx: any = transactionContext.prisma;
    await lockLoyaltyAccount(tx, store.id, userId);
    const existing = await tx.loyaltyRedemption.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (existing) {
      if (existing.storeId !== store.id || existing.userId !== userId || existing.points !== args.points) throw new Error('Loyalty redemption replay differs from original owner or points');
      const coupon = await tx.coupon.findUnique({ where: { id: existing.couponId } });
      return { success: true, redemptionId: existing.id, couponCode: coupon.code, points: existing.points, discountCents: existing.discountCents, balance: await loyaltyBalance(tx, store.id, userId), reused: true };
    }
    const program = await tx.loyaltyProgram.findFirst({ where: { storeId: store.id, isActive: true }, orderBy: { id: 'asc' } });
    if (!program) throw new Error('No active loyalty program');
    if (args.points < program.minimumRedemptionPoints) throw new Error('Points are below the minimum redemption');
    const balance = await loyaltyBalance(tx, store.id, userId);
    if (balance < args.points) throw new Error('Insufficient available loyalty points; refund debt must be recovered first');
    const discountCents = Number(BigInt(args.points) * BigInt(100) / BigInt(program.redeemPointsPer100Cents));
    if (!Number.isSafeInteger(discountCents) || discountCents <= 0 || discountCents > 2147483647 || BigInt(args.points) * BigInt(100) % BigInt(program.redeemPointsPer100Cents) !== BigInt(0)) throw new Error('Choose a point amount that converts to exact currency minor units');
    const coupon = await tx.coupon.create({ data: { storeId: store.id, code: loyaltyCouponCode(`${store.id}:${userId}:${args.idempotencyKey}`), discountType: 'fixed', discountValue: discountCents / 100, discountValueCents: discountCents, minPurchase: discountCents / 100, minPurchaseCents: discountCents, maxUses: 1, currentUses: 0, isActive: true, validFrom: new Date(), productCategories: [], excludedProducts: [] } });
    const redemption = await tx.loyaltyRedemption.create({ data: { storeId: store.id, userId, programId: program.id, couponId: coupon.id, points: args.points, discountCents, status: 'issued', idempotencyKey: args.idempotencyKey, events: [{ action: 'issued', at: new Date().toISOString(), userId, points: args.points, discountCents }] } });
    const journal = await appendLoyaltyEntry(tx, { storeId: store.id, userId, programId: program.id, idempotencyKey: `redeem:${args.idempotencyKey}`, sourceId: redemption.id, sourceType: 'loyalty_redemption', actorId: userId, points: -args.points, type: 'redeemed_discount', description: 'Points exchanged for a retailer-funded customer-owned single-use reward', metadata: { redemptionId: redemption.id, couponId: coupon.id, discountCents, retailerFunded: true } });
    return { success: true, redemptionId: redemption.id, couponCode: coupon.code, points: args.points, discountCents, balance: journal.balanceAfter, reused: false };
  }, { isolationLevel: 'Serializable' as any }));
}

export async function getGroceryLoyalty(_root: unknown, _args: unknown, context: Context) {
  const store = await requireSessionStore(context);
  const tx: any = context.prisma;
  const userId = context.session!.itemId;
  const program = await tx.loyaltyProgram.findFirst({ where: { storeId: store.id, isActive: true }, orderBy: { id: 'asc' } });
  const balance = await loyaltyBalance(tx, store.id, userId);
  const rewards = await tx.loyaltyRedemption.findMany({ where: { storeId: store.id, userId, status: 'issued' }, take: 100, orderBy: { createdAt: 'desc' }, include: { coupon: { select: { code: true } } } });
  return { balance, redeemablePoints: Math.max(0, balance), refundDebt: Math.max(0, -balance), program: program ? { id: program.id, name: program.name, earnPointsPer100Cents: program.earnPointsPer100Cents, redeemPointsPer100Cents: program.redeemPointsPer100Cents, minimumRedemptionPoints: program.minimumRedemptionPoints, refundDebtPolicy: program.refundDebtPolicy } : null, rewards: rewards.map((reward: any) => ({ id: reward.id, couponCode: reward.coupon.code, discountCents: reward.discountCents, points: reward.points })) };
}
