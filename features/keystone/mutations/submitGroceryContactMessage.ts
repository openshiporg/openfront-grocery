import { randomBytes } from 'node:crypto';
import type { Context } from '.keystone/types';

import { consumeActionBuckets } from '../lib/graphqlRateLimit';
import { publicError } from '../lib/publicError';
import { publicStore } from '../lib/storeScope';
import { zonedDateKey } from '../lib/storeTime';

export const CONTACT_TOPICS: Record<string, string> = {
  order_problem: 'Missing, wrong or damaged item',
  order_change: 'Change an order, address or time',
  substitution: 'Replacement or substitution',
  refund: 'Refund or payment',
  account: 'Account or sign-in',
  other: 'Something else',
};

type ContactInput = { name: string; email: string; phone?: string | null; topic: string; orderNumber?: string | null; message: string; sourcePath?: string | null };

const singleLine = (value: unknown, max: number) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= max && !/[\r\n\u0000-\u001f]/.test(text) ? text : null;
};

/**
 * Stores a shopper message in the Store's contact inbox (Gym submitContactForm pattern). The
 * message is durable merchant receipt; no email is claimed. Throttled per sender and per Store on
 * this mutation only, so browsing and checkout are never counted.
 */
export async function submitGroceryContactMessage(_root: unknown, { data }: { data: ContactInput }, context: Context) {
  const name = singleLine(data?.name, 100), email = singleLine(data?.email, 254)?.toLowerCase(), phone = singleLine(data?.phone ?? '', 40);
  const topic = typeof data?.topic === 'string' && CONTACT_TOPICS[data.topic] ? data.topic : null;
  const orderNumber = singleLine(data?.orderNumber ?? '', 20)?.replace(/^#/, '') ?? null;
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  const rawPath = singleLine(data?.sourcePath ?? '', 300) || '';
  const sourcePath = rawPath.startsWith('/') && !rawPath.startsWith('//') ? rawPath : '';
  if (!name) throw publicError('Enter your name (up to 100 characters).');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw publicError('Enter a valid email address so the store can reply.');
  if (phone === null) throw publicError('Enter a phone number of up to 40 characters, or leave it blank.');
  if (!topic) throw publicError('Choose what your message is about.');
  if (orderNumber === null || (orderNumber && !/^\d{1,10}$/.test(orderNumber))) throw publicError('Enter the order number as digits, for example 1024, or leave it blank.');
  if (message.length < 10 || message.length > 5000) throw publicError('Write a message of 10 to 5,000 characters.');

  const store = await publicStore(context);
  // Per actor and per sender address, never one store-wide bucket: one caller
  // must not be able to stop other shoppers from asking for help.
  await consumeActionBuckets(context, 'contact', { target: `${store.id}:${email}`, targetLimit: 3, actorLimit: 10 });

  const customerId = context.session?.itemId
    ? (await (context.prisma as any).user.findUnique({ where: { id: context.session.itemId }, select: { id: true, storeId: true } }))
    : null;
  const now = new Date();
  // The date part is the store's calendar day, so a shopper quoting it reads the same day the store does.
  let referenceDay: string;
  try { referenceDay = zonedDateKey(now, store.timezone || 'UTC'); } catch { referenceDay = now.toISOString().slice(0, 10); }
  const reference = `JUN-${referenceDay.replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
  await context.sudo().db.ContactMessage.createOne({
    data: {
      store: { connect: { id: store.id } },
      ...(customerId?.storeId === store.id ? { customer: { connect: { id: customerId.id } } } : {}),
      reference, name, email, phone, topic: CONTACT_TOPICS[topic], orderNumber, message, sourcePath,
      subject: `${CONTACT_TOPICS[topic]}${orderNumber ? ` · order #${orderNumber}` : ''}`,
    },
  });
  return { reference, receivedAt: now.toISOString() };
}
