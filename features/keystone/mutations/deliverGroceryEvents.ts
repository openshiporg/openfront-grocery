import { applyRefundLoyalty } from '../lib/refundLoyalty';
import { decryptStaffInvitationToken } from '../lib/staffInvitations';
import { claimGroceryOutboxEvents, completeGroceryOutboxEvent, completeUnknownGroceryOutboxEventFromWorker } from './manageGroceryOutbox';
import { sendGroceryEmail } from '../../integrations/communications';
import { deliverGroceryIntegrationEvent } from '../../integrations/events';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { communicationAllowed, orderMessage, refundReceiptSnapshot } from '../lib/customerCommunications';
import { claimCustomerDelivery, updateCustomerDelivery } from '../lib/customerDeliveryLease';
import { requirePrismaSuccess } from '../utils/serializableTransaction';

const ORDER_MESSAGES = ['order.rescheduled', 'order.adjustment.requested', 'order.confirmed', 'order.ready', 'order.dispatched', 'order.finalized', 'payment.refunded', 'order.access.requested', 'order.cancelled', 'inventory.recall.notice'];
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
  const events = await claimGroceryOutboxEvents(null, { workerId, limit }, context);
  const outcomes = [];
  for (const event of events) {
    let delivery: any = null;
    let dispatchStarted = false;
    let customerMessageStateUnavailable = false;
    try {
      let orderId = event.aggregateType === 'Order' ? event.aggregateId : event.payload?.orderId;
      if (!orderId && event.aggregateType.toLowerCase() === 'payment') orderId = requirePrismaSuccess(await context.prisma.payment.findUnique({ where: { id: event.aggregateId }, select: { orderId: true } }), 'delivery payment lookup')?.orderId;
      let draft: any = null, guard: any = {}, sendText: (() => string) | null = null;
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
        const subscription = event.eventType === 'subscription.cart_ready', stock = event.eventType === 'product.back_in_stock';
        guard = { userId: user.id };
        draft = { eventKey: `${event.eventKey}:email`, storeId: store.id, userId: user.id, recipient: user.email,
          subject: subscription ? 'Your scheduled grocery basket is ready' : stock ? 'Requested grocery is back in stock' : 'Account event delivery',
          body: subscription ? 'Review your recurring basket, choose a current fulfillment slot and approve checkout at ' + new URL('/cart', origin()) : stock ? 'Your requested product is available. Availability is confirmed again at checkout. ' + new URL('/products/' + encodeURIComponent(event.payload.handle), origin()) : '',
          status: subscription || (stock && communicationAllowed(event.eventType, preference)) ? 'pending' : 'skipped' };
      }
      if (draft) {
        delivery = await claimCustomerDelivery(context, event, draft, guard);
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
        if (event.eventType === 'product.back_in_stock') requirePrismaSuccess(await context.prisma.backInStockAlert.updateMany({ where: { id: event.payload.alertId, userId: guard.userId }, data: { isActive: false, notifiedAt: delivery.message.status === 'skipped' ? null : new Date() } }), 'stock alert completion update');
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

/** Select only currently eligible stock so unavailable subscriptions cannot starve later alerts. */
export async function queueAvailableStockAlerts(context:any) {
  await requireFreshCapability(context,'canManageOnboarding');
  const store=await requireSessionStore(context);
  const alerts=requirePrismaSuccess(await context.prisma.backInStockAlert.findMany({where:{isActive:true,user:{storeId:store.id},productRef:{storeId:store.id,status:'published',inventoryLots:{some:{storeId:store.id,quantityRemaining:{gt:0},expirationDate:{gt:new Date()},safetyStatus:'available',conditionStatus:'accepted'}}}},include:{productRef:{select:{id:true,handle:true}},user:{select:{id:true}}},orderBy:{id:'asc'},take:100}),'available stock alert lookup');
  for(const alert of alerts) await context.transaction(async (tx:any)=>{
    await enqueueGroceryOutboxEvent(tx.prisma,{storeId:store.id,eventKey:`stock-alert:${alert.id}:${new Date(alert.updatedAt).toISOString()}`,eventType:'product.back_in_stock',aggregateType:'Product',aggregateId:alert.productRef.id,occurredAt:new Date().toISOString(),payload:{userId:alert.user.id,alertId:alert.id,handle:alert.productRef.handle}});
  });
  return alerts.length;
}
