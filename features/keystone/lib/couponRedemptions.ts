/** Caller owns the Order (or just created it) and Coupon locks in one transaction. */
export async function consumeOrderCoupon(tx: any, input: { orderId: string; storeId: string; couponId: string; userId?: string | null }) {
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.storeId !== input.storeId || (order.userId || null) !== (input.userId || null) || order.metadata?.coupon?.id !== input.couponId) throw new Error('Coupon consumption must belong to the current order and Store');
  const previous = order.metadata?.couponConsumption;
  if (previous) {
    if (previous.orderId !== order.id || previous.couponId !== input.couponId || previous.storeId !== input.storeId) throw new Error('Coupon consumption identity conflicts with this order');
    return { ...previous, reused: true };
  }
  const coupon = await tx.coupon.findUnique({ where: { id: input.couponId } });
  if (!coupon || coupon.storeId !== input.storeId) throw new Error('Coupon belongs to another Store');
  const consumedAt = new Date(); let clipId: string | null = null;
  if (input.userId) {
    const candidate = await tx.userCoupon.findFirst({ where: { userId: input.userId, couponId: input.couponId, used: false }, orderBy: [{ clippedAt: 'asc' }, { id: 'asc' }] });
    if (candidate) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "UserCoupon" WHERE "id"=$1 FOR UPDATE', candidate.id);
      const clip = await tx.userCoupon.findUnique({ where: { id: candidate.id } });
      if (clip && clip.userId === input.userId && clip.couponId === input.couponId && !clip.used) {
        await tx.userCoupon.update({ where: { id: clip.id }, data: { used: true, usedAt: consumedAt, usedByOrderId: order.id } });
        clipId = clip.id;
      }
    }
  }
  const currentUsesBefore = Number(coupon.currentUses || 0);
  if (!Number.isSafeInteger(currentUsesBefore) || currentUsesBefore < 0) throw new Error('Coupon usage counter is invalid');
  await tx.coupon.update({ where: { id: coupon.id }, data: { currentUses: currentUsesBefore + 1 } });
  const consumption = { orderId: order.id, couponId: coupon.id, storeId: input.storeId, userId: input.userId || null, clipId, consumedAt: consumedAt.toISOString(), currentUsesBefore };
  await tx.order.update({ where: { id: order.id }, data: { metadata: { ...(order.metadata || {}), couponConsumption: consumption } } });
  return { ...consumption, reused: false };
}

/** Caller owns Order lock; acquires Coupon then clip, and persists one release marker. */
export async function releaseOrderCoupon(tx: any, input: { storeId: string; orderId: string; sourceId: string; reason: string }) {
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.storeId !== input.storeId) throw new Error('Coupon release order is outside the active Store');
  const metadata = order.metadata || {}, consumption = metadata.couponConsumption;
  const couponId = consumption?.couponId || metadata.coupon?.id;
  if (!couponId) return { released: false, reused: false, metadata };
  if (metadata.couponRelease || metadata.cancellation?.couponRedemptionReleased) return { released: true, reused: true, metadata };
  if (consumption && (consumption.orderId !== order.id || consumption.storeId !== input.storeId || (consumption.userId || null) !== (order.userId || null) || metadata.coupon?.id !== couponId)) throw new Error('Coupon consumption owner differs from the released order');
  await tx.$queryRawUnsafe('SELECT "id" FROM "Coupon" WHERE "id"=$1 FOR UPDATE', couponId);
  const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
  if (coupon && coupon.storeId !== input.storeId) throw new Error('Coupon release cannot change another Store');
  let clipRestored = false;
  if (consumption?.clipId && order.userId) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "UserCoupon" WHERE "id"=$1 FOR UPDATE', consumption.clipId);
    const clip = await tx.userCoupon.findUnique({ where: { id: consumption.clipId } });
    // A deleted clip or one consumed by a newer order must never be recreated or reset.
    if (clip && clip.userId === order.userId && clip.couponId === couponId && clip.used && clip.usedByOrderId === order.id) {
      await tx.userCoupon.update({ where: { id: clip.id }, data: { used: false, usedAt: null, usedByOrderId: null } });
      clipRestored = true;
    }
  }
  const currentUsesBefore = Number(coupon?.currentUses || 0);
  if (!Number.isSafeInteger(currentUsesBefore) || currentUsesBefore < 0) throw new Error('Coupon usage counter is invalid');
  if (coupon && currentUsesBefore > 0) await tx.coupon.update({ where: { id: couponId }, data: { currentUses: currentUsesBefore - 1 } });
  const release = { orderId: order.id, couponId, sourceId: input.sourceId, reason: input.reason, releasedAt: new Date().toISOString(), counterDecremented: Boolean(coupon && currentUsesBefore > 0), clipRestored, clipId: consumption?.clipId || null, evidenceKind: consumption ? 'order_consumption' : 'legacy_coupon_snapshot_no_clip_link' };
  const nextMetadata = { ...metadata, couponRelease: release };
  await tx.order.update({ where: { id: order.id }, data: { metadata: nextMetadata } });
  return { released: true, reused: false, metadata: nextMetadata };
}

/** Full release needs zero remaining captured money and no live authorization. */
export function isOrderFullyRefunded(payments: any[], refunds: any[]) {
  if (payments.some(payment => ['pending', 'processing', 'authorized'].includes(payment.status))) return false;
  const paid = payments.filter(payment => ['succeeded', 'partially_refunded', 'refunded'].includes(payment.status));
  const paidIds = new Set(paid.map(payment => payment.id));
  const cents = (value: unknown) => { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new Error('Refund release requires valid captured and refunded cents'); return number; };
  const captured = paid.reduce((sum, payment) => sum + cents(payment.amountCents), 0);
  const returned = refunds.filter(refund => paidIds.has(refund.paymentId) && refund.status === 'succeeded').reduce((sum, refund) => sum + cents(refund.amountCents), 0);
  return captured > 0 && returned >= captured;
}
