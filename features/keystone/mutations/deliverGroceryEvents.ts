import { applyRefundLoyalty } from '../lib/refundLoyalty';
import { decryptStaffInvitationToken } from '../lib/staffInvitations';
import { claimGroceryOutboxEvents, completeGroceryOutboxEvent, completeUnknownGroceryOutboxEventFromWorker } from './manageGroceryOutbox';
import { emailTransportConfigured, sendGroceryEmail } from '../../integrations/communications';
import { deliverGroceryIntegrationEvent } from '../../integrations/events';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { communicationAllowed, orderMessage, refundReceiptSnapshot } from '../lib/customerCommunications';
import { claimCustomerDelivery, updateCustomerDelivery } from '../lib/customerDeliveryLease';
import { requirePrismaSuccess } from '../utils/serializableTransaction';
import { publicError } from '../lib/publicError';

const ORDER_MESSAGES = ['order.substitution.proposed', 'order.rescheduled', 'order.adjustment.requested', 'order.confirmed', 'order.ready', 'order.dispatched', 'order.finalized', 'payment.refunded', 'order.access.requested', 'order.cancelled', 'inventory.recall.notice'];
const DELIVERY_UNKNOWN_MESSAGE = 'Delivery outcome unknown; reconcile the provider receipt before retrying';
const origin = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
function deliveryEvidence(previous: any, patch: Record<string, unknown>) {
  const current = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  return { ...current, ...patch };
}
function isDefinitiveDeliveryFailure(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { definitive?: unknown }).definitive === true;
}
function receiptStorageText(text: string) { return text.replace(/https?:\/\/\S+\/order-access#\S+/g, '[Private order link added at delivery]'); }

export async function deliverGroceryEvents(context: any, { workerId, limit = 20 }: { workerId: string; limit?: number }, dependencies = { send: sendGroceryEmail, external: deliverGroceryIntegrationEvent }) {
  await requireFreshCapability(context, 'canManageOnboarding');
  const store = await requireSessionStore(context);
  const outcomes = [];
  // Claim each event just before it is processed: a claim's lease starts when its
  // own work starts, so slow deliveries earlier in a run cannot let later events'
  // claims expire (and be stolen or retried) before they were even attempted.
  for (let index = 0; index < Math.max(1, Math.min(50, limit)); index += 1) {
    const [event] = await claimGroceryOutboxEvents(null, { workerId, limit: 1 }, context);
    if (!event) break;
    let delivery: any = null;
    let dispatchStarted = false;
    let customerMessageStateUnavailable = false;
    try {
      let orderId = event.aggregateType === 'Order' ? event.aggregateId : event.payload?.orderId;
      if (!orderId && event.aggregateType.toLowerCase() === 'payment') orderId = requirePrismaSuccess(await context.prisma.payment.findUnique({ where: { id: event.aggregateId }, select: { orderId: true } }), 'delivery payment lookup')?.orderId;
      let draft: any = null, guard: any = {}, sendText: (() => string) | null = null, consentType: string | undefined;
      if (orderId) {
        const order = requirePrismaSuccess(await context.prisma.order.findUnique({ where: { id: orderId }, include: { lineItems: true } }), 'delivery order lookup');
        if (!order || order.storeId !== store.id) throw new Error('Message order is unavailable in the active Store');
        let messageEvent = event.payload;
        if (event.eventType === 'payment.refunded') {
          const refund = requirePrismaSuccess(await context.prisma.paymentRefund.findUnique({ where: { id: event.payload.refundId }, select: { status: true, amountCents: true, providerData: true, payment: { select: { orderId: true, storeId: true } } } }), 'delivery refund lookup');
          const refundReceipt = refundReceiptSnapshot(refund, order);
          if (refundReceipt.amountCents !== event.payload.amountCents) throw new Error('Refund event amount differs from its receipt');
          messageEvent = { ...event.payload, refundReceipt };
        }
        const preference = order.userId ? requirePrismaSuccess(await context.prisma.notificationPreference.findFirst({ where: { userId: order.userId }, orderBy: { updatedAt: 'desc' } }), 'delivery preference lookup') : null;
        const isReceipt = ORDER_MESSAGES.includes(event.eventType);
        const content = isReceipt ? orderMessage(event.eventType, order, origin(), messageEvent) : { subject: 'Order event delivery', text: '' };
        draft = { eventKey: `${event.eventKey}:email`, storeId: store.id, orderId: order.id, userId: order.userId, recipient: order.email, subject: content.subject, body: receiptStorageText(content.text), status: isReceipt && communicationAllowed(event.eventType, preference) ? 'pending' : 'skipped' };
        guard = { orderId: order.id, userId: order.userId || undefined };
        consentType = isReceipt && order.userId ? event.eventType : undefined;
        // Guest bearer credentials are materialized only in the authorized send.
        sendText = () => orderMessage(event.eventType, order, origin(), messageEvent).text;
      } else if (event.eventType === 'purchase_order.send_requested') {
        guard = { purchaseOrderId: event.payload.purchaseOrderId };
        draft = { eventKey: `${event.eventKey}:email`, storeId: store.id, recipient: event.payload.recipient, subject: 'Purchase order ' + event.payload.poNumber, body: (event.payload.lines || []).map((line: any) => `${line.title} (${line.sku || ''}) · ${line.quantity} × ${(line.unitCostCents / 100).toFixed(2)} ${event.payload.currencyCode}`).join('\n'), status: 'pending' };
      } else if (event.eventType === 'staff.invited') {
        const invitation = requirePrismaSuccess(await context.prisma.staffInvitation.findUnique({ where: { id: event.payload.invitationId } }), 'delivery invitation lookup');
        if (!invitation || invitation.storeId !== store.id) throw new Error('Invitation is unavailable in the active Store');
        guard = { invitationId: invitation.id };
        draft = { eventKey: `${event.eventKey}:email`, storeId: store.id, recipient: invitation.email, subject: 'Your grocery staff invitation', body: 'Invitation credentials are included only in delivery to the authorized recipient.', status: 'pending' };
        sendText = () => 'Accept your invitation and choose your own password: ' + new URL('/staff/accept#' + new URLSearchParams({ token: decryptStaffInvitationToken(event.payload.encryptedToken) }), origin()).toString();
      } else if (event.payload?.userId) {
        const user = requirePrismaSuccess(await context.prisma.user.findUnique({ where: { id: event.payload.userId } }), 'delivery notification owner lookup');
        if (!user || user.storeId !== store.id) throw new Error('Notification owner is unavailable in the active Store');
        const preference = requirePrismaSuccess(await context.prisma.notificationPreference.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }), 'delivery preference lookup');
        const subscription = event.eventType === 'subscription.cart_ready', stock = event.eventType === 'product.back_in_stock', priceDrop = event.eventType === 'product.price_drop';
        guard = { userId: user.id };
        consentType = stock || priceDrop ? event.eventType : undefined;
        const productUrl = event.payload.handle ? new URL('/products/' + encodeURIComponent(event.payload.handle), origin()).toString() : '';
        draft = { eventKey: `${event.eventKey}:email`, storeId: store.id, userId: user.id, recipient: user.email,
          subject: subscription ? 'Your scheduled grocery basket is ready' : stock ? 'Requested grocery is back in stock' : priceDrop ? 'A price you were watching dropped' : 'Account event delivery',
          body: subscription ? 'Review your recurring basket, choose a current fulfillment slot and approve checkout at ' + new URL('/cart', origin())
            : stock ? 'Your requested product is available. Availability is confirmed again at checkout. ' + productUrl
            : priceDrop ? `${String(event.payload.title || 'A product you watch')} is now ${(Number(event.payload.priceCents || 0) / 100).toFixed(2)}, at or below your target. Prices are confirmed again at checkout. ${productUrl}` : '',
          status: subscription || ((stock || priceDrop) && communicationAllowed(event.eventType, preference)) ? 'pending' : 'skipped' };
      }
      if (draft) {
        delivery = await claimCustomerDelivery(context, event, draft, guard, consentType);
        if (!delivery) {
          const current = requirePrismaSuccess(await context.prisma.groceryOutboxEvent.findUnique({ where: { id: event.eventId } }), 'suppressed event lookup');
          if (current?.status === 'processing' && current.claimToken === event.claimToken) await completeGroceryOutboxEvent(null, { eventId: event.eventId, claimToken: event.claimToken!, succeeded: true }, context);
          outcomes.push({ eventId: event.eventId, status: 'suppressed' }); continue;
        }
        if (delivery.unresolved) {
          await completeGroceryOutboxEvent(null, { eventId: event.eventId, claimToken: event.claimToken!, succeeded: false, unknown: true, error: DELIVERY_UNKNOWN_MESSAGE }, context);
          outcomes.push({ eventId: event.eventId, status: 'unknown' }); continue;
        }
        if (orderId && event.eventType === 'payment.refunded') await applyRefundLoyalty(context, store.id, orderId);
        if (delivery.send) {
          const text = sendText ? sendText() : delivery.message.body;
          const previousAttempt = delivery.message.providerEvidence?.deliveryAttempt || {};
          const attemptEvidence = deliveryEvidence(delivery.message.providerEvidence, { deliveryAttempt: { ...previousAttempt, transportStartedAt: new Date().toISOString() } });
          await updateCustomerDelivery(context, delivery, { providerEvidence: attemptEvidence });
          await requireFreshCapability(context, 'canManageOnboarding');
          dispatchStarted = true;
          const proof = await dependencies.send({ id: delivery.message.id, to: delivery.message.recipient, subject: delivery.message.subject, text });
          await updateCustomerDelivery(context, delivery, { status: 'sent', sentAt: new Date(), providerEvidence: deliveryEvidence(attemptEvidence, proof || {}), failureMessage: '' });
        }
        // An alert is fulfilled only by an email that was actually sent. A skipped
        // (opted-out) or failed message leaves the alert active and unnotified; it
        // gets a new occurrence when the customer turns those emails back on.
        if (event.eventType === 'product.back_in_stock' && (delivery.send || delivery.message.status === 'sent')) requirePrismaSuccess(await context.prisma.backInStockAlert.updateMany({ where: { id: event.payload.alertId, userId: guard.userId }, data: { isActive: false, notifiedAt: new Date() } }), 'stock alert completion update');
        // A price alert is triggered by the email actually sent, recording the price it reported.
        if (event.eventType === 'product.price_drop' && (delivery.send || delivery.message.status === 'sent')) requirePrismaSuccess(await context.prisma.priceAlert.updateMany({ where: { id: event.payload.alertId, userId: guard.userId, isTriggered: false }, data: { isTriggered: true, notifiedAt: new Date(), currentPrice: (Number(event.payload.priceCents || 0) / 100).toFixed(2) } }), 'price alert completion update');
        // Keep the customer lease through the external HTTP delivery as well.
        await updateCustomerDelivery(context, delivery, {});
      }
      await requireFreshCapability(context, 'canManageOnboarding');
      await dependencies.external(event);
      if (delivery) await updateCustomerDelivery(context, delivery, {}, true);
      await completeGroceryOutboxEvent(null, { eventId: event.eventId, claimToken: event.claimToken!, succeeded: true }, context);
      outcomes.push({ eventId: event.eventId, status: 'delivered' });
    } catch (error) {
      let unknownOutcome = Boolean(delivery?.unresolved) || (dispatchStarted && !isDefinitiveDeliveryFailure(error));
      if (delivery && !delivery.unresolved) {
        let currentMessage: any;
        try {
          currentMessage = requirePrismaSuccess(await context.prisma.customerMessage.findUnique({ where: { id: delivery.message.id } }), 'failed delivery state lookup');
        } catch {
          // A failed state read cannot prove whether SMTP accepted the message.
          customerMessageStateUnavailable = true;
          unknownOutcome = dispatchStarted && !isDefinitiveDeliveryFailure(error);
        }
        if (!customerMessageStateUnavailable) {
          const alreadySent = currentMessage?.status === 'sent';
          unknownOutcome = alreadySent ? false : dispatchStarted && !isDefinitiveDeliveryFailure(error);
          try {
            await updateCustomerDelivery(context, delivery, alreadySent ? {} : {
              status: unknownOutcome ? 'unknown' : 'failed',
              failureMessage: unknownOutcome ? DELIVERY_UNKNOWN_MESSAGE : 'Message delivery failed before provider acceptance',
            }, true);
          } catch {
            customerMessageStateUnavailable = true;
            if (!alreadySent) unknownOutcome = dispatchStarted && !isDefinitiveDeliveryFailure(error);
          }
        }
      }
      const current = requirePrismaSuccess(await context.prisma.groceryOutboxEvent.findUnique({ where: { id: event.eventId } }), 'failed outbox state lookup');
      if (current?.status === 'processing' && current.claimToken === event.claimToken) {
        if (unknownOutcome && customerMessageStateUnavailable) {
          await completeUnknownGroceryOutboxEventFromWorker(context, { eventId: event.eventId, claimToken: event.claimToken! });
        } else {
          await completeGroceryOutboxEvent(null, { eventId: event.eventId, claimToken: event.claimToken!, succeeded: false, unknown: unknownOutcome, error: unknownOutcome ? DELIVERY_UNKNOWN_MESSAGE : 'Delivery failed' }, context);
        }
      }
      outcomes.push({ eventId: event.eventId, status: current?.status === 'suppressed' ? 'suppressed' : unknownOutcome ? 'unknown' : 'failed' });
    }
  }
  return outcomes;
}

