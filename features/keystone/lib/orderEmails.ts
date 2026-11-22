// Customer order emails: "order confirmed" after checkout commits, and "ready for pickup" when staff
// mark it ready. They are sent in-request through the existing password-reset transport (no queue,
// no outbox). A send failure never undoes the order; it is logged and recorded on the order so staff
// can see it, and Order.noNotification suppresses both.
import { sendStoreEmail } from './mailTransport';
import { emailButton, emailHeading, emailItems, emailLayout, emailMuted, emailPanel, emailParagraph, emailTotals, escapeHtml } from './email-layout';
import { isOnboardingPlaceholder } from '../../lib/onboarding-placeholders';
import { formatSlotRange, legacyWindowTimes } from '../../storefront/lib/marketFormatting';

type OrderEmailKind = 'confirmed' | 'ready_for_pickup';

const money = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format((cents || 0) / 100);

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
}

function windowLabel(order: any) {
  const slot = order.pickupSlot || order.deliverySlot;
  const dateValue = slot?.date || order.deliveryDate;
  const day = dateValue
    ? new Date(new Date(dateValue).toISOString().slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
    : null;
  const times = slot?.startTime && slot?.endTime ? slot : legacyWindowTimes(order.deliveryTimeWindow);
  const range = times.startTime && times.endTime ? formatSlotRange(times.startTime, times.endTime) : null;
  return [day, range].filter(Boolean).join(', ');
}

/** Send one order email unless already sent or suppressed. Never throws. Returns the message id or null. */
export async function sendOrderEmail(context: any, orderId: string, kind: OrderEmailKind): Promise<string | null> {
  try {
    const prisma = context.prisma;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, displayId: true, email: true, metadata: true, noNotification: true, currencyCode: true,
        subtotalCents: true, taxCents: true, deliveryFeeCents: true, discountCents: true, totalCents: true,
        deliveryDate: true, deliveryTimeWindow: true, storeId: true,
        pickupSlot: { select: { date: true, startTime: true, endTime: true } },
        deliverySlot: { select: { date: true, startTime: true, endTime: true } },
        lineItems: { select: { title: true, quantity: true, unitPriceCents: true } },
      },
    });
    if (!order?.email || order.noNotification) return null;
    const metadata = (order.metadata || {}) as Record<string, any>;
    const sent = (metadata.customerEmails || {}) as Record<string, any>;
    if (sent[kind]?.messageId) return null;

    const settings = await prisma.storeSettings.findFirst({
      where: { storeId: order.storeId, isActive: true },
      select: { name: true, contactEmail: true, address: true },
    }) || await prisma.storeSettings.findFirst({ where: { storeId: order.storeId }, select: { name: true, contactEmail: true, address: true } });
    const storeName = settings?.name || 'Our store';
    const supportEmail = settings?.contactEmail && !isOnboardingPlaceholder(settings.contactEmail) ? settings.contactEmail : undefined;
    const pickup = metadata.fulfillmentMethod === 'pickup';
    const when = windowLabel(order);
    const url = `${siteOrigin()}/order/${order.id}`;
    const currency = order.currencyCode || 'USD';

    let subject: string, title: string, body: string, preheader: string;
    if (kind === 'confirmed') {
      subject = `Order #${order.displayId} confirmed`;
      title = `Thanks, we have your order`;
      preheader = `${pickup ? 'Pickup' : 'Delivery'} ${when}. We'll pick it fresh.`;
      const items = (order.lineItems || []).map((line: any) => ({
        title: line.title, quantity: line.quantity, amount: money((line.unitPriceCents || 0) * (line.quantity || 0), currency),
      }));
      body = `${emailParagraph(`Order <strong>#${order.displayId}</strong> is confirmed. We pick it fresh before your window; if an item is out, we follow your substitution choices.`)}
${emailPanel(`<strong>${pickup ? 'Pickup' : 'Delivery'}</strong><br>${escapeHtml(when || 'Time shown on your order page')}${pickup && settings?.address ? `<br>${escapeHtml(settings.address)}` : ''}`)}
${emailHeading('Items')}
${emailItems(items)}
${emailTotals([
  { label: 'Subtotal', value: money(order.subtotalCents, currency) },
  ...(order.discountCents ? [{ label: 'Discount', value: `−${money(order.discountCents, currency)}` }] : []),
  ...(order.deliveryFeeCents ? [{ label: 'Delivery', value: money(order.deliveryFeeCents, currency) }] : []),
  { label: 'Tax', value: money(order.taxCents, currency) },
  { label: 'Authorized total', value: money(order.totalCents, currency) },
])}
${emailMuted('Your card is charged for what we actually pick. Weighed items and substitutions can change the final total; you will see it on your receipt.')}
${emailButton('View your order', url)}`;
    } else {
      subject = `Order #${order.displayId} is ready for pickup`;
      title = 'Your groceries are ready';
      preheader = `Order #${order.displayId} is packed and waiting at ${storeName}.`;
      body = `${emailParagraph(`Order <strong>#${order.displayId}</strong> is packed and waiting for you.`)}
${emailPanel(`<strong>Pickup</strong><br>${escapeHtml(when || 'Your chosen window')}${settings?.address ? `<br>${escapeHtml(settings.address)}` : ''}`)}
${emailParagraph('When you arrive, open your order and check in. Tell us your parking spot and we will bring it out.')}
${emailButton('Check in when you arrive', url)}`;
    }

    const messageId = await sendStoreEmail({
      to: order.email,
      subject,
      html: emailLayout({ storeName, preheader, title, body, supportEmail }),
    });
    const latest = await prisma.order.findUnique({ where: { id: orderId }, select: { metadata: true } });
    const latestMetadata = (latest?.metadata || {}) as Record<string, any>;
    await prisma.order.update({
      where: { id: orderId },
      data: { metadata: { ...latestMetadata, customerEmails: { ...(latestMetadata.customerEmails || {}), [kind]: { messageId, sentAt: new Date().toISOString() } } } },
    });
    console.log(`order-email ${kind} order=${order.displayId} messageId=${messageId}`);
    return messageId;
  } catch (error) {
    console.error(`order-email ${kind} order=${orderId} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}
