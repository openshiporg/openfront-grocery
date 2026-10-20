import type { Context } from '.keystone/types';

import { SHOPPER_EMAIL_MAX, shopperPasswordProblem } from '../../lib/accountContract';
import { consumeActionBuckets } from '../lib/graphqlRateLimit';
import { publicError } from '../lib/publicError';
import { publicStore } from '../lib/storeScope';

/**
 * Storefront shopper sign-up. E-commerce and Restaurant let shoppers create their own accounts;
 * like provisionGroceryCustomer, the account belongs to the public Store and has no role, so it
 * can never reach the dashboard. Throttled on this mutation only, per requesting actor and per
 * email — never with a store-wide bucket that one caller could use to lock every shopper out.
 */
export async function registerGroceryCustomer(_root: unknown, args: { name: string; email: string; password: string }, context: Context) {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  const password = typeof args.password === 'string' ? args.password : '';
  if (name.length < 1 || name.length > 120 || /[\r\n]/.test(name)) throw publicError('Enter your name (up to 120 characters).');
  if (email.length > SHOPPER_EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw publicError('Enter a valid email address.');
  const passwordProblem = shopperPasswordProblem(password);
  if (passwordProblem) throw publicError(passwordProblem);
  const store = await publicStore(context);
  await consumeActionBuckets(context, 'signup', { target: `${store.id}:${email}`, targetLimit: 3, actorLimit: 10 });
  const existing = await context.prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw publicError('An account already exists for this email. Sign in, or reset your password if you forgot it.', 'ACCOUNT_EXISTS');
  const user = await context.sudo().db.User.createOne({
    data: { name, email, password, store: { connect: { id: store.id } }, onboardingStatus: 'not_started' },
  });
  return { success: true, customerId: user.id, email };
}
