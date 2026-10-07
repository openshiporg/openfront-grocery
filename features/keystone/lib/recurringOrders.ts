import { enqueueGroceryOutboxEvent } from './groceryOutbox';
import { isInventoryLotEligible } from './inventorySafety';
import { quantityMilli } from './inventoryMovements';

function localParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const number = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: number('year'), month: number('month'), day: number('day'), hour: number('hour'), minute: number('minute'), second: number('second') };
}
export function subscriptionAnchorDay(value: Date, timezone: string) { return localParts(value, timezone).day; }
export function advanceSubscriptionDate(current: Date, frequency: string, timezone: string, anchorDay = subscriptionAnchorDay(current, timezone)) {
  if (!Number.isFinite(current.getTime()) || !['weekly', 'biweekly', 'monthly'].includes(frequency)) throw new Error('Subscription frequency or date is invalid');
  const parts = localParts(current, timezone);
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  if (frequency === 'monthly') {
    calendar.setUTCDate(1); calendar.setUTCMonth(calendar.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, 0)).getUTCDate();
    calendar.setUTCDate(Math.min(anchorDay, lastDay));
  } else calendar.setUTCDate(calendar.getUTCDate() + (frequency === 'weekly' ? 7 : 14));
  const desired = calendar.getTime();
  let candidate = desired;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const observed = localParts(new Date(candidate), timezone);
    const local = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const delta = desired - local;
    if (delta === 0) return new Date(candidate);
    candidate += delta;
  }
  // Nonexistent DST wall time rolls forward to the next valid hour, never back.
  const adjusted = localParts(new Date(candidate), timezone);
  if (Date.UTC(adjusted.year, adjusted.month - 1, adjusted.day, adjusted.hour, adjusted.minute, adjusted.second) < desired) candidate += 3600000;
  return new Date(candidate);
}
export function nextSubscriptionOccurrence(subscription: any, after: Date) {
  let next = new Date(subscription.nextDeliveryDate);
  let skippedOccurrences = 0;
  do {
    next = advanceSubscriptionDate(next, subscription.frequency, subscription.scheduleTimezone || 'UTC', subscription.anchorDay || undefined);
    skippedOccurrences += 1;
    if (skippedOccurrences > 10000) throw new Error('Subscription schedule requires manual date review');
  } while (next <= after);
  return { next, skippedOccurrences: Math.max(0, skippedOccurrences - 1) };
}

