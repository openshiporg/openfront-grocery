import { randomUUID } from 'node:crypto';
import { communicationAllowed } from './customerCommunications';

export const CUSTOMER_DELIVERY_LEASE_MS = 5 * 60_000;
const DELIVERY_UNKNOWN_MESSAGE = 'Delivery outcome unknown; reconcile the provider receipt before retrying';
function deliveryEvidence(previous: any, patch: Record<string, unknown>) {
  const current = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  return { ...current, ...patch };
}
function requireSuccessfulPrismaResult(value: any) {
  if (value?.extensions?.code === 'KS_PRISMA_ERROR') throw new Error('Customer delivery database operation failed');
  return value;
}
/**
 * `consentType`, when given, is the optional message type whose email consent is
 * re-read here under the customer's row lock — at the moment each send
 * (including a retry of a failed one) is authorized. A message the customer has
 * since opted out of becomes `skipped` and is never sent.
 */
export async function claimCustomerDelivery(context: any, event: any, draft: any, guard: { userId?: string; orderId?: string; purchaseOrderId?: string; invitationId?: string }, consentType?: string) {
  return context.transaction(async (tc: any) => {
    const tx = tc.prisma;
    let consentAllowed = true;
    if (guard.userId) {
      requireSuccessfulPrismaResult(await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', guard.userId));
      const user = requireSuccessfulPrismaResult(await tx.user.findUnique({ where: { id: guard.userId } }));
      if (!user || user.storeId !== draft.storeId) throw new Error('Message customer is outside the active Store');
      if (user.privacyErasedAt) return null;
      if (consentType) {
        const preference = requireSuccessfulPrismaResult(await tx.notificationPreference.findFirst({ where: { userId: guard.userId }, orderBy: { updatedAt: 'desc' } }));
        consentAllowed = communicationAllowed(consentType, preference);
      }
    }
    let suppressed = false;
    if (guard.orderId) {
      requireSuccessfulPrismaResult(await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id"=$1 FOR UPDATE', guard.orderId));
      const order = requireSuccessfulPrismaResult(await tx.order.findUnique({ where: { id: guard.orderId } }));
      if (!order || order.storeId !== draft.storeId || (order.userId || null) !== (guard.userId || null)) throw new Error('Message order ownership changed');
      suppressed = Boolean(order.metadata?.privacy?.pseudonymized);
    }
    if (guard.purchaseOrderId) {
      requireSuccessfulPrismaResult(await tx.$queryRawUnsafe('SELECT "id" FROM "PurchaseOrder" WHERE "id"=$1 FOR UPDATE', guard.purchaseOrderId));
      const purchase = requireSuccessfulPrismaResult(await tx.purchaseOrder.findUnique({ where: { id: guard.purchaseOrderId } }));
      if (!purchase || purchase.storeId !== draft.storeId) throw new Error('Supplier request is outside the active Store');
      suppressed = purchase.status === 'cancelled';
    }
    if (guard.invitationId) {
      const invitation = requireSuccessfulPrismaResult(await tx.staffInvitation.findUnique({ where: { id: guard.invitationId } }));
      if (!invitation || invitation.storeId !== draft.storeId) throw new Error('Invitation is outside the active Store');
      suppressed = invitation.status !== 'pending' || new Date(invitation.expiresAt).getTime() <= Date.now();
    }
    requireSuccessfulPrismaResult(await tx.$queryRawUnsafe('SELECT "id" FROM "GroceryOutboxEvent" WHERE "id"=$1 FOR UPDATE', event.eventId));
    const currentEvent = requireSuccessfulPrismaResult(await tx.groceryOutboxEvent.findUnique({ where: { id: event.eventId } }));
    if (currentEvent?.status === 'suppressed') return null;
    if (!currentEvent || currentEvent.storeId !== draft.storeId || currentEvent.status !== 'processing' || currentEvent.claimToken !== event.claimToken) throw new Error('Delivery event claim expired');
    let message = requireSuccessfulPrismaResult(await tx.customerMessage.findUnique({ where: { eventKey: draft.eventKey } }));
    if (!message) message = requireSuccessfulPrismaResult(await tx.customerMessage.create({ data: consentAllowed ? draft : { ...draft, status: 'skipped' } }));
    else if (!consentAllowed && ['pending', 'failed'].includes(message.status)) {
      message = requireSuccessfulPrismaResult(await tx.customerMessage.update({ where: { id: message.id }, data: {
        status: 'skipped', deliveryToken: '', deliveryLeaseExpiresAt: null,
        providerEvidence: deliveryEvidence(message.providerEvidence, { consentOutcome: { status: 'skipped', reason: 'Customer email preference no longer allows this message', observedAt: new Date().toISOString() } }),
      } }));
    }
    if (message.storeId !== draft.storeId) throw new Error('Message ownership differs from its event');
    if (suppressed || message.status === 'suppressed') {
      if (message.status !== 'sent') requireSuccessfulPrismaResult(await tx.customerMessage.update({ where: { id: message.id }, data: { status: 'suppressed', deliveryToken: '', deliveryLeaseExpiresAt: null } }));
      return null;
    }
    const leaseExpiresAt = message.deliveryLeaseExpiresAt ? new Date(message.deliveryLeaseExpiresAt).getTime() : 0;
    if (leaseExpiresAt > Date.now()) throw new Error('Message has an active delivery attempt');
    if (message.status === 'unknown') return { message, token: '', userId: guard.userId, send: false, unresolved: true };
    if (message.status === 'processing') {
      const unknownMessage = requireSuccessfulPrismaResult(await tx.customerMessage.update({ where: { id: message.id }, data: {
        status: 'unknown', deliveryToken: '', deliveryLeaseExpiresAt: null, failureMessage: DELIVERY_UNKNOWN_MESSAGE,
        providerEvidence: deliveryEvidence(message.providerEvidence, { deliveryOutcome: { status: 'unknown', reason: 'Delivery lease expired before durable acceptance evidence', observedAt: new Date().toISOString() } }),
      } }));
      return { message: unknownMessage, token: '', userId: guard.userId, send: false, unresolved: true };
    }
    if (['pending', 'failed'].includes(message.status) && Number(message.attempts || 0) >= 10) {
      const unknownMessage = requireSuccessfulPrismaResult(await tx.customerMessage.update({ where: { id: message.id }, data: {
        status: 'unknown', deliveryToken: '', deliveryLeaseExpiresAt: null, failureMessage: DELIVERY_UNKNOWN_MESSAGE,
        providerEvidence: deliveryEvidence(message.providerEvidence, { deliveryOutcome: { status: 'unknown', reason: 'Customer delivery attempt limit reached; manual review required', observedAt: new Date().toISOString() } }),
      } }));
      return { message: unknownMessage, token: '', userId: guard.userId, send: false, unresolved: true };
    }
    if (!['pending', 'failed', 'sent', 'skipped', 'acknowledged'].includes(message.status)) throw new Error('Customer message has an unsupported delivery state');
    const token = randomUUID();
    const send = ['pending', 'failed'].includes(message.status);
    const body = String((send ? draft.body : message.body) || '').replace(/https?:\/\/\S+\/order-access#\S+/g, '[Private order link added at delivery]');
    const attempt = { number: Number(message.attempts || 0) + 1, claimedAt: new Date().toISOString() };
    const claimed = requireSuccessfulPrismaResult(await tx.customerMessage.update({ where: { id: message.id }, data: {
      body, deliveryToken: token, deliveryLeaseExpiresAt: new Date(Date.now() + CUSTOMER_DELIVERY_LEASE_MS),
      ...(send ? { status: 'processing', attempts: { increment: 1 }, providerEvidence: deliveryEvidence(message.providerEvidence, { deliveryAttempt: attempt }) } : {}),
    } }));
    return { message: claimed, token, userId: guard.userId, send, unresolved: false };
  });
}

export async function updateCustomerDelivery(context: any, claim: any, data: any, release = false) {
  return context.transaction(async (tc: any) => {
    const tx = tc.prisma;
    if (claim.userId) requireSuccessfulPrismaResult(await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', claim.userId));
    requireSuccessfulPrismaResult(await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerMessage" WHERE "id"=$1 FOR UPDATE', claim.message.id));
    const current = requireSuccessfulPrismaResult(await tx.customerMessage.findUnique({ where: { id: claim.message.id } }));
    if (!current || current.status === 'suppressed' || current.deliveryToken !== claim.token || !current.deliveryLeaseExpiresAt || new Date(current.deliveryLeaseExpiresAt).getTime() <= Date.now()) throw new Error('Message delivery claim was fenced');
    return requireSuccessfulPrismaResult(await tx.customerMessage.update({ where: { id: current.id }, data: { ...data, ...(release ? { deliveryToken: '', deliveryLeaseExpiresAt: null } : {}) } }));
  });
}