/**
 * Operator-run delivery from Communications, like Restaurant's dashboard-sent notifications.
 * Without SMTP nothing is claimed, so queued messages stay pending instead of burning retries.
 */
export async function deliverGroceryOutboxNow(_root: unknown, { limit }: { limit?: number | null }, context: any) {
  await requireFreshCapability(context, 'canManageOnboarding');
  if (!emailTransportConfigured()) throw publicError('Email sending is not configured for this store, so queued messages stay pending. Nothing was sent.', 'EMAIL_NOT_CONFIGURED');
  const workerId = `dashboard:${String(context.session?.itemId || 'operator').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'operator'}`;
  const outcomes = await deliverGroceryEvents(context, { workerId, limit: Math.max(1, Math.min(20, Math.trunc(Number(limit) || 20))) });
  const count = (status: string) => outcomes.filter((outcome) => outcome.status === status).length;
  return { attempted: outcomes.length, delivered: count('delivered'), failed: count('failed'), unknown: count('unknown'), suppressed: count('suppressed') };
}

/**
 * Queue alerts whose product is sellable again. Alerts that already have an
 * event for their current occurrence are skipped (that event keeps its own
 * delivery, failure or unknown evidence), so a stuck group can never starve
 * later alerts: every scan moves on to alerts not yet queued.
 */
