import { randomUUID } from 'node:crypto';
import { emailTransportConfigured, sendGroceryEmail } from '../../integrations/communications';
import { deliverGroceryIntegrationEvent } from '../../integrations/events';
import { communicationAllowed, orderMessage } from './customerCommunications';
import { claimCustomerDelivery, updateCustomerDelivery } from './customerDeliveryLease';
import { developmentSiteOrigin } from './runtimeConfig';
import { requirePrismaSuccess } from '../utils/serializableTransaction';

const DELIVERY_UNKNOWN_MESSAGE = 'Delivery outcome unknown; reconcile the provider receipt before retrying';
const origin = () => process.env.NEXT_PUBLIC_SITE_URL || developmentSiteOrigin();
const receiptStorageText = (text: string) => text.replace(/https?:\/\/\S+\/order-access#\S+/g, '[Private order link added at delivery]');

type Dependencies = {
  send: typeof sendGroceryEmail;
  external: typeof deliverGroceryIntegrationEvent;
  claim: typeof claimCustomerDelivery;
  update: typeof updateCustomerDelivery;
  configured: () => boolean;
};
const defaults: Dependencies = { send: sendGroceryEmail, external: deliverGroceryIntegrationEvent, claim: claimCustomerDelivery, update: updateCustomerDelivery, configured: emailTransportConfigured };

/**
 * Sends the order-confirmation email for ONE just-committed order, in process, so a guest
 * checkout does not depend on a separate worker. It claims that order's existing
 * `order.confirmed:<orderId>` outbox event (pending -> processing) and reuses the worker's own
 * message builder, customer-message lease and sender, so the worker and the operator's
 * Communications button see the event as delivered (or unknown/failed) and cannot resend it.
 * Other queued events are never touched. Without SMTP nothing is claimed and the event stays
 * pending. Never throws: the order is already committed.
 */
export async function deliverOrderConfirmationNow(context: any, orderId: string, dependencies: Dependencies = defaults) {
  try {
    if (!dependencies.configured()) return { status: 'skipped_not_configured' as const };
    const prisma = context.prisma;
    const event = requirePrismaSuccess(await prisma.groceryOutboxEvent.findUnique({ where: { eventKey: `order.confirmed:${orderId}` } }), 'confirmation event lookup');
    if (!event || event.eventType !== 'order.confirmed' || event.aggregateId !== orderId) return { status: 'no_event' as const };
    const claimToken = `inline:${randomUUID()}`;
    const claimed = requirePrismaSuccess(await prisma.groceryOutboxEvent.updateMany({
      where: { id: event.id, status: 'pending', attempts: { lt: 10 } },
      data: { status: 'processing', attempts: { increment: 1 }, claimToken, claimedAt: new Date(), lastError: '' },
    }), 'confirmation event claim');
    if (claimed.count !== 1) return { status: 'already_handled' as const };

    const claimedEvent = { eventId: event.id, eventKey: event.eventKey, eventType: event.eventType, aggregateType: event.aggregateType, aggregateId: event.aggregateId, schemaVersion: event.schemaVersion, payload: event.payload, payloadHash: event.payloadHash, occurredAt: new Date(event.occurredAt).toISOString(), claimToken };
    let delivery: any = null;
    let dispatchStarted = false;
    const finish = (data: Record<string, unknown>) => prisma.groceryOutboxEvent.updateMany({ where: { id: event.id, status: 'processing', claimToken }, data: { claimToken: '', claimedAt: null, ...data } });
    try {
      const order = requirePrismaSuccess(await prisma.order.findUnique({ where: { id: orderId }, include: { lineItems: true } }), 'confirmation order lookup');
      if (!order) throw new Error('Confirmation order is unavailable');
      const preference = order.userId ? requirePrismaSuccess(await prisma.notificationPreference.findFirst({ where: { userId: order.userId }, orderBy: { updatedAt: 'desc' } }), 'confirmation preference lookup') : null;
      const content = orderMessage('order.confirmed', order, origin(), event.payload);
      const draft = { eventKey: `${event.eventKey}:email`, storeId: order.storeId, orderId: order.id, userId: order.userId, recipient: order.email, subject: content.subject, body: receiptStorageText(content.text), status: communicationAllowed('order.confirmed', preference) ? 'pending' : 'skipped' };
      delivery = await dependencies.claim(context, claimedEvent, draft, { orderId: order.id, userId: order.userId || undefined }, order.userId ? 'order.confirmed' : undefined);
      if (!delivery) { await finish({ status: 'delivered', deliveredAt: new Date(), nextAttemptAt: null }); return { status: 'suppressed' as const }; }
      if (delivery.unresolved) { await finish({ status: 'unknown', nextAttemptAt: null, lastError: DELIVERY_UNKNOWN_MESSAGE }); return { status: 'unknown' as const }; }
      if (delivery.send) {
        const text = orderMessage('order.confirmed', order, origin(), event.payload).text;
        const attemptEvidence = { ...(delivery.message.providerEvidence || {}), deliveryAttempt: { ...(delivery.message.providerEvidence?.deliveryAttempt || {}), transportStartedAt: new Date().toISOString() } };
        await dependencies.update(context, delivery, { providerEvidence: attemptEvidence });
        dispatchStarted = true;
        const proof = await dependencies.send({ id: delivery.message.id, to: delivery.message.recipient, subject: delivery.message.subject, text });
        await dependencies.update(context, delivery, { status: 'sent', sentAt: new Date(), providerEvidence: { ...attemptEvidence, ...(proof || {}) }, failureMessage: '' });
      }
      await dependencies.update(context, delivery, {});
      await dependencies.external(claimedEvent);
      await dependencies.update(context, delivery, {}, true);
      await finish({ status: 'delivered', deliveredAt: new Date(), nextAttemptAt: null });
      return { status: 'delivered' as const };
    } catch (error) {
      const definitive = typeof error === 'object' && error !== null && (error as { definitive?: unknown }).definitive === true;
      const unknown = dispatchStarted && !definitive;
      try {
        if (delivery && !delivery.unresolved) {
          const current = await prisma.customerMessage.findUnique({ where: { id: delivery.message.id } });
          if (current?.status !== 'sent') await dependencies.update(context, delivery, { status: unknown ? 'unknown' : 'failed', failureMessage: unknown ? DELIVERY_UNKNOWN_MESSAGE : 'Message delivery failed before provider acceptance' }, true);
        }
      } catch { /* the event state below still records the failure */ }
      try {
        await finish(unknown
          ? { status: 'unknown', nextAttemptAt: null, lastError: DELIVERY_UNKNOWN_MESSAGE }
          : { status: 'failed', nextAttemptAt: new Date(Date.now() + 30_000), lastError: 'Confirmation delivery failed' });
      } catch { /* the worker's stale-claim recovery handles an unreadable state */ }
      console.error('Order confirmation delivery failed:', error instanceof Error ? error.message : 'Unknown error');
      return { status: unknown ? ('unknown' as const) : ('failed' as const) };
    }
  } catch (error) {
    console.error('Order confirmation delivery was not attempted:', error instanceof Error ? error.message : 'Unknown error');
    return { status: 'failed' as const };
  }
}