/** Owner/capability validated by resolver; no payment or order is created here. */
export async function prepareSubscriptionRun(tx: any, subscriptionId: string, storeId: string, now = new Date()) {
  const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.storeId !== storeId) throw new Error('Subscription not found in active store');
  if (subscription.status === 'cancelled' || !subscription.isActive || (subscription.pausedUntil && new Date(subscription.pausedUntil) > now) || (subscription.status === 'paused' && !subscription.pausedUntil)) return null;
  if (!subscription.consent?.approveEachOrder) return null;
  if (!subscription.nextDeliveryDate || new Date(subscription.nextDeliveryDate) > now) return null;
  const key = `subscription:${subscription.id}:${new Date(subscription.nextDeliveryDate).toISOString()}`;
  let run = await tx.subscriptionRun.findUnique({ where: { idempotencyKey: key } });
  if (run && ['awaiting_checkout', 'ordered', 'skipped', 'cancelled'].includes(run.status)) return run;
  const user = await tx.user.findUnique({ where: { id: subscription.userId }, select: { id: true, storeId: true, email: true } });
  if (!user || user.storeId !== storeId) throw new Error('Subscription customer no longer belongs to this store');
  const product = await tx.product.findUnique({ where: { id: subscription.productRefId }, include: { inventoryLots: true } });
  const sellable = (product?.inventoryLots || []).filter((lot: any) => lot.storeId === storeId && isInventoryLotEligible(lot, now)).reduce((sum: number, lot: any) => sum + quantityMilli(lot.quantityRemaining), 0) / 1000;
  let status = !product || product.storeId !== storeId || product.status !== 'published' || sellable < subscription.quantity ? 'blocked_stock' : 'awaiting_checkout';
  let reason = status === 'blocked_stock' ? 'Product is unavailable or lacks eligible stock for the recurring basket.' : '';
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-cart-identity'), hashtext($1))", `user:${user.id}`);
  let cart = await tx.cart.findUnique({ where: { customerId: user.id }, include: { items: true } });
  if (cart && cart.storeId !== storeId) throw new Error('Subscription cart belongs to another store');
  if (cart) await tx.$queryRawUnsafe('SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE', cart.id);
  await tx.$queryRawUnsafe('SELECT "id" FROM "Subscription" WHERE "id" = $1 FOR UPDATE', subscriptionId);
  if (subscription.status === 'paused' && subscription.pausedUntil && new Date(subscription.pausedUntil) <= now) await tx.subscription.update({ where: { id: subscription.id }, data: { status: 'active', pausedUntil: null } });
  const activeRun = cart ? await tx.subscriptionRun.findFirst({ where: { cartId: cart.id, status: 'awaiting_checkout' } }) : null;
  if (status === 'awaiting_checkout' && ((cart?.items || []).length || activeRun)) { status = 'blocked_cart'; reason = 'Complete or clear your current basket before preparing this occurrence.'; }
  const data = { storeId, subscriptionId, userId: user.id, productId: subscription.productRefId, productTitle: product?.title || subscription.product, quantity: subscription.quantity, priceCents: Number(product?.priceCents || 0), dueAt: new Date(subscription.nextDeliveryDate), status, failureReason: reason };
  if (run) run = await tx.subscriptionRun.update({ where: { id: run.id }, data: { ...data, events: [...(run.events || []), { action: 'retry', status, reason, at: now.toISOString() }] } });
  else run = await tx.subscriptionRun.create({ data: { ...data, idempotencyKey: key, events: [{ action: 'scheduled', status, reason, at: now.toISOString() }] } });
  if (status === 'awaiting_checkout') {
    if (!cart) cart = await tx.cart.create({ data: { storeId, customerId: user.id, sessionId: `user:${user.id}`, itemCount: 0, subtotal: 0, subtotalCents: 0 } });
    const subtotalCents = Number(product.priceCents) * subscription.quantity;
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0 || subtotalCents > 2147483647) throw new Error('Recurring basket price exceeds supported minor-unit bounds');
    const cartItem = await tx.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: subscription.quantity, subtotalCents, subtotal: subtotalCents / 100, substitutionPreference: 'contact' } });
    await tx.cart.update({ where: { id: cart.id }, data: { itemCount: subscription.quantity, subtotalCents, subtotal: subtotalCents / 100 } });
    run = await tx.subscriptionRun.update({ where: { id: run.id }, data: { cartId: cart.id, cartItemId: cartItem.id } });
    await enqueueGroceryOutboxEvent(tx, { storeId, eventKey: `subscription.cart_ready:${run.id}`, eventType: 'subscription.cart_ready', aggregateType: 'SubscriptionRun', aggregateId: run.id, occurredAt: now.toISOString(), payload: { subscriptionId, runId: run.id, userId: user.id, email: user.email, cartId: cart.id, productTitle: product.title, quantity: subscription.quantity, checkoutPath: '/checkout', requiresCustomerApproval: true } });
  }
  return run;
}

/** Checkout owns cart/order locks and has validated customer payment and promised slot. */
export async function completeSubscriptionRunForCart(tx: any, cartId: string, orderId: string, storeId: string, userId: string | null | undefined) {
  const runs = await tx.subscriptionRun.findMany({ where: { cartId, status: 'awaiting_checkout' } });
  if (!runs.length) return null;
  if (runs.length > 1) throw new Error('Recurring cart has conflicting pending occurrences');
  const run = runs[0];
  if (!userId || run.storeId !== storeId || run.userId !== userId) throw new Error('Recurring checkout belongs to another customer');
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { lineItems: true } });
  if (!order || order.storeId !== storeId || order.userId !== userId) throw new Error('Recurring order ownership is invalid');
  const containsProduct = (order.lineItems || []).some((line: any) => line.productId === run.productId);
  await tx.$queryRawUnsafe('SELECT "id" FROM "Subscription" WHERE "id" = $1 FOR UPDATE', run.subscriptionId);
  const subscription = await tx.subscription.findUnique({ where: { id: run.subscriptionId } });
  if (!subscription || subscription.storeId !== storeId) throw new Error('Recurring subscription is unavailable');
  const { next, skippedOccurrences } = nextSubscriptionOccurrence(subscription, new Date());
  await tx.subscription.update({ where: { id: subscription.id }, data: { nextDeliveryDate: next, events: [...(subscription.events || []), { action: containsProduct ? 'ordered' : 'basket_item_removed', orderId, runId: run.id, skippedOccurrences, at: new Date().toISOString() }] } });
  return tx.subscriptionRun.update({ where: { id: run.id }, data: { status: containsProduct ? 'ordered' : 'skipped', orderId, events: [...(run.events || []), { action: containsProduct ? 'ordered' : 'basket_item_removed', orderId, at: new Date().toISOString() }] } });
}
