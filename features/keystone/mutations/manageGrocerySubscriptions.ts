import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { canonicalGroceryOutboxPayload } from '../lib/groceryOutbox';
import { nextSubscriptionOccurrence, prepareSubscriptionRun, subscriptionAnchorDay } from '../lib/recurringOrders';
import { withSerializableRetry } from '../utils/serializableTransaction';

type Args = { action: string; subscriptionId?: string; productId?: string; quantity?: number; frequency?: string; firstRunAt?: string; pausedUntil?: string; idempotencyKey: string; approveEachOrder?: boolean };
export async function manageGrocerySubscription(_root: unknown, args: Args, context: Context) {
  const store = await requireSessionStore(context);
  const userId = context.session!.itemId;
  if (!['create', 'pause', 'resume', 'skip', 'cancel', 'prepare'].includes(args.action) || args.idempotencyKey?.trim().length < 12) throw new Error('Valid recurring order action and idempotency key required');
  const fingerprint = canonicalGroceryOutboxPayload({ ...args, idempotencyKey: undefined });
  return withSerializableRetry(() => context.transaction(async transactionContext => {
    const tx: any = transactionContext.prisma;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-subscription'), hashtext($1))", args.subscriptionId || args.idempotencyKey);
    if (args.action === 'create') {
      const existing = await tx.subscription.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      if (existing) {
        if (existing.storeId !== store.id || existing.userId !== userId || existing.events?.[0]?.fingerprint !== fingerprint) throw new Error('Recurring order replay differs from original owner or schedule');
        return { success: true, subscriptionId: existing.id, status: existing.status, runId: null, reused: true };
      }
      if (!args.approveEachOrder) throw new Error('Explicit approval of each recurring checkout is required');
      if (!Number.isSafeInteger(args.quantity) || Number(args.quantity) < 1 || Number(args.quantity) > 10000 || !['weekly', 'biweekly', 'monthly'].includes(args.frequency || '')) throw new Error('Recurring orders require a positive quantity and supported frequency');
      const firstRunAt = new Date(args.firstRunAt || '');
      if (!Number.isFinite(firstRunAt.getTime()) || firstRunAt < new Date(Date.now() - 60000)) throw new Error('The first recurring occurrence must be a valid present or future time');
      const product = await tx.product.findUnique({ where: { id: args.productId } });
      if (!product || product.storeId !== store.id || product.status !== 'published') throw new Error('Recurring product is not available in your store');
      const timezone = store.timezone || 'UTC';
      const subscription = await tx.subscription.create({ data: { storeId: store.id, userId, productRefId: product.id, product: product.handle || product.title, quantity: args.quantity, frequency: args.frequency, nextDeliveryDate: firstRunAt, scheduleTimezone: timezone, anchorDay: subscriptionAnchorDay(firstRunAt, timezone), status: 'active', isActive: true, discount: 0, discountBps: 0, idempotencyKey: args.idempotencyKey, consent: { approveEachOrder: true, userId, at: new Date().toISOString(), policy: 'Prepare a basket at the scheduled time. Customer chooses a current slot and approves prices and payment at each normal checkout.' }, events: [{ action: 'created', fingerprint, actorId: userId, at: new Date().toISOString(), nextDeliveryDate: firstRunAt.toISOString(), timezone }] } });
      return { success: true, subscriptionId: subscription.id, status: subscription.status, runId: null, reused: false };
    }
    const subscription = await tx.subscription.findUnique({ where: { id: args.subscriptionId } });
    if (!subscription || subscription.storeId !== store.id || subscription.userId !== userId) throw new Error('Recurring order not found in your account');
    const replay = (subscription.events || []).find((event: any) => event.idempotencyKey === args.idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new Error('Recurring action replay differs from original inputs');
      return { success: true, subscriptionId: subscription.id, status: subscription.status, runId: replay.runId || null, reused: true };
    }
    if (subscription.status === 'cancelled') throw new Error('Cancelled recurring orders cannot be changed');
    if (args.action === 'prepare') {
      const run = await prepareSubscriptionRun(tx, subscription.id, store.id);
      return { success: true, subscriptionId: subscription.id, status: run?.status || subscription.status, runId: run?.id || null, reused: false };
    }
    const pendingRuns = ['cancel', 'skip'].includes(args.action) ? await tx.subscriptionRun.findMany({ where: { subscriptionId: subscription.id, status: { in: ['awaiting_checkout', 'blocked_cart', 'blocked_stock'] } } }) : [];
    for (const cartId of [...new Set<string>(pendingRuns.map((run: any) => run.cartId).filter(Boolean))].sort()) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', cartId);
      const cart = await tx.cart.findUnique({ where: { id: cartId } });
      if (!cart || cart.storeId !== store.id || cart.customerId !== userId) throw new Error('Recurring basket belongs to another account');
      for (const run of pendingRuns.filter((run: any) => run.cartId === cartId)) if (run.cartItemId) await tx.cartItem.deleteMany({ where: { id: run.cartItemId, cartId } });
      const items = await tx.cartItem.findMany({ where: { cartId } });
      const subtotalCents = items.reduce((total: number, item: any) => total + Number(item.subtotalCents), 0);
      await tx.cart.update({ where: { id: cartId }, data: { itemCount: items.reduce((total: number, item: any) => total + Number(item.quantity), 0), subtotalCents, subtotal: subtotalCents / 100 } });
    }
    await tx.$queryRawUnsafe('SELECT "id" FROM "Subscription" WHERE "id" = $1 FOR UPDATE', subscription.id);
    const update: any = {};
    if (args.action === 'pause') {
      const until = args.pausedUntil ? new Date(args.pausedUntil) : null;
      if (until && (!Number.isFinite(until.getTime()) || until <= new Date())) throw new Error('Pause end must be a future date');
      Object.assign(update, { status: 'paused', pausedUntil: until, isActive: true });
    } else if (args.action === 'resume') Object.assign(update, { status: 'active', pausedUntil: null, isActive: true });
    else if (args.action === 'cancel') Object.assign(update, { status: 'cancelled', isActive: false });
    else if (args.action === 'skip') Object.assign(update, { nextDeliveryDate: nextSubscriptionOccurrence(subscription, new Date()).next });
    if (args.action === 'cancel' || args.action === 'skip') {
      for (const run of pendingRuns) await tx.subscriptionRun.update({ where: { id: run.id }, data: { status: args.action === 'cancel' ? 'cancelled' : 'skipped', events: [...(run.events || []), { action: args.action, actorId: userId, at: new Date().toISOString() }] } });
    }
    const updated = await tx.subscription.update({ where: { id: subscription.id }, data: { ...update, events: [...(subscription.events || []), { action: args.action, idempotencyKey: args.idempotencyKey, fingerprint, actorId: userId, at: new Date().toISOString() }] } });
    return { success: true, subscriptionId: subscription.id, status: updated.status, runId: null, reused: false };
  }, { isolationLevel: 'Serializable' as any }));
}

