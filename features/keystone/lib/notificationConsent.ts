import { communicationAllowed } from './customerCommunications';

/** The customer's current notification preference row (latest), read inside the caller's transaction. */
export async function currentNotificationPreference(prisma: any, userId: string) {
  return prisma.notificationPreference.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } });
}

/** Whether an optional customer message of this type may be emailed under the current preference. */
export function emailAllowedFor(type: string, preference: any) {
  return communicationAllowed(type, preference);
}

/**
 * Turn on email for exactly one category the customer just asked for, without
 * changing the effective state of any other category: if email was off for
 * the account, the other optional categories stay off.
 */
export async function enableEmailCategory(prisma: any, userId: string, category: 'backInStock' | 'orderUpdates' | 'deliveryAlerts' | 'priceDrops') {
  const existing = await currentNotificationPreference(prisma, userId);
  const channels: string[] = Array.isArray(existing?.channels) ? existing.channels.filter((value: unknown) => typeof value === 'string') : ['email'];
  const emailWasOff = Boolean(existing) && !channels.includes('email');
  const data = {
    channels: emailWasOff ? [...channels, 'email'] : channels,
    orderUpdates: emailWasOff ? false : existing?.orderUpdates ?? true,
    deliveryAlerts: emailWasOff ? false : existing?.deliveryAlerts ?? true,
    backInStock: emailWasOff ? false : existing?.backInStock ?? true,
    priceDrops: emailWasOff ? false : existing?.priceDrops ?? true,
    [category]: true,
  };
  if (existing) await prisma.notificationPreference.update({ where: { id: existing.id }, data });
  else await prisma.notificationPreference.create({ data: { ...data, userId } });
}