export async function queueAvailableStockAlerts(context:any) {
  await requireFreshCapability(context,'canManageOnboarding');
  const store=await requireSessionStore(context);
  const rows=requirePrismaSuccess(await context.prisma.$queryRawUnsafe(
    `SELECT a."id" FROM "BackInStockAlert" a
       JOIN "User" u ON u."id" = a."user"
       JOIN "Product" p ON p."id" = a."productRef"
      WHERE a."isActive" = true AND u."store" = $1 AND u."privacyErasedAt" IS NULL AND p."store" = $1 AND p."status" = 'published'
        AND EXISTS (SELECT 1 FROM "InventoryLot" l WHERE l."product" = p."id" AND l."store" = $1 AND l."quantityRemaining" > 0
                    AND l."expirationDate" > NOW() AND l."safetyStatus" = 'available' AND l."conditionStatus" = 'accepted')
        AND NOT EXISTS (SELECT 1 FROM "GroceryOutboxEvent" e WHERE e."store" = $1 AND e."eventType" = 'product.back_in_stock'
                        AND e."payload"->>'alertId' = a."id" AND e."occurredAt" >= a."updatedAt")
      ORDER BY a."updatedAt" ASC, a."id" ASC
      LIMIT 100`,
    store.id,
  ),'available stock alert lookup') as Array<{id:string}>;
  if(!rows.length) return 0;
  const alerts=requirePrismaSuccess(await context.prisma.backInStockAlert.findMany({where:{id:{in:rows.map((row)=>row.id)}},include:{productRef:{select:{id:true,handle:true}},user:{select:{id:true}}},orderBy:[{updatedAt:'asc'},{id:'asc'}]}),'available stock alert detail lookup');
  for(const alert of alerts) await context.transaction(async (tx:any)=>{
    await enqueueGroceryOutboxEvent(tx.prisma,{storeId:store.id,eventKey:`stock-alert:${alert.id}:${new Date(alert.updatedAt).toISOString()}`,eventType:'product.back_in_stock',aggregateType:'Product',aggregateId:alert.productRef.id,occurredAt:new Date().toISOString(),payload:{userId:alert.user.id,alertId:alert.id,handle:alert.productRef.handle}});
  });
  return alerts.length;
}