export async function processDueGrocerySubscriptions(_root: unknown, args: { limit?: number }, context: Context) {
  await requireFreshCapability(context, 'canManageOrders');
  const store = await requireSessionStore(context);
  const now = new Date();
  const tx: any = context.prisma;
  const due = await tx.subscription.findMany({ where: { storeId: store.id, isActive: true, status: { not: 'cancelled' }, nextDeliveryDate: { lte: now }, OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }] }, orderBy: [{ lastProcessedAt: 'asc' }, { nextDeliveryDate: 'asc' }, { id: 'asc' }], take: Math.max(1, Math.min(100, Math.trunc(args.limit || 25))) });
  const results: any[] = [];
  for (const subscription of due) {
    try {
      const run = await withSerializableRetry(() => context.transaction(async transactionContext => {
        const run = await prepareSubscriptionRun(transactionContext.prisma, subscription.id, store.id, now);
        await (transactionContext.prisma as any).subscription.update({ where: { id: subscription.id }, data: { lastProcessedAt: now } });
        return run;
      }, { isolationLevel: 'Serializable' as any }));
      results.push({ subscriptionId: subscription.id, runId: run?.id || null, status: run?.status || 'paused' });
    } catch (error) { results.push({ subscriptionId: subscription.id, status: 'failed', error: error instanceof Error ? error.message : 'Recurring preparation failed' }); }
  }
  return { processed: results.length, results };
}