/**
 * Queue price-drop emails for alerts whose product is now at or below the
 * target. Like stock alerts, an alert already queued for its current state is
 * skipped, so later alerts always progress.
 */
export async function queueTriggeredPriceAlerts(context:any) {
  await requireFreshCapability(context,'canManageOnboarding');
  const store=await requireSessionStore(context);
  const rows=requirePrismaSuccess(await context.prisma.$queryRawUnsafe(
    `SELECT a."id" FROM "PriceAlert" a
       JOIN "User" u ON u."id" = a."user"
       JOIN "Product" p ON p."id" = a."productRef"
      WHERE a."isTriggered" = false AND u."store" = $1 AND u."privacyErasedAt" IS NULL AND p."store" = $1 AND p."status" = 'published'
        AND p."priceCents" <= ROUND(a."targetPrice" * 100)
        AND NOT EXISTS (SELECT 1 FROM "GroceryOutboxEvent" e WHERE e."store" = $1 AND e."eventType" = 'product.price_drop'
                        AND e."payload"->>'alertId' = a."id" AND e."occurredAt" >= a."updatedAt")
      ORDER BY a."updatedAt" ASC, a."id" ASC
      LIMIT 100`,
    store.id,
  ),'price alert lookup') as Array<{id:string}>;
  if(!rows.length) return 0;
  const alerts=requirePrismaSuccess(await context.prisma.priceAlert.findMany({where:{id:{in:rows.map((row)=>row.id)}},include:{productRef:{select:{id:true,handle:true,title:true,priceCents:true}},user:{select:{id:true}}}}),'price alert detail lookup');
  for(const alert of alerts) await context.transaction(async (tx:any)=>{
    await enqueueGroceryOutboxEvent(tx.prisma,{storeId:store.id,eventKey:`price-alert:${alert.id}:${new Date(alert.updatedAt).toISOString()}`,eventType:'product.price_drop',aggregateType:'Product',aggregateId:alert.productRef.id,occurredAt:new Date().toISOString(),payload:{userId:alert.user.id,alertId:alert.id,handle:alert.productRef.handle,title:alert.productRef.title,priceCents:alert.productRef.priceCents}});
  });
  return alerts.length;
}
